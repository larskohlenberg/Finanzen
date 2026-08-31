// app/tools/regel-probelauf.mjs
//
// Sicherheitsnetz fuer die autonome Regelanlage: rechnet Regelkandidaten gegen
// den GESAMTEN Bestand, bevor eine Zeile geschrieben wird, und blockiert alles,
// was der spaetere Review nicht mehr heilen koennte.
//
// Warum ueberhaupt ein Tool: Seit der Agent Regeln ohne Vorab-Bestaetigung
// anlegen darf, ist der Probelauf die einzige verbliebene Schranke. Als
// Wegwerf-Skript waere sie nur so verlaesslich wie die Tagesform des Agenten —
// als Tool mit Exit-Code ist sie eine Bedingung.
//
// Zwei Befunde blockieren, und zwar aus verschiedenen Gruenden:
//
// - NEUER KONFLIKT: zwei Regeln mit verschiedenen Kategorien treffen dieselbe
//   Buchung. Ergebnis ist `offen` statt `vorgeschlagen` — der Review sieht nur
//   `vorgeschlagen` und bekommt den Schaden also nie zu Gesicht. Unsichtbar
//   schlimmer als gar keine Regel.
// - WIEDERVORLAGE: der Kandidat widerspricht einer bereits BESTAETIGTEN
//   Regel-Kategorie. Das ist Nacharbeit an einer Entscheidung, die der Nutzer
//   schon getroffen hat — das darf der Agent nicht im Alleingang ausloesen.
// - TREFFERVERLUST: eine Einengung laesst BESTAETIGTE Buchungen aus der Regel
//   fallen. Sie verlieren ihre Kategorie und landen wieder auf `offen` — der
//   Schaden ist derselbe wie bei einer Wiedervorlage, nur von der anderen
//   Seite: dort widerspricht die Regel, hier verschwindet sie. Ohne diese
//   Pruefung muesste der Verlust von Hand gegengerechnet werden.
//
// Nicht blockierend, aber berichtet: Kandidaten ohne jeden Treffer. Eine Regel
// darf wissensbasiert fuer kuenftige Buchungen angelegt werden.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { categorize } from "./categorizer.mjs";
import { toCents } from "./lib/text.mjs";
import { dataRootFromArg } from "./data-root.mjs";
import { referenzmenge, istSpezifisch } from "./lib/spezifitaet.mjs";

const PFLICHTFELDER = ["regel_id", "kategorie_id", "status", "erstellt_am", "kommentar"];
const ERLAUBTE_FELDER = new Set([...PFLICHTFELDER, "gegenpartei_pattern", "verwendungszweck_pattern", "konto_id", "vorzeichen", "belegstufe"]);
// Dieselbe Menge wie in freigabe.mjs: eine Regel mit einer Stufe ausserhalb
// davon faellt am Gate durch, ohne dass jemand es merkt.
const BELEGSTUFEN = new Set(["E1", "E2", "E3", "E4"]);

