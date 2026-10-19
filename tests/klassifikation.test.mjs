// Zentrale Klassifikation der Buchungen (Review Welle 2, 2.2): eine Klasse je
// Buchung, je Kennzahl eine Auswahl; Kennzahlen liefern Monatsliste, Umfang und
// Ausschluesse; Vollstaendigkeit ueber die Importabdeckung je Konto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buchungsKlasse, importAbdeckung, kategorienIndex } from "../app/klassifikation.mjs";
import { monatsMittel } from "../app/uebersicht-rechnung.mjs";
import { planIst } from "../app/plan-ist.mjs";
import { uebersichtModell } from "../app/uebersicht-modell.mjs";
import { planIstMonate } from "../app/plan-ist-modell.mjs";

const KATEGORIEN = [
  { kategorie_id: "KAT-001", name: "Gehalt", typ: "einnahme" },
  { kategorie_id: "KAT-003", name: "Lebensmittel", typ: "ausgabe" },
  { kategorie_id: "KAT-010", name: "Sparen", typ: "neutral", sparziel: "depot" },
  { kategorie_id: "KAT-011", name: "Umbuchung", typ: "neutral" },
  { kategorie_id: "KAT-012", name: "Noch zu klaeren", typ: "neutral" },
  { kategorie_id: "KAT-020", name: "Steuer", typ: "ausgabe", gutschriften_sondereffekt: true },
  { kategorie_id: "KAT-021", name: "Modernisierung", typ: "ausgabe", investition: true },
  { kategorie_id: "KAT-022", name: "Nebenkosten", typ: "ausgabe", brutto: true },
];
let n = 0;
const tx = (konto_id, datum, betrag, kategorie_id, extra = {}) => ({ transaktion_id: `TXN-${++n}`, konto_id, buchungsdatum: datum, betrag, kategorie_id, gegenpartei: "Muster", ...extra });
const konten = [
  { konto_id: "KTO-001", name: "Giro", kontotyp: "giro", status: "aktiv", liquiditaetsrelevant: true },
  { konto_id: "KTO-002", name: "Tagesgeld", kontotyp: "tagesgeld", status: "aktiv", liquiditaetsrelevant: true },
];

function daten() {
  n = 0;
  const transaktionen = [];
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, "0");
    transaktionen.push(tx("KTO-001", `2025-${mm}-01`, "3000.00", "KAT-001"));
    transaktionen.push(tx("KTO-001", `2025-${mm}-05`, "-800.00", "KAT-003"));
    transaktionen.push(tx("KTO-001", `2025-${mm}-10`, "-200.00", "KAT-010"));
  }
  // Ausschluesse und Sonderfaelle im Fenster
  transaktionen.push(tx("KTO-001", "2025-03-15", "-500.00", "KAT-011", { ist_transfer: true, transfer_id: "TRF-1" }));
  transaktionen.push(tx("KTO-002", "2025-03-15", "500.00", "KAT-011", { ist_transfer: true, transfer_id: "TRF-1" }));
  transaktionen.push(tx("KTO-001", "2025-04-20", "900.00", "KAT-020"));
  transaktionen.push(tx("KTO-001", "2025-05-20", "-4000.00", "KAT-021"));
  transaktionen.push(tx("KTO-001", "2025-06-20", "150.00", "KAT-022"));
  transaktionen.push(tx("KTO-001", "2025-06-21", "-400.00", "KAT-022"));
  // Tagesgeld mitten in der Geschichte importiert: Startzustand am 1.2.
  transaktionen.push(tx("KTO-002", "2025-02-01", "5000.00", "KAT-012", { transaktionstyp: "Startzustand" }));
  transaktionen.push(tx("KTO-002", "2025-12-31", "12.00", "KAT-001"));
  return {
    konten,
    kategorien: KATEGORIEN,
    transaktionen,
    zeitwerte: [
      { entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "100.00", standdatum: "2024-12-31", qualitaet: "belegt" },
      { entitaet: "konto", entitaet_id: "KTO-002", feld: "kontostand", wert: "5512.00", standdatum: "2025-12-31", qualitaet: "belegt" },
    ],
    regelzahlungen: [], vorsorge: [], darlehen: [], immobilien: [], vermoegenswerte: [], fristen: [], personen: [], transfers: [],
  };
}

const HEUTE = "2026-01-20";

test("buchungsKlasse: eine Klasse je Buchung", () => {
  const typ = kategorienIndex({ kategorien: KATEGORIEN });
  assert.equal(buchungsKlasse(tx("KTO-001", "2025-01-01", "-1.00", "KAT-011", { ist_transfer: true }), typ), "transfer");
  assert.equal(buchungsKlasse(tx("KTO-001", "2025-01-01", "1.00", "KAT-012", { transaktionstyp: "Startzustand" }), typ), "startzustand");
  assert.equal(buchungsKlasse(tx("KTO-001", "2025-01-01", "-1.00", "KAT-021"), typ), "investition");
  assert.equal(buchungsKlasse(tx("KTO-001", "2025-01-01", "1.00", "KAT-020"), typ), "sondereffekt");
  assert.equal(buchungsKlasse(tx("KTO-001", "2025-01-01", "-1.00", "KAT-020"), typ), "laufend", "Steuerzahlung ist laufend");
  assert.equal(buchungsKlasse(tx("KTO-001", "2025-01-01", "-1.00", "KAT-010"), typ), "neutral");
  assert.equal(buchungsKlasse(tx("KTO-001", "2025-01-01", "-1.00", "KAT-012"), typ), "laufend", "Noch zu klaeren zaehlt laufend");
  assert.equal(buchungsKlasse(tx("KTO-001", "2025-01-01", "-1.00", undefined), typ), "laufend");
});

