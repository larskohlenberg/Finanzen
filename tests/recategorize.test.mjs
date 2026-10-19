// tests/recategorize.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { recategorize } from "../app/tools/recategorize.mjs";
import { validateMasterData } from "../app/tools/validator.mjs";

const regeln = [
  { regel_id: "REG-001", gegenpartei_pattern: "musterladena", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-06-01" },
  { regel_id: "REG-002", gegenpartei_pattern: "musterladenb", kategorie_id: "KAT-005", status: "aktiv", erstellt_am: "2026-06-01" },
];

let txCounter = 0;
function tx(props) {
  txCounter += 1;
  return {
    transaktion_id: `TXN-20260520-${String(txCounter).padStart(6, "0")}`,
    dedupe_hash: `h${txCounter}`,
    rohquelle: "data/inbox/x.csv",
    konto_id: "KTO-001",
    buchungsdatum: "2026-05-20",
    betrag: "-10.00",
    gegenpartei: "",
    verwendungszweck: "",
    ist_transfer: false,
    ...props,
  };
}

test("offen mit Treffer wird vorgeschlagen + herkunft regel", () => {
  const t = tx({ gegenpartei: "MusterladenA Mitte", kategorisierung_status: "offen" });
  const out = recategorize({ transaktionen: [t], regeln });
  const r = out.transaktionen[0];
  assert.equal(r.kategorisierung_status, "vorgeschlagen");
  assert.equal(r.kategorie_id, "KAT-003");
  assert.equal(r.kategorie_herkunft, "regel");
  assert.equal(out.report.neu_vorgeschlagen, 1);
});

test("offen ohne Treffer bleibt offen", () => {
  const t = tx({ gegenpartei: "Unbekannt", kategorisierung_status: "offen" });
  const out = recategorize({ transaktionen: [t], regeln });
  const r = out.transaktionen[0];
  assert.equal(r.kategorisierung_status, "offen");
  assert.equal(Object.hasOwn(r, "kategorie_id"), false);
  assert.equal(Object.hasOwn(r, "kategorie_herkunft"), false);
  assert.equal(out.report.unveraendert, 1);
});

// Neu bewertet wird eine Bestaetigung nur, wenn sie eine Auto-Freigabe ist;
// menschliche Bestaetigungen stehen in menschliche-entscheidung.test.mjs.
test("bestaetigt+regel+auto mit gleicher Kategorie bleibt unveraendert", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", bestaetigt_durch: "auto", kategorie_id: "KAT-003", kategorie_herkunft: "regel" });
  const out = recategorize({ transaktionen: [t], regeln });
  const r = out.transaktionen[0];
  // matched_regeln wird jetzt konsistent gestempelt — Kategorie und Status bleiben gleich.
  assert.equal(r.kategorisierung_status, "bestaetigt");
  assert.equal(r.kategorie_id, "KAT-003");
  assert.equal(r.kategorie_herkunft, "regel");
  assert.deepEqual(r.matched_regeln, ["REG-001"]);
  // Nur der matched_regeln-Stempel aendert sich (fachlich unveraendert).
  assert.equal(out.report.unveraendert, 1);
});

test("bestaetigt+regel+auto mit anderer konkreter Kategorie wird wiedervorgelegt", () => {
  // Bestaetigt auf KAT-003, aber das Regelwerk liefert fuer MusterladenB jetzt KAT-005.
  const t = tx({ gegenpartei: "MusterladenB City", kategorisierung_status: "bestaetigt", bestaetigt_durch: "auto", kategorie_id: "KAT-003", kategorie_herkunft: "regel" });
  const out = recategorize({ transaktionen: [t], regeln });
  const r = out.transaktionen[0];
  assert.equal(r.kategorisierung_status, "vorgeschlagen");
  assert.equal(r.kategorie_id, "KAT-005");
  assert.equal(r.kategorie_herkunft, "regel");
  assert.equal(out.report.wiedervorlage, 1);
});

test("bestaetigt+regel+auto ohne Treffer bleibt unveraendert", () => {
  const t = tx({ gegenpartei: "Unbekannt", kategorisierung_status: "bestaetigt", bestaetigt_durch: "auto", kategorie_id: "KAT-003", kategorie_herkunft: "regel" });
  const out = recategorize({ transaktionen: [t], regeln });
  assert.deepEqual(out.transaktionen[0], t);
  assert.equal(out.report.unveraendert, 1);
});