// Struktur gegen schemas/kategorisierungsregeln.schema.json, ohne Validator-
// Abhaengigkeit: der Probelauf laeuft VOR dem Schreiben, es gibt also noch
// keine Datei, die der Validator pruefen koennte.
function strukturFehler(kandidaten, bestandsRegeln, kategorieIds, aenderung) {
  const fehler = [];
  const vergeben = new Set(bestandsRegeln.map((r) => r.regel_id));
  const gesehen = new Set();

  for (const r of kandidaten) {
    const id = r.regel_id ?? "(ohne regel_id)";
    for (const feld of PFLICHTFELDER) {
      if (r[feld] === undefined || r[feld] === null || r[feld] === "") fehler.push(`${id}: Pflichtfeld ${feld} fehlt`);
    }
    for (const feld of Object.keys(r)) {
      if (!ERLAUBTE_FELDER.has(feld)) fehler.push(`${id}: unbekanntes Feld ${feld}`);
    }
    if (!/^REG-\d{3}$/.test(r.regel_id ?? "")) fehler.push(`${id}: regel_id muss dem Muster REG-NNN folgen`);
    if (gesehen.has(r.regel_id)) fehler.push(`${id}: regel_id doppelt im Kandidatensatz`);
    gesehen.add(r.regel_id);
    // Ohne --aenderung ist eine schon vergebene ID ein Versehen (ID-Zaehler
    // nicht hochgezaehlt) und wuerde eine bestehende Regel ueberschreiben.
    if (!aenderung && vergeben.has(r.regel_id)) fehler.push(`${id}: regel_id bereits im Bestand vergeben — bei beabsichtigter Aenderung --aenderung setzen`);
    if (kategorieIds && r.kategorie_id && !kategorieIds.includes(r.kategorie_id)) fehler.push(`${id}: kategorie_id ${r.kategorie_id} steht nicht in kategorien.json`);
    if (r.status && !["aktiv", "inaktiv"].includes(r.status)) fehler.push(`${id}: status muss aktiv oder inaktiv sein`);
    if (r.erstellt_am && !/^\d{4}-\d{2}-\d{2}$/.test(r.erstellt_am)) fehler.push(`${id}: erstellt_am muss ein Datum JJJJ-MM-TT sein`);
    if (!r.gegenpartei_pattern && !r.verwendungszweck_pattern) fehler.push(`${id}: braucht mindestens ein Muster`);
    if (r.vorzeichen && !["einnahme", "ausgabe"].includes(r.vorzeichen)) fehler.push(`${id}: vorzeichen muss einnahme oder ausgabe sein`);
    if (r.belegstufe && !BELEGSTUFEN.has(r.belegstufe)) fehler.push(`${id}: belegstufe muss E1 bis E4 sein`);
  }
  return fehler;
}

// Menschliche Akte sind fuer Wiedervorlage und Trefferverlust tabu —
// recategorize.mjs fasst sie ohnehin nie an, also kann ein Kandidat dort weder
// etwas umbiegen noch etwas wegnehmen.
function istUnantastbar(tx) {
  return tx.kategorie_herkunft === "manuell" || tx.kategorisierung_status === "abgelehnt";
}

