// inbox_verwerfen und inbox_zurueckholen: Dateien aus der Inbox in den
// Papierkorb schieben bzw. aus error/ zurueckholen. Nie loeschen, nie
// ueberschreiben, nichts ausserhalb von data/inbox/.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { localTodayIso } from "../app/liquiditaet.mjs";
import { legeAbzugAn, starteServer } from "./mcp-hilfe.mjs";

let abzug;
let inbox;
let korb;
before(() => {
  abzug = legeAbzugAn();
  inbox = join(abzug.app, "data", "inbox");
  korb = join(abzug.app, "data", "papierkorb", localTodayIso());
});
after(() => abzug.aufraeumen());

const logZeilen = () => readFileSync(join(abzug.master, "agent_log.jsonl"), "utf8").trim().split("\n").map((z) => JSON.parse(z));

test("inbox_verwerfen: aus der Wurzel samt Zwilling und Textvorlauf in den Papierkorb, mit Log-Zeile", async () => {
  mkdirSync(join(inbox, "standardized"), { recursive: true });
  writeFileSync(join(inbox, "duplikat.pdf"), "%PDF-1.4 a");
  writeFileSync(join(inbox, "duplikat.txt"), "Zwilling\n");
  writeFileSync(join(inbox, "standardized", "duplikat.txt"), "Vorlauf\n");
  writeFileSync(join(inbox, "bleibt.pdf"), "%PDF-1.4 b");
  const s = starteServer(abzug, "schreiben");
  try {
    const r = await s.werkzeug("inbox_verwerfen", { pfad: "data/inbox/duplikat.pdf", grund: "Duplikat eines bereits importierten Auszugs" });
    assert.ok(!r.isError, r.text);
    const tag = localTodayIso();
    assert.match(r.text, new RegExp(`data/papierkorb/${tag}/duplikat\\.pdf`));
    assert.match(r.text, /Validator nach dem Schreiben/);
    assert.equal(readFileSync(join(korb, "duplikat.pdf"), "utf8"), "%PDF-1.4 a");
    assert.equal(readFileSync(join(korb, "duplikat.txt"), "utf8"), "Zwilling\n");
    assert.equal(readFileSync(join(korb, "standardized", "duplikat.txt"), "utf8"), "Vorlauf\n");
    assert.ok(!existsSync(join(inbox, "duplikat.pdf")));
    assert.ok(!existsSync(join(inbox, "duplikat.txt")));
    assert.ok(!existsSync(join(inbox, "standardized", "duplikat.txt")));
    assert.ok(existsSync(join(inbox, "bleibt.pdf")));

    const eintrag = logZeilen().at(-1);
    assert.equal(eintrag.anlass, "inbox-verwerfen");
    assert.equal(eintrag.notiz, "Duplikat eines bereits importierten Auszugs");
    assert.deepEqual(eintrag.inputs, ["data/inbox/duplikat.pdf", "data/inbox/duplikat.txt", "data/inbox/standardized/duplikat.txt"]);
    assert.deepEqual(eintrag.papierkorb, [`data/papierkorb/${tag}/duplikat.pdf`, `data/papierkorb/${tag}/duplikat.txt`, `data/papierkorb/${tag}/standardized/duplikat.txt`]);
    assert.match(eintrag.zeitpunkt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(eintrag.anzahl_fehler, 0);
  } finally {
    await s.beenden();
  }
});

test("inbox_verwerfen: aus error/ mit Fehlernotiz, Unterstruktur bleibt; Kollision bekommt ein Suffix", async () => {
  mkdirSync(join(inbox, "error"), { recursive: true });
  writeFileSync(join(inbox, "error", "auszug.csv"), "kaputt 1");
  writeFileSync(join(inbox, "error", "auszug.csv.fehler.txt"), "Spalte fehlt\n");
  const s = starteServer(abzug, "schreiben");
  try {
    const erst = await s.werkzeug("inbox_verwerfen", { pfad: "data/inbox/error/auszug.csv" });
    assert.ok(!erst.isError, erst.text);
    assert.equal(readFileSync(join(korb, "error", "auszug.csv"), "utf8"), "kaputt 1");
    assert.equal(readFileSync(join(korb, "error", "auszug.csv.fehler.txt"), "utf8"), "Spalte fehlt\n");
    assert.deepEqual(readdirSync(join(inbox, "error")), []);
    assert.equal(logZeilen().at(-1).notiz, "Datei aus der Inbox verworfen");

    // Gleicher Name noch einmal: nichts wird ueberschrieben, die Gruppe bekommt -2.
    writeFileSync(join(inbox, "error", "auszug.csv"), "kaputt 2");
    writeFileSync(join(inbox, "error", "auszug.csv.fehler.txt"), "Datum unlesbar\n");
    const zweit = await s.werkzeug("inbox_verwerfen", { pfad: "data/inbox/error/auszug.csv" });
    assert.ok(!zweit.isError, zweit.text);
    assert.match(zweit.text, /error\/auszug-2\.csv/);
    assert.equal(readFileSync(join(korb, "error", "auszug.csv"), "utf8"), "kaputt 1");
    assert.equal(readFileSync(join(korb, "error", "auszug-2.csv"), "utf8"), "kaputt 2");
    assert.equal(readFileSync(join(korb, "error", "auszug-2.csv.fehler.txt"), "utf8"), "Datum unlesbar\n");
  } finally {
    await s.beenden();
  }
});

test("inbox_verwerfen: Pfadschutz — ../, Symlink, Belege, master, Ordner", async () => {
  writeFileSync(join(abzug.app, "Belege", "beleg.pdf"), "%PDF beleg");
  symlinkSync(join(abzug.master, "konten.json"), join(inbox, "verweis.json"));
  mkdirSync(join(inbox, "processed"), { recursive: true });
  const kontenVorher = readFileSync(join(abzug.master, "konten.json"), "utf8");
  const s = starteServer(abzug, "schreiben");
  try {
    for (const pfad of [
      "data/inbox/../master/konten.json",
      "data/master/konten.json",
      "Belege/beleg.pdf",
      "data/inbox/verweis.json",
      "../data/inbox/x.pdf",
      "/etc/passwd",
      "data/inbox/processed",
      "data/inbox",
      "data/inbox/gibtesnicht.pdf",
    ]) {
      const r = await s.werkzeug("inbox_verwerfen", { pfad });
      assert.equal(r.isError, true, `${pfad} muss abgewiesen werden: ${r.text}`);
    }
    assert.equal(readFileSync(join(abzug.master, "konten.json"), "utf8"), kontenVorher);
    assert.ok(existsSync(join(abzug.app, "Belege", "beleg.pdf")));
    assert.ok(existsSync(join(inbox, "verweis.json")));
  } finally {
    await s.beenden();
  }
});

test("inbox_verwerfen und inbox_zurueckholen nur mit Schreibrecht", async () => {
  mkdirSync(join(inbox, "error"), { recursive: true });
  writeFileSync(join(inbox, "lesend.pdf"), "x");
  writeFileSync(join(inbox, "error", "lesend.csv"), "x");
  const s = starteServer(abzug, "lesen");
  try {
    const namen = (await s.anfrage("tools/list")).result.tools.map((t) => t.name);
    assert.ok(!namen.includes("inbox_verwerfen"));
    assert.ok(!namen.includes("inbox_zurueckholen"));
    const v = await s.werkzeug("inbox_verwerfen", { pfad: "data/inbox/lesend.pdf" });
    assert.equal(v.isError, true);
    assert.match(v.text, /recht=schreiben/);
    const z = await s.werkzeug("inbox_zurueckholen", { pfad: "data/inbox/error/lesend.csv" });
    assert.equal(z.isError, true);
    assert.ok(existsSync(join(inbox, "lesend.pdf")));
    assert.ok(existsSync(join(inbox, "error", "lesend.csv")));
  } finally {
    await s.beenden();
  }
  const schreibend = starteServer(abzug, "schreiben");
  try {
    const namen = (await schreibend.anfrage("tools/list")).result.tools.map((t) => t.name);
    assert.ok(namen.includes("inbox_verwerfen"));
    assert.ok(namen.includes("inbox_zurueckholen"));
  } finally {
    await schreibend.beenden();
  }
});

test("inbox_zurueckholen: aus error/ in die Wurzel, Kollision bricht ab, nur error/", async () => {
  mkdirSync(join(inbox, "error"), { recursive: true });
  writeFileSync(join(inbox, "error", "nochmal.csv"), "neu");
  const s = starteServer(abzug, "schreiben");
  try {
    const ok = await s.werkzeug("inbox_zurueckholen", { pfad: "data/inbox/error/nochmal.csv" });
    assert.ok(!ok.isError, ok.text);
    assert.match(ok.text, /data\/inbox\/nochmal\.csv/);
    assert.match(ok.text, /Validator nach dem Schreiben/);
    assert.equal(readFileSync(join(inbox, "nochmal.csv"), "utf8"), "neu");
    assert.ok(!existsSync(join(inbox, "error", "nochmal.csv")));
    assert.equal(logZeilen().at(-1).anlass, "inbox-zurueckholen");

    writeFileSync(join(inbox, "error", "nochmal.csv"), "anders");
    const kollision = await s.werkzeug("inbox_zurueckholen", { pfad: "data/inbox/error/nochmal.csv" });
    assert.equal(kollision.isError, true);
    assert.match(kollision.text, /existiert bereits/);
    assert.equal(readFileSync(join(inbox, "nochmal.csv"), "utf8"), "neu");
    assert.equal(readFileSync(join(inbox, "error", "nochmal.csv"), "utf8"), "anders");

    writeFileSync(join(inbox, "error", "nochmal.csv.fehler.txt"), "Fehler\n");
    mkdirSync(join(inbox, "processed"), { recursive: true });
    writeFileSync(join(inbox, "processed", "fertig.csv"), "x");
    for (const pfad of ["data/inbox/processed/fertig.csv", "data/inbox/error/../processed/fertig.csv", "data/inbox/error/nochmal.csv.fehler.txt", "data/master/konten.json", "data/inbox/error"]) {
      const r = await s.werkzeug("inbox_zurueckholen", { pfad });
      assert.equal(r.isError, true, `${pfad} muss abgewiesen werden: ${r.text}`);
    }
    assert.ok(existsSync(join(inbox, "processed", "fertig.csv")));
  } finally {
    await s.beenden();
  }
});
