// Importprofile werden vor der Nutzung gegen schemas/importprofil.schema.json
// geprueft (Review 0A.2, Rest). Ein ungueltiges Profil bricht den Inbox-Lauf
// nicht ab und normalisiert auch nichts halb: die Datei, die es treffen
// wuerde, landet mit klarer Fehlernotiz in error/.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { validateImportProfil } from "../app/tools/import-format.mjs";
import { planInbox } from "../app/tools/inbox.mjs";
import { legeAbzugAn } from "./mcp-hilfe.mjs";

const PROFIL = {
  profil_id: "test-profil",
  quelle: "csv",
  dateimuster: "^profil.*\\.csv$",
  konto_id: "KTO-005",
  trennzeichen: ";",
  kopfzeile: "Datum",
  datumsformat: "DD.MM.YYYY",
  dezimal: ",",
  felder: {
    buchungsdatum: { spalte: "Datum" },
    betrag: { spalte: "Betrag" },
    gegenpartei: { spalte: "Name" },
    verwendungszweck: { spalte: "Zweck", muster: "^(.*)$", gruppe: 1 },
    kundenreferenz: { konstante: "" },
  },
};

const ohne = (objekt, feld) => {
  const kopie = structuredClone(objekt);
  delete kopie[feld];
  return kopie;
};
const mit = (aenderung) => ({ ...structuredClone(PROFIL), ...aenderung });
const fehlerVon = (profil) => validateImportProfil(profil).join("\n");

test("gueltiges Profil hat keine Fehler, auch mit Soll/Haben-Betrag", () => {
  assert.deepEqual(validateImportProfil(PROFIL), []);
  assert.deepEqual(validateImportProfil(mit({ felder: { ...PROFIL.felder, betrag: { soll: "Soll", haben: "Haben" } } })), []);
});

test("Pflichtfelder, unbekannte Felder, Muster und Aufzaehlungen werden gemeldet", () => {
  assert.match(fehlerVon(ohne(PROFIL, "kopfzeile")), /kopfzeile: Pflichtfeld fehlt/);
  assert.match(fehlerVon(mit({ kopfzeille: "Datum" })), /unbekanntes Feld kopfzeille/);
  assert.match(fehlerVon(mit({ profil_id: "Test Profil" })), /profil_id/);
  assert.match(fehlerVon(mit({ konto_id: "KTO-5" })), /konto_id/);
  assert.match(fehlerVon(mit({ quelle: "pdf" })), /quelle/);
  assert.match(fehlerVon(mit({ datumsformat: "D.M.YY" })), /datumsformat/);
  assert.match(fehlerVon(mit({ dezimal: "" })), /dezimal/);
  assert.match(fehlerVon(mit({ trennzeichen: 1 })), /trennzeichen/);
});

test("felder: Pflichtfelder, unbekannte Zielfelder und kaputte Herkunft", () => {
  const felder = (aenderung) => mit({ felder: { ...structuredClone(PROFIL.felder), ...aenderung } });
  assert.match(fehlerVon(mit({ felder: ohne(PROFIL.felder, "betrag") })), /felder\.betrag: Pflichtfeld fehlt/);
  assert.match(fehlerVon(felder({ betrg: { spalte: "Betrag" } })), /felder: unbekanntes Feld betrg/);
  assert.match(fehlerVon(felder({ gegenpartei: { splate: "Name" } })), /felder\.gegenpartei: unbekanntes Feld splate/);
  assert.match(fehlerVon(felder({ gegenpartei: {} })), /felder\.gegenpartei: braucht spalte oder konstante/);
  assert.match(fehlerVon(felder({ gegenpartei: { spalte: "Name", konstante: "" } })), /felder\.gegenpartei: spalte und konstante schliessen sich aus/);
  assert.match(fehlerVon(felder({ gegenpartei: { spalte: "Name", muster: "(", gruppe: 1 } })), /felder\.gegenpartei\.muster: kein gueltiger regulaerer Ausdruck/);
  assert.match(fehlerVon(felder({ gegenpartei: { spalte: "Name", muster: "(.*)", gruppe: 0 } })), /felder\.gegenpartei\.gruppe/);
  assert.match(fehlerVon(felder({ betrag: { soll: "Soll" } })), /felder\.betrag/);
});

test("dateimuster muss ein gueltiger regulaerer Ausdruck sein", () => {
  assert.match(fehlerVon(mit({ dateimuster: "^profil[" })), /dateimuster: kein gueltiger regulaerer Ausdruck/);
});

test("kein Objekt ist ein Fehler, kein Absturz", () => {
  assert.notDeepEqual(validateImportProfil(null), []);
  assert.notDeepEqual(validateImportProfil([]), []);
});

