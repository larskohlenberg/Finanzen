// tests/normalize.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeCsv } from "../app/tools/normalize.mjs";

// Profil nachgebaut aus dem echten Volkswagen-Bank-Export: Vorspann vor der
// Kopfzeile, getrennte Soll-/Haben-Spalten, deutsches Datum und Dezimalkomma.
const profil = {
  profil_id: "test-bank",
  konto_id: "KTO-002",
  trennzeichen: ";",
  kopfzeile: "Buchungsdatum",
  datumsformat: "DD.MM.YYYY",
  dezimal: ",",
  felder: {
    buchungsdatum: { spalte: "Buchungsdatum" },
    wertstellungsdatum: { spalte: "Wertstellung" },
    betrag: { soll: "Soll (EUR)", haben: "Haben (EUR)" },
    gegenpartei: { spalte: "Umsatzinformation", muster: "^(.*?)\\s+BIC:", gruppe: 1 },
    verwendungszweck: { spalte: "Umsatzinformation" },
    transaktionstyp: { spalte: "Umsatzart" },
  },
};

const KOPF = "Nr.;Buchungsdatum;Umsatzart;Umsatzinformation;Wertstellung;Soll (EUR);Haben (EUR)";

function csv(...zeilen) {
  return ["Kontoinhaber;Erika Mustermann", "Saldo (EUR);123,45", "", KOPF, ...zeilen].join("\n");
}

test("ueberspringt den Vorspann und findet die Kopfzeile", () => {
  const out = normalizeCsv({ text: csv(`1;"01.06.2026";"Belastung";"Uebertrag BIC: X";"02.06.2026";"2000,00";""`), profil, rohquelle: "Belege/x.csv" });
  assert.equal(out.eintraege.length, 1);
  assert.deepEqual(out.fehler, []);
});

test("wandelt deutsches Datum in ISO", () => {
  const out = normalizeCsv({ text: csv(`1;"01.06.2026";"Belastung";"Text BIC: X";"02.06.2026";"10,00";""`), profil, rohquelle: "Belege/x.csv" });
  assert.equal(out.eintraege[0].buchungsdatum, "2026-06-01");
  assert.equal(out.eintraege[0].wertstellungsdatum, "2026-06-02");
});

test("Soll wird negativ, Haben positiv", () => {
  const out = normalizeCsv({
    text: csv(`1;"01.06.2026";"Belastung";"A BIC: X";"01.06.2026";"2000,00";""`, `2;"02.06.2026";"Gutschrift";"B BIC: X";"02.06.2026";"";"1400,00"`),
    profil,
    rohquelle: "Belege/x.csv",
  });
  assert.equal(out.eintraege[0].betrag, "-2000.00");
  assert.equal(out.eintraege[1].betrag, "1400.00");
});

test("Tausenderpunkt im deutschen Betrag wird korrekt gelesen", () => {
  const out = normalizeCsv({ text: csv(`1;"01.06.2026";"X";"A BIC: X";"01.06.2026";"12.345,67";""`), profil, rohquelle: "Belege/x.csv" });
  assert.equal(out.eintraege[0].betrag, "-12345.67");
});

test("Zeile ohne Soll und ohne Haben ist ein Fehler, nie still 0,00", () => {
  const out = normalizeCsv({ text: csv(`1;"01.06.2026";"X";"A BIC: X";"01.06.2026";"";""`), profil, rohquelle: "Belege/x.csv" });
  assert.equal(out.eintraege.length, 0);
  assert.equal(out.fehler.length, 1);
  assert.match(out.fehler[0].grund, /Betrag/);
  assert.equal(out.fehler[0].zeile, 5);
});

test("eine kaputte Zeile stoppt den Lauf nicht — zeilenweise, kein Alles-oder-nichts", () => {
  const out = normalizeCsv({
    text: csv(`1;"kein datum";"X";"A BIC: X";"01.06.2026";"10,00";""`, `2;"02.06.2026";"X";"B BIC: X";"02.06.2026";"20,00";""`),
    profil,
    rohquelle: "Belege/x.csv",
  });
  assert.equal(out.eintraege.length, 1);
  assert.equal(out.eintraege[0].betrag, "-20.00");
  assert.equal(out.fehler.length, 1);
  assert.match(out.fehler[0].grund, /[Dd]atum/);
});

test("extrahiert die Gegenpartei per Muster aus einer Sammelspalte", () => {
  const out = normalizeCsv({ text: csv(`1;"01.06.2026";"X";"Stadtwerke Salzgitter  BIC: ABCDEF IBAN: DE12";"01.06.2026";"219,00";""`), profil, rohquelle: "Belege/x.csv" });
  assert.equal(out.eintraege[0].gegenpartei, "Stadtwerke Salzgitter");
  assert.equal(out.eintraege[0].verwendungszweck, "Stadtwerke Salzgitter  BIC: ABCDEF IBAN: DE12");
});

test("Gegenpartei bleibt leer statt geraten, wenn das Muster nicht greift", () => {
  const out = normalizeCsv({ text: csv(`1;"01.06.2026";"X";"Ohne Trennmarker";"01.06.2026";"10,00";""`), profil, rohquelle: "Belege/x.csv" });
  assert.equal(out.eintraege[0].gegenpartei, "");
});

test("setzt konto_id aus dem Profil und rohquelle aus dem Aufruf", () => {
  const out = normalizeCsv({ text: csv(`1;"01.06.2026";"X";"A BIC: X";"01.06.2026";"10,00";""`), profil, rohquelle: "Belege/Kontoauszuege/KTO-002/x.csv" });
  assert.equal(out.eintraege[0].konto_id, "KTO-002");
  assert.equal(out.eintraege[0].rohquelle, "Belege/Kontoauszuege/KTO-002/x.csv");
});

test("respektiert Anfuehrungszeichen mit eingebettetem Trennzeichen", () => {
  const out = normalizeCsv({ text: csv(`1;"01.06.2026";"X";"Rechnung 1;2;3 BIC: X";"01.06.2026";"10,00";""`), profil, rohquelle: "Belege/x.csv" });
  assert.equal(out.eintraege[0].verwendungszweck, "Rechnung 1;2;3 BIC: X");
});

test("ignoriert Leerzeilen und Vorspann-Reste hinter der Kopfzeile", () => {
  const out = normalizeCsv({ text: csv(`1;"01.06.2026";"X";"A BIC: X";"01.06.2026";"10,00";""`, "", ";;;;;;"), profil, rohquelle: "Belege/x.csv" });
  assert.equal(out.eintraege.length, 1);
  assert.deepEqual(out.fehler, []);
});

test("fehlende Kopfzeile ist ein harter Fehler mit Hinweis auf das Profil", () => {
  assert.throws(
    () => normalizeCsv({ text: "irgendwas\nohne kopf", profil, rohquelle: "Belege/x.csv" }),
    /Kopfzeile/,
  );
});

test("eine im Profil erwartete Spalte, die die Datei nicht hat, bricht sichtbar ab", () => {
  // Genau der Fall "Bank hat die Spalten umbenannt": lauter Fehler statt
  // stiller Falschzuordnung.
  const text = ["Nr.;Buchungsdatum;Umsatzart;Wertstellung;Soll (EUR);Haben (EUR)", `1;"01.06.2026";"X";"01.06.2026";"10,00";""`].join("\n");
  assert.throws(() => normalizeCsv({ text, profil, rohquelle: "Belege/x.csv" }), /Umsatzinformation/);
});
