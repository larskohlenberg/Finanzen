import { test } from "node:test";
import assert from "node:assert/strict";
import { aktuellerZeitwert, kontoWert, restschuldHeute, anteilWertCents, faelligkeiten, computeNettovermoegen, computeVermoegenChecks, STANDDATUM_SCHWELLEN } from "../app/vermoegen.mjs";

function vollDaten() {
  return {
    personen: [{ person_id: "PER-001", name: "Lars", status: "aktiv" }, { person_id: "PER-002", name: "Katrin", status: "aktiv" }],
    konten: [
      { konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" },
      { konto_id: "KTO-006", name: "Depot", kontotyp: "depot", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" },
    ],
    transaktionen: [{ konto_id: "KTO-001", buchungsdatum: "2026-02-10", betrag: "-200.00", ist_transfer: false }],
    immobilien: [{ immobilie_id: "IMM-001", bezeichnung: "EFH", eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 1 }], status: "aktiv" }],
    darlehen: [{ darlehen_id: "DAR-001", bezeichnung: "Hyp", status: "aktiv", anfangsbetrag: "300000.00", anfangsdatum: "2020-01-31", zinssatz: "1.80", sollrate: "800.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, immobilie_id: "IMM-001" }],
    vermoegenswerte: [{ vermoegenswert_id: "VMW-001", typ: "edelmetall", bezeichnung: "Gold", eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 1 }], status: "aktiv" }],
    regelzahlungen: [],
    zeitwerte: [
      { entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "1000.00", standdatum: "2026-01-31", qualitaet: "belegt" },
      { entitaet: "konto", entitaet_id: "KTO-006", feld: "depotwert", wert: "25000.00", standdatum: "2026-02-01", qualitaet: "belegt" },
      { entitaet: "immobilie", entitaet_id: "IMM-001", feld: "marktwert", wert: "400000.00", standdatum: "2026-01-01", qualitaet: "geschaetzt" },
      { entitaet: "darlehen", entitaet_id: "DAR-001", feld: "restschuld", wert: "200000.00", standdatum: "2026-01-31", qualitaet: "belegt" },
      { entitaet: "vermoegenswert", entitaet_id: "VMW-001", feld: "marktwert", wert: "5000.00", standdatum: "2026-02-01", qualitaet: "geschaetzt" },
    ],
  };
}

test("aktuellerZeitwert nimmt den jüngsten Eintrag pro (entitaet_id, feld)", () => {
  const zw = [
    { entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "1000.00", standdatum: "2026-01-31", qualitaet: "belegt" },
    { entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "1200.00", standdatum: "2026-03-31", qualitaet: "belegt" },
  ];
  const result = aktuellerZeitwert(zw, "konto", "KTO-001", "kontostand");
  assert.equal(result.wert, "1200.00");
  assert.equal(result.standdatum, "2026-03-31");
});

test("kontoWert für Cash-Konto: Anker + Buchungen nach Standdatum", () => {
  const konto = { konto_id: "KTO-001", kontotyp: "giro", liquiditaetsrelevant: true };
  const zw = [{ entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "1000.00", standdatum: "2026-01-31", qualitaet: "belegt" }];
  const tx = [
    { konto_id: "KTO-001", buchungsdatum: "2026-01-15", betrag: "500.00", ist_transfer: false }, // vor Anker -> ignoriert
    { konto_id: "KTO-001", buchungsdatum: "2026-02-10", betrag: "-200.00", ist_transfer: false },
    { konto_id: "KTO-001", buchungsdatum: "2026-02-20", betrag: "50.00", ist_transfer: true }, // Transfer zählt mit (Saldo, nicht Cashflow)
  ];
  const result = kontoWert(konto, zw, tx, "2026-03-01");
  // 1000.00 - 200.00 + 50.00 = 850.00
  assert.equal(result.wert_cents, 85000);
  assert.equal(result.basis, "anker+buchungen");
});