export function probelauf({ transaktionen, bestandsRegeln, kandidaten, kategorieIds = null, aenderung = false }) {
  const struktur_fehler = strukturFehler(kandidaten, bestandsRegeln, kategorieIds, aenderung);

  // Kandidaten mit bekannter ID ersetzen den Bestandssatz, statt ihn zu doppeln:
  // sonst traefe die alte Fassung im Probelauf mit und erzeugte Phantomkonflikte.
  const ersetzt = new Set(kandidaten.map((r) => r.regel_id));
  const kombiniert = [...bestandsRegeln.filter((r) => !ersetzt.has(r.regel_id)), ...kandidaten];
  const kandidatIds = new Set(kandidaten.filter((r) => r.status === "aktiv").map((r) => r.regel_id));

  // Treffer VERLIEREN kann nur eine Regel, die schon im Bestand steht und vom
  // Kandidaten ersetzt wird. Bei reiner Neuanlage ist die Menge leer — dann
  // entfaellt der zweite Categorizer-Lauf ueber den ganzen Bestand.
  const bestandsIds = new Set(bestandsRegeln.map((r) => r.regel_id));
  const geaenderteIds = new Set([...ersetzt].filter((id) => bestandsIds.has(id)));

  const pro_regel = Object.fromEntries(kandidaten.map((r) => [r.regel_id, { kategorie_id: r.kategorie_id, treffer: 0, treffer_bestaetigt: 0, verliert_bestaetigt: 0, summe_cents: 0, beispiele: [] }]));
  const neue_konflikte = [];
  const wiedervorlagen = [];
  const verlorene_bestaetigte = [];
  let treffer = 0;
  let treffer_bestaetigt = 0;

  for (const tx of transaktionen) {
    const nachher = categorize(tx, kombiniert);
    // Ein Kandidat ist auf zwei Arten beteiligt: er trifft die Buchung jetzt —
    // oder er hat sie vorher getroffen und tut es nach der Einengung nicht
    // mehr. Nur die erste Art zu betrachten hiesse, jede Einengung blind zu
    // machen: genau die Buchungen, die herausfallen, waeren unsichtbar.
    const vorher = geaenderteIds.size > 0 || nachher.conflict ? categorize(tx, bestandsRegeln) : null;
    const trifftJetzt = nachher.matched_regeln.some((id) => kandidatIds.has(id));
    const trafVorher = vorher ? vorher.matched_regeln.some((id) => geaenderteIds.has(id)) : false;
    if (!trifftJetzt && !trafVorher) continue;

    // Gezaehlt wird ueber den GESAMTEN Bestand, nicht nur ueber `offen`. Sonst
    // meldet das Tool bei leerem Offen-Stapel "ohne aktuellen Treffer" fuer
    // eine Regel, die hunderte bestaetigte Buchungen traegt.
    if (trifftJetzt) {
      treffer += 1;
      if (tx.kategorisierung_status === "bestaetigt") treffer_bestaetigt += 1;
      for (const id of nachher.matched_regeln) {
        const eintrag = pro_regel[id];
        if (!eintrag) continue;
        eintrag.treffer += 1;
        if (tx.kategorisierung_status === "bestaetigt") eintrag.treffer_bestaetigt += 1;
        eintrag.summe_cents += toCents(tx.betrag);
        if (eintrag.beispiele.length < 3) {
          eintrag.beispiele.push({ buchungsdatum: tx.buchungsdatum, betrag: tx.betrag, gegenpartei: tx.gegenpartei });
        }
      }
    }

    if (nachher.conflict) {
      // Ein Konflikt, den es vorher schon gab, ist nicht dem Kandidaten anzulasten.
      if (!vorher.conflict) {
        neue_konflikte.push({
          transaktion_id: tx.transaktion_id,
          buchungsdatum: tx.buchungsdatum,
          betrag: tx.betrag,
          gegenpartei: tx.gegenpartei,
          regeln: nachher.matched_regeln,
        });
      }
      continue;
    }

    if (tx.kategorisierung_status !== "bestaetigt" || istUnantastbar(tx)) continue;
    // Deckt eine andere Regel die Buchung mit derselben Kategorie weiter ab,
    // aendert sich fachlich nichts — das ist kein Verlust und kein Fall.
    if (nachher.kategorie_id === tx.kategorie_id) continue;

    const befund = {
      transaktion_id: tx.transaktion_id,
      buchungsdatum: tx.buchungsdatum,
      betrag: tx.betrag,
      gegenpartei: tx.gegenpartei,
      ist_kategorie: tx.kategorie_id,
      neu_kategorie: nachher.kategorie_id,
    };

    if (trafVorher && !trifftJetzt) {
      // Die Buchung faellt aus der Regel. `regeln` nennt die Kandidaten, die
      // sie fallen lassen — nicht die, die jetzt zufaellig noch passen.
      const verloren = vorher.matched_regeln.filter((id) => geaenderteIds.has(id) && !nachher.matched_regeln.includes(id));
      for (const id of verloren) pro_regel[id].verliert_bestaetigt += 1;
      verlorene_bestaetigte.push({ ...befund, regeln: verloren });
      continue;
    }

    wiedervorlagen.push({ ...befund, regeln: nachher.matched_regeln });
  }

  const ohne_treffer = kandidaten.filter((r) => r.status === "aktiv" && pro_regel[r.regel_id].treffer === 0).map((r) => r.regel_id);
  // Ein Muster, das ueber drei oder mehr Kategorien streut, traegt keine
  // Kategorieaussage. Das soll schon beim Anlegen auffallen, nicht erst wenn
  // das Gate die Buchungen stumm zurueckhaelt.
  const referenz = referenzmenge(transaktionen);
  const unspezifisch = kandidaten
    .filter((regel) => !istSpezifisch(regel, referenz))
    .map((regel) => ({ regel_id: regel.regel_id }));

  const blockiert = struktur_fehler.length > 0 || neue_konflikte.length > 0 || wiedervorlagen.length > 0
    || verlorene_bestaetigte.length > 0 || unspezifisch.length > 0;

  return { treffer, treffer_bestaetigt, pro_regel, neue_konflikte, wiedervorlagen, verlorene_bestaetigte, ohne_treffer, struktur_fehler, unspezifisch, blockiert };
}

