import assert from "node:assert/strict";
import test from "node:test";
import { monatsMittel } from "../app/uebersicht-rechnung.mjs";

const kategorien = [
  { kategorie_id: "KAT-001", name: "Gehalt", typ: "einnahme" },
  { kategorie_id: "KAT-003", name: "Wohnen", typ: "ausgabe" },
  { kategorie_id: "KAT-004", name: "Lebensmittel", typ: "ausgabe" },
  { kategorie_id: "KAT-008", name: "Kinder", typ: "ausgabe" },
  { kategorie_id: "KAT-009", name: "Sparen & Umbuchung", typ: "neutral", sparziel: "depot" },
  { kategorie_id: "KAT-014", name: "Altersvorsorge", typ: "neutral", sparziel: "versicherung" },
  { kategorie_id: "KAT-026", name: "Festgeld", typ: "neutral", sparziel: "liquide" },
  { kategorie_id: "KAT-030", name: "Steuern", typ: "ausgabe", gutschriften_sondereffekt: true },
  { kategorie_id: "KAT-012", name: "Noch zu klaeren", typ: "neutral" },
];
const tx = (buchungsdatum, betrag, kategorie_id, extra = {}) => ({ buchungsdatum, betrag, kategorie_id, ist_transfer: false, ...extra });

