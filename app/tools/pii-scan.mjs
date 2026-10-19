// app/tools/pii-scan.mjs
//
// Schranke gegen echte Finanzdaten im oeffentlichen Repo. Durchsucht die
// hinzugefuegten Zeilen eines Diffs sowie Commit- und PR-Texte.
//
// Fehler (Exit 1): IBAN mit gueltiger Pruefziffer und echter Bankleitzahl,
// Kartennummer mit gueltiger Luhn-Ziffer, Eintrag der optionalen Sperrliste
// (Umgebungsvariable PII_SPERRLISTE, ein Eintrag je Zeile, nie im Repo).
// Warnungen (Exit 0): erkennbar erfundene IBANs, Anrede mit Name, Adresse,
// E-Mail, Telefonnummer, in Prosa auch Betraege mit Waehrung. Erfundene
// Testdaten sind erlaubt, deshalb bleiben diese Heuristiken Warnungen.
//
// Treffer nennen Ort und Regel, nie den vollen Wert: die CI-Logs sind oeffentlich.
//
//   node app/tools/pii-scan.mjs <basis> [<ziel>]     z. B. origin/main
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Laenge der IBAN je Land; Laender ausserhalb der Liste werden nicht geprueft.
const IBAN_LAENGE = {
  AT: 20, BE: 16, CH: 21, CZ: 24, DE: 22, DK: 18, ES: 24, FI: 18, FR: 27, GB: 22,
  IE: 22, IT: 27, LI: 21, LU: 20, NL: 18, NO: 15, PL: 28, PT: 25, SE: 24,
};

// Oeffentlich dokumentierte Beispielwerte, die in Doku und Tests stehen duerfen.
const BEISPIEL_IBAN = "DE89370400440532013000";
const TEST_KARTEN = new Set([
  "4111111111111111", "4012888888881881", "4242424242424242", "4000056655665556",
  "5555555555554444", "5105105105105100", "5200828282828210", "2223003122003222",
  "378282246310005", "371449635398431",
]);

const PROSA = /\.(md|txt)$/i;
const ERLAUBTE_MAILDOMAINS = /(^|\.)(example\.(com|org|net)|example|test|invalid|localhost|users\.noreply\.github\.com)$/i;

const IBAN_KANDIDAT = /\b([A-Z]{2})(\d{2})((?: ?[A-Z0-9]){10,30})/g;
const KARTE_KOMPAKT = /(?<![\d.,])\d{13,19}(?!\d|[.,]\d)/g;
const KARTE_GRUPPIERT = /(?<![\d.,])(?:\d{4}([ -])\d{4}\1\d{4}\1\d{1,7}|3[47]\d{2}([ -])\d{6}\2\d{5})(?!\d|[.,]\d)/g;

const WARNREGELN = [
  {
    regel: "anrede-name",
    muster: /\b(?:Herr|Frau|Hr\.|Fr\.)\s+[A-ZÄÖÜ][a-zäöüß]+/u,
    hinweis: "Anrede mit Name. Echte Personen gehoeren nicht ins Repo; erfundene Namen sind in Ordnung.",
  },
  {
    regel: "adresse",
    muster: /\b[A-ZÄÖÜ][\p{L}-]*(?:straße|strasse|str\.|weg|allee|platz|gasse|ring|damm|ufer)\s+\d{1,4}[a-z]?\b/u,
    hinweis: "Sieht nach Strasse mit Hausnummer aus.",
  },
  {
    regel: "telefon",
    muster: /\+49[\s\d/()-]{7,}\d/,
    hinweis: "Deutsche Telefonnummer.",
  },
  {
    regel: "betrag",
    nurProsa: true,
    muster: /\d(?:[\d.,]*\d)?\s?(?:€|EUR\b|Euro\b)|(?:€|\bEUR)\s?-?\d/u,
    hinweis: "Betrag mit Waehrung in Prosa. Konkrete Werte gehoeren ins agent_log.jsonl im Datenbestand.",
  },
];

export function ibanGueltig(iban) {
  const umgestellt = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const zeichen of umgestellt) {
    const wert = zeichen >= "A" ? String(zeichen.charCodeAt(0) - 55) : zeichen;
    for (const ziffer of wert) rest = (rest * 10 + Number(ziffer)) % 97;
  }
  return rest === 1;
}

export function luhnGueltig(ziffern) {
  let summe = 0;
  for (let i = 0; i < ziffern.length; i++) {
    let d = Number(ziffern[ziffern.length - 1 - i]);
    if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    summe += d;
  }
  return summe % 10 === 0;
}

