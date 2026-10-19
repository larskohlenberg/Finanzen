// app/tools/regelzahlung-matcher.mjs
// Ordnet gebuchte Transaktionen bestaetigten Regelzahlungen zu (regelzahlung_id).
// Erkennen ist Agent-Urteil (ADR 0010): der Agent bestaetigt die Regelzahlung und
// setzt ihr Konto. Dieses Tool matcht nur noch gegen eine konkrete Buchung.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { toCents, centsToDecimal, dayDiff, normalizeLoose, normalizeWhitespace } from "./lib/text.mjs";
import { addInterval } from "../liquiditaet.mjs";
import { loadMasterData, validateMasterData } from "./validator.mjs";
import { pflichtDatenroot } from "./data-root.mjs";
import { sperreFuerProzess } from "./lib/schreibsperre.mjs";

// Betragstoleranz relativ zum Betrag der Regelzahlung. Die Mandatsreferenz ist
// ein strukturelles Signal und traegt Beitragsdynamik ueber Jahre; die
// Gegenpartei ist Freitext und bleibt eng.
const TOLERANZ_MANDAT = 0.5;
const TOLERANZ_GEGENPARTEI = 0.1;
// So viele Termine je Richtung um das anker_datum herum sucht das Tool die
// Ankerbuchung (Rabattmonat, Wochenende, Anker auf dem Monatsersten).
const ANKER_TERMINE = 3;

function intervallTage(rz) {
  const n = Number(rz.rhythmus_intervall) || 1;
  return { tag: 1, woche: 7, monat: 30, jahr: 365 }[rz.rhythmus_einheit] * n;
}

// Datumsfenster um den erwarteten Termin: ein Viertel des Rhythmus, hoechstens
// 15 Tage. Monatlich 7 Tage (Wochenende, Monatswechsel), quartalsweise und
// jaehrlich 15. Benachbarte Termine ueberlappen so nie.
export function fensterTage(rz) {
  return Math.min(15, Math.floor(intervallTage(rz) / 4));
}

const termin = (rz, k) => addInterval(rz.anker_datum, rz.rhythmus_einheit, Number(rz.rhythmus_intervall) * k);
const vorzeichen = (cents) => Math.sign(cents);
const abweichung = (tx, rz) => Math.abs(Math.abs(toCents(tx.betrag)) - Math.abs(toCents(rz.betrag)));
const imRahmen = (tx, rz, toleranz) => abweichung(tx, rz) <= Math.round(Math.abs(toCents(rz.betrag)) * toleranz);

// Kennung, an der die Buchungen einer Regelzahlung wiedererkannt werden.
// Die Mandatsreferenz identifiziert einen Lastschriftvertrag; ohne sie bleibt
// die Gegenpartei, dann mit enger Betragstoleranz und gleicher Kategorie.
function kennungVon(tx) {
  const mandat = normalizeWhitespace(tx.mandatsreferenz);
  if (mandat) return { signal: "mandat", wert: mandat };
  const gegenpartei = normalizeLoose(tx.gegenpartei);
  if (gegenpartei) return { signal: "gegenpartei", wert: gegenpartei };
  return null;
}
const kennungSchluessel = (k) => `${k.signal}|${k.wert}`;

// Woerter, die keinen Empfaenger kennzeichnen: Zahlungsdienstleister,
// Buchungsarten, Rechtsformen und Branchenwoerter, die viele Firmen teilen
// ("Stadtwerke X" und "Stadtwerke Y" sind verschiedene Empfaenger). Woerter
// unter vier Zeichen fallen ohnehin weg.
const FUELLWOERTER = new Set([
  "paypal", "klarna", "sumup", "visa", "mastercard", "girocard", "maestro", "debit", "sepa", "stripe", "adyen",
  "zahlung", "zahlungen", "lastschrift", "gutschrift", "kartenzahlung", "debitkartenumsatz", "kartenumsatz",
  "ueberweisung", "dauerauftrag", "einzug", "payment", "payments", "europe", "deutschland", "germany",
  "subscription", "subscr", "subsc", "abonnement", "monthly", "beitrag", "rechnung", "kundennr", "mandat", "referenz",
  "gmbh", "limited", "holding", "group", "gruppe", "international", "digital", "media",
  "stadtwerke", "versicherung", "versicherungen", "versicherungs", "bank", "sparkasse", "volksbank", "raiffeisenbank",
  "stadt", "gemeinde", "verwaltung", "kasse", "service", "services", "online", "shop", "store", "markt", "center",
]);

