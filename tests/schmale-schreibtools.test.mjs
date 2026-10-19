// tests/schmale-schreibtools.test.mjs
// 1B.3: schmale Schreibwerkzeuge statt roher Dateiedits auf Kerndateien.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { regelSchreiben } from "../app/tools/regel-schreiben.mjs";
import { stammdatumSetzen } from "../app/tools/stammdatum-setzen.mjs";
import { zeitwertAnhaengen } from "../app/tools/zeitwert-anhaengen.mjs";
import { protokollEintrag } from "../app/tools/protokoll-eintrag.mjs";
import { transferExtern } from "../app/tools/transfer-extern.mjs";
import { validateMasterData } from "../app/tools/validate-core.mjs";
import { sichtbareWerkzeuge } from "../app/mcp/werkzeuge.mjs";

const demo = fileURLToPath(new URL("../app/data/demo/", import.meta.url));
const lies = (datei) => JSON.parse(readFileSync(join(demo, datei), "utf8"));
const liesJsonl = (datei) => readFileSync(join(demo, datei), "utf8").split("\n").filter((z) => z.trim()).map((z) => JSON.parse(z));
const TXN_A = "TXN-11111111-1111-4111-8111-111111111111";
const TXN_B = "TXN-22222222-2222-4222-8222-222222222222";

function tx(props) {
  return {
    transaktion_id: TXN_A, dedupe_hash: `h-${props.transaktion_id ?? TXN_A}`, rohquelle: "data/inbox/x.csv", konto_id: "KTO-001",
    buchungsdatum: "2026-05-20", betrag: "-10.00", gegenpartei: "Testladen", verwendungszweck: "", ist_transfer: false,
    kategorisierung_status: "offen", ...props,
  };
}

// --- regel_schreiben -------------------------------------------------------

test("regel_schreiben: neue Regel bekommt die naechste ID und Standardwerte", () => {
  const bestandsRegeln = [{ regel_id: "REG-007", gegenpartei_pattern: "Anderer", kategorie_id: "KAT-004", status: "aktiv", erstellt_am: "2026-01-01", kommentar: "x", belegstufe: "E3" }];
  const out = regelSchreiben({
    transaktionen: [tx({})], bestandsRegeln, kategorieIds: ["KAT-003", "KAT-004"], heute: "2026-10-20",
    regeln: [{ gegenpartei_pattern: "Testladen", kategorie_id: "KAT-003", kommentar: "Buchungstext nennt den Laden", belegstufe: "E3" }],
  });
  assert.equal(out.blockiert, false, JSON.stringify(out.probelauf));
  assert.deepEqual(out.neu, ["REG-008"]);
  const neu = out.regeln.find((r) => r.regel_id === "REG-008");
  assert.equal(neu.status, "aktiv");
  assert.equal(neu.erstellt_am, "2026-10-20");
  assert.equal(out.regeln.length, 2);
});

test("regel_schreiben: aktive neue Regel ohne Belegstufe wird abgewiesen", () => {
  const out = regelSchreiben({
    transaktionen: [], bestandsRegeln: [], kategorieIds: ["KAT-003"], heute: "2026-10-20",
    regeln: [{ gegenpartei_pattern: "Testladen", kategorie_id: "KAT-003", kommentar: "ohne Beleg" }],
  });
  assert.equal(out.blockiert, true);
  assert.ok(out.fehler.some((f) => f.includes("belegstufe")), JSON.stringify(out.fehler));
});

test("regel_schreiben: Probelauf blockiert, dann bleibt der Regelbestand unveraendert", () => {
  const bestandsRegeln = [{ regel_id: "REG-001", gegenpartei_pattern: "Testladen", kategorie_id: "KAT-004", status: "aktiv", erstellt_am: "2026-01-01", kommentar: "x", belegstufe: "E3" }];
  const out = regelSchreiben({
    transaktionen: [tx({})], bestandsRegeln, kategorieIds: ["KAT-003", "KAT-004"], heute: "2026-10-20",
    regeln: [{ gegenpartei_pattern: "Testladen", kategorie_id: "KAT-003", kommentar: "Konflikt", belegstufe: "E3" }],
  });
  assert.equal(out.blockiert, true);
  assert.equal(out.probelauf.neue_konflikte.length, 1);
  assert.deepEqual(out.regeln, bestandsRegeln);
});