async function readJsonl(url) {
  const text = await readFile(url, "utf8");
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));
}

const MAX_ZEILEN = 20;

function euro(cents) {
  return (cents / 100).toFixed(2);
}

function bericht(out) {
  const zeilen = [];

  if (out.struktur_fehler.length) {
    zeilen.push(`STRUKTUR-FEHLER (${out.struktur_fehler.length}) — nichts schreiben:`);
    for (const f of out.struktur_fehler) zeilen.push(`  - ${f}`);
    zeilen.push("");
  }

  zeilen.push(`Buchungen im Gesamtbestand, die die Kandidaten treffen: ${out.treffer} (davon ${out.treffer_bestaetigt} bestaetigt)`);
  zeilen.push("");
  for (const [id, r] of Object.entries(out.pro_regel)) {
    const bestaetigt = r.treffer_bestaetigt ? `  (${r.treffer_bestaetigt} bestaetigt)` : "";
    zeilen.push(`${id}  ${String(r.treffer).padStart(4)}x  ${euro(r.summe_cents).padStart(12)} EUR  -> ${r.kategorie_id}${bestaetigt}`);
    for (const b of r.beispiele) zeilen.push(`        ${b.buchungsdatum}  ${String(b.betrag).padStart(10)}  ${b.gegenpartei ?? ""}`);
  }

  if (out.ohne_treffer.length) {
    zeilen.push("");
    zeilen.push(`Ohne aktuellen Treffer (erlaubt, wenn wissensbasiert gewollt): ${out.ohne_treffer.join(", ")}`);
  }

  if (out.unspezifisch.length) {
    zeilen.push("");
    zeilen.push(`UNSPEZIFISCHE MUSTER (${out.unspezifisch.length}) — blockiert:`);
    for (const u of out.unspezifisch) zeilen.push(`  - ${u.regel_id}: Muster streut ueber drei oder mehr Kategorien und traegt keine Kategorieaussage`);
  }
  if (out.neue_konflikte.length) {
    zeilen.push("");
    zeilen.push(`NEUE REGELKONFLIKTE (${out.neue_konflikte.length}) — blockiert:`);
    zeilen.push("  Diese Buchungen landen auf 'offen' statt 'vorgeschlagen'. Der Review sieht");
    zeilen.push("  nur 'vorgeschlagen' und bekommt den Fehler nie zu Gesicht. Muster schaerfen.");
    for (const k of out.neue_konflikte) zeilen.push(`  - ${k.buchungsdatum} ${String(k.betrag).padStart(10)}  ${k.gegenpartei}  [${k.regeln.join(", ")}]`);
  }

  if (out.verlorene_bestaetigte.length) {
    zeilen.push("");
    zeilen.push(`VERLORENE BESTAETIGTE TREFFER (${out.verlorene_bestaetigte.length}) — blockiert:`);
    zeilen.push("  Diese Buchungen sind bestaetigt und fallen durch die Einengung aus der Regel.");
    zeilen.push("  Sie verlieren ihre Kategorie und landen wieder auf 'offen' — eine getroffene");
    zeilen.push("  Nutzerentscheidung waere still weg. Vor dem Schreiben ausdruecklich nachfragen.");
    for (const [id, r] of Object.entries(out.pro_regel)) {
      if (r.verliert_bestaetigt) zeilen.push(`  - Kandidat ${id} verliert ${r.verliert_bestaetigt} bestaetigte Treffer`);
    }
    // Gedeckelt, damit ein Lauf mit 89 Verlusten die Konsole nicht flutet; die
    // vollstaendige Liste steht in --json.
    for (const v of out.verlorene_bestaetigte.slice(0, MAX_ZEILEN)) {
      zeilen.push(`      ${v.buchungsdatum} ${String(v.betrag).padStart(10)}  ${v.gegenpartei}  ${v.ist_kategorie} -> ${v.neu_kategorie ?? "(keine)"}`);
    }
    if (out.verlorene_bestaetigte.length > MAX_ZEILEN) zeilen.push(`      ... und ${out.verlorene_bestaetigte.length - MAX_ZEILEN} weitere (vollstaendig in --json)`);
  }

  if (out.wiedervorlagen.length) {
    zeilen.push("");
    zeilen.push(`WIEDERVORLAGEN (${out.wiedervorlagen.length}) — blockiert:`);
    zeilen.push("  Diese Buchungen sind bereits bestaetigt. Ein Widerspruch ist Nacharbeit an");
    zeilen.push("  einer Nutzerentscheidung — vor dem Schreiben ausdruecklich nachfragen.");
    for (const w of out.wiedervorlagen) zeilen.push(`  - ${w.buchungsdatum} ${String(w.betrag).padStart(10)}  ${w.gegenpartei}  ${w.ist_kategorie} -> ${w.neu_kategorie}  [${w.regeln.join(", ")}]`);
  }

  zeilen.push("");
  zeilen.push(out.blockiert ? "ERGEBNIS: BLOCKIERT — nicht schreiben." : "ERGEBNIS: frei — Kandidaten koennen geschrieben werden.");
  return zeilen.join("\n");
}