test("bestaetigt+regel+auto bei Regel-Konflikt bleibt unveraendert", () => {
  const konfliktRegeln = [
    { regel_id: "REG-A", gegenpartei_pattern: "tankstelle", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-06-01" },
    { regel_id: "REG-B", gegenpartei_pattern: "tankstelle", kategorie_id: "KAT-005", status: "aktiv", erstellt_am: "2026-06-01" },
  ];
  const t = tx({ gegenpartei: "Tankstelle Nord", kategorisierung_status: "bestaetigt", bestaetigt_durch: "auto", kategorie_id: "KAT-003", kategorie_herkunft: "regel" });
  const out = recategorize({ transaktionen: [t], regeln: konfliktRegeln });
  assert.deepEqual(out.transaktionen[0], t);
  assert.equal(out.report.unveraendert, 1);
});

test("manuell wird nie angefasst, auch wenn eine Regel widerspricht", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-099", kategorie_herkunft: "manuell" });
  const out = recategorize({ transaktionen: [t], regeln });
  assert.deepEqual(out.transaktionen[0], t);
  assert.equal(out.report.uebersprungen, 1);
});

test("agenten-vorschlag wird nie von Regellaeufen angefasst", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "vorgeschlagen", kategorie_id: "KAT-099", kategorie_herkunft: "agent" });
  const out = recategorize({ transaktionen: [t], regeln });
  assert.deepEqual(out.transaktionen[0], t);
  assert.equal(out.report.uebersprungen, 1);
});

test("abgelehnt wird nie angefasst", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "abgelehnt" });
  const out = recategorize({ transaktionen: [t], regeln });
  assert.deepEqual(out.transaktionen[0], t);
  assert.equal(out.report.uebersprungen, 1);
});

test("vorgeschlagen+regel ohne Treffer wird auf offen zurueckgesetzt", () => {
  // Die Regel, die diesen Vorschlag erzeugt hat, ist weg.
  const t = tx({ gegenpartei: "Unbekannt", kategorisierung_status: "vorgeschlagen", kategorie_id: "KAT-003", kategorie_herkunft: "regel" });
  const out = recategorize({ transaktionen: [t], regeln });
  const r = out.transaktionen[0];
  assert.equal(r.kategorisierung_status, "offen");
  assert.equal(Object.hasOwn(r, "kategorie_id"), false);
  assert.equal(Object.hasOwn(r, "kategorie_herkunft"), false);
  assert.equal(out.report.zurueckgesetzt, 1);
});

test("erhaelt unbeteiligte Felder", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "offen", bank_referenz: "REF-1", bemerkung: "Notiz" });
  const out = recategorize({ transaktionen: [t], regeln });
  assert.equal(out.transaktionen[0].bank_referenz, "REF-1");
  assert.equal(out.transaktionen[0].bemerkung, "Notiz");
});

test("recategorize stempelt matched_regeln auf neu vorgeschlagene Buchung", () => {
  const regeln = [{ regel_id: "REG-001", gegenpartei_pattern: "musterladenb", kategorie_id: "KAT-003", status: "aktiv" }];
  const t = tx({ transaktion_id: "TXN-x", kategorisierung_status: "offen", gegenpartei: "MusterladenB Markt", verwendungszweck: "" });
  const out = recategorize({ transaktionen: [t], regeln });
  assert.deepEqual(out.transaktionen[0].matched_regeln, ["REG-001"]);
});

test("recategorize stempelt Konflikt-Regeln auf offene Buchung", () => {
  const regeln = [
    { regel_id: "REG-001", gegenpartei_pattern: "shop", kategorie_id: "KAT-003", status: "aktiv" },
    { regel_id: "REG-002", gegenpartei_pattern: "shop", kategorie_id: "KAT-017", status: "aktiv" },
  ];
  const t = tx({ transaktion_id: "TXN-y", kategorisierung_status: "offen", gegenpartei: "Shop", verwendungszweck: "" });
  const out = recategorize({ transaktionen: [t], regeln });
  assert.equal(out.transaktionen[0].kategorisierung_status, "offen");
  assert.deepEqual([...out.transaktionen[0].matched_regeln].sort(), ["REG-001", "REG-002"]);
});

