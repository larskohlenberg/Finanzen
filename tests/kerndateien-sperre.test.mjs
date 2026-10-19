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