test("planInbox: eine CSV, die nur ein ungueltiges Profil trifft, wird ein Fehlerauftrag", () => {
  const plan = planInbox({
    dateien: ["profil-1.csv", "anderes.csv"],
    profile: [],
    ungueltigeProfile: [{ datei: "test-profil.json", profil_id: "test-profil", dateimuster: "^profil", fehler: ["kopfzeile: Pflichtfeld fehlt"] }],
  });
  assert.deepEqual(plan.auftraege, [{ datei: "profil-1.csv", art: "profil-ungueltig", profil_id: "test-profil", profildatei: "test-profil.json", fehler: ["kopfzeile: Pflichtfeld fehlt"] }]);
  assert.equal(plan.offen.length, 1);
  assert.equal(plan.offen[0].datei, "anderes.csv");
});

test("planInbox: gueltiges und ungueltiges Profil auf derselben Datei sind mehrdeutig", () => {
  const plan = planInbox({
    dateien: ["profil-1.csv"],
    profile: [{ ...PROFIL, profil_id: "gut" }],
    ungueltigeProfile: [{ datei: "kaputt.json", profil_id: "kaputt", dateimuster: "^profil", fehler: ["x"] }],
  });
  assert.equal(plan.auftraege.length, 0);
  assert.match(plan.offen[0].grund, /mehrdeutig: gut, kaputt/);
});

// --- Inbox-Lauf als Ganzes ---------------------------------------------------

function abzugMit(profile) {
  const abzug = legeAbzugAn();
  const ordner = join(abzug.app, "data", "import-profile");
  mkdirSync(ordner, { recursive: true });
  for (const [name, inhalt] of Object.entries(profile)) {
    writeFileSync(join(ordner, name), typeof inhalt === "string" ? inhalt : JSON.stringify(inhalt));
  }
  return { ...abzug, inbox: join(abzug.app, "data", "inbox") };
}

function inboxLauf(abzug) {
  const r = spawnSync(process.execPath, [join(realpathSync(abzug.app), "tools", "inbox.mjs"), abzug.master, "--schreiben"], { cwd: abzug.wurzel, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}
const bericht = (stdout) => JSON.parse(stdout.slice(stdout.indexOf("{"), stdout.lastIndexOf("}") + 1));
const csv = (...zeilen) => ["Datum;Betrag;Name;Zweck", ...zeilen].join("\n") + "\n";

test("Inbox-Lauf: ungueltiges Profil schickt seine Datei mit klarer Notiz nach error/, ohne zu importieren", () => {
  const abzug = abzugMit({ "test-profil.json": ohne(PROFIL, "kopfzeile") });
  try {
    const vorher = readFileSync(join(abzug.master, "transaktionen.jsonl"), "utf8");
    writeFileSync(join(abzug.inbox, "profil-1.csv"), csv("01.09.2026;-13,37;Testladen;Einkauf"));
    const r = inboxLauf(abzug);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(join(abzug.inbox, "error", "profil-1.csv")));
    const notiz = readFileSync(join(abzug.inbox, "error", "profil-1.csv.fehler.txt"), "utf8");
    assert.match(notiz, /Profil test-profil \(test-profil\.json\) ungueltig/);
    assert.match(notiz, /kopfzeile: Pflichtfeld fehlt/);
    assert.equal(readFileSync(join(abzug.master, "transaktionen.jsonl"), "utf8"), vorher);
    assert.equal(bericht(r.stdout).profilfehler[0].datei, "test-profil.json");
  } finally {
    abzug.aufraeumen();
  }
});

test("Inbox-Lauf: kaputtes JSON und kaputtes dateimuster bringen den Lauf nicht zum Absturz", () => {
  const abzug = abzugMit({
    "test-profil.json": PROFIL,
    "kaputt.json": "{ kein json",
    "muster.json": mit({ profil_id: "muster", dateimuster: "^x[" }),
  });
  try {
    writeFileSync(join(abzug.inbox, "profil-2.csv"), csv("02.09.2026;-2,50;Testladen;Einkauf Zwei"));
    const r = inboxLauf(abzug);
    assert.equal(r.status, 0, r.stderr);
    const b = bericht(r.stdout);
    assert.equal(b.laeufe[0].geschrieben, 1);
    assert.ok(existsSync(join(abzug.inbox, "processed", "profil-2.csv")));
    const fehler = Object.fromEntries(b.profilfehler.map((p) => [p.datei, p.fehler.join("; ")]));
    assert.match(fehler["kaputt.json"], /kein gueltiges JSON/);
    assert.match(fehler["muster.json"], /dateimuster: kein gueltiger regulaerer Ausdruck/);
  } finally {
    abzug.aufraeumen();
  }
});