// Nur Nummernkreise und Laengen von Visa, Mastercard und Amex.
function kartenpraefix(ziffern) {
  const n = ziffern.length;
  if (/^4/.test(ziffern)) return n === 13 || n === 16 || n === 19;
  if (/^5[1-5]/.test(ziffern)) return n === 16;
  if (/^2(?:22[1-9]|2[3-9]\d|[3-6]\d\d|7[01]\d|720)/.test(ziffern)) return n === 16;
  if (/^3[47]/.test(ziffern)) return n === 15;
  return false;
}

function ibanTreffer(text) {
  const treffer = [];
  for (const m of text.matchAll(IBAN_KANDIDAT)) {
    const laenge = IBAN_LAENGE[m[1]];
    const kompakt = m[0].replace(/ /g, "");
    if (!laenge || kompakt.length < laenge) continue;
    const iban = kompakt.slice(0, laenge);
    if (m[1] === "DE" && !/^DE\d{20}$/.test(iban)) continue;
    if (iban === BEISPIEL_IBAN) continue;
    const maske = `${iban.slice(0, 4)}…${iban.slice(-4)}`;
    const gueltig = ibanGueltig(iban);
    // Bankleitzahlen beginnen mit 1 bis 8; 0 und 9 sind nicht vergeben.
    const erfunden = m[1] === "DE" && /^[09]/.test(iban.slice(4));
    if (gueltig && !erfunden) {
      treffer.push({
        art: "fehler",
        regel: "iban",
        hinweis: `IBAN ${maske} mit gueltiger Pruefziffer. Fuer Testdaten eine Bankleitzahl mit 0 vorn, eine ungueltige Pruefziffer oder ${BEISPIEL_IBAN} verwenden.`,
      });
    } else if (m[1] === "DE") {
      treffer.push({
        art: "warnung",
        regel: "iban-erfunden",
        hinweis: `IBAN-foermig (${maske}), aber ${gueltig ? "Bankleitzahl nicht vergeben" : "Pruefziffer ungueltig"}: vermutlich erfunden.`,
      });
    }
  }
  return treffer;
}

function kartenTreffer(text) {
  const treffer = [];
  for (const muster of [KARTE_KOMPAKT, KARTE_GRUPPIERT]) {
    for (const m of text.matchAll(muster)) {
      const ziffern = m[0].replace(/[ -]/g, "");
      if (!kartenpraefix(ziffern) || !luhnGueltig(ziffern) || TEST_KARTEN.has(ziffern)) continue;
      treffer.push({
        art: "fehler",
        regel: "kartennummer",
        hinweis: `Kartennummer …${ziffern.slice(-4)} mit gueltiger Luhn-Pruefziffer. Fuer Tests eine dokumentierte Testkarte wie 4111111111111111 verwenden.`,
      });
    }
  }
  return treffer;
}

function sperrlistenTreffer(text, sperrliste) {
  const treffer = [];
  sperrliste.forEach((muster, i) => {
    if (muster.test(text)) {
      treffer.push({ art: "fehler", regel: "sperrliste", hinweis: `Eintrag Nr. ${i + 1} der Sperrliste.` });
    }
  });
  return treffer;
}

// Sperrliste aus PII_SPERRLISTE: ein Begriff je Zeile, # leitet Kommentare ein.
// Gesucht wird ohne Gross-/Kleinschreibung und nur als ganzes Wort.
export function sperrlisteAus(text = "") {
  return text
    .split(/\r?\n/)
    .map((zeile) => zeile.trim())
    .filter((zeile) => zeile && !zeile.startsWith("#"))
    .map((begriff) => {
      const escaped = begriff.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu");
    });
}

