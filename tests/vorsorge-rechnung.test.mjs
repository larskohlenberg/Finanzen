import assert from "node:assert/strict";
import test from "node:test";
import {
  beitragJeJahrCents, beitragJeJahrVertrag, beitragJeMonatCents, beitragJeMonatVertrag, beitragsVerlauf, beitragVorjahr, erwarteteLeistungen,
  gebuchteBeitraegeAlle, gesetzlicherRentenbeginn, leistungsZeitstrahl, monateBis, naechsterBeitrag,
  rentenStufen, tabFuerVorsorge, vermoegensBezug, beitragsAenderungen, vertragsFarben,
} from "../app/vorsorge-rechnung.mjs";

const HEUTE = "2026-10-16";

const zw = (id, feld, wert, standdatum = "2026-01-01") => ({ entitaet: "vorsorge", entitaet_id: id, feld, wert, standdatum, qualitaet: "belegt" });

function daten() {
  return {
    vorsorge: [
      { vorsorge_id: "VS-001", art: "gesetzliche-rente", name: "DRV", person_id: "PER-001", status: "geplant", kapitalbildend: false, leistung_beginn: "2040-04-01" },
      { vorsorge_id: "VS-002", art: "riester", name: "Riester", person_id: "PER-001", status: "aktiv", kapitalbildend: true, leistung_beginn: "2040-02-01" },
      { vorsorge_id: "VS-003", art: "lebensversicherung", name: "LV", person_id: "PER-001", status: "aktiv", kapitalbildend: true, leistung_beginn: "2035-05-01" },
      { vorsorge_id: "VS-004", art: "schutzversicherung", name: "Haftpflicht", person_id: "PER-002", status: "aktiv", kapitalbildend: false },
      { vorsorge_id: "VS-005", art: "riester", name: "Alt", person_id: "PER-001", status: "gekuendigt", kapitalbildend: true, leistung_beginn: "2030-01-01" },
      { vorsorge_id: "VS-006", art: "betriebsrente", name: "bAV ohne Beginn", person_id: "PER-002", status: "geplant", kapitalbildend: false },
    ],
    zeitwerte: [
      zw("VS-001", "erwartete_rente", "2400.00"),
      zw("VS-002", "erwartete_rente", "150.00"),
      zw("VS-002", "rueckkaufswert", "20000.00"),
      zw("VS-003", "erwartete_kapitalleistung", "25000.00"),
      zw("VS-005", "erwartete_rente", "50.00"),
      zw("VS-006", "erwartete_rente", "100.00"),
    ],
    regelzahlungen: [
      { regelzahlung_id: "RZ-001", vorsorge_id: "VS-002", betrag: "-150.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-06-01" },
      { regelzahlung_id: "RZ-002", vorsorge_id: "VS-004", betrag: "-120.00", rhythmus_einheit: "jahr", rhythmus_intervall: 1, anker_datum: "2025-11-03" },
      { regelzahlung_id: "RZ-003", vorsorge_id: "VS-003", betrag: "-30.00", rhythmus_einheit: "monat", rhythmus_intervall: 3, anker_datum: "2026-01-15", aktiv_bis: "2026-06-30" },
    ],
    transaktionen: [
      { transaktion_id: "TXN-1", regelzahlung_id: "RZ-002", buchungsdatum: "2024-11-04", betrag: "-100.00" },
      { transaktion_id: "TXN-2", regelzahlung_id: "RZ-002", buchungsdatum: "2025-11-03", betrag: "-120.00" },
      { transaktion_id: "TXN-3", regelzahlung_id: "RZ-001", buchungsdatum: "2026-09-01", betrag: "-150.00" },
      { transaktion_id: "TXN-4", regelzahlung_id: "RZ-001", buchungsdatum: "2026-10-01", betrag: "-150.00" },
      { transaktion_id: "TXN-5", regelzahlung_id: "RZ-001", buchungsdatum: "2024-01-01", betrag: "-140.00" },
      { transaktion_id: "TXN-X", regelzahlung_id: "RZ-999", buchungsdatum: "2026-10-01", betrag: "-999.00" },
    ],
  };
}

test("Tab je Vertragsart", () => {
  assert.equal(tabFuerVorsorge({ art: "gesetzliche-rente" }), "renten");
  assert.equal(tabFuerVorsorge({ art: "ruerup" }), "renten");
  assert.equal(tabFuerVorsorge({ art: "rentenversicherung" }), "renten");
  assert.equal(tabFuerVorsorge({ art: "lebensversicherung" }), "lebensversicherungen");
  assert.equal(tabFuerVorsorge({ art: "schutzversicherung" }), "versicherungen");
  assert.equal(tabFuerVorsorge({ art: "sonstig" }), "versicherungen");
});

