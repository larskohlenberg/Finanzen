// app/tools/transfer-matcher.mjs
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { toCents, centsToDecimal, dayDiff, normalizeLoose } from "./lib/text.mjs";
import { nextTransferId } from "./ids.mjs";
import { loadMasterData, validateMasterData } from "./validator.mjs";
import { dataRootFromArg } from "./data-root.mjs";

// IBANs werden nur zum Vergleich vereinheitlicht (Gross, ohne Whitespace);
// gespeichert bleibt immer die Originalform.
function normalizeIban(value) {
  return String(value ?? "").replace(/\s+/g, "").toUpperCase();
}

// Datumsfenster je Signal. Freitext-Gleichheit ist das schwaechere Signal und
// bleibt eng; die strukturellen Signale duerfen Monatsende plus Wochenende
// bzw. Feiertag ueberbruecken.
const FENSTER_ZWECK = 3;
const FENSTER_STRUKTUR = 5;

// Deutsche IBAN irgendwo im Freitext, einzelne Leerzeichen zwischen den
// Zeichen toleriert ("DE89 3704 ..." wie "DE893704..."). Bewusst generisch:
// kein Bankwortlaut, kein Parser pro Bank (ADR 0005).
const IBAN_IM_TEXT = /(?<![A-Z0-9])DE\s?\d{2}(?:\s?\d){18}(?!\d)/gi;

export function ibansImText(text) {
  return [...String(text ?? "").matchAll(IBAN_IM_TEXT)].map((m) => normalizeIban(m[0]));
}

// Zweiter Weg zum Auto-Match neben identischem Verwendungszweck: eine Seite
// traegt die Kontoreferenz des Gegenkontos als empfaenger_iban. Das ist ein
// strukturelles Signal und damit staerker als Freitext-Gleichheit — noetig,
// weil zwei Banken denselben Uebertrag unterschiedlich betexten und das
// Textkriterium dann systematisch nie greifen kann.
function ibanGekoppelt(a, b, kontoVonIban) {
  const aZeigtAufB = kontoVonIban.get(normalizeIban(a.empfaenger_iban)) === b.konto_id;
  const bZeigtAufA = kontoVonIban.get(normalizeIban(b.empfaenger_iban)) === a.konto_id;
  return aZeigtAufB || bZeigtAufA;
}

// Dritter Weg: eine Seite nennt im Verwendungszweck eine IBAN, und diese ist
// die Kontoreferenz des Gegenkontos. Typisch fuer Eingaenge, deren Text die
// Absender-IBAN traegt, waehrend die Gegenseite (PDF-Import) keine IBAN kennt.
// Die Absender-IBAN gehoert nicht in empfaenger_iban; der Text reicht.
function ibanImTextGekoppelt(a, b, kontoVonIban) {
  const zeigtAuf = (tx, ziel) => ibansImText(tx.verwendungszweck).some((iban) => kontoVonIban.get(iban) === ziel.konto_id);
  return zeigtAuf(a, b) || zeigtAuf(b, a);
}

// Liefert das ausloesende Signal oder null. Bei mehreren Signalen gewinnt das
// strukturell staerkste; Freitext-Gleichheit traegt nur im engen Fenster und
// nur mit Text: zwei leere Verwendungszwecke sind kein gemeinsames Merkmal.
function signalFuer(a, b, tage, kontoVonIban) {
  if (tage <= FENSTER_STRUKTUR) {
    if (ibanGekoppelt(a, b, kontoVonIban)) return "iban";
    if (ibanImTextGekoppelt(a, b, kontoVonIban)) return "iban-text";
  }
  const zweck = normalizeLoose(a.verwendungszweck);
  if (tage <= FENSTER_ZWECK && zweck !== "" && zweck === normalizeLoose(b.verwendungszweck)) return "zweck";
  return null;
}

// Zwei Kandidaten sind austauschbar, wenn die Wahl am Ergebnis nichts aendert:
// gleiches Konto, gleicher Tag (der Betrag ist ohnehin gleich). Nur eine Wahl
// zwischen NICHT austauschbaren Kandidaten ist mehrdeutig.
const austauschKlasse = (tx) => `${tx.konto_id}|${tx.buchungsdatum}`;