// Hinzugefuegte Zeilen eines `git diff -U0` mit Datei und Zeilennummer.
export function hinzugefuegteZeilen(diff) {
  const zeilen = [];
  let datei = null;
  let nummer = 0;
  for (const zeile of diff.split("\n")) {
    if (zeile.startsWith("+++ ")) {
      const ziel = zeile.slice(4).replace(/\t$/, "");
      datei = ziel === "/dev/null" ? null : ziel.replace(/^b\//, "");
    } else if (zeile.startsWith("@@")) {
      const m = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(zeile);
      nummer = m ? Number(m[1]) : 0;
    } else if (zeile.startsWith("+") && datei) {
      zeilen.push({ datei, zeile: nummer, text: zeile.slice(1) });
      nummer += 1;
    } else if (zeile.startsWith(" ")) {
      nummer += 1;
    }
  }
  return zeilen;
}

// Treffer fuer eine Liste von { datei, zeile, text }; datei kann auch "Commit abc1234" sein.
export function scanZeilen(zeilen, { sperrliste = [], prosa } = {}) {
  const treffer = [];
  for (const { datei, zeile, text } of zeilen) {
    const istProsa = prosa ?? PROSA.test(datei);
    const funde = [...ibanTreffer(text), ...kartenTreffer(text), ...sperrlistenTreffer(text, sperrliste)];
    for (const { regel, muster, hinweis, nurProsa } of WARNREGELN) {
      if (nurProsa && !istProsa) continue;
      if (muster.test(text)) funde.push({ art: "warnung", regel, hinweis });
    }
    for (const m of text.matchAll(/([\w.%+-]+)@([\w-]+(?:\.[\w-]+)+)/g)) {
      if (!/^no-?reply$/i.test(m[1]) && !ERLAUBTE_MAILDOMAINS.test(m[2])) {
        funde.push({ art: "warnung", regel: "e-mail", hinweis: "E-Mail-Adresse; fuer Beispiele example.org verwenden." });
      }
    }
    treffer.push(...funde.map((fund) => ({ datei, zeile, ...fund })));
  }
  return treffer;
}

// Freitext (Commit- oder PR-Text) zeilenweise als Prosa pruefen.
export function scanText(quelle, text, optionen = {}) {
  const zeilen = String(text ?? "").split(/\r?\n/).map((t, i) => ({ datei: quelle, zeile: i + 1, text: t }));
  return scanZeilen(zeilen, { ...optionen, prosa: true });
}

// Eine Zeile je Treffer; mit github: true als Annotation fuer GitHub Actions.
export function formatiere(treffer, { github = false } = {}) {
  return treffer.map(({ datei, zeile, art, regel, hinweis }) => {
    if (!github) return `${art === "fehler" ? "FEHLER " : "Warnung"} ${datei}:${zeile} [${regel}] ${hinweis}`;
    const istDatei = !/^(Commit |PR-)/.test(datei);
    const ort = istDatei ? `file=${datei},line=${zeile},` : "";
    const vorspann = istDatei ? "" : `${datei}, Zeile ${zeile}: `;
    return `::${art === "fehler" ? "error" : "warning"} ${ort}title=PII-Scan ${regel}::${vorspann}${hinweis}`;
  });
}

function git(args) {
  return execFileSync("git", ["-c", "core.quotePath=false", ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

function main() {
  const [basis, ziel = "HEAD"] = process.argv.slice(2);
  if (!basis) {
    console.error("Aufruf: node app/tools/pii-scan.mjs <basis> [<ziel>]   z. B. origin/main");
    process.exit(2);
  }
  if (/^0+$/.test(basis)) {
    console.log("PII-Scan: keine Vergleichsbasis (neuer Branch), nichts zu pruefen.");
    return;
  }
  const sperrliste = sperrlisteAus(process.env.PII_SPERRLISTE);
  const diff = git(["diff", "-U0", "--no-color", "--no-ext-diff", "--find-renames", "--src-prefix=a/", "--dst-prefix=b/", `${basis}...${ziel}`]);
  const treffer = scanZeilen(hinzugefuegteZeilen(diff), { sperrliste });

  const commits = git(["log", "--no-merges", "--format=%h%x00%B%x1e", `${basis}..${ziel}`]);
  for (const eintrag of commits.split("\x1e")) {
    const [hash, text] = eintrag.replace(/^\n/, "").split("\x00");
    if (hash && text) treffer.push(...scanText(`Commit ${hash}`, text, { sperrliste }));
  }
  if (process.env.PR_TITEL) treffer.push(...scanText("PR-Titel", process.env.PR_TITEL, { sperrliste }));
  if (process.env.PR_TEXT) treffer.push(...scanText("PR-Beschreibung", process.env.PR_TEXT, { sperrliste }));

  for (const zeile of formatiere(treffer, { github: Boolean(process.env.GITHUB_ACTIONS) })) console.log(zeile);
  const fehler = treffer.filter((t) => t.art === "fehler").length;
  const sperrInfo = sperrliste.length ? `, Sperrliste mit ${sperrliste.length} Eintraegen` : "";
  console.log(`PII-Scan: ${fehler} Fehler, ${treffer.length - fehler} Warnungen${sperrInfo}.`);
  if (fehler) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