const USAGE = `Aufruf: node app/tools/regel-probelauf.mjs <datenroot> <kandidaten.json> [--json] [--aenderung]

Rechnet Regelkandidaten gegen den gesamten Bestand, bevor etwas geschrieben wird.
Exit-Code 2 bei Strukturfehlern, unspezifischen Mustern, neuen Regelkonflikten,
Wiedervorlagen und verlorenen bestaetigten Treffern (Einengung laesst bestaetigte
Buchungen aus der Regel fallen).
--aenderung erlaubt Kandidaten mit bereits vergebener regel_id (Regel bewusst aendern).`;

async function main() {
  const argv = process.argv.slice(2);
  const positional = argv.filter((a) => !a.startsWith("--"));
  const [root, kandidatenPfad] = positional;

  if (!kandidatenPfad) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const masterRoot = dataRootFromArg(root, new URL("../data/master/", import.meta.url), new URL("../", import.meta.url));
  const [transaktionen, bestandsRegeln, kategorien, kandidaten] = await Promise.all([
    readJsonl(new URL("transaktionen.jsonl", masterRoot)),
    readFile(new URL("kategorisierungsregeln.json", masterRoot), "utf8").then(JSON.parse),
    readFile(new URL("kategorien.json", masterRoot), "utf8").then(JSON.parse),
    readFile(new URL(kandidatenPfad, `file://${process.cwd()}/`), "utf8").then(JSON.parse),
  ]);

  const out = probelauf({
    transaktionen,
    bestandsRegeln,
    kandidaten,
    kategorieIds: kategorien.map((k) => k.kategorie_id),
    aenderung: argv.includes("--aenderung"),
  });

  console.log(argv.includes("--json") ? JSON.stringify(out, null, 2) : bericht(out));
  if (out.blockiert) process.exitCode = 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
