// Schreibgrenzen (Review 0A.9): eine MCP-Sitzung schreibt nur in ihren
// Bestand samt dessen Inbox, Importprofilen und Papierkorb, nur erlaubte
// Endungen, Datei- und Belegwerkzeuge erst mit schreiben:true, und ein
// Werkzeugfehler fuehrt nie zu einem Commit.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { mitRollback } from "../app/mcp/schreiben.mjs";
import { bestandOrte } from "../app/tools/lib/bestand-orte.mjs";
import { legeAbzugAn, starteServer } from "./mcp-hilfe.mjs";

const demoQuelle = fileURLToPath(new URL("../app/data/demo/", import.meta.url));

let abzug;
before(() => {
  abzug = legeAbzugAn();
  cpSync(abzug.master, join(abzug.app, "data", "demo"), { recursive: true });
});
after(() => abzug.aufraeumen());

test("bestandOrte: data/master behaelt data/inbox, jeder andere Bestand hat eigene Orte", () => {
  const app = "/x/app";
  assert.deepEqual(bestandOrte(app, "/x/app/data/master"), {
    inbox: "/x/app/data/inbox", profile: "/x/app/data/import-profile", papierkorb: "/x/app/data/papierkorb", belege: "/x/app/Belege",
  });
  assert.deepEqual(bestandOrte(app, "/x/app/data/demo"), {
    inbox: "/x/app/data/demo/inbox", profile: "/x/app/data/demo/import-profile", papierkorb: "/x/app/data/demo/papierkorb", belege: null,
  });
});

test("Sitzung auf data/master schreibt nicht in einen anderen Bestand", async () => {
  const s = starteServer(abzug, "schreiben");
  try {
    for (const pfad of ["data/demo/konten.json", "data/demo/inbox/x.txt", "data/exports/x.txt", "data/x.txt"]) {
      const r = await s.werkzeug("datei_schreiben", { pfad, inhalt: "x", schreiben: true });
      assert.equal(r.isError, true, `${pfad}: ${r.text}`);
      const ziel = join(abzug.app, pfad);
      assert.ok(!existsSync(ziel) || readFileSync(ziel, "utf8") !== "x", pfad);
    }
    const inbox = await s.werkzeug("datei_schreiben", { pfad: "data/inbox/notiz.txt", inhalt: "x", schreiben: true });
    assert.ok(!inbox.isError, inbox.text);
    const profil = await s.werkzeug("datei_schreiben", { pfad: "data/import-profile/bank.json", inhalt: "{}", schreiben: true });
    assert.ok(!profil.isError, profil.text);
  } finally {
    await s.beenden();
  }
});

test("Sitzung auf data/demo: nur die eigene Inbox, nie die echte; keine Belege", async () => {
  writeFileSync(join(abzug.app, "data", "inbox", "echt-fremd.csv"), "a;b\n");
  const s = starteServer(abzug, "schreiben", "data/demo");
  try {
    for (const pfad of ["data/master/konten.json", "data/inbox/x.txt", "data/import-profile/x.json"]) {
      const r = await s.werkzeug("datei_schreiben", { pfad, inhalt: "x", schreiben: true });
      assert.equal(r.isError, true, `${pfad}: ${r.text}`);
    }
    const eigen = await s.werkzeug("datei_schreiben", { pfad: "data/demo/inbox/notiz.txt", inhalt: "x", schreiben: true });
    assert.ok(!eigen.isError, eigen.text);

    const status = JSON.parse((await s.werkzeug("status")).text);
    assert.deepEqual(status.inbox.dateien.map((d) => d.name), ["notiz.txt"]);
    const lauf = await s.werkzeug("inbox");
    assert.ok(!lauf.text.includes("echt-fremd.csv"), lauf.text);

    const verwerfen = await s.werkzeug("inbox_verwerfen", { pfad: "data/inbox/echt-fremd.csv", schreiben: true });
    assert.equal(verwerfen.isError, true, verwerfen.text);
    assert.ok(existsSync(join(abzug.app, "data", "inbox", "echt-fremd.csv")));

    const ablegen = await s.werkzeug("beleg_ablegen", { quelle: "data/demo/inbox/notiz.txt", ziel: "Belege/Sonstiges/Allgemein/notiz.txt", schreiben: true });
    assert.equal(ablegen.isError, true, ablegen.text);
    assert.match(ablegen.text, /Belege/);
  } finally {
    await s.beenden();
  }
});

test("Dateiwerkzeuge schreiben nur erlaubte Endungen", async () => {
  const s = starteServer(abzug, "schreiben");
  try {
    for (const name of ["x.html", "x.htm", "x.js", "x.mjs", "x.svg", "x", "x.sh"]) {
      const r = await s.werkzeug("datei_schreiben", { pfad: `data/inbox/${name}`, inhalt: "x", schreiben: true });
      assert.equal(r.isError, true, `${name}: ${r.text}`);
      assert.ok(!existsSync(join(abzug.app, "data", "inbox", name)), name);
    }
    for (const name of ["x.csv", "x.jsonl", "x.md", "x.TXT"]) {
      const r = await s.werkzeug("datei_schreiben", { pfad: `data/inbox/${name}`, inhalt: "x", schreiben: true });
      assert.ok(!r.isError, `${name}: ${r.text}`);
    }
  } finally {
    await s.beenden();
  }
});