test("regel_schreiben: Aenderung einer bestehenden Regel, unbekannte ID ist ein Fehler", () => {
  const bestandsRegeln = [{ regel_id: "REG-001", gegenpartei_pattern: "Testladen", kategorie_id: "KAT-004", status: "aktiv", erstellt_am: "2026-01-01", kommentar: "x", belegstufe: "E3" }];
  const ok = regelSchreiben({ transaktionen: [], bestandsRegeln, kategorieIds: ["KAT-004"], heute: "2026-10-20", regeln: [{ regel_id: "REG-001", status: "inaktiv" }] });
  assert.equal(ok.blockiert, false, JSON.stringify(ok));
  assert.deepEqual(ok.geaendert, ["REG-001"]);
  assert.equal(ok.regeln[0].status, "inaktiv");
  assert.equal(ok.regeln[0].gegenpartei_pattern, "Testladen");
  const falsch = regelSchreiben({ transaktionen: [], bestandsRegeln, kategorieIds: ["KAT-004"], heute: "2026-10-20", regeln: [{ regel_id: "REG-099", status: "inaktiv" }] });
  assert.equal(falsch.blockiert, true);
});

// --- stammdatum_setzen -----------------------------------------------------

test("stammdatum_setzen: Feld setzen und mit null entfernen", () => {
  const konten = lies("konten.json");
  const out = stammdatumSetzen({ liste: konten, typ: "konto", id: "KTO-001", felder: { name: "Neu", aktiv_bis: null } });
  const k = out.liste.find((x) => x.konto_id === "KTO-001");
  assert.equal(k.name, "Neu");
  assert.equal(Object.hasOwn(k, "aktiv_bis"), false);
  assert.deepEqual(out.aenderung.felder.name, { vorher: konten[0].name, nachher: "Neu" });
});