// Markante Woerter einer Gegenpartei: an Nicht-Buchstaben/-Ziffern getrennt,
// ohne Fuellwoerter, ohne Woerter unter vier Zeichen und ohne Woerter mit
// Ziffern (Bestell- und Referenznummern). Bei Kartenzahlungen steht hinter
// dem ersten "/" der Ort ("DIENST.SUB/DUBLIN"); er kennzeichnet keinen
// Empfaenger und zaehlt nicht.
export function markanteWoerter(name) {
  return new Set(String(name ?? "").split("/")[0].toLowerCase().split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4 && !/\p{N}/u.test(w) && !FUELLWOERTER.has(w)));
}

// Gleiche Gegenpartei. Manche Auszuege (z. B. PDF statt CSV derselben Bank)
// kuerzen den Namen nach einer festen Laenge; ein Name, der mit dem anderen
// beginnt, zaehlt deshalb mit, sofern der kuerzere mindestens 20 Zeichen hat.
// Kartenzahlungen schreibt die Bank jedes Mal anders ("PAYPAL..DIENST.P3D1",
// "Dienst"); dann reicht ein gemeinsames markantes Wort. Gegen Fehlgriffe
// sichern Konto, Kategorie und Betragstoleranz ab.
const MIN_GEKUERZT = 20;
export function gleicheGegenpartei(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const [kurz, lang] = a.length < b.length ? [a, b] : [b, a];
  if (kurz.length >= MIN_GEKUERZT && lang.startsWith(kurz)) return true;
  const woerterLang = markanteWoerter(lang);
  return [...markanteWoerter(kurz)].some((w) => woerterLang.has(w));
}

function passtZurKennung(tx, rz, kennung) {
  if (kennung.signal === "mandat") {
    return normalizeWhitespace(tx.mandatsreferenz) === kennung.wert && imRahmen(tx, rz, TOLERANZ_MANDAT);
  }
  return gleicheGegenpartei(normalizeLoose(tx.gegenpartei), kennung.wert)
    && (!rz.kategorie_id || tx.kategorie_id === rz.kategorie_id)
    && imRahmen(tx, rz, TOLERANZ_GEGENPARTEI);
}

// Ankerbuchung: die Buchung, die die Regelzahlung am naechstgelegenen Termin
// erfuellt — gleiches Konto, gleiche Richtung und Kategorie, Betrag cent-genau.
// Erst wenn kein Termin einen cent-genauen Treffer hat, und nur bei geschaetztem
// Betrag (Gehalt als Mittelwert), gilt die enge Toleranz. Die Kennung der
// Kandidaten muss eindeutig sein.
function findeAnker(rz, buchungen) {
  const fenster = fensterTage(rz);
  const ziel = toCents(rz.betrag);
  const reihenfolge = [0];
  for (let k = 1; k <= ANKER_TERMINE; k++) reihenfolge.push(-k, k);
  const durchlaeufe = [(tx) => toCents(tx.betrag) === ziel];
  if (rz.qualitaet === "geschaetzt") durchlaeufe.push((tx) => imRahmen(tx, rz, TOLERANZ_GEGENPARTEI));
  for (const passt of durchlaeufe) {
    for (const k of reihenfolge) {
      const datum = termin(rz, k);
      if (rz.aktiv_bis && datum > rz.aktiv_bis) continue;
      const kandidaten = buchungen.filter((tx) =>
        (!rz.kategorie_id || tx.kategorie_id === rz.kategorie_id)
        && Math.abs(dayDiff(tx.buchungsdatum, datum)) <= fenster
        && passt(tx));
      if (!kandidaten.length) continue;
      const kennungen = new Map();
      for (const tx of kandidaten) {
        const kennung = kennungVon(tx);
        if (kennung) kennungen.set(kennungSchluessel(kennung), kennung);
      }
      if (kennungen.size === 0) return { grund: "anker-ohne-kennung", kandidaten: kandidaten.map((t) => t.transaktion_id).sort() };
      if (kennungen.size > 1) return { grund: "anker-mehrdeutig", kandidaten: kandidaten.map((t) => t.transaktion_id).sort() };
      const anker = kandidaten
        .slice()
        .sort((a, b) => Math.abs(dayDiff(a.buchungsdatum, datum)) - Math.abs(dayDiff(b.buchungsdatum, datum)) || a.transaktion_id.localeCompare(b.transaktion_id))[0];
      return { anker, kennung: [...kennungen.values()][0], exakt: toCents(anker.betrag) === ziel };
    }
  }
  return { grund: "ohne-anker" };
}

