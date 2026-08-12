import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateMasterData } from "../app/tools/validator.mjs";

function basis() {
  return {
    personen: [
      { person_id: "PER-001", name: "Person A", status: "aktiv" },
      { person_id: "PER-002", name: "Person B", status: "aktiv" },
    ],
    konten: [
      { konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" },
    ],
    kategorien: [],
    transaktionen: [],
    transfers: [],
    regelzahlungen: [],
    immobilien: [],
    darlehen: [],
    vermoegenswerte: [],
    zeitwerte: [],
  };
}

test("gültige Immobilie mit Bruch-Anteilen Summe 1 ist valide", () => {
  const data = basis();
  data.immobilien.push({
    immobilie_id: "IMM-001",
    bezeichnung: "EFH",
    eigentumsanteile: [
      { person_id: "PER-001", zaehler: 2, nenner: 3 },
      { person_id: "PER-002", zaehler: 1, nenner: 3 },
    ],
    status: "aktiv",
  });
  const result = validateMasterData(data);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("Eigentumsanteile mit Summe != 1 ist Fehler", () => {
  const data = basis();
  data.immobilien.push({
    immobilie_id: "IMM-001",
    bezeichnung: "EFH",
    eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 3 }],
    status: "aktiv",
  });
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("eigentumsanteile") && e.includes("Summe")));
});

test("Eigentumsanteil mit unbekannter person_id ist Fehler", () => {
  const data = basis();
  data.immobilien.push({
    immobilie_id: "IMM-001",
    bezeichnung: "EFH",
    eigentumsanteile: [{ person_id: "PER-999", zaehler: 1, nenner: 1 }],
    status: "aktiv",
  });
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("PER-999")));
});

test("Darlehen mit kaputter immobilie_id/konto_id ist Fehler", () => {
  const data = basis();
  data.darlehen.push({
    darlehen_id: "DAR-001", bezeichnung: "Hyp", status: "aktiv",
    anfangsbetrag: "300000.00", anfangsdatum: "2020-01-01", zinssatz: "1.85",
    sollrate: "1200.00", rhythmus_einheit: "monat", rhythmus_intervall: 1,
    immobilie_id: "IMM-404", konto_id: "KTO-404",
  });
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("IMM-404")));
  assert.ok(result.errors.some((e) => e.includes("KTO-404")));
});

test("Zeitwert mit kaputter entitaet_id ist Fehler", () => {
  const data = basis();
  data.zeitwerte.push({
    entitaet: "konto", entitaet_id: "KTO-404", feld: "kontostand",
    wert: "1000.00", standdatum: "2026-01-01", qualitaet: "belegt",
  });
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("KTO-404")));
});

test("Regelzahlung mit kaputter darlehen_id ist Fehler", () => {
  const data = basis();
  data.regelzahlungen.push({
    regelzahlung_id: "RZ-001", bezeichnung: "Rate", betrag: "-1200.00",
    rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-01",
    status: "bestaetigt", erstellt_am: "2026-01-01", darlehen_id: "DAR-404",
  });
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("DAR-404")));
});

function basisMitTransaktion(herkunft) {
  const data = basis();
  data.kategorien.push({ kategorie_id: "KAT-001", name: "Lebensmittel", typ: "ausgabe", lebenshaltung_relevant: true, status: "aktiv" });
  const tx = {
    transaktion_id: "TXN-4bacb864-48f3-444b-9523-0e32eb870e63", dedupe_hash: "h1", rohquelle: "data/inbox/x.csv",
    konto_id: "KTO-001", buchungsdatum: "2026-05-20", betrag: "-42.80",
    gegenpartei: "MusterladenA", verwendungszweck: "Einkauf",
    kategorisierung_status: "vorgeschlagen", ist_transfer: false, kategorie_id: "KAT-001",
  };
  if (herkunft !== undefined) tx.kategorie_herkunft = herkunft;
  data.transaktionen.push(tx);
  return data;
}

test("Transaktion mit kategorie_herkunft=regel ist valide", () => {
  const result = validateMasterData(basisMitTransaktion("regel"));
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("Transaktion mit kategorie_herkunft=manuell ist valide", () => {
  const result = validateMasterData(basisMitTransaktion("manuell"));
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("Transaktion mit unbekanntem kategorie_herkunft ist Fehler", () => {
  const result = validateMasterData(basisMitTransaktion("geraten"));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("kategorie_herkunft")));
});

test("JSON-Transaktionsvertrag erlaubt eine Immobilienreferenz", () => {
  const schema = JSON.parse(readFileSync(
    new URL("../app/schemas/transaktionen.schema.json", import.meta.url),
    "utf8",
  ));
  assert.equal(schema.items.properties.immobilie_id.pattern, "^IMM-\\d{3}$");
});

test("Transaktion mit existierender immobilie_id ist valide", () => {
  const data = basisMitTransaktion("regel");
  data.immobilien.push({
    immobilie_id: "IMM-001",
    bezeichnung: "Testobjekt",
    eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 1 }],
    status: "aktiv",
  });
  data.transaktionen[0].immobilie_id = "IMM-001";

  const result = validateMasterData(data);
  assert.equal(result.valid, true, result.errors.join("\n"));
});

test("Transaktion mit unbekannter immobilie_id ist ungueltig", () => {
  const data = basisMitTransaktion("regel");
  data.transaktionen[0].immobilie_id = "IMM-999";

  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /immobilie_id.*IMM-999.*existiert nicht/);
});

test("Transaktion mit falsch formatierter immobilie_id ist ungueltig", () => {
  const data = basisMitTransaktion("regel");
  data.transaktionen[0].immobilie_id = "IMM-1";

  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /immobilie_id.*Format ungueltig/);
});