test("monatsMittel: Durchschnitt der letzten zwoelf vollen Monate je Seite und Kategorie", () => {
  const transaktionen = [];
  for (let m = 1; m <= 12; m++) {
    const monat = `2025-${String(m).padStart(2, "0")}`;
    transaktionen.push(tx(`${monat}-01`, "3000.00", "KAT-001"));
    transaktionen.push(tx(`${monat}-03`, "-1200.00", "KAT-003"));
  }
  transaktionen.push(
    tx("2025-06-10", "-600.00", "KAT-004"),
    tx("2025-06-12", "60.00", "KAT-004"), // Erstattung mindert die Ausgaben
    tx("2025-07-01", "-240.00", "KAT-012"), // ungeklaert: nach Vorzeichen
    tx("2025-07-02", "-5000.00", "KAT-009"), // Sparen zaehlt nicht
    tx("2025-07-03", "-999.00", "KAT-004", { ist_transfer: true }), // Transfer zaehlt nicht
    tx("2026-01-05", "-777.00", "KAT-004"), // laufender Monat zaehlt nicht
    tx("2024-12-31", "-888.00", "KAT-004"), // vor dem Fenster
  );
  const r = monatsMittel({ transaktionen, kategorien }, "2026-01-20");

  assert.deepEqual(r.monate, ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12"]);
  assert.equal(r.von, "2025-01-01");
  assert.equal(r.bis, "2025-12-31");
  assert.equal(r.einnahmen.mittel_cents, 300000);
  assert.equal(r.einnahmen.je_monat.length, 12);
  // (12*1200 + 540 + 240) / 12 = 1265
  assert.equal(r.ausgaben.mittel_cents, 126500);
  assert.equal(r.ausgaben.je_monat[5], 174000);
  assert.deepEqual(r.ausgaben.kategorien.map((k) => [k.kategorie_id, k.mittel_cents]), [["KAT-003", 120000], ["KAT-004", 4500], ["KAT-012", 2000]]);
  assert.equal(r.ausgaben.kategorien[0].name, "Wohnen");
});

test("monatsMittel: kurze Historie teilt nur durch die Monate seit der ersten Buchung", () => {
  const transaktionen = [tx("2025-11-01", "2000.00", "KAT-001"), tx("2025-12-01", "2000.00", "KAT-001")];
  const r = monatsMittel({ transaktionen, kategorien }, "2026-01-20");
  assert.equal(r.anzahl_monate, 2);
  assert.equal(r.einnahmen.mittel_cents, 200000);
  assert.deepEqual(r.monate, ["2025-11", "2025-12"]);
  assert.equal(r.von, "2025-11-01");

  assert.equal(monatsMittel({ transaktionen: [], kategorien }, "2026-01-20").anzahl_monate, 0);
});

test("monatsMittel: Fenster endet mit dem letzten Buchungsmonat, nicht mit leeren Monaten", () => {
  const transaktionen = [];
  for (let m = 1; m <= 12; m++) transaktionen.push(tx(`2025-${String(m).padStart(2, "0")}-01`, "1200.00", "KAT-001"));
  const r = monatsMittel({ transaktionen, kategorien }, "2026-04-10");
  assert.equal(r.monate[0], "2025-01");
  assert.equal(r.monate.at(-1), "2025-12");
  assert.equal(r.bis, "2025-12-31");
  assert.equal(r.einnahmen.mittel_cents, 120000);
});

test("monatsMittel: Kategorie mit Gutschrift-Ueberhang zaehlt als Einnahme, Sparquote mit Aufteilung", () => {
  const transaktionen = [];
  for (let m = 1; m <= 12; m++) {
    const monat = `2025-${String(m).padStart(2, "0")}`;
    transaktionen.push(tx(`${monat}-01`, "4000.00", "KAT-001"));
    transaktionen.push(tx(`${monat}-02`, "-2000.00", "KAT-003"));
    transaktionen.push(tx(`${monat}-03`, "250.00", "KAT-008")); // Kindergeld
    transaktionen.push(tx(`${monat}-04`, "-50.00", "KAT-008")); // Kinderausgabe
    transaktionen.push(tx(`${monat}-05`, "-1000.00", "KAT-009"));
    transaktionen.push(tx(`${monat}-06`, "-500.00", "KAT-014"));
  }
  const r = monatsMittel({ transaktionen, kategorien }, "2026-01-20");
  // Kinder netto +200/Monat -> Einnahme.
  assert.equal(r.einnahmen.mittel_cents, 420000);
  assert.deepEqual(r.einnahmen.kategorien.map((k) => k.kategorie_id), ["KAT-001", "KAT-008"]);
  assert.equal(r.ausgaben.mittel_cents, 200000);
  assert.equal(r.ausgaben.je_monat[0], 200000);
  assert.equal(r.sparen.ueberschuss_cents, 220000);
  assert.equal(Math.round(r.sparen.quote * 1000), 524);
  assert.deepEqual(r.sparen.ziele.map((z) => [z.ziel, z.mittel_cents]), [["liquide", 70000], ["depot", 100000], ["versicherung", 50000]]);
  assert.deepEqual(r.sparen.ziele[1].kategorien, ["KAT-009"]);
});

test("monatsMittel: Steuererstattung ist Sondereffekt, Steuerzahlung bleibt Ausgabe, Festgeld bleibt liquide", () => {
  const transaktionen = [];
  for (let m = 1; m <= 12; m++) transaktionen.push(tx(`2025-${String(m).padStart(2, "0")}-01`, "3000.00", "KAT-001"));
  transaktionen.push(
    tx("2025-03-10", "12000.00", "KAT-030"), // Erstattung
    tx("2025-09-28", "-120.00", "KAT-030"), // Kfz-Steuer
    tx("2025-05-01", "-6000.00", "KAT-026"), // Festgeld angelegt
  );
  const r = monatsMittel({ transaktionen, kategorien }, "2026-01-20");
  assert.equal(r.einnahmen.mittel_cents, 300000);
  assert.equal(r.ausgaben.mittel_cents, 1000);
  assert.deepEqual(r.sondereffekte, [{ kategorie_id: "KAT-030", name: "Steuern", summe_cents: 1200000, buchungen: [{ datum: "2025-03-10", betrag_cents: 1200000 }] }]);
  // Festgeld ist kein Depot und keine Versicherung: alles bleibt liquide.
  assert.deepEqual(r.sparen.ziele.map((z) => z.mittel_cents), [299000, 0, 0]);
  // Davon Festgeld 500/Monat, der Rest auf Konten und Tagesgeld.
  assert.deepEqual(r.sparen.ziele[0].teile, [{ kategorie_id: "KAT-026", name: "Festgeld", mittel_cents: 50000 }]);
  assert.equal(r.sparen.ziele[0].konten_cents, 249000);
});

test("monatsMittel: Investitionen zaehlen nicht, brutto-Kategorien teilen nach Vorzeichen", () => {
  const kat = [
    { kategorie_id: "KAT-001", name: "Gehalt", typ: "einnahme" },
    { kategorie_id: "KAT-008", name: "Kinder", typ: "ausgabe", brutto: true },
    { kategorie_id: "KAT-027", name: "Investition Immobilie", typ: "ausgabe", investition: true },
  ];
  const transaktionen = [];
  for (let m = 1; m <= 12; m++) {
    const monat = `2025-${String(m).padStart(2, "0")}`;
    transaktionen.push(tx(`${monat}-01`, "3000.00", "KAT-001"));
    transaktionen.push(tx(`${monat}-05`, "-100.00", "KAT-008")); // Taschengeld
  }
  transaktionen.push(
    tx("2025-06-01", "600.00", "KAT-008"), // Rueckzahlung Fuehrerschein
    tx("2025-04-01", "-30000.00", "KAT-027"), // Heizung
    tx("2025-08-01", "15000.00", "KAT-027"), // Zuschuss
  );
  const r = monatsMittel({ transaktionen, kategorien: kat }, "2026-01-20");
  assert.equal(r.einnahmen.mittel_cents, 305000);
  assert.deepEqual(r.einnahmen.kategorien.map((k) => [k.kategorie_id, k.mittel_cents]), [["KAT-001", 300000], ["KAT-008", 5000]]);
  assert.equal(r.ausgaben.mittel_cents, 10000);
  assert.deepEqual(r.ausgaben.kategorien.map((k) => k.kategorie_id), ["KAT-008"]);
  assert.equal(r.sparen.ueberschuss_cents, 295000);
});

test("monatsMittel: Zeitraum endet mit dem letzten Monat, den alle Konten vollstaendig belegen", () => {
  const kat = [{ kategorie_id: "KAT-001", name: "Gehalt", typ: "einnahme" }];
  const transaktionen = [];
  for (let m = 1; m <= 9; m++) transaktionen.push(tx(`2026-${String(m).padStart(2, "0")}-01`, "1000.00", "KAT-001"));
  // Ein Konto ist erst bis 15.09. belegt: der September zaehlt noch nicht.
  const halb = monatsMittel({ transaktionen, kategorien: kat }, "2026-10-18", { vollstaendigBis: "2026-09-15" });
  assert.equal(halb.monate.at(-1), "2026-08");
  assert.equal(halb.bis, "2026-08-31");
  // Alle Konten bis 30.09. belegt: September zaehlt.
  assert.equal(monatsMittel({ transaktionen, kategorien: kat }, "2026-10-18", { vollstaendigBis: "2026-09-30" }).monate.at(-1), "2026-09");
  // Stand im laufenden Monat aendert nichts: der laufende Monat zaehlt nie.
  assert.equal(monatsMittel({ transaktionen, kategorien: kat }, "2026-10-18", { vollstaendigBis: "2026-10-31" }).monate.at(-1), "2026-09");
});