function vergleich(a, b) {
  return a.abweichung - b.abweichung || a.tage - b.tage;
}

// Zwei Buchungen sind fuer einen Termin austauschbar, wenn die Wahl am Ergebnis
// nichts aendert: gleiches Konto, gleicher Tag, gleicher Betrag.
const austauschKlasse = (tx) => `${tx.konto_id}|${tx.buchungsdatum}|${tx.betrag}`;

export function matchRegelzahlungen(transaktionen, regelzahlungen) {
  const uebersprungen = [];
  const laeufe = [];
  const proKonto = new Map();
  for (const tx of transaktionen) {
    if (toCents(tx.betrag) === 0) continue;
    if (!proKonto.has(tx.konto_id)) proKonto.set(tx.konto_id, []);
    proKonto.get(tx.konto_id).push(tx);
  }

  for (const rz of regelzahlungen) {
    if (rz.status !== "bestaetigt") continue;
    if (!rz.konto_id) { uebersprungen.push({ regelzahlung_id: rz.regelzahlung_id, grund: "ohne-konto" }); continue; }
    const richtung = vorzeichen(toCents(rz.betrag));
    const buchungen = (proKonto.get(rz.konto_id) ?? []).filter((tx) => vorzeichen(toCents(tx.betrag)) === richtung);
    const frei = buchungen.filter((tx) => !tx.regelzahlung_id || tx.regelzahlung_id === rz.regelzahlung_id);
    const ergebnis = findeAnker(rz, frei);
    if (!ergebnis.anker) { uebersprungen.push({ regelzahlung_id: rz.regelzahlung_id, ...ergebnis }); continue; }
    laeufe.push({ rz, buchungen, ...ergebnis });
  }

  // Vertragsnachfolge: eine Regelzahlung reicht nicht vor das aktiv_bis einer
  // Vorgaengerin mit derselben Kennung auf demselben Konto zurueck.
  for (const lauf of laeufe) {
    let ab = null;
    for (const andere of laeufe) {
      if (andere === lauf || !andere.rz.aktiv_bis || andere.rz.konto_id !== lauf.rz.konto_id) continue;
      if (kennungSchluessel(andere.kennung) !== kennungSchluessel(lauf.kennung)) continue;
      if (andere.rz.aktiv_bis >= lauf.rz.anker_datum) continue;
      if (!ab || andere.rz.aktiv_bis > ab) ab = andere.rz.aktiv_bis;
    }
    lauf.ab = ab;
  }

  // Kanten Termin -> Buchung. Ein Termin, den schon eine Buchung dieser
  // Regelzahlung erfuellt, bekommt keine zweite.
  const kanten = [];
  const termineJe = new Map();
  for (const lauf of laeufe) {
    const { rz, buchungen, kennung } = lauf;
    const fenster = fensterTage(rz);
    const daten = buchungen.map((tx) => tx.buchungsdatum).sort();
    const stats = { termine: [], bereits: 0, datenEnde: null };
    termineJe.set(rz.regelzahlung_id, stats);
    if (!daten.length) continue;
    const erstes = addInterval(daten[0], "tag", -fenster);
    // Termine bis kurz nach der letzten Buchung des Kontos: eine Zahlung kann
    // ein paar Tage nach ihrem Termin gebucht sein. Als fehlend zaehlt ein
    // Termin aber erst, wenn der Bestand ueber ihn hinausreicht.
    const letztes = addInterval(daten.at(-1), "tag", fenster);
    stats.datenEnde = daten.at(-1);
    let k = 0;
    while (termin(rz, k - 1) >= erstes) k--;
    for (; ; k++) {
      const datum = termin(rz, k);
      if (datum > letztes || (rz.aktiv_bis && datum > rz.aktiv_bis)) break;
      if (datum < erstes || (lauf.ab && datum <= lauf.ab)) continue;
      stats.termine.push(datum);
      const imFenster = buchungen.filter((tx) => Math.abs(dayDiff(tx.buchungsdatum, datum)) <= fenster);
      if (imFenster.some((tx) => tx.regelzahlung_id === rz.regelzahlung_id)) { stats.bereits++; continue; }
      for (const tx of imFenster) {
        if (tx.regelzahlung_id || !passtZurKennung(tx, rz, kennung)) continue;
        kanten.push({ termin: `${rz.regelzahlung_id}@${datum}`, datum, rz, tx, signal: kennung.signal, abweichung: abweichung(tx, rz), tage: Math.abs(dayDiff(tx.buchungsdatum, datum)) });
      }
    }
  }

  // Gegenseitig beste Paare, Runde fuer Runde: eine Kante gilt, wenn sie fuer
  // ihren Termin und fuer ihre Buchung die beste ist (kleinste Betragsabweichung,
  // dann kleinster Abstand). Erst wenn keine Runde mehr etwas vergibt, werden
  // gleich gute, nicht austauschbare Alternativen gesperrt und gemeldet.
  const zuordnungen = [];
  const mehrdeutig = [];
  const vergeben = new Set();
  const gesperrt = new Set();
  let offen = kanten;
  for (;;) {
    offen = offen.filter((k) => ![k.termin, k.tx.transaktion_id].some((s) => vergeben.has(s) || gesperrt.has(s)));
    if (!offen.length) break;
    const besteJeTermin = new Map();
    const besteJeTx = new Map();
    for (const k of offen) {
      for (const [map, schluessel] of [[besteJeTermin, k.termin], [besteJeTx, k.tx.transaktion_id]]) {
        const bisher = map.get(schluessel);
        if (!bisher || vergleich(k, bisher[0]) < 0) map.set(schluessel, [k]);
        else if (vergleich(k, bisher[0]) === 0) bisher.push(k);
      }
    }
    const termKlar = (beste) => new Set(beste.map((k) => austauschKlasse(k.tx))).size === 1;
    const angenommen = [];
    for (const beste of besteJeTermin.values()) {
      if (!termKlar(beste)) continue;
      const k = beste.slice().sort((a, b) => a.tx.transaktion_id.localeCompare(b.tx.transaktion_id))[0];
      const fuerTx = besteJeTx.get(k.tx.transaktion_id);
      if (fuerTx.length === 1 && fuerTx[0] === k) angenommen.push(k);
    }
    if (angenommen.length) {
      for (const k of angenommen) {
        k.tx.regelzahlung_id = k.rz.regelzahlung_id;
        vergeben.add(k.termin);
        vergeben.add(k.tx.transaktion_id);
        zuordnungen.push({ transaktion_id: k.tx.transaktion_id, regelzahlung_id: k.rz.regelzahlung_id, buchungsdatum: k.tx.buchungsdatum, betrag: k.tx.betrag, termin: k.datum, tage: k.tage, signal: k.signal });
      }
      continue;
    }
    let gesperrtNeu = 0;
    for (const [schluessel, beste] of besteJeTermin) {
      if (termKlar(beste)) continue;
      mehrdeutig.push({ termin: schluessel, kandidaten: beste.map((k) => k.tx.transaktion_id).sort() });
      gesperrt.add(schluessel);
      gesperrtNeu++;
    }
    for (const [id, beste] of besteJeTx) {
      if (beste.length < 2) continue;
      mehrdeutig.push({ transaktion_id: id, termine: beste.map((k) => k.termin).sort() });
      gesperrt.add(id);
      gesperrtNeu++;
    }
    if (!gesperrtNeu) break;
  }

  const je = laeufe.map(({ rz, anker, kennung, exakt }) => {
    const stats = termineJe.get(rz.regelzahlung_id);
    const neu = zuordnungen.filter((z) => z.regelzahlung_id === rz.regelzahlung_id);
    const erfuellt = new Set(neu.map((z) => z.termin));
    const termine = stats.termine.filter((d) => d <= stats.datenEnde || erfuellt.has(d)).length;
    return {
      regelzahlung_id: rz.regelzahlung_id,
      bezeichnung: rz.bezeichnung,
      signal: kennung.signal,
      anker: anker.transaktion_id,
      anker_exakt: exakt,
      termine,
      bereits: stats.bereits,
      neu: neu.length,
      ohne_buchung: termine - stats.bereits - neu.length,
      erste: neu.map((z) => z.buchungsdatum).sort()[0] ?? null,
      letzte: neu.map((z) => z.buchungsdatum).sort().at(-1) ?? null,
    };
  }).sort((a, b) => a.regelzahlung_id.localeCompare(b.regelzahlung_id));

  zuordnungen.sort((a, b) => a.regelzahlung_id.localeCompare(b.regelzahlung_id) || a.buchungsdatum.localeCompare(b.buchungsdatum));
  uebersprungen.sort((a, b) => a.regelzahlung_id.localeCompare(b.regelzahlung_id));
  return { transaktionen, zuordnungen, je_regelzahlung: je, uebersprungen, mehrdeutig };
}

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}
async function readJsonl(url) {
  const text = await readFile(url, "utf8");
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));
}