test("recategorize laesst manuell unangetastet (kein matched_regeln)", () => {
  const regeln = [{ regel_id: "REG-001", gegenpartei_pattern: "musterladenb", kategorie_id: "KAT-003", status: "aktiv" }];
  const t = tx({ transaktion_id: "TXN-z", kategorisierung_status: "bestaetigt", kategorie_herkunft: "manuell", kategorie_id: "KAT-099", gegenpartei: "MusterladenB", verwendungszweck: "" });
  const out = recategorize({ transaktionen: [t], regeln });
  assert.equal(out.transaktionen[0].matched_regeln, undefined);
});

test("recategorize entfernt veraltete Quelle bei auto-bestaetigt ohne aktuellen Treffer", () => {
  const regeln = [];
  const t = tx({ transaktion_id: "TXN-w", kategorisierung_status: "bestaetigt", bestaetigt_durch: "auto", kategorie_herkunft: "regel", kategorie_id: "KAT-003", matched_regeln: ["REG-001"], gegenpartei: "Alt", verwendungszweck: "" });
  const out = recategorize({ transaktionen: [t], regeln });
  assert.equal(out.transaktionen[0].matched_regeln, undefined);
});

test("ist idempotent: zweimal laufen liefert dasselbe Ergebnis", () => {
  const txs = [
    tx({ gegenpartei: "MusterladenA", kategorisierung_status: "offen" }),
    tx({ gegenpartei: "MusterladenB", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "regel" }),
    tx({ gegenpartei: "Unbekannt", kategorisierung_status: "vorgeschlagen", kategorie_id: "KAT-003", kategorie_herkunft: "regel" }),
    tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-099", kategorie_herkunft: "manuell" }),
    tx({ gegenpartei: "MusterladenA", kategorisierung_status: "abgelehnt" }),
  ];
  const once = recategorize({ transaktionen: txs, regeln });
  const twice = recategorize({ transaktionen: once.transaktionen, regeln });
  assert.deepEqual(twice.transaktionen, once.transaktionen);
});

test("auto-bestaetigt wird neu bewertet, mensch-bestaetigt nicht", () => {
  const auto = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-009", kategorie_herkunft: "agent", bestaetigt_durch: "auto" });
  const mensch = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-009", kategorie_herkunft: "agent", bestaetigt_durch: "mensch" });
  const out = recategorize({ transaktionen: [auto, mensch], regeln });
  // REG-001 deckt MusterladenA mit KAT-003 ab: Wiedervorlage nur fuer den auto-Eintrag.
  assert.equal(out.transaktionen[0].kategorisierung_status, "vorgeschlagen");
  assert.equal(out.transaktionen[0].kategorie_id, "KAT-003");
  assert.equal(out.transaktionen[1].kategorisierung_status, "bestaetigt");
  assert.equal(out.transaktionen[1].kategorie_id, "KAT-009");
});

test("Wiedervorlage entfernt bestaetigt_durch (Invariante: nur bei bestaetigt)", () => {
  const auto = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-009", kategorie_herkunft: "regel", bestaetigt_durch: "auto" });
  const out = recategorize({ transaktionen: [auto], regeln });
  assert.equal(out.transaktionen[0].kategorisierung_status, "vorgeschlagen");
  assert.equal(Object.hasOwn(out.transaktionen[0], "bestaetigt_durch"), false);
});

