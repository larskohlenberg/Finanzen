// tests/agentenvertrag.test.mjs
// Review 3.11: Agentenvertrag aus einer Quelle (app/mcp/vertrag.mjs). Kurze
// Pflichtanleitung als MCP-instructions und im Kopf von agent-context.md,
// Themenwissen als Ressource je Abschnitt, Werkzeuge nach Aufgaben geordnet,
// strukturierte Ergebnisse (structuredContent) mit Fehlercode, IDs, Zaehlern,
// Vorschauzustand und Fingerabdruck.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { AUFGABEN, PFLICHT, pflichtMarkdown, pflichtAnleitung, setzePflichtAbschnitt } from "../app/mcp/vertrag.mjs";
import { WERKZEUGE } from "../app/mcp/werkzeuge.mjs";
import { legeAbzugAn, starteServer } from "./mcp-hilfe.mjs";

let abzug;
before(() => { abzug = legeAbzugAn(); });
after(() => abzug.aufraeumen());

const agentContext = fileURLToPath(new URL("../app/docs/agent-context.md", import.meta.url));

test("instructions sind die kurze Pflichtanleitung aus der Vertragsquelle", async () => {
  const s = starteServer(abzug, "schreiben");
  try {
    const init = await s.anfrage("initialize", { protocolVersion: "2025-06-18", capabilities: {} });
    const text = init.result.instructions;
    for (const regel of PFLICHT) assert.ok(text.includes(regel.text), regel.id);
    assert.ok(text.length < 2200, `zu lang: ${text.length}`);
    assert.equal(text, pflichtAnleitung({ datenrootRel: "data/master", recht: "schreiben" }));
  } finally {
    await s.beenden();
  }
});

test("agent-context.md beginnt mit demselben Pflichtabschnitt", () => {
  const text = readFileSync(agentContext, "utf8");
  assert.equal(setzePflichtAbschnitt(text), text, "Pflichtabschnitt veraltet: node app/mcp/vertrag.mjs --schreiben");
  assert.ok(text.includes(pflichtMarkdown()));
  assert.ok(text.indexOf(pflichtMarkdown()) < text.indexOf("\n## "), "Pflichtabschnitt steht vor dem ersten Thema");
});

test("jedes Werkzeug gehoert genau einer Aufgabe; tools/list folgt den Aufgaben und nennt einen Titel", async () => {
  const zuordnung = AUFGABEN.flatMap((a) => a.werkzeuge);
  assert.deepEqual([...zuordnung].sort(), WERKZEUGE.map((w) => w.name).sort());
  assert.equal(new Set(zuordnung).size, zuordnung.length);
  const s = starteServer(abzug, "schreiben");
  try {
    const tools = (await s.anfrage("tools/list")).result.tools;
    assert.deepEqual(tools.map((t) => t.name), zuordnung);
    for (const t of tools) assert.match(t.title, /^[A-ZÄÖÜ][^:]+: /, t.name);
  } finally {
    await s.beenden();
  }
});

test("Themenwissen: je Abschnitt von agent-context eine Ressource", async () => {
  const s = starteServer(abzug, "lesen");
  try {
    const liste = (await s.anfrage("resources/list")).result.resources;
    const themen = liste.filter((r) => r.uri.startsWith("finanzen://docs/agent-context/"));
    assert.ok(themen.length >= 10, themen.map((r) => r.uri).join(", "));
    const vorsorge = themen.find((r) => r.uri === "finanzen://docs/agent-context/vorsorge");
    assert.ok(vorsorge);
    const text = (await s.anfrage("resources/read", { uri: vorsorge.uri })).result.contents[0].text;
    assert.match(text, /^## Vorsorge/);
    assert.doesNotMatch(text, /\n## (?!Vorsorge)/);
  } finally {
    await s.beenden();
  }
});

test("structuredContent: status mit Validator-Befunden, Vorschau mit Fingerabdruck und Ergebnis", async () => {
  const s = starteServer(abzug, "schreiben");
  try {
    const st = await s.werkzeug("status");
    assert.equal(st.structuredContent.werkzeug, "status");
    assert.equal(st.structuredContent.ok, true);
    assert.equal(typeof st.structuredContent.validator.gueltig, "boolean");
    assert.ok(Array.isArray(st.structuredContent.validator.befunde));

    const v = await s.werkzeug("freigabe", {});
    assert.equal(v.structuredContent.modus, "vorschau");
    assert.match(v.structuredContent.fingerabdruck, /^(G\d+|[0-9a-f]{16})$/);
    assert.equal(v.structuredContent.exitcode, 0);
    assert.equal(typeof v.structuredContent.ergebnis, "object");
  } finally {
    await s.beenden();
  }
});

test("structuredContent: abgewiesener Schreiblauf nennt Fehlercode und neue Befunde mit Objekt/Feld", async () => {
  const s = starteServer(abzug, "schreiben");
  const konten = join(abzug.master, "konten.json");
  const vorher = readFileSync(konten, "utf8");
  try {
    const r = await s.werkzeug("stammdatum_setzen", { typ: "konto", id: "KTO-001", felder: { kontotyp: "unbekannt" }, schreiben: true });
    assert.equal(r.isError, true, r.text);
    assert.equal(r.structuredContent.ok, false);
    assert.equal(r.structuredContent.fehler, "validator");
    assert.deepEqual(r.structuredContent.validator.neu.map((b) => [b.code, b.sammlung, b.objekt, b.feld]), [["wert-nicht-erlaubt", "konten", "KTO-001", "kontotyp"]]);

    const pfad = await s.werkzeug("datei_schreiben", { pfad: "data/master/agent_log.jsonl", inhalt: "{}", schreiben: true });
    assert.equal(pfad.structuredContent.fehler, "pfad");

    const alt = await s.werkzeug("stammdatum_setzen", { typ: "konto", id: "KTO-001", felder: { name: "x" }, schreiben: true, fingerabdruck: "0000000000000000" });
    assert.equal(alt.structuredContent.fehler, "stand-veraltet");

    const ok = await s.werkzeug("stammdatum_setzen", { typ: "konto", id: "KTO-001", felder: { name: "Umbenannt" }, schreiben: true });
    assert.equal(ok.structuredContent.ok, true, ok.text);
    assert.equal(ok.structuredContent.modus, "schreiben");
    assert.deepEqual(ok.structuredContent.ergebnis.felder, { name: { vorher: JSON.parse(vorher)[0].name, nachher: "Umbenannt" } });
  } finally {
    await s.beenden();
    writeFileSync(konten, vorher);
  }
});