test("Beitraege werden auf den Monat umgelegt, beendete Regelzahlungen zaehlen nicht", () => {
  assert.equal(beitragJeMonatCents({ betrag: "-120.00", rhythmus_einheit: "jahr", rhythmus_intervall: 1 }), 1000);
  assert.equal(beitragJeMonatCents({ betrag: "-30.00", rhythmus_einheit: "monat", rhythmus_intervall: 3 }), 1000);
  const d = daten();
  assert.equal(beitragJeMonatVertrag(d, "VS-002", HEUTE), 15000);
  assert.equal(beitragJeMonatVertrag(d, "VS-003", HEUTE), 0, "RZ-003 lief bis 06/2026");
  // Jahresbetrag ohne Umweg ueber die gerundete Monatsrate: 900,01 bleibt 900,01.
  assert.equal(beitragJeJahrCents({ betrag: "-900.01", rhythmus_einheit: "jahr", rhythmus_intervall: 1 }), 90001);
  assert.equal(beitragJeJahrCents({ betrag: "-150.00", rhythmus_einheit: "monat", rhythmus_intervall: 1 }), 180000);
  assert.equal(beitragJeJahrVertrag(d, "VS-004", HEUTE), 12000);
});

test("naechster Beitrag liegt strikt nach heute", () => {
  const d = daten();
  assert.equal(naechsterBeitrag(d, "VS-004", HEUTE).datum, "2026-11-03");
  assert.equal(naechsterBeitrag(d, "VS-002", HEUTE).datum, "2026-11-01");
  assert.equal(naechsterBeitrag(d, "VS-003", HEUTE), null);
});

test("gebuchte Beitraege nur aus den eigenen Regelzahlungen, neueste zuerst", () => {
  assert.deepEqual(gebuchteBeitraegeAlle(daten(), "VS-002").map((tx) => tx.transaktion_id), ["TXN-4", "TXN-3", "TXN-5"]);
});

test("Beitragsverlauf: Monatszahler in 24 Monaten, Jahreszahler in 5 Jahren", () => {
  const monat = beitragsVerlauf(daten(), "VS-002", HEUTE);
  assert.equal(monat.einheit, "monat");
  assert.equal(monat.perioden.length, 24);
  assert.equal(monat.perioden.at(-1), "2026-10");
  assert.equal(monat.perioden[0], "2024-11");
  assert.equal(monat.werte.at(-1), 15000);
  assert.equal(monat.werte.reduce((a, b) => a + b, 0), 2 * 15000, "TXN-5 von 01/2024 liegt vor dem Fenster");

  const jahr = beitragsVerlauf(daten(), "VS-004", HEUTE);
  assert.equal(jahr.einheit, "jahr");
  assert.deepEqual(jahr.perioden, ["2022", "2023", "2024", "2025", "2026"]);
  assert.deepEqual(jahr.werte, [0, 0, 10000, 12000, 0]);
});

test("Vorjahresvergleich nimmt die Zahlung rund ein Jahr vor der letzten", () => {
  assert.deepEqual(beitragVorjahr(daten(), "VS-004"), {
    letzte_cents: 12000, letzte_datum: "2025-11-03", vorjahr_cents: 10000, vorjahr_datum: "2024-11-04",
  });
  // Monatszahler: die Vormonatsbuchung ist kein Vorjahr.
  assert.equal(beitragVorjahr(daten(), "VS-002").vorjahr_cents, 14000);
  assert.equal(beitragVorjahr(daten(), "VS-006"), null);
});

test("erwartete Leistungen ohne beendete Vertraege, nach Beginn sortiert", () => {
  const l = erwarteteLeistungen(daten());
  assert.deepEqual(l.map((x) => [x.vorsorge.vorsorge_id, x.typ]), [["VS-003", "kapital"], ["VS-002", "rente"], ["VS-001", "rente"], ["VS-006", "rente"]]);
});

test("Rentenstufen summieren je Beginn, Renten ohne Beginn nur im Gesamtwert", () => {
  const r = rentenStufen(daten());
  assert.deepEqual(r.stufen.map((s) => [s.datum, s.summe_cents]), [["2040-02-01", 15000], ["2040-04-01", 255000]]);
  assert.equal(r.gesamt_cents, 265000);
  assert.deepEqual(r.ohne_beginn.map((l) => l.vorsorge.vorsorge_id), ["VS-006"]);
});

test("gesetzlicher Rentenbeginn je Person", () => {
  assert.equal(gesetzlicherRentenbeginn(daten(), "PER-001"), "2040-04-01");
  assert.equal(gesetzlicherRentenbeginn(daten(), "PER-002"), null);
});

test("Zeitstrahl: Jahre bis zwei nach der letzten Leistung, Rente am Jahresende", () => {
  const z = leistungsZeitstrahl(daten(), HEUTE);
  assert.equal(z.jahre[0], 2026);
  assert.equal(z.jahre.at(-1), 2042);
  assert.equal(z.rente[z.jahre.indexOf(2039)], 0);
  assert.equal(z.rente[z.jahre.indexOf(2040)], 255000);
  const lv = z.leistungen.find((l) => l.vorsorge.vorsorge_id === "VS-003");
  assert.equal(lv.pos, 9 + 4 / 12);
  assert.equal(leistungsZeitstrahl({ vorsorge: [], zeitwerte: [] }, HEUTE), null);
});

