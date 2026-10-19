// Haertung der MCP-Tools aus dem Review: Pfade, Dateimodus, Anhaengen.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { legeAbzugAn, starteServer } from "./mcp-hilfe.mjs";

let abzug;
before(() => { abzug = legeAbzugAn(); });
after(() => abzug.aufraeumen());

const KANDIDAT = [{ regel_id: "REG-900", gegenpartei_pattern: "gibtesnicht", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-08-12", kommentar: "x", belegstufe: "E2" }];

test("regel_probelauf: kandidaten_datei wird nicht als URL dekodiert", async () => {
  mkdirSync(join(abzug.wurzel, "geheim"), { recursive: true });
  writeFileSync(join(abzug.wurzel, "geheim", "kandidaten.json"), "GEHEIM-MARKER");
  // Ein Dateiname mit Prozentzeichen muss woertlich gelesen werden.
  writeFileSync(join(abzug.app, "data", "inbox", "k%41.json"), JSON.stringify(KANDIDAT));
  const s = starteServer(abzug);
  try {
    const ausbruch = await s.werkzeug("regel_probelauf", { kandidaten_datei: "data/%2e%2e/%2e%2e/geheim/kandidaten.json", json: true });
    assert.equal(ausbruch.isError, true, ausbruch.text);
    assert.ok(!ausbruch.text.includes("GEHEIM"), ausbruch.text);

    const woertlich = await s.werkzeug("regel_probelauf", { kandidaten_datei: "data/inbox/k%41.json", json: true });
    assert.ok(!woertlich.isError, woertlich.text);
    assert.match(woertlich.text, /REG-900/);
  } finally {
    await s.beenden();
  }
});

test("Atomares Schreiben behaelt den Dateimodus, neue Dateien bekommen 0640", async () => {
  const bestehend = join(abzug.app, "data", "inbox", "modus.txt");
  writeFileSync(bestehend, "a=1\n");
  chmodSync(bestehend, 0o600);
  const s = starteServer(abzug, "schreiben");
  try {
    const ersetzt = await s.werkzeug("datei_ersetzen", { schreiben: true, pfad: "data/inbox/modus.txt", alt: "a=1", neu: "a=2" });
    assert.ok(!ersetzt.isError, ersetzt.text);
    assert.equal(readFileSync(bestehend, "utf8"), "a=2\n");
    assert.equal(statSync(bestehend).mode & 0o777, 0o600);

    const neu = await s.werkzeug("datei_schreiben", { schreiben: true, pfad: "data/inbox/neu-modus.txt", inhalt: "x" });
    assert.ok(!neu.isError, neu.text);
    assert.equal(statSync(join(abzug.app, "data", "inbox", "neu-modus.txt")).mode & 0o777, 0o640);
  } finally {
    await s.beenden();
  }
});

test("Anhaengen an eine unlesbare Datei bricht ab statt sie zu ersetzen", { skip: process.getuid?.() === 0 && "als root greift chmod nicht" }, async () => {
  const datei = join(abzug.app, "data", "inbox", "gesperrt.txt");
  writeFileSync(datei, "alt\n");
  chmodSync(datei, 0o200);
  const s = starteServer(abzug, "schreiben");
  try {
    const r = await s.werkzeug("datei_schreiben", { schreiben: true, pfad: "data/inbox/gesperrt.txt", inhalt: "neu", anhaengen: true });
    assert.equal(r.isError, true, r.text);
    chmodSync(datei, 0o600);
    assert.equal(readFileSync(datei, "utf8"), "alt\n");

    const neu = await s.werkzeug("datei_schreiben", { schreiben: true, pfad: "data/inbox/frisch.txt", inhalt: "erste", anhaengen: true });
    assert.ok(!neu.isError, neu.text);
    assert.equal(readFileSync(join(abzug.app, "data", "inbox", "frisch.txt"), "utf8"), "erste\n");
  } finally {
    chmodSync(datei, 0o600);
    await s.beenden();
  }
});

test("datei_lesen: der .txt-Zwilling eines PDFs laeuft durch den Pfadschutz", async () => {
  mkdirSync(join(abzug.wurzel, "geheim"), { recursive: true });
  writeFileSync(join(abzug.wurzel, "geheim", "zwilling.txt"), "GEHEIM-ZWILLING\n");
  writeFileSync(join(abzug.app, "Belege", "ausbruch.pdf"), "%PDF-1.4 x");
  symlinkSync(join(abzug.wurzel, "geheim", "zwilling.txt"), join(abzug.app, "Belege", "ausbruch.txt"));
  writeFileSync(join(abzug.app, "Belege", "echt.pdf"), "%PDF-1.4 y");
  writeFileSync(join(abzug.app, "Belege", "echt.txt"), "Zwillingstext\n");
  const s = starteServer(abzug);
  try {
    const r = await s.werkzeug("datei_lesen", { pfad: "Belege/ausbruch.pdf" });
    assert.ok(!r.text.includes("GEHEIM"), r.text);

    const echt = await s.werkzeug("datei_lesen", { pfad: "Belege/echt.pdf" });
    assert.ok(!echt.isError, echt.text);
    assert.match(echt.text, /Zwillingstext/);
  } finally {
    await s.beenden();
  }
});
