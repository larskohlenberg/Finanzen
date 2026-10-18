// Plan & Ist (app/plan-ist.mjs): Termine rueckwaerts, Beginn je Regelzahlung,
// Monate des Bestands, Zeitraeume, Ist gegen Plan je Kategorie, Einzelposten,
// Luecken. Dazu: Ist deckt sich mit den Kacheln der Uebersicht (monatsMittel).
import assert from "node:assert/strict";
import test from "node:test";
import { bestandsMonate, perioden, planIst, regelzahlungBeginn, termineImZeitraum, zeitraumMonate } from "../app/plan-ist.mjs";
import { monatsMittel, kontenGruppen } from "../app/uebersicht-rechnung.mjs";
import { planIstText } from "../app/mcp/kennzahlen.mjs";
import { WERKZEUGE } from "../app/mcp/werkzeuge.mjs";
import { loadMasterData } from "../app/tools/validator.mjs";

const KATEGORIEN = [
  { kategorie_id: "KAT-001", name: "Gehalt", typ: "einnahme" },
  { kategorie_id: "KAT-003", name: "Lebensmittel", typ: "ausgabe" },
  { kategorie_id: "KAT-007", name: "Freizeit", typ: "ausgabe" },
  { kategorie_id: "KAT-010", name: "Sparen", typ: "neutral", sparziel: "depot" },
  { kategorie_id: "KAT-011", name: "Transfer", typ: "neutral" },
  { kategorie_id: "KAT-012", name: "Noch zu klaeren", typ: "ausgabe" },
  { kategorie_id: "KAT-016", name: "Bargeld", typ: "ausgabe", ohne_einzelposten: true },
];
let n = 0;
const tx = (datum, betrag, kategorie_id, extra = {}) => ({ transaktion_id: `TXN-${++n}`, konto_id: "KTO-901", buchungsdatum: datum, betrag, kategorie_id, gegenpartei: "Muster", ...extra });
const rz = (id, betrag, anker, kategorie_id, extra = {}) => ({ regelzahlung_id: id, bezeichnung: id, betrag, rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: anker, status: "bestaetigt", qualitaet: "belegt", erstellt_am: "2026-01-01", kategorie_id, ...extra });

test("termineImZeitraum: vom Anker vor- und rueckwaerts, aktiv_bis begrenzt", () => {
  assert.deepEqual(termineImZeitraum(rz("RZ-1", "-10.00", "2026-05-31", "KAT-003"), "2026-02-01", "2026-06-30"), ["2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30"]);
  assert.deepEqual(termineImZeitraum(rz("RZ-1", "-10.00", "2026-05-15", "KAT-003", { aktiv_bis: "2026-04-30" }), "2026-01-01", "2026-12-31"), ["2026-01-15", "2026-02-15", "2026-03-15", "2026-04-15"]);
  assert.deepEqual(termineImZeitraum({ ...rz("RZ-1", "-10.00", "2026-11-26", "KAT-001"), rhythmus_einheit: "jahr" }, "2024-01-01", "2025-12-31"), ["2024-11-26", "2025-11-26"]);
});

test("regelzahlungBeginn: erste zugeordnete Buchung minus Fenster, sonst erste Buchung des Kontos, Konsumplan immer", () => {
  const data = {
    transaktionen: [tx("2025-01-03", "-5.00", "KAT-003"), tx("2025-06-10", "-20.00", "KAT-003", { regelzahlung_id: "RZ-1" })],
    regelzahlungen: [rz("RZ-1", "-20.00", "2025-06-10", "KAT-003", { konto_id: "KTO-901" }), rz("RZ-2", "-9.00", "2025-06-01", "KAT-003", { konto_id: "KTO-901" }), rz("RZ-3", "-300.00", "2025-06-01", "KAT-003")],
  };
  const b = regelzahlungBeginn(data);
  assert.equal(b.get("RZ-1"), "2025-06-03");
  assert.equal(b.get("RZ-2"), "2025-01-03");
  assert.equal(b.get("RZ-3"), "");
});

test("bestandsMonate: ab dem letzten Startzustand, bis zum letzten vollen Monat", () => {
  const data = {
    transaktionen: [
      tx("2023-01-01", "1000.00", "KAT-012", { transaktionstyp: "Startzustand" }),
      tx("2023-12-29", "500.00", "KAT-012", { transaktionstyp: "Startzustand" }),
      tx("2023-05-03", "-5.00", "KAT-003"),
      tx("2024-03-03", "-5.00", "KAT-003"),
      tx("2024-04-10", "-5.00", "KAT-003"),
    ],
  };
  assert.deepEqual(bestandsMonate(data, "2024-04-20"), ["2024-01", "2024-02", "2024-03"]);
  // Ohne Startzustand ab der ersten Buchung; vollstaendigBis kappt das Ende.
  const ohne = { transaktionen: [...data.transaktionen.filter((t) => !t.transaktionstyp), tx("2024-02-15", "-5.00", "KAT-003")] };
  assert.deepEqual(bestandsMonate(ohne, "2024-05-02", { vollstaendigBis: "2024-03-30" }).at(-1), "2024-02");
  assert.equal(bestandsMonate(ohne, "2024-05-02")[0], "2023-05");
});