test("monateBis zaehlt volle Monate", () => {
  assert.equal(monateBis("2026-10-16", "2040-02-01"), 159);
  assert.equal(monateBis("2040-02-01", "2040-04-01"), 2);
});

test("Vermoegensbezug aus den Immobilien der gebuchten Beitraege, haeufigste zuerst", () => {
  const d = daten();
  d.transaktionen = [
    { transaktion_id: "TXN-A", regelzahlung_id: "RZ-002", buchungsdatum: "2024-11-04", betrag: "-100.00", immobilie_id: "IMM-002" },
    { transaktion_id: "TXN-B", regelzahlung_id: "RZ-002", buchungsdatum: "2025-11-03", betrag: "-120.00", immobilie_id: "IMM-001" },
    { transaktion_id: "TXN-C", regelzahlung_id: "RZ-002", buchungsdatum: "2026-11-03", betrag: "-120.00", immobilie_id: "IMM-001" },
    { transaktion_id: "TXN-D", regelzahlung_id: "RZ-999", buchungsdatum: "2026-11-03", betrag: "-1.00", immobilie_id: "IMM-009" },
  ];
  assert.deepEqual(vermoegensBezug(d, "VS-004"), [
    { klasse: "immobilie", id: "IMM-001", anzahl: 2 },
    { klasse: "immobilie", id: "IMM-002", anzahl: 1 },
  ]);
  assert.deepEqual(vermoegensBezug(d, "VS-002"), []);
});

test("Beitragsaenderungen: Jahreszahler je Abweichung, Monatszahler nur bestaetigte Stufen", () => {
  const monatlich = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"];
  const betraege = ["-50.00", "-50.00", "-52.00", "-52.00", "-40.00", "-52.00", "-52.00"]; // Stufe im Maerz, Ausreisser im Mai
  const d = {
    regelzahlungen: [
      { regelzahlung_id: "RZ-J", vorsorge_id: "VS-J", betrag: "-110.00", rhythmus_einheit: "jahr", rhythmus_intervall: 1, anker_datum: "2025-03-01" },
      { regelzahlung_id: "RZ-M", vorsorge_id: "VS-M", betrag: "-52.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-01" },
    ],
    transaktionen: [
      { transaktion_id: "TXN-J1", regelzahlung_id: "RZ-J", buchungsdatum: "2024-03-01", betrag: "-100.00" },
      { transaktion_id: "TXN-J2", regelzahlung_id: "RZ-J", buchungsdatum: "2025-03-01", betrag: "-110.00" },
      { transaktion_id: "TXN-J3", regelzahlung_id: "RZ-J", buchungsdatum: "2026-03-01", betrag: "-99.00" },
      ...monatlich.map((m, i) => ({ transaktion_id: `TXN-M${i}`, regelzahlung_id: "RZ-M", buchungsdatum: `${m}-01`, betrag: betraege[i] })),
    ],
  };
  const jahr = beitragsAenderungen(d, "VS-J");
  assert.deepEqual(jahr.map((a) => [a.datum, a.alt_cents, a.neu_cents, a.diff_cents]), [["2026-03-01", 11000, 9900, -1100], ["2025-03-01", 10000, 11000, 1000]]);
  assert.equal(jahr[1].anteil, 0.1);
  const monat = beitragsAenderungen(d, "VS-M");
  assert.deepEqual(monat.map((a) => [a.datum, a.alt_cents, a.neu_cents]), [["2026-03-01", 5000, 5200]], "Ausreisser im Mai zaehlt nicht");
  assert.deepEqual(beitragsAenderungen(d, "VS-X"), []);
});

test("Vertragsfarben: kapitalbildende mit Rueckkaufswert zuerst, dann Renten und Kapital, beendete ohne Farbe", () => {
  const farben = vertragsFarben(daten());
  // VS-002 hat Rueckkaufswert; dann VS-001 (Rente), VS-003 (Kapital), VS-006 (Rente); VS-005 ist gekuendigt.
  assert.deepEqual([...farben], [["VS-002", 0], ["VS-001", 1], ["VS-003", 2], ["VS-006", 3]]);
  const viele = daten();
  for (let i = 10; i < 16; i++) {
    viele.vorsorge.push({ vorsorge_id: `VS-0${i}`, art: "riester", name: `R${i}`, person_id: "PER-001", status: "aktiv", kapitalbildend: false });
    viele.zeitwerte.push(zw(`VS-0${i}`, "erwartete_rente", "10.00"));
  }
  assert.equal(vertragsFarben(viele).size, 6, "hoechstens sechs Farben");
});
