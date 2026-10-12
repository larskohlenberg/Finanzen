import { test } from "node:test";
import assert from "node:assert/strict";
import { rechneSzenario, kippMonat, tiefpunkt, phasenKennzahlen, ereignisWirkung, jahresWerte } from "../app/szenarien.mjs";

const TODAY = "2026-06-22";
const rz = (id, betrag, kat, extra = {}) => ({ regelzahlung_id: id, bezeichnung: id, betrag, rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-07-01", status: "bestaetigt", qualitaet: "belegt", erstellt_am: "2026-06-01", kategorie_id: kat, ...extra });
function data(regelzahlungen = [], start = "1000.00") {
  return {
    konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    kategorien: [
      { kategorie_id: "KAT-001", name: "Gehalt", typ: "einnahme", lebenshaltung_relevant: true, status: "aktiv" },
      { kategorie_id: "KAT-002", name: "Wohnen", typ: "ausgabe", lebenshaltung_relevant: true, status: "aktiv" },
      { kategorie_id: "KAT-003", name: "Umbuchung", typ: "neutral", lebenshaltung_relevant: false, status: "aktiv" },
    ],
    transaktionen: [],
    zeitwerte: [{ entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: start, standdatum: TODAY, qualitaet: "belegt" }],
    darlehen: [], immobilien: [], vermoegenswerte: [], regelzahlungen,
  };
}
const sz = (annahmen = [], extra = {}) => ({ szenario_id: "SZN-001", name: "T", status: "entwurf", stand: TODAY, reichweite_bis: "2027-12-31", erstellt_am: TODAY, annahmen, ...extra });

test("Monatsbewegungen: Einnahmen, Ausgaben, Umbuchungen und Einmalzahlungen ergeben die Saldoaenderung", () => {
  const d = data([rz("RZ-1", "3000.00", "KAT-001"), rz("RZ-2", "-1000.00", "KAT-002"), rz("RZ-3", "-200.00", "KAT-003")]);
  const r = rechneSzenario(d, sz([{ annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2026-09-15", betrag: "5000.00" }]), TODAY);
  const sep = r.punkte.find((p) => p.monat === "2026-09");
  assert.equal(sep.ein_cents, 300000);
  assert.equal(sep.aus_cents, -100000);
  assert.equal(sep.umbuchung_cents, -20000);
  assert.equal(sep.einmal_cents, 500000);
  let vorher = 100000;
  for (const p of r.punkte) {
    assert.equal(p.liquide_cents - vorher, p.ein_cents + p.aus_cents + p.umbuchung_cents + p.einmal_cents, p.monat);
    vorher = p.liquide_cents;
  }
});

test("kippMonat: erster negativer Monat, sonst null", () => {
  assert.equal(kippMonat([{ monat: "2026-07", liquide_cents: 10 }, { monat: "2026-08", liquide_cents: -1 }, { monat: "2026-09", liquide_cents: -5 }]), "2026-08");
  assert.equal(kippMonat([{ monat: "2026-07", liquide_cents: 0 }]), null);
});

test("tiefpunkt: kleinster Liquiditaetsstand mit Monat", () => {
  assert.deepEqual(tiefpunkt([{ monat: "2026-07", liquide_cents: 50 }, { monat: "2026-08", liquide_cents: 20 }, { monat: "2026-09", liquide_cents: 30 }]), { monat: "2026-08", cents: 20 });
});

test("phasenKennzahlen: ohne Phasen genau eine Phase 'gesamt'", () => {
  const d = data([rz("RZ-1", "3000.00", "KAT-001"), rz("RZ-2", "-1000.00", "KAT-002")]);
  const s = sz();
  const r = rechneSzenario(d, s, TODAY);
  const ph = phasenKennzahlen(s, r.punkte);
  assert.equal(ph.length, 1);
  assert.equal(ph[0].art, "gesamt");
  assert.equal(ph[0].von, "2026-06");
  assert.equal(ph[0].bis, "2027-12");
  assert.equal(ph[0].liquide_ende_cents, r.punkte.at(-1).liquide_cents);
});

test("phasenKennzahlen: Vorlauf, Durchschnitte je Phase und Zuordnung der Annahmen", () => {
  const d = data([rz("RZ-1", "3000.00", "KAT-001"), rz("RZ-2", "-1000.00", "KAT-002")]);
  const annahmen = [
    { annahme_id: "A1", art: "regelzahlung-aenderung", qualitaet: "geschaetzt", regelzahlung_id: "RZ-1", ab: "2027-01-01", aktion: "beenden" },
    { annahme_id: "A2", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2027-03-10", betrag: "2000.00" },
  ];
  const s = sz(annahmen, { phasen: [{ name: "Arbeit", ab: "2026-08-01" }, { name: "Pause", ab: "2027-01-01" }] });
  const r = rechneSzenario(d, s, TODAY);
  const ph = phasenKennzahlen(s, r.punkte);
  assert.deepEqual(ph.map((p) => [p.art, p.name, p.von, p.bis]), [
    ["vorlauf", null, "2026-06", "2026-07"],
    ["benannt", "Arbeit", "2026-08", "2026-12"],
    ["benannt", "Pause", "2027-01", "2027-12"],
  ]);
  assert.equal(ph[1].ein_cents, 300000);
  assert.equal(ph[1].aus_cents, -100000);
  assert.equal(ph[1].saldo_cents, 200000);
  assert.equal(ph[2].ein_cents, 0);
  assert.equal(ph[2].saldo_cents, -100000);
  assert.equal(ph[2].einmal_cents, 200000);
  assert.deepEqual(ph[2].annahme_ids, ["A1", "A2"]);
  assert.equal(ph[2].liquide_ende_cents, r.punkte.at(-1).liquide_cents);
});

test("phasenKennzahlen: Phasen vor dem Rechenstart werden abgeschnitten", () => {
  const d = data([]);
  const s = sz([], { phasen: [{ name: "Alt", ab: "2020-01-01" }, { name: "Jetzt", ab: "2025-01-01" }, { name: "Spaeter", ab: "2027-06-01" }] });
  const r = rechneSzenario(d, s, TODAY);
  const ph = phasenKennzahlen(s, r.punkte);
  assert.deepEqual(ph.map((p) => [p.name, p.von, p.bis]), [["Jetzt", "2026-06", "2027-05"], ["Spaeter", "2027-06", "2027-12"]]);
});

test("ereignisWirkung: meldet Einmalzahlungen, ohne die die Liquiditaet deutlich frueher kippt", () => {
  const d = data([rz("RZ-2", "-1000.00", "KAT-002")], "3000.00");
  const s = sz([
    { annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2026-07-15", betrag: "30000.00" },
    { annahme_id: "A2", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2026-07-20", betrag: "100.00" },
  ], { reichweite_bis: "2030-12-31" });
  const w = ereignisWirkung(d, s, TODAY);
  assert.deepEqual(w, [{ annahme_id: "A1", kipp_monat: "2026-10" }]);
});

test("jahresWerte: je Jahr der letzte Stand und die Summen der Bewegungen", () => {
  const d = data([rz("RZ-1", "100.00", "KAT-001")]);
  const r = rechneSzenario(d, sz(), TODAY);
  const j = jahresWerte(r.punkte);
  assert.deepEqual(j.map((x) => x.jahr), ["2026", "2027"]);
  assert.equal(j[0].punkt.monat, "2026-12");
  assert.equal(j[1].ein_cents, 120000);
});