test("perioden und zeitraumMonate: Jahr, Quartal, Monat, letzte zwoelf", () => {
  const monate = ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04"];
  assert.deepEqual(perioden(monate, "quartal").map((p) => [p.schluessel, p.vollstaendig]), [["2025-Q4", false], ["2026-Q1", true], ["2026-Q2", false]]);
  assert.deepEqual(perioden(monate, "jahr").map((p) => p.schluessel), ["2025", "2026"]);
  assert.deepEqual(zeitraumMonate(monate, "2026-Q1"), ["2026-01", "2026-02", "2026-03"]);
  assert.deepEqual(zeitraumMonate(monate, "2025"), ["2025-11", "2025-12"]);
  assert.deepEqual(zeitraumMonate(monate, "2026-04"), ["2026-04"]);
  assert.deepEqual(zeitraumMonate(monate, ""), monate);
  assert.equal(zeitraumMonate([...monate, ...monate.map((m) => `${Number(m.slice(0, 4)) + 1}${m.slice(4)}`)], "12m").length, 12);
});

test("planIst: Ist und Plan je Kategorie, Einzelposten, Sparen und Luecken", () => {
  const data = {
    kategorien: KATEGORIEN,
    konten: [{ konto_id: "KTO-901", name: "Testgiro", kontotyp: "giro" }],
    transaktionen: [
      tx("2026-01-27", "3000.00", "KAT-001", { regelzahlung_id: "RZ-1" }),
      tx("2026-02-27", "3100.00", "KAT-001", { regelzahlung_id: "RZ-1" }),
      tx("2026-01-10", "-250.00", "KAT-003"),
      tx("2026-02-10", "-350.00", "KAT-003"),
      tx("2026-02-14", "-900.00", "KAT-007"),
      tx("2026-01-05", "-500.00", "KAT-010", { regelzahlung_id: "RZ-4" }),
      tx("2026-01-20", "-800.00", "KAT-016"),
      tx("2026-02-02", "-700.00", "KAT-011", { ist_transfer: true }),
      tx("2026-02-28", "-19.99", "KAT-003"),
    ],
    regelzahlungen: [
      rz("RZ-1", "3000.00", "2026-01-27", "KAT-001", { konto_id: "KTO-901" }),
      rz("RZ-2", "-300.00", "2026-01-15", "KAT-003"),
      rz("RZ-3", "-100.00", "2026-01-15", "KAT-007"),
      rz("RZ-4", "-500.00", "2026-01-05", "KAT-010", { konto_id: "KTO-901" }),
      rz("RZ-5", "-600.00", "2026-01-15", "KAT-016"),
      { ...rz("RZ-6", "-50.00", "2026-01-01", "KAT-003"), status: "vorgeschlagen" },
    ],
  };
  const r = planIst(data, ["2026-01", "2026-02"]);
  assert.equal(r.anzahl_monate, 2);
  assert.equal(r.von, "2026-01-01");
  assert.equal(r.bis, "2026-02-28");
  assert.equal(r.einnahmen.ist_cents, 610000);
  assert.equal(r.einnahmen.plan_cents, 600000);
  const aus = new Map(r.ausgaben.kategorien.map((k) => [k.kategorie_id, k]));
  assert.equal(aus.get("KAT-003").ist_cents, 61999);
  assert.equal(aus.get("KAT-003").plan_cents, 60000);
  assert.equal(aus.get("KAT-007").einzel_cents, 90000);
  assert.equal(aus.get("KAT-007").einzel_buchungen.length, 1);
  // Bargeld: grosse Abhebungen sind keine Einzelposten.
  assert.equal(aus.get("KAT-016").einzel_cents, 0);
  assert.equal(r.ausgaben.ist_cents, 61999 + 90000 + 80000);
  assert.equal(r.ausgaben.plan_cents, 60000 + 20000 + 120000);
  assert.equal(r.sparen.ist.depot_cents, 50000);
  assert.equal(r.sparen.plan.depot_cents, 100000);
  assert.equal(r.sparen.ist.ueberschuss_cents, 610000 - 231999);
  // RZ-4 hat nur im Januar gebucht: der Februar-Termin fehlt.
  assert.deepEqual(r.luecken.map((l) => [l.regelzahlung_id, l.fehlend]), [["RZ-4", ["2026-02-05"]]]);
  const gehalt = r.einnahmen.kategorien[0].regelzahlungen[0];
  assert.deepEqual([gehalt.termine, gehalt.gebucht_anzahl, gehalt.gebucht_cents], [2, 2, 610000]);
});

test("planIst: Startzustand zaehlt nicht, ohne Monate leer", () => {
  const data = { kategorien: KATEGORIEN, transaktionen: [tx("2026-01-01", "5000.00", "KAT-012", { transaktionstyp: "Startzustand" })], regelzahlungen: [] };
  assert.equal(planIst(data, ["2026-01"]).einnahmen.ist_cents, 0);
  assert.equal(planIst(data, []).anzahl_monate, 0);
});

test("Demodaten: Ist der letzten zwoelf Monate deckt sich mit den Kacheln, plan_ist rechnet", async () => {
  const data = await loadMasterData(new URL("../app/data/demo/", import.meta.url));
  const heute = "2026-10-18";
  const mittel = monatsMittel(data, heute, { vollstaendigBis: kontenGruppen(data, heute).konten.aeltester });
  const r = planIst(data, mittel.monate);
  assert.equal(Math.round(r.einnahmen.ist_cents / mittel.anzahl_monate), mittel.einnahmen.mittel_cents);
  assert.equal(Math.round(r.ausgaben.ist_cents / mittel.anzahl_monate), mittel.ausgaben.mittel_cents);
  const text = planIstText(data, heute, { zeitraum: "12m", verlauf: "quartal" });
  assert.match(text, /^Plan & Ist 12m: /);
  assert.match(text, /Verlauf je quartal/);
  assert.ok(WERKZEUGE.some((w) => w.name === "plan_ist" && w.annotations.readOnlyHint));
});
