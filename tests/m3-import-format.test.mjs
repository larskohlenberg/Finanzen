// tests/m3-import-format.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { validateImportEntry } from "../app/tools/import-format.mjs";

const kontenIds = new Set(["KTO-001", "KTO-004"]);
const valid = {
  konto_id: "KTO-001",
  buchungsdatum: "2026-05-20",
  betrag: "-42.80",
  gegenpartei: "Baeckerei",
  verwendungszweck: "Fruehstueck",
  rohquelle: "data/inbox/ing-mai.csv",
};

test("gueltiger Eintrag hat keine Fehler", () => {
  assert.deepEqual(validateImportEntry(valid, kontenIds), []);
});

test("leere gegenpartei ist erlaubt", () => {
  assert.deepEqual(validateImportEntry({ ...valid, gegenpartei: "" }, kontenIds), []);
});

test("unbekanntes Konto wird gemeldet", () => {
  const errors = validateImportEntry({ ...valid, konto_id: "KTO-099" }, kontenIds);
  assert.match(errors.join("\n"), /konto_id.*unbekannt/);
});

test("fehlender Betrag wird gemeldet", () => {
  const { betrag, ...ohneBetrag } = valid;
  assert.match(validateImportEntry(ohneBetrag, kontenIds).join("\n"), /betrag/);
});

test("falsches Betragsformat wird gemeldet", () => {
  assert.match(validateImportEntry({ ...valid, betrag: "42,80" }, kontenIds).join("\n"), /betrag.*Format/);
});

test("unplausibles Datum wird gemeldet", () => {
  assert.match(validateImportEntry({ ...valid, buchungsdatum: "2026-13-40" }, kontenIds).join("\n"), /buchungsdatum/);
});

test("fehlende rohquelle wird gemeldet", () => {
  const { rohquelle, ...ohneQuelle } = valid;
  assert.match(validateImportEntry(ohneQuelle, kontenIds).join("\n"), /rohquelle/);
});

test("optionale Bankdetails sind erlaubt", () => {
  assert.deepEqual(validateImportEntry({
    ...valid,
    bank_referenz: "BANK-REF-1",
    wertstellungsdatum: "2026-05-21",
    transaktionstyp: "SEPA-Basislastschrift",
    kundenreferenz: "KREF-123",
    empfaenger: "Muster GmbH",
    empfaenger_iban: "DE02120300000000202051",
    mandatsreferenz: "MANDAT-123",
    glaeubiger_id: "DE98ZZZ09999999999",
  }, kontenIds), []);
});

test("unplausibles Wertstellungsdatum wird gemeldet", () => {
  assert.match(validateImportEntry({ ...valid, wertstellungsdatum: "2026-02-31" }, kontenIds).join("\n"), /wertstellungsdatum/);
});