test("Datei- und Belegwerkzeuge sind ohne schreiben:true eine Vorschau", async () => {
  const inbox = join(abzug.app, "data", "inbox");
  mkdirSync(join(inbox, "error"), { recursive: true });
  writeFileSync(join(inbox, "vorschau.pdf"), "%PDF-1.4 v");
  writeFileSync(join(inbox, "error", "zurueck.csv"), "a;b\n");
  writeFileSync(join(inbox, "ersetzen.txt"), "a=1\n");
  const s = starteServer(abzug, "schreiben");
  try {
    const faelle = [
      ["datei_schreiben", { pfad: "data/inbox/vorschau-neu.txt", inhalt: "x" }, () => !existsSync(join(inbox, "vorschau-neu.txt"))],
      ["datei_ersetzen", { pfad: "data/inbox/ersetzen.txt", alt: "a=1", neu: "a=2" }, () => readFileSync(join(inbox, "ersetzen.txt"), "utf8") === "a=1\n"],
      ["beleg_ablegen", { quelle: "data/inbox/vorschau.pdf", ziel: "Belege/Sonstiges/Allgemein/2026_Vorschau.pdf" }, () => existsSync(join(inbox, "vorschau.pdf"))],
      ["inbox_verwerfen", { pfad: "data/inbox/vorschau.pdf" }, () => existsSync(join(inbox, "vorschau.pdf"))],
      ["inbox_zurueckholen", { pfad: "data/inbox/error/zurueck.csv" }, () => existsSync(join(inbox, "error", "zurueck.csv"))],
    ];
    for (const [name, args, unveraendert] of faelle) {
      const r = await s.werkzeug(name, args);
      assert.ok(!r.isError, `${name}: ${r.text}`);
      assert.match(r.text, /Vorschau/, name);
      assert.ok(unveraendert(), `${name} hat ohne schreiben:true geschrieben`);
    }
  } finally {
    await s.beenden();
  }
});

test("mitRollback: Werkzeugfehler setzt den Bestand zurueck, auch ohne neue Validatorfehler", async () => {
  const wurzel = mkdtempSync(join(tmpdir(), "finanzen-rollback-fehler-"));
  const master = join(wurzel, "master");
  cpSync(demoQuelle, master, { recursive: true });
  const logVorher = readFileSync(join(master, "agent_log.jsonl"), "utf8");
  try {
    const r = await mitRollback(master, async () => {
      writeFileSync(join(master, "agent_log.jsonl"), `${logVorher}{"anlass":"halb"}\n`);
      writeFileSync(join(master, "neu.txt"), "halb");
      return { text: "Teil 2 gescheitert", isError: true };
    });
    assert.equal(r.isError, true);
    assert.match(r.text, /zurueckgesetzt/);
    assert.equal(readFileSync(join(master, "agent_log.jsonl"), "utf8"), logVorher);
    assert.ok(!existsSync(join(master, "neu.txt")));

    const wurf = await mitRollback(master, async () => {
      writeFileSync(join(master, "agent_log.jsonl"), "kaputt-aber-egal\n");
      throw new Error("Abbruch");
    });
    assert.equal(wurf.isError, true);
    assert.equal(readFileSync(join(master, "agent_log.jsonl"), "utf8"), logVorher);
  } finally {
    rmSync(wurzel, { recursive: true, force: true });
  }
});

test("recategorize-CLI: ohne Datenroot Abbruch, ohne --schreiben nur Vorschau", () => {
  const wurzel = mkdtempSync(join(tmpdir(), "finanzen-recat-cli-"));
  const master = join(wurzel, "bestand");
  cpSync(demoQuelle, master, { recursive: true });
  const skript = fileURLToPath(new URL("../app/tools/recategorize.mjs", import.meta.url));
  const vorher = readFileSync(join(master, "transaktionen.jsonl"), "utf8");
  try {
    const ohne = spawnSync(process.execPath, [skript], { cwd: wurzel, encoding: "utf8" });
    assert.notEqual(ohne.status, 0);
    assert.match(ohne.stderr, /Datenroot/);

    const vorschau = execFileSync(process.execPath, [skript, master], { cwd: wurzel, encoding: "utf8" });
    assert.match(vorschau, /Vorschau/);
    assert.equal(readFileSync(join(master, "transaktionen.jsonl"), "utf8"), vorher);

    execFileSync(process.execPath, [skript, master, "--schreiben"], { cwd: wurzel, encoding: "utf8" });
  } finally {
    rmSync(wurzel, { recursive: true, force: true });
  }
});
