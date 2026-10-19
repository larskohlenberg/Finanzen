// Externer Datenort (Review 1.4, ADR 0036): Mit FINANZEN_DATEN liegen Bestand,
// Inbox, Importprofile, Papierkorb und Belege ausserhalb des Code-Checkouts;
// logische Pfade (data/master, data/inbox, Belege/) bleiben gleich.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseArgs } from "../app/server.mjs";
import { dataRootFromArg } from "../app/tools/data-root.mjs";
import { bestandOrte } from "../app/tools/lib/bestand-orte.mjs";
import { logisch, physisch, physischeWurzeln, pruefeDatenort } from "../app/tools/lib/datenort.mjs";
import { legeAbzugAn, starteServer } from "./mcp-hilfe.mjs";

const app = "/x/app";
const env = { FINANZEN_DATEN: "/var/lib/finanzen" };

test("physisch/logisch: ohne FINANZEN_DATEN alles im Checkout", () => {
  assert.equal(physisch(app, "data/master/konten.json", {}), "/x/app/data/master/konten.json");
  assert.equal(physisch(app, "Belege/Konten/a.pdf", {}), "/x/app/Belege/Konten/a.pdf");
  assert.equal(logisch(app, "/x/app/data/inbox/a.csv", {}), "data/inbox/a.csv");
});

test("physisch/logisch: mit FINANZEN_DATEN liegen Echtdaten extern, Demo bleibt im Checkout", () => {
  assert.equal(physisch(app, "data/master/konten.json", env), "/var/lib/finanzen/master/konten.json");
  assert.equal(physisch(app, "data/inbox", env), "/var/lib/finanzen/inbox");
  assert.equal(physisch(app, "data/master.gen/aktuell", env), "/var/lib/finanzen/master.gen/aktuell");
  assert.equal(physisch(app, "Belege/Konten/a.pdf", env), "/var/lib/finanzen/Belege/Konten/a.pdf");
  assert.equal(physisch(app, "data/demo/konten.json", env), "/x/app/data/demo/konten.json");
  assert.equal(physisch(app, "data/demo-belege/a.pdf", env), "/x/app/data/demo-belege/a.pdf");
  assert.equal(physisch(app, "docs/agent-context.md", env), "/x/app/docs/agent-context.md");
  assert.equal(physisch(app, "data/inbox/../../docs/x.md", env), "/x/app/docs/x.md");
  assert.equal(logisch(app, "/var/lib/finanzen/inbox/a.csv", env), "data/inbox/a.csv");
  assert.equal(logisch(app, "/var/lib/finanzen/Belege/Konten/a.pdf", env), "Belege/Konten/a.pdf");
  assert.equal(logisch(app, "/var/lib/finanzen/master", env), "data/master");
  assert.equal(logisch(app, "/x/app/data/demo/a.json", env), "data/demo/a.json");
  assert.deepEqual(physischeWurzeln(app, "data", env), ["/var/lib/finanzen", "/x/app/data"]);
  assert.deepEqual(physischeWurzeln(app, "Belege", env), ["/var/lib/finanzen/Belege"]);
});

test("FINANZEN_DATEN muss absolut sein", () => {
  assert.throws(() => physisch(app, "data/master", { FINANZEN_DATEN: "daten" }), /absoluter Pfad/);
});

test("bestandOrte und dataRootFromArg folgen FINANZEN_DATEN", () => {
  assert.deepEqual(bestandOrte(app, "/var/lib/finanzen/master", env), {
    inbox: "/var/lib/finanzen/inbox", profile: "/var/lib/finanzen/import-profile", papierkorb: "/var/lib/finanzen/papierkorb", belege: "/var/lib/finanzen/Belege",
  });
  assert.equal(bestandOrte(app, "/x/app/data/demo", env).inbox, "/x/app/data/demo/inbox");
  const vorher = process.env.FINANZEN_DATEN;
  process.env.FINANZEN_DATEN = "/var/lib/finanzen";
  try {
    assert.equal(fileURLToPath(dataRootFromArg("data/master", undefined, new URL("file:///x/app/"))), "/var/lib/finanzen/master/");
    assert.equal(fileURLToPath(dataRootFromArg("data/demo", undefined, new URL("file:///x/app/"))), "/x/app/data/demo/");
  } finally {
    if (vorher === undefined) delete process.env.FINANZEN_DATEN; else process.env.FINANZEN_DATEN = vorher;
  }
});

test("App-Server: Inbox, Belege und Bestand standardmaessig am Datenort", () => {
  const opt = parseArgs([], { appDir: app, env });
  assert.equal(opt.inbox, "/var/lib/finanzen/inbox");
  assert.equal(opt.belege, "/var/lib/finanzen/Belege");
  assert.equal(opt.daten, "/var/lib/finanzen/master");
  const ohne = parseArgs([], { appDir: app, env: {} });
  assert.equal(ohne.inbox, "/x/app/data/inbox");
  assert.equal(ohne.daten, "/x/app/data/master");
});

// Abzug wie fuer die MCP-Tests, die Echtdaten-Orte aber nach aussen verlegt.
function abzugMitDatenort() {
  const abzug = legeAbzugAn();
  const extern = join(abzug.wurzel, "var-lib-finanzen");
  mkdirSync(extern);
  renameSync(abzug.master, join(extern, "master"));
  renameSync(join(abzug.app, "data", "inbox"), join(extern, "inbox"));
  renameSync(join(abzug.app, "Belege"), join(extern, "Belege"));
  return { ...abzug, extern, master: join(extern, "master") };
}