export function matchTransfers(transaktionen, existingTransfers, konten = []) {
  // Ohne Konten-Liste bleibt es beim reinen Textkriterium (Rueckwaertskompatibilitaet).
  const kontoVonIban = new Map(
    konten.filter((k) => k.kontoreferenz).map((k) => [normalizeIban(k.kontoreferenz), k.konto_id]),
  );

  const transfers = [...existingTransfers];
  const usedTransferIds = new Set(existingTransfers.map((transfer) => transfer.transfer_id));
  const matched = [];
  const mehrdeutig = [];

  const open = transaktionen
    .filter((t) => !t.transfer_id && t.ist_transfer !== true && toCents(t.betrag) !== 0)
    .sort((a, b) => a.buchungsdatum.localeCompare(b.buchungsdatum) || a.transaktion_id.localeCompare(b.transaktion_id));

  // Alle zulaessigen Paare (Kanten) mit Abstand und Signal sammeln.
  const kanten = [];
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      const a = open[i];
      const b = open[j];
      if (a.konto_id === b.konto_id) continue;
      if (toCents(a.betrag) + toCents(b.betrag) !== 0) continue;
      const tage = Math.abs(dayDiff(a.buchungsdatum, b.buchungsdatum));
      const signal = signalFuer(a, b, tage, kontoVonIban);
      if (signal) kanten.push({ a, b, tage, signal });
    }
  }

  // Eindeutigkeit statt greedy: Abstandsstufe fuer Abstandsstufe aufsteigend.
  // So bekommt jede Buchung ihr naechstes noch freies Gegenstueck. Hat eine
  // Buchung auf ihrer naechsten Stufe mehrere nicht austauschbare Kandidaten,
  // wird sie samt dieser Kandidaten zurueckgehalten und gemeldet — sie faellt
  // auch nicht auf ein weiter entferntes Gegenstueck zurueck.
  const vergeben = new Set();
  const gesperrt = new Set();
  const frei = (tx) => !vergeben.has(tx.transaktion_id) && !gesperrt.has(tx.transaktion_id);
  for (let tage = 0; tage <= FENSTER_STRUKTUR; tage++) {
    const stufe = kanten.filter((k) => k.tage === tage && frei(k.a) && frei(k.b));
    const partner = new Map();
    for (const k of stufe) {
      for (const [x, y] of [[k.a, k.b], [k.b, k.a]]) {
        if (!partner.has(x.transaktion_id)) partner.set(x.transaktion_id, []);
        partner.get(x.transaktion_id).push(y);
      }
    }
    for (const [id, kandidaten] of partner) {
      if (new Set(kandidaten.map(austauschKlasse)).size < 2) continue;
      mehrdeutig.push({ transaktion_id: id, kandidaten: kandidaten.map((t) => t.transaktion_id).sort(), tage });
    }
    for (const eintrag of mehrdeutig.filter((m) => m.tage === tage)) {
      gesperrt.add(eintrag.transaktion_id);
      for (const id of eintrag.kandidaten) gesperrt.add(id);
    }

    for (const { a, b, signal } of stufe) {
      if (!frei(a) || !frei(b)) continue;
      const abgang = toCents(a.betrag) < 0 ? a : b;
      const zugang = abgang === a ? b : a;
      const transferId = nextTransferId(usedTransferIds);
      usedTransferIds.add(transferId);

      transfers.push({
        transfer_id: transferId,
        betrag: centsToDecimal(Math.abs(toCents(abgang.betrag))),
        typ: "intern",
        abgang_transaktion_id: abgang.transaktion_id,
        zugang_transaktion_id: zugang.transaktion_id,
      });
      abgang.ist_transfer = true;
      abgang.transfer_id = transferId;
      zugang.ist_transfer = true;
      zugang.transfer_id = transferId;
      matched.push({ transfer_id: transferId, from: abgang.transaktion_id, to: zugang.transaktion_id, signal, tage });
      vergeben.add(a.transaktion_id);
      vergeben.add(b.transaktion_id);
    }
  }

  mehrdeutig.sort((x, y) => x.transaktion_id.localeCompare(y.transaktion_id));
  return { transaktionen, transfers, matched, mehrdeutig };
}

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}
async function readJsonl(url) {
  const text = await readFile(url, "utf8");
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));
}

// Lauf ueber den BESTAND. import.mjs paart nur die Buchungen eines Importlaufs;
// nach einem neu angelegten Konto oder einer Korrektur muss der Bestand
// nachgezogen werden. Vorschau ist Default wie bei confirm.mjs und inbox.mjs.
async function main() {
  const argv = process.argv.slice(2);
  const schreiben = argv.includes("--schreiben");
  const masterRoot = dataRootFromArg(argv.find((a) => !a.startsWith("--")), new URL("../data/master/", import.meta.url), new URL("../", import.meta.url));

  const [transaktionen, transfers, konten] = await Promise.all([
    readJsonl(new URL("transaktionen.jsonl", masterRoot)),
    readJson(new URL("transfers.json", masterRoot)),
    readJson(new URL("konten.json", masterRoot)),
  ]);

  const out = matchTransfers(transaktionen, transfers, konten);
  const betragVon = new Map(out.transfers.map((t) => [t.transfer_id, t.betrag]));
  const volumen = out.matched.reduce((sum, m) => sum + toCents(betragVon.get(m.transfer_id)), 0);
  // Je Paar das ausloesende Signal (zweck | iban | iban-text) und den Abstand
  // in Tagen, damit die Vorschau vor dem Schreiben pruefbar ist.
  const paare = out.matched.map((m) => ({ transfer_id: m.transfer_id, abgang: m.from, zugang: m.to, betrag: betragVon.get(m.transfer_id), tage: m.tage, signal: m.signal }));
  console.log(JSON.stringify({
    modus: schreiben ? "geschrieben" : "vorschau",
    neue_paare: out.matched.length,
    volumen: centsToDecimal(volumen),
    transfers_gesamt: out.transfers.length,
    mehrdeutig_anzahl: out.mehrdeutig.length,
    paare,
    mehrdeutig: out.mehrdeutig,
  }, null, 2));

  if (!schreiben) {
    console.log("\nVorschau — nichts geschrieben. Mit --schreiben anwenden.");
    return;
  }

  await writeFile(new URL("transaktionen.jsonl", masterRoot), out.transaktionen.map((tx) => JSON.stringify(tx)).join("\n") + "\n");
  await writeFile(new URL("transfers.json", masterRoot), JSON.stringify(out.transfers, null, 2) + "\n");

  const validation = validateMasterData(await loadMasterData(masterRoot));
  if (!validation.valid) {
    console.error("Validierung nach Transfer-Lauf fehlgeschlagen:");
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