test("Uebersicht und Plan & Ist: gleiche Monatsliste, Kachel = round(Plan&Ist-Summe / Monate)", () => {
  const d = daten();
  const u = uebersichtModell(d, HEUTE);
  const alle = planIstMonate(d, HEUTE);
  assert.deepEqual(u.mittel.monate, alle.slice(-12));
  assert.equal(u.mittel.monate[0], "2025-02", "erst ab dem Startzustand vollstaendig");
  const r = planIst(d, u.mittel.monate);
  assert.equal(u.mittel.einnahmen.mittel_cents, Math.round(r.einnahmen.ist_cents / u.mittel.anzahl_monate));
  assert.equal(u.mittel.ausgaben.mittel_cents, Math.round(r.ausgaben.ist_cents / u.mittel.anzahl_monate));
});

test("Startzustand ist weder Einnahme noch Ausgabe", () => {
  const d = daten();
  const r = monatsMittel(d, HEUTE, { vollstaendigBis: "2025-12-31" });
  // Gehalt 3000 x 11 Monate (Feb-Dez) + 12 Zinsen, Nebenkosten-Gutschrift 150
  assert.equal(r.einnahmen.mittel_cents, Math.round((3000 * 11 * 100 + 1200 + 15000) / 11));
});

test("Kennzahlen liefern Umfang und Ausschluesse mit", () => {
  const d = daten();
  const r = monatsMittel(d, HEUTE, { vollstaendigBis: "2025-12-31" });
  assert.equal(r.ausschluesse.transfer.anzahl, 2);
  assert.equal(r.ausschluesse.transfer.summe_cents, 0);
  assert.deepEqual(r.ausschluesse.startzustand, { anzahl: 1, summe_cents: 500000 }, "Startzustand am Monatsersten liegt im Fenster, zaehlt aber nicht");
  assert.equal(r.ausschluesse.sondereffekt.summe_cents, 90000);
  assert.equal(r.ausschluesse.investition.summe_cents, -400000);
  const p = planIst(d, r.monate);
  assert.deepEqual(p.ausschluesse, r.ausschluesse);
  const u = uebersichtModell(d, HEUTE);
  assert.equal(u.mittel.umfang.vollstaendig_bis, "2025-12-10");
  assert.deepEqual(u.mittel.umfang.konten.map((k) => k.konto_id), ["KTO-001", "KTO-002"]);
  assert.deepEqual(u.mittel.ausschluesse, r.ausschluesse);
});

test("importAbdeckung: je Konto belegt bis (letzte Buchung oder Anker); ruhige Konten begrenzen sichtbar", () => {
  const d = daten();
  const a = importAbdeckung(d, HEUTE);
  assert.deepEqual(a.konten.map((k) => [k.konto_id, k.belegt_bis]), [["KTO-001", "2025-12-10"], ["KTO-002", "2025-12-31"]]);
  assert.equal(a.vollstaendig_bis, "2025-12-10");
  assert.equal(a.begrenzt_durch, "KTO-001");
  // Konto ohne Anker zaehlt mit seiner letzten Buchung (vorher fiel es heraus).
  d.konten.push({ konto_id: "KTO-003", name: "Zweitgiro", kontotyp: "giro", status: "aktiv", liquiditaetsrelevant: true });
  d.transaktionen.push(tx("KTO-003", "2025-08-31", "-1.00", "KAT-003"));
  const b = importAbdeckung(d, HEUTE);
  assert.equal(b.vollstaendig_bis, "2025-08-31");
  assert.equal(b.begrenzt_durch, "KTO-003");
  // Keine automatische Ruhe-Ausnahme: erst ein neuer Kontostand belegt den Zeitraum.
  d.zeitwerte.push({ entitaet: "konto", entitaet_id: "KTO-003", feld: "kontostand", wert: "10.00", standdatum: "2026-01-05", qualitaet: "belegt" });
  assert.equal(importAbdeckung(d, HEUTE).begrenzt_durch, "KTO-001");
});

test("Startzustand nach dem Fensterende leert vergangene Fenster nicht (Trend)", () => {
  const d = daten();
  d.transaktionen.push(tx("KTO-002", "2025-12-15", "100.00", "KAT-012", { transaktionstyp: "Startzustand" }));
  // Mitten im letzten Monat: sein erster voller Monat (2026-01) liegt nach dem Fenster.
  assert.equal(monatsMittel(d, HEUTE, { vollstaendigBis: "2025-12-31" }).monate.at(-1), "2025-12");
  // Vergangenes Fenster (Stichtag Juli 2025): der Startzustand vom Dezember zaehlt nicht.
  assert.deepEqual(monatsMittel(d, "2025-07-10").monate, ["2025-02", "2025-03", "2025-04", "2025-05", "2025-06"]);
});