// Lauf ueber den Bestand. Vorschau ist Default; --schreiben setzt regelzahlung_id
// und validiert danach den Datenroot.
async function main() {
  const argv = process.argv.slice(2);
  const schreiben = argv.includes("--schreiben");
  const details = argv.includes("--details");
  const masterRoot = pflichtDatenroot(argv.find((a) => !a.startsWith("--")));
  // Schreibsperre des Bestands fuer den ganzen Lauf (Lesen bis Schreiben).
  if (schreiben) await sperreFuerProzess(fileURLToPath(masterRoot));

  const [transaktionen, regelzahlungen] = await Promise.all([
    readJsonl(new URL("transaktionen.jsonl", masterRoot)),
    readJson(new URL("regelzahlungen.json", masterRoot)),
  ]);

  const out = matchRegelzahlungen(transaktionen, regelzahlungen);
  const volumen = out.zuordnungen.reduce((sum, z) => sum + toCents(z.betrag), 0);
  console.log(JSON.stringify({
    modus: schreiben ? "geschrieben" : "vorschau",
    neue_zuordnungen: out.zuordnungen.length,
    volumen: centsToDecimal(volumen),
    je_regelzahlung: out.je_regelzahlung,
    uebersprungen: out.uebersprungen,
    mehrdeutig: out.mehrdeutig,
    ...(details ? { zuordnungen: out.zuordnungen } : {}),
  }, null, 2));

  if (!schreiben) {
    console.log("\nVorschau — nichts geschrieben. Mit --schreiben anwenden, --details listet jede Zuordnung.");
    return;
  }

  await writeFile(new URL("transaktionen.jsonl", masterRoot), out.transaktionen.map((tx) => JSON.stringify(tx)).join("\n") + "\n");
  const validation = validateMasterData(await loadMasterData(masterRoot));
  if (!validation.valid) {
    console.error("Validierung nach Regelzahlungs-Zuordnung fehlgeschlagen:");
    for (const error of validation.errors.slice(0, 20)) console.error(`- ${error}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
