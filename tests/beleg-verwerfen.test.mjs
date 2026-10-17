// beleg_verwerfen: eine Doublette unter Belege/ samt Zwilling in den Papierkorb,
// aber nie einen Beleg, auf den die Daten noch verweisen.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { localTodayIso } from "../app/liquiditaet.mjs";
import { legeAbzugAn, starteServer } from "./mcp-hilfe.mjs";

const REL = "Belege/Vorsorge/VS-001_Muster/2026";
let abzug;
let ordner;
before(() => {
  abzug = legeAbzugAn();
  ordner = join(abzug.app, ...REL.split("/"));
  mkdirSync(ordner, { recursive: true });
});
after(() => abzug.aufraeumen());

test("beleg_verwerfen: Vorschau aendert nichts, Schreiben schiebt Beleg und Zwilling in den Papierkorb", async () => {
  writeFileSync(join(ordner, "doppelt.pdf"), "%PDF-1.4 doppelt\n");
  writeFileSync(join(ordner, "doppelt.txt"), "Zwilling\n");
  const s = starteServer(abzug, "schreiben");
  try {
    const vorschau = await s.werkzeug("beleg_verwerfen", { pfad: `${REL}/doppelt.pdf`, grund: "Doublette" });
    assert.ok(!vorschau.isError, vorschau.text);
    assert.match(vorschau.text, /Vorschau/);
    assert.ok(existsSync(join(ordner, "doppelt.pdf")));

    const r = await s.werkzeug("beleg_verwerfen", { pfad: `${REL}/doppelt.pdf`, grund: "Doublette", schreiben: true });
    assert.ok(!r.isError, r.text);
    assert.ok(!existsSync(join(ordner, "doppelt.pdf")));
    assert.ok(!existsSync(join(ordner, "doppelt.txt")));
    const korb = join(abzug.app, "data", "papierkorb", localTodayIso(), ...REL.split("/"));
    assert.equal(readFileSync(join(korb, "doppelt.pdf"), "utf8"), "%PDF-1.4 doppelt\n");
    assert.equal(readFileSync(join(korb, "doppelt.txt"), "utf8"), "Zwilling\n");
    const eintrag = readFileSync(join(abzug.master, "agent_log.jsonl"), "utf8").trim().split("\n").map((z) => JSON.parse(z)).at(-1);
    assert.equal(eintrag.anlass, "beleg-verwerfen");
    assert.equal(eintrag.notiz, "Doublette");

    // Gleicher Name noch einmal: Suffix statt Ueberschreiben.
    writeFileSync(join(ordner, "doppelt.pdf"), "%PDF-1.4 zweite\n");
    const nochmal = await s.werkzeug("beleg_verwerfen", { pfad: `${REL}/doppelt.pdf`, schreiben: true });
    assert.ok(!nochmal.isError, nochmal.text);
    assert.equal(readFileSync(join(korb, "doppelt-2.pdf"), "utf8"), "%PDF-1.4 zweite\n");
  } finally {
    await s.beenden();
  }
});

test("beleg_verwerfen: verwiesene Belege, fremde Pfade und fehlende Dateien werden abgewiesen", async () => {
  writeFileSync(join(ordner, "verwiesen.pdf"), "%PDF-1.4\n");
  const vorsorge = join(abzug.master, "vorsorge.json");
  const vorher = readFileSync(vorsorge, "utf8");
  writeFileSync(vorsorge, vorher.replace('"quelle_hinweis": "Vertragsstand 2025"', `"quelle_hinweis": "${REL}/verwiesen.pdf"`));
  const s = starteServer(abzug, "schreiben");
  try {
    for (const [pfad, grund] of [
      [`${REL}/verwiesen.pdf`, /noch verwiesen[\s\S]*vorsorge\.json: 1/],
      [`${REL}/fehlt.pdf`, /keine Datei/],
      ["data/master/konten.json", /.+/],
      ["Belege/../data/master/konten.json", /.+/],
    ]) {
      const r = await s.werkzeug("beleg_verwerfen", { pfad, schreiben: true });
      assert.equal(r.isError, true, pfad);
      assert.match(r.text, grund);
    }
    assert.ok(existsSync(join(ordner, "verwiesen.pdf")));
  } finally {
    await s.beenden();
    writeFileSync(vorsorge, vorher);
  }
});

test("beleg_verwerfen nur mit Schreibrecht", async () => {
  const s = starteServer(abzug, "lesen");
  try {
    const r = await s.werkzeug("beleg_verwerfen", { pfad: `${REL}/verwiesen.pdf` });
    assert.equal(r.isError, true);
  } finally {
    await s.beenden();
  }
});