test("pruefeDatenort: fehlender Ort und doppelter Bestand werden abgewiesen, Symlink ist erlaubt", () => {
  const abzug = abzugMitDatenort();
  try {
    const e = { FINANZEN_DATEN: abzug.extern };
    assert.match(pruefeDatenort(abzug.app, e), /Datenort/);
    assert.throws(() => pruefeDatenort(abzug.app, { FINANZEN_DATEN: join(abzug.extern, "fehlt") }), /existiert nicht/);
    mkdirSync(join(abzug.app, "data", "master"));
    assert.throws(() => pruefeDatenort(abzug.app, e), /Doppelter Bestand/);
    rmSync(join(abzug.app, "data", "master"), { recursive: true });
    symlinkSync(join(abzug.extern, "master"), join(abzug.app, "data", "master"));
    assert.match(pruefeDatenort(abzug.app, e), /Datenort/);
  } finally {
    abzug.aufraeumen();
  }
});

test("MCP mit externem Datenort: lesen, schreiben, ablegen, suchen unter logischen Pfaden", async () => {
  const abzug = abzugMitDatenort();
  const s = starteServer(abzug, "schreiben", "data/master", { FINANZEN_DATEN: abzug.extern });
  try {
    const status = await s.werkzeug("status");
    assert.ok(!status.isError, status.text);
    assert.match(status.text, /data\/master/);
    const konten = await s.werkzeug("datei_lesen", { pfad: "data/master/konten.json" });
    assert.ok(!konten.isError, konten.text);

    const notiz = await s.werkzeug("datei_schreiben", { pfad: "data/inbox/scan.pdf", inhalt: "%PDF-1.4 Test", schreiben: true });
    assert.ok(!notiz.isError, notiz.text);
    assert.ok(existsSync(join(abzug.extern, "inbox", "scan.pdf")));
    assert.ok(!existsSync(join(abzug.app, "data", "inbox", "scan.pdf")));

    const inbox = await s.werkzeug("inbox");
    assert.ok(!inbox.isError, inbox.text);

    const gefunden = await s.werkzeug("dateien_suchen", { muster: "data/inbox/*.pdf" });
    assert.match(gefunden.text, /^data\/inbox\/scan\.pdf$/m);

    const ablage = await s.werkzeug("beleg_ablegen", { quelle: "data/inbox/scan.pdf", ziel: "Belege/Sonstiges/Allgemein/2026/Test_Scan.pdf", schreiben: true });
    assert.ok(!ablage.isError, ablage.text);
    assert.match(ablage.text, /data\/inbox\/scan\.pdf -> Belege\/Sonstiges\/Allgemein\/2026\/Test_Scan\.pdf/);
    assert.equal(readFileSync(join(abzug.extern, "Belege", "Sonstiges", "Allgemein", "2026", "Test_Scan.pdf"), "utf8"), "%PDF-1.4 Test");

    const verworfen = await s.werkzeug("beleg_verwerfen", { pfad: "Belege/Sonstiges/Allgemein/2026/Test_Scan.pdf", grund: "Test", schreiben: true });
    assert.ok(!verworfen.isError, verworfen.text);
    assert.match(verworfen.text, /data\/papierkorb\/\d{4}-\d{2}-\d{2}\/Belege\/Sonstiges/);
    assert.ok(existsSync(join(abzug.extern, "papierkorb")));
    assert.ok(!existsSync(join(abzug.app, "data", "papierkorb")));

    // Ausbruch aus dem Datenort bleibt verboten, auch ueber einen Symlink.
    const raus = await s.werkzeug("datei_lesen", { pfad: "data/../../../etc/hosts" });
    assert.equal(raus.isError, true);
    symlinkSync(join(abzug.app, "tools"), join(abzug.extern, "inbox", "link"));
    const ueberLink = await s.werkzeug("datei_lesen", { pfad: "data/inbox/link/data-root.mjs" });
    assert.equal(ueberLink.isError, true, ueberLink.text);
  } finally {
    await s.beenden();
    abzug.aufraeumen();
  }
});

test("MCP-Start: doppelter Bestand bricht ab", () => {
  const abzug = abzugMitDatenort();
  try {
    mkdirSync(join(abzug.app, "data", "master"));
    const r = spawnSync(process.execPath, [join(abzug.app, "mcp", "server.mjs"), "data/master"], {
      input: "", encoding: "utf8", env: { ...process.env, FINANZEN_DATEN: abzug.extern },
    });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Doppelter Bestand/);
  } finally {
    abzug.aufraeumen();
  }
});

test("MCP-Start ohne FINANZEN_DATEN bleibt beim Checkout", () => {
  const abzug = legeAbzugAn();
  try {
    writeFileSync(join(abzug.app, "data", "inbox", "x.txt"), "x");
    const r = spawnSync(process.execPath, [join(abzug.app, "mcp", "server.mjs"), "data/master"], {
      input: "", encoding: "utf8", env: { ...process.env, FINANZEN_DATEN: "" },
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /Daten im Checkout/);
  } finally {
    abzug.aufraeumen();
  }
});
