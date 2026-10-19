// tests/kerndateien-sperre.test.mjs
// 1B.3: Kerndateien sind fuer datei_schreiben/datei_ersetzen gesperrt; sie
// aendern nur noch die Fachwerkzeuge. So setzt kein Datei-Edit
// `bestaetigt_durch: mensch`, keine Regel umgeht den Probelauf und kein
// Protokolleintrag faelscht einen Werkzeug-Anlass.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { legeAbzugAn, starteServer } from "./mcp-hilfe.mjs";

let abzug;
before(() => { abzug = legeAbzugAn(); });
after(() => abzug.aufraeumen());

const GESPERRT = ["transaktionen.jsonl", "transfers.json", "agent_log.jsonl", "kategorisierungsregeln.json"];

test("datei_schreiben und datei_ersetzen weisen Kerndateien ab, auch in der Vorschau", async () => {
  const s = starteServer(abzug, "schreiben");
  try {
    for (const datei of GESPERRT) {
      const vorher = readFileSync(join(abzug.master, datei), "utf8");
      for (const schreiben of [false, true]) {
        const w = await s.werkzeug("datei_schreiben", { pfad: `data/master/${datei}`, inhalt: "x", anhaengen: true, schreiben });
        assert.equal(w.isError, true, `${datei} datei_schreiben: ${w.text}`);
        assert.match(w.text, /gesperrt/);
        const e = await s.werkzeug("datei_ersetzen", { pfad: `data/master/${datei}`, alt: "a", neu: "b", schreiben });
        assert.equal(e.isError, true, `${datei} datei_ersetzen: ${e.text}`);
      }
      assert.equal(readFileSync(join(abzug.master, datei), "utf8"), vorher, datei);
    }
  } finally {
    await s.beenden();
  }
});

test("Abweisung nennt das passende Fachwerkzeug", async () => {
  const s = starteServer(abzug, "schreiben");
  try {
    const regeln = await s.werkzeug("datei_ersetzen", { pfad: "data/master/kategorisierungsregeln.json", alt: "a", neu: "b" });
    assert.match(regeln.text, /regel_schreiben/);
    const log = await s.werkzeug("datei_schreiben", { pfad: "data/master/agent_log.jsonl", inhalt: "{}", anhaengen: true });
    assert.match(log.text, /protokoll_eintrag/);
    const tx = await s.werkzeug("datei_schreiben", { pfad: "data/master/transaktionen.jsonl", inhalt: "{}", anhaengen: true });
    assert.match(tx.text, /bestaetigen/);
  } finally {
    await s.beenden();
  }
});

test("andere Bestandsdateien bleiben per Datei-Edit schreibbar", async () => {
  const s = starteServer(abzug, "schreiben");
  try {
    const ok = await s.werkzeug("datei_ersetzen", { schreiben: true, pfad: "data/master/konten.json", alt: "\"name\": \"Gemeinschaftsgiro\"", neu: "\"name\": \"Gemeinschaftskonto\"" });
    assert.ok(!ok.isError, ok.text);
  } finally {
    await s.beenden();
  }
});

test("Sperre greift auch bei anderer Schreibweise und fuer Hardlinks", async () => {
  const { linkSync } = await import("node:fs");
  linkSync(join(abzug.master, "agent_log.jsonl"), join(abzug.master, "protokoll-kopie.jsonl"));
  const s = starteServer(abzug, "schreiben");
  try {
    for (const pfad of ["data/master/AGENT_LOG.jsonl", "data/master/Transaktionen.JSONL", "data/master/protokoll-kopie.jsonl"]) {
      const r = await s.werkzeug("datei_schreiben", { pfad, inhalt: "{}", anhaengen: true, schreiben: true });
      assert.equal(r.isError, true, `${pfad}: ${r.text}`);
    }
  } finally {
    await s.beenden();
  }
});

test("beleg_verwerfen mit ersetzt_durch stellt Verweise um und verschiebt die Doublette", async () => {
  const { mkdirSync, writeFileSync, existsSync } = await import("node:fs");
  const ordner = join(abzug.app, "Belege", "Konten", "Test");
  mkdirSync(ordner, { recursive: true });
  writeFileSync(join(ordner, "original.pdf"), "%PDF-1.4 a");
  writeFileSync(join(ordner, "doppelt.pdf"), "%PDF-1.4 a");
  // Verweis ueber eine Frist-Bemerkung, die den Beleg nennt.
  const fristen = join(abzug.master, "fristen.json");
  const fristenVorher = readFileSync(fristen, "utf8");
  const liste = JSON.parse(fristenVorher);
  liste[0] = { ...liste[0], bemerkung: "Beleg: Belege/Konten/Test/doppelt.pdf" };
  writeFileSync(fristen, JSON.stringify(liste, null, 2) + "\n");
  const s = starteServer(abzug, "schreiben");
  try {
    const ohne = await s.werkzeug("beleg_verwerfen", { pfad: "Belege/Konten/Test/doppelt.pdf", schreiben: true });
    assert.equal(ohne.isError, true);
    assert.match(ohne.text, /ersetzt_durch/);
    const mit = await s.werkzeug("beleg_verwerfen", { pfad: "Belege/Konten/Test/doppelt.pdf", ersetzt_durch: "Belege/Konten/Test/original.pdf", schreiben: true });
    assert.ok(!mit.isError, mit.text);
    assert.match(readFileSync(fristen, "utf8"), /Belege\/Konten\/Test\/original\.pdf/);
    assert.equal(existsSync(join(ordner, "doppelt.pdf")), false);
  } finally {
    await s.beenden();
    writeFileSync(fristen, fristenVorher);
  }
});

test("beleg_verwerfen: ersetzt_durch mit Anfuehrungszeichen im Namen wird abgewiesen", async () => {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const ordner = join(abzug.app, "Belege", "Konten", "Haerte");
  mkdirSync(ordner, { recursive: true });
  writeFileSync(join(ordner, "a.pdf"), "%PDF-1.4 a");
  writeFileSync(join(ordner, "b\",\"x.pdf"), "%PDF-1.4 a");
  const s = starteServer(abzug, "schreiben");
  try {
    const r = await s.werkzeug("beleg_verwerfen", { pfad: "Belege/Konten/Haerte/a.pdf", ersetzt_durch: "Belege/Konten/Haerte/b\",\"x.pdf" });
    assert.equal(r.isError, true, r.text);
    assert.match(r.text, /nicht erlaubt/);
  } finally {
    await s.beenden();
  }
});