test("stammdatum_setzen: neues Konto bekommt die naechste ID", () => {
  const konten = lies("konten.json");
  const out = stammdatumSetzen({ liste: konten, typ: "konto", felder: { name: "Neues Konto", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" } });
  const max = Math.max(...konten.map((k) => Number(k.konto_id.slice(4))));
  assert.equal(out.aenderung.id, `KTO-${String(max + 1).padStart(3, "0")}`);
  assert.equal(out.liste.length, konten.length + 1);
});

test("stammdatum_setzen: neue Kategorie landet vor KAT-012", () => {
  const out = stammdatumSetzen({ liste: lies("kategorien.json"), typ: "kategorie", felder: { name: "Test", typ: "ausgabe", lebenshaltung_relevant: true, status: "aktiv" } });
  assert.equal(out.liste.at(-1).kategorie_id, "KAT-012");
  assert.equal(out.liste.at(-2).kategorie_id, out.aenderung.id);
});

test("stammdatum_setzen: ID-Feld nicht aenderbar, unbekannter Typ und unbekannte ID sind Fehler", () => {
  const konten = lies("konten.json");
  assert.throws(() => stammdatumSetzen({ liste: konten, typ: "konto", id: "KTO-001", felder: { konto_id: "KTO-999" } }), /konto_id/);
  assert.throws(() => stammdatumSetzen({ liste: konten, typ: "transaktion", id: "KTO-001", felder: {} }), /Typ/);
  assert.throws(() => stammdatumSetzen({ liste: konten, typ: "konto", id: "KTO-999", felder: { name: "x" } }), /KTO-999/);
});

// --- zeitwert_anhaengen ----------------------------------------------------

const ZW = { entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "100.00", standdatum: "2026-01-31", qualitaet: "belegt", quelle_hinweis: "Auszug" };

test("zeitwert_anhaengen: neu anhaengen, gleicher Wert ist unveraendert", () => {
  const a = zeitwertAnhaengen({ zeitwerte: [], eintraege: [ZW] });
  assert.equal(a.zeitwerte.length, 1);
  assert.equal(a.bericht.neu, 1);
  const b = zeitwertAnhaengen({ zeitwerte: a.zeitwerte, eintraege: [ZW] });
  assert.equal(b.zeitwerte.length, 1);
  assert.equal(b.bericht.unveraendert, 1);
  assert.equal(b.blockiert, false);
});

test("zeitwert_anhaengen: abweichender Wert am selben Standdatum warnt und schreibt nur mit korrigieren", () => {
  const anders = { ...ZW, wert: "120.00" };
  const ohne = zeitwertAnhaengen({ zeitwerte: [ZW], eintraege: [anders] });
  assert.equal(ohne.blockiert, true);
  assert.equal(ohne.bericht.abweichend.length, 1);
  assert.deepEqual(ohne.zeitwerte, [ZW]);
  const mit = zeitwertAnhaengen({ zeitwerte: [ZW], eintraege: [anders], korrigieren: true });
  assert.equal(mit.blockiert, false);
  assert.equal(mit.zeitwerte.length, 1);
  assert.equal(mit.zeitwerte[0].wert, "120.00");
  assert.equal(mit.bericht.korrigiert, 1);
});

// --- protokoll_eintrag -----------------------------------------------------

test("protokoll_eintrag: freier Eintrag mit Zeitpunkt, Werkzeug-Anlaesse sind reserviert", () => {
  const e = protokollEintrag({ anlass: "stammdaten", notiz: "Konto ergaenzt", ids: ["KTO-001"], zeitpunkt: "2026-10-20T00:00:00.000Z" });
  assert.equal(e.anlass, "stammdaten");
  assert.equal(e.zeitpunkt, "2026-10-20T00:00:00.000Z");
  assert.deepEqual(e.ids, ["KTO-001"]);
  assert.throws(() => protokollEintrag({ anlass: "korrektur", notiz: "x" }), /reserviert/);
  assert.throws(() => protokollEintrag({ anlass: "freigabe", notiz: "x" }), /reserviert/);
  assert.throws(() => protokollEintrag({ anlass: "stammdaten", notiz: "" }), /notiz/);
  assert.equal(protokollEintrag({ anlass: "dubletten", notiz: "angesehen", dubletten_geprueft: true }).dubletten_geprueft, true);
});

// --- transfer_extern -------------------------------------------------------

test("transfer_extern: legt einen externen Transfer an, Bestand bleibt gueltig; entfernen macht es rueckgaengig", () => {
  const basis = {
    personen: lies("personen.json"), konten: lies("konten.json"), kategorien: lies("kategorien.json"), transfers: [],
    transaktionen: [tx({ transaktion_id: TXN_A, betrag: "-50.00" }), tx({ transaktion_id: TXN_B, dedupe_hash: "h2" })],
  };
  const out = transferExtern({ transaktionen: basis.transaktionen, transfers: [], transaktionId: TXN_A, gegenseite: "bar", begruendung: "Bargeld an Dritte", neueId: () => "TRF-33333333-3333-4333-8333-333333333333" });
  assert.equal(out.transfers.length, 1);
  assert.equal(out.transfers[0].abgang_transaktion_id, TXN_A);
  assert.equal(out.transfers[0].betrag, "50.00");
  const r = validateMasterData({ ...basis, transaktionen: out.transaktionen, transfers: out.transfers });
  assert.equal(r.valid, true, r.errors.join("; "));
  assert.throws(() => transferExtern({ transaktionen: out.transaktionen, transfers: out.transfers, transaktionId: TXN_A, gegenseite: "bar", begruendung: "x", neueId: () => "TRF-x" }), /schon/);
  const weg = transferExtern({ transaktionen: out.transaktionen, transfers: out.transfers, transaktionId: TXN_A, entfernen: true });
  assert.deepEqual(weg.transfers, []);
  assert.equal(weg.transaktionen[0].ist_transfer, false);
  assert.equal(Object.hasOwn(weg.transaktionen[0], "transfer_id"), false);
});

// --- CLI und MCP -----------------------------------------------------------

test("stammdatum-setzen CLI: Vorschau schreibt nicht, --schreiben schreibt und protokolliert", () => {
  const wurzel = mkdtempSync(join(tmpdir(), "finanzen-stammdatum-"));
  try {
    cpSync(demo, wurzel, { recursive: true });
    const skript = fileURLToPath(new URL("../app/tools/stammdatum-setzen.mjs", import.meta.url));
    const args = [skript, wurzel, "--typ=konto", "--id=KTO-001", `--felder=${JSON.stringify({ name: "Umbenannt" })}`, "--notiz=Test"];
    const vorschau = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(vorschau.status, 0, vorschau.stderr);
    assert.notEqual(JSON.parse(readFileSync(join(wurzel, "konten.json"), "utf8"))[0].name, "Umbenannt");
    const lauf = spawnSync(process.execPath, [...args, "--schreiben"], { encoding: "utf8" });
    assert.equal(lauf.status, 0, lauf.stderr + lauf.stdout);
    assert.equal(JSON.parse(readFileSync(join(wurzel, "konten.json"), "utf8"))[0].name, "Umbenannt");
    const log = readFileSync(join(wurzel, "agent_log.jsonl"), "utf8").trim().split("\n").map((z) => JSON.parse(z));
    assert.equal(log.at(-1).anlass, "stammdatum");
    assert.deepEqual(log.at(-1).ids, ["KTO-001"]);
  } finally {
    rmSync(wurzel, { recursive: true, force: true });
  }
});

test("MCP kennt die schmalen Schreibwerkzeuge", () => {
  const namen = sichtbareWerkzeuge({ recht: "schreiben" }).map((w) => w.name);
  for (const n of ["regel_schreiben", "stammdatum_setzen", "zeitwert_anhaengen", "protokoll_eintrag", "transfer_extern"]) assert.ok(namen.includes(n), n);
});

test("Demodaten: zeitwerte und Regeln passen zu den Werkzeugen", () => {
  // Sicherheitsnetz: die Funktionen arbeiten auf dem echten Format der Dateien.
  assert.doesNotThrow(() => zeitwertAnhaengen({ zeitwerte: liesJsonl("zeitwerte.jsonl"), eintraege: [] }));
  assert.equal(regelSchreiben({ transaktionen: liesJsonl("transaktionen.jsonl"), bestandsRegeln: lies("kategorisierungsregeln.json"), kategorieIds: lies("kategorien.json").map((k) => k.kategorie_id), heute: "2026-10-20", regeln: [] }).blockiert, false);
});

test("regel_schreiben: Aenderung darf keine aktive Regel ohne Belegstufe hinterlassen; Reaktivierung nur mit notiz", () => {
  const inaktiv = { regel_id: "REG-001", gegenpartei_pattern: "Testladen", kategorie_id: "KAT-004", status: "inaktiv", erstellt_am: "2026-01-01", kommentar: "x" };
  const ohneStufe = regelSchreiben({ transaktionen: [], bestandsRegeln: [inaktiv], kategorieIds: ["KAT-004"], heute: "2026-10-20", regeln: [{ regel_id: "REG-001", status: "aktiv" }], notiz: "Nutzer will sie wieder" });
  assert.equal(ohneStufe.blockiert, true);
  const ohneNotiz = regelSchreiben({ transaktionen: [], bestandsRegeln: [{ ...inaktiv, belegstufe: "E3" }], kategorieIds: ["KAT-004"], heute: "2026-10-20", regeln: [{ regel_id: "REG-001", status: "aktiv" }] });
  assert.equal(ohneNotiz.blockiert, true);
  assert.ok(ohneNotiz.fehler.some((f) => f.includes("notiz")));
  const mitNotiz = regelSchreiben({ transaktionen: [], bestandsRegeln: [{ ...inaktiv, belegstufe: "E3" }], kategorieIds: ["KAT-004"], heute: "2026-10-20", regeln: [{ regel_id: "REG-001", status: "aktiv" }], notiz: "Nutzer hat die Stilllegung aufgehoben" });
  assert.equal(mitNotiz.blockiert, false, JSON.stringify(mitNotiz.fehler));
  const stufeWeg = regelSchreiben({ transaktionen: [], bestandsRegeln: [{ ...inaktiv, status: "aktiv", belegstufe: "E3" }], kategorieIds: ["KAT-004"], heute: "2026-10-20", regeln: [{ regel_id: "REG-001", belegstufe: null }], notiz: "x" });
  assert.equal(stufeWeg.blockiert, true);
});

test("protokoll_eintrag: Abstimmung (normalisierung) fuer den Pruefbericht", () => {
  const e = protokollEintrag({ anlass: "abstimmung", notiz: "Luecke geschlossen", normalisierung: { reconciliation_erledigt: { konto_id: "KTO-001", bezug: "2026-01", grund: "Auszug nachgereicht" } } });
  assert.equal(e.normalisierung.reconciliation_erledigt.konto_id, "KTO-001");
  assert.throws(() => protokollEintrag({ anlass: "abstimmung", notiz: "x", normalisierung: { beliebig: 1 } }), /unbekannte/);
});