test("kontoWert für Depot: nur depotwert, keine Buchungssumme", () => {
  const konto = { konto_id: "KTO-006", kontotyp: "depot", liquiditaetsrelevant: true };
  const zw = [{ entitaet: "konto", entitaet_id: "KTO-006", feld: "depotwert", wert: "25000.00", standdatum: "2026-02-01", qualitaet: "belegt" }];
  const tx = [{ konto_id: "KTO-006", buchungsdatum: "2026-02-15", betrag: "-100.00", ist_transfer: false }];
  const result = kontoWert(konto, zw, tx, "2026-03-01");
  assert.equal(result.wert_cents, 2500000);
  assert.equal(result.basis, "depotwert");
});

test("kontoWert für bar: kein Beitrag", () => {
  const konto = { konto_id: "KTO-009", kontotyp: "bar", liquiditaetsrelevant: false };
  const result = kontoWert(konto, [], [], "2026-03-01");
  assert.equal(result.wert_cents, null);
  assert.equal(result.basis, "bar-ignoriert");
});

test("kontoWert ohne Anker: fehlend markiert", () => {
  const konto = { konto_id: "KTO-001", kontotyp: "giro", liquiditaetsrelevant: true };
  const result = kontoWert(konto, [], [], "2026-03-01");
  assert.equal(result.wert_cents, null);
  assert.equal(result.basis, "anker-fehlt");
});

test("restschuldHeute: Annuität, eine Monatsrate nach Anker", () => {
  // Anker 200000.00 zum 2026-01-31, Zins 1.80% p.a., Rate 800.00/Monat
  const dar = { darlehen_id: "DAR-001", status: "aktiv", anfangsbetrag: "300000.00", anfangsdatum: "2020-01-31", zinssatz: "1.80", sollrate: "800.00", rhythmus_einheit: "monat", rhythmus_intervall: 1 };
  const zw = [{ entitaet: "darlehen", entitaet_id: "DAR-001", feld: "restschuld", wert: "200000.00", standdatum: "2026-01-31", qualitaet: "belegt" }];
  // Eine Fälligkeit (2026-02-29? Anker-Tag 31 -> Februar clamped 28) bis today 2026-03-01
  const result = restschuldHeute(dar, zw, "2026-03-01");
  // Zins Monat = round(20000000 * 1.80 / 100 / 12) = round(300000) = 30000 Cent = 300.00
  // Tilgung = 80000 - 30000 = 50000 Cent; Restschuld = 20000000 - 50000 = 19950000
  assert.equal(result.wert_cents, 19950000);
  assert.equal(result.basis, "anker+tilgung");
});

test("restschuldHeute ohne Anker: fehlend markiert", () => {
  const dar = { darlehen_id: "DAR-001", status: "aktiv", anfangsbetrag: "300000.00", anfangsdatum: "2020-01-31", zinssatz: "1.80", sollrate: "800.00", rhythmus_einheit: "monat", rhythmus_intervall: 1 };
  const result = restschuldHeute(dar, [], "2026-03-01");
  assert.equal(result.wert_cents, null);
  assert.equal(result.basis, "anker-fehlt");
});

test("anteilWertCents summiert nur person_id-Anteile, externe fallen raus", () => {
  // 90000.00 Marktwert, 2/3 PER-001, 1/3 extern
  const cents = anteilWertCents(9000000, [
    { person_id: "PER-001", zaehler: 2, nenner: 3 },
    { extern: true, zaehler: 1, nenner: 3 },
  ]);
  assert.equal(cents, 6000000);
});

test("anteilWertCents ignoriert Anteil ohne person_id auch ohne extern-Flag", () => {
  const cents = anteilWertCents(9000000, [
    { person_id: "PER-001", zaehler: 1, nenner: 2 },
    { zaehler: 1, nenner: 2 }, // weder person_id noch extern -> zählt nicht
  ]);
  assert.equal(cents, 4500000);
});

test("faelligkeiten: Termin genau auf bis ist inklusiv, Anker exklusiv", () => {
  const dar = { anfangsdatum: "2020-01-31", rhythmus_einheit: "monat", rhythmus_intervall: 1 };
  // nach = 2026-01-31 (Anker, exklusiv), bis = 2026-02-28 (geclampter Termin, inklusiv)
  const dates = faelligkeiten(dar, "2026-01-31", "2026-02-28");
  assert.deepEqual(dates, ["2026-02-28"]);
});