// Ohne eindeutigen Regeltreffer gibt es nichts, worauf neu bewertet werden
// koennte (ADR 0017: kein eindeutiges Ergebnis => unveraendert). Wuerde der
// Lauf hier zurueckstufen, wischte er bei jedem Durchgang alle KAT-012-
// Zuordnungen weg, ohne dass eine Regel etwas Besseres anzubieten haette.
test("auto-bestaetigt ohne Regeltreffer bleibt unveraendert bestaetigt", () => {
  const auto = tx({ gegenpartei: "Voellig Unbekannt", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-009", kategorie_herkunft: "agent", bestaetigt_durch: "auto" });
  const out = recategorize({ transaktionen: [auto], regeln });
  assert.equal(out.transaktionen[0].kategorisierung_status, "bestaetigt");
  assert.equal(out.transaktionen[0].bestaetigt_durch, "auto");
  assert.equal(out.transaktionen[0].kategorie_id, "KAT-009");
});

// Trifft eine Regel eine auto-freigegebene Agenten-Schaetzung mit derselben
// Kategorie, hat die Schaetzung jetzt einen Beleg: Herkunft wird regel, die
// Freigabe bleibt. Agenten-Herkunft mit matched_regeln verbietet der Validator.
test("agent+auto mit gleicher Kategorie wird belegt: Herkunft regel, Freigabe bleibt", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "agent", bestaetigt_durch: "auto" });
  const out = recategorize({ transaktionen: [t], regeln });
  const r = out.transaktionen[0];
  assert.equal(r.kategorisierung_status, "bestaetigt");
  assert.equal(r.bestaetigt_durch, "auto");
  assert.equal(r.kategorie_id, "KAT-003");
  assert.equal(r.kategorie_herkunft, "regel");
  assert.deepEqual(r.matched_regeln, ["REG-001"]);
  assert.equal(out.report.belegt, 1);
  assert.equal(out.report.wiedervorlage, 0);
});

test("agent+auto mit gleicher Kategorie ergibt einen gueltigen Bestand", async () => {
  const root = new URL("./fixtures/master-valid/", import.meta.url);
  const json = async (name) => JSON.parse(await readFile(new URL(name, root), "utf8"));
  const jsonl = async (name) => (await readFile(new URL(name, root), "utf8")).split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
  const data = {
    personen: await json("personen.json"),
    konten: await json("konten.json"),
    kategorien: await json("kategorien.json"),
    immobilien: await json("immobilien.json"),
    transaktionen: await jsonl("transaktionen.jsonl"),
    transfers: await json("transfers.json"),
  };
  const fixtureRegeln = [{ regel_id: "REG-001", gegenpartei_pattern: "musterladena", kategorie_id: "KAT-001", status: "aktiv", erstellt_am: "2026-06-01", kommentar: "Testregel" }];
  const t = tx({ transaktion_id: "TXN-00000000-0000-4000-8000-000000000001", gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-001", kategorie_herkunft: "agent", bestaetigt_durch: "auto" });
  const out = recategorize({ transaktionen: [...data.transaktionen, t], regeln: fixtureRegeln });
  const result = validateMasterData({ ...data, kategorisierungsregeln: fixtureRegeln, transaktionen: out.transaktionen });
  assert.equal(result.valid, true, result.errors.join("\n"));
});

test("agent+auto mit anderer Kategorie wird wie bisher als Regelvorschlag wiedervorgelegt", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-009", kategorie_herkunft: "agent", bestaetigt_durch: "auto" });
  const out = recategorize({ transaktionen: [t], regeln });
  const r = out.transaktionen[0];
  assert.equal(r.kategorisierung_status, "vorgeschlagen");
  assert.equal(r.kategorie_id, "KAT-003");
  assert.equal(r.kategorie_herkunft, "regel");
  assert.deepEqual(r.matched_regeln, ["REG-001"]);
  assert.equal(Object.hasOwn(r, "bestaetigt_durch"), false);
  assert.equal(out.report.wiedervorlage, 1);
});

test("agent+mensch bleibt unveraendert, auch bei gleicher Kategorie", () => {
  const gleich = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "agent", bestaetigt_durch: "mensch" });
  const anders = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-009", kategorie_herkunft: "agent", bestaetigt_durch: "mensch" });
  const out = recategorize({ transaktionen: [gleich, anders], regeln });
  assert.deepEqual(out.transaktionen, [gleich, anders]);
  assert.equal(out.report.uebersprungen, 2);
});

test("regel+auto bekommt den aktuellen Regelbezug, regel+mensch bleibt wie entschieden", () => {
  const auto = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "regel", bestaetigt_durch: "auto" });
  const mensch = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "regel", bestaetigt_durch: "mensch" });
  const out = recategorize({ transaktionen: [auto, mensch], regeln });
  assert.deepEqual(out.transaktionen, [{ ...auto, matched_regeln: ["REG-001"] }, mensch]);
  assert.equal(out.report.unveraendert, 1);
  assert.equal(out.report.uebersprungen, 1);
  assert.equal(out.report.belegt, 0);
});