test("faelligkeiten: nach == bis liefert leere Liste", () => {
  const dar = { anfangsdatum: "2020-01-31", rhythmus_einheit: "monat", rhythmus_intervall: 1 };
  assert.deepEqual(faelligkeiten(dar, "2026-02-28", "2026-02-28"), []);
});

test("faelligkeiten: mehrere Perioden zwischen nach und bis", () => {
  const dar = { anfangsdatum: "2020-01-15", rhythmus_einheit: "monat", rhythmus_intervall: 1 };
  const dates = faelligkeiten(dar, "2026-01-15", "2026-04-15");
  assert.deepEqual(dates, ["2026-02-15", "2026-03-15", "2026-04-15"]);
});

test("computeNettovermoegen summiert Aktiva minus Passiva", () => {
  const r = computeNettovermoegen(vollDaten(), "2026-03-01");
  // Aktiva: Giro 800.00 + Depot 25000.00 + Immobilie 400000.00 + Gold 5000.00 = 430800.00
  // Passiva: Restschuld 199500.00 (Zins 300, Tilgung 500 für eine Februar-Rate)
  // Netto = 430800.00 - 199500.00 = 231300.00
  assert.equal(r.aktiva_cents, 43080000);
  assert.equal(r.passiva_cents, 19950000);
  assert.equal(r.netto_cents, 23130000);
  assert.ok(r.positionen.length >= 5);
});

test("computeVermoegenChecks meldet fehlenden Marktwert und fehlenden Anker", () => {
  const daten = vollDaten();
  daten.zeitwerte = daten.zeitwerte.filter((z) => !(z.entitaet === "immobilie") && !(z.entitaet === "konto" && z.entitaet_id === "KTO-001"));
  const checks = computeVermoegenChecks(daten, "2026-03-01");
  assert.ok(checks.some((c) => c.art === "marktwert-fehlt" && c.entitaet_id === "IMM-001"));
  assert.ok(checks.some((c) => c.art === "anker-fehlt" && c.entitaet_id === "KTO-001"));
});

test("computeVermoegenChecks meldet aktives Darlehen ohne Raten-Regelzahlung", () => {
  const checks = computeVermoegenChecks(vollDaten(), "2026-03-01");
  assert.ok(checks.some((c) => c.art === "darlehen-ohne-regelzahlung" && c.entitaet_id === "DAR-001"));
});

test("computeVermoegenChecks: Reconciliation-Drift bei zwei belegten Kontoständen", () => {
  const daten = vollDaten();
  daten.zeitwerte.push({ entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "5000.00", standdatum: "2026-02-28", qualitaet: "belegt" });
  // gebucht zwischen 01-31 und 02-28: -200.00 -> erwartet 800.00, belegt 5000.00 -> Drift
  const checks = computeVermoegenChecks(daten, "2026-03-01");
  assert.ok(checks.some((c) => c.art === "reconciliation-drift" && c.entitaet_id === "KTO-001"));
});

test("computeVermoegenChecks: geschätzter Kontostand ankert keine Reconciliation", () => {
  const daten = vollDaten();
  // Zweiter Stand ist nur geschätzt -> darf keine Drift erzeugen (ADR 0013: nur belegte Anker)
  daten.zeitwerte.push({ entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "5000.00", standdatum: "2026-02-28", qualitaet: "geschaetzt" });
  const checks = computeVermoegenChecks(daten, "2026-03-01");
  assert.ok(!checks.some((c) => c.art === "reconciliation-drift" && c.entitaet_id === "KTO-001"));
});

test("computeVermoegenChecks: veralteter Marktwert je Schwelle", () => {
  const daten = vollDaten();
  // Immobilie marktwert standdatum 2026-01-01, today weit später -> > 12 Monate
  const checks = computeVermoegenChecks(daten, "2027-06-01");
  assert.ok(checks.some((c) => c.art === "bewertung-veraltet" && c.entitaet_id === "IMM-001"));
});
