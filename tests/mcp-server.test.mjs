import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { legeAbzugAn, starteServer } from "./mcp-hilfe.mjs";

function pruefsumme(ordner) {
  const hash = createHash("sha256");
  for (const name of readdirSync(ordner).sort()) {
    hash.update(name);
    hash.update(readFileSync(join(ordner, name)));
  }
  return hash.digest("hex");
}

let abzug;
before(() => { abzug = legeAbzugAn(); });
after(() => abzug.aufraeumen());

test("Handshake: initialize, tools/list, prompts, resources", async () => {
  const s = starteServer(abzug);
  try {
    const init = await s.anfrage("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "0" } });
    assert.equal(init.result.protocolVersion, "2025-03-26");
    assert.equal(init.result.serverInfo.name, "finanzen");
    assert.ok(init.result.capabilities.tools && init.result.capabilities.prompts && init.result.capabilities.resources);

    const fremd = await s.anfrage("initialize", { protocolVersion: "1999-01-01", capabilities: {} });
    assert.equal(fremd.result.protocolVersion, "2025-06-18");

    s.benachrichtigung("notifications/initialized");
    assert.deepEqual((await s.anfrage("ping")).result, {});

    const tools = (await s.anfrage("tools/list")).result.tools;
    const namen = tools.map((t) => t.name);
    for (const name of ["status", "transaktionen_abfragen", "datei_lesen", "dateien_suchen", "pruefbericht", "freigabe", "regel_probelauf"]) {
      assert.ok(namen.includes(name), `Tool ${name} fehlt`);
    }
    assert.ok(!namen.includes("datei_schreiben"), "Schreib-Tools sind mit --recht=lesen nicht gelistet");
    for (const t of tools) assert.equal(t.inputSchema.type, "object", t.name);

    const prompts = (await s.anfrage("prompts/list")).result.prompts;
    assert.ok(prompts.some((p) => p.name === "import-durchlauf" && p.description));
    const prompt = await s.anfrage("prompts/get", { name: "kategorisierungsregel-pflege" });
    assert.match(prompt.result.messages[0].content.text, /Belegleiter/);

    const ressourcen = (await s.anfrage("resources/list")).result.resources.map((r) => r.uri);
    assert.ok(ressourcen.includes("finanzen://docs/agent-context"));
    assert.ok(ressourcen.includes("finanzen://docs/adr/0001-beispiel.md"));
    const ctx = await s.anfrage("resources/read", { uri: "finanzen://docs/context" });
    assert.match(ctx.result.contents[0].text, /Glossar/);

    // Protokollfehler
    assert.equal((await s.anfrage("gibt/es/nicht")).error.code, -32601);
    assert.equal((await s.roh("{kaputt", null)).error.code, -32700);
    assert.equal((await s.anfrage("resources/read", { uri: "finanzen://nichts" })).error.code, -32002);
    // stdout enthaelt ausschliesslich JSON-RPC
    for (const zeile of s.zeilen) assert.equal(JSON.parse(zeile).jsonrpc, "2.0");
  } finally {
    await s.beenden();
  }
});

test("Lese-Tools liefern Bestand, Pruefbericht und Dateien", async () => {
  writeFileSync(join(abzug.app, "data", "inbox", "neu.csv"), "a;b\n1;2\n");
  mkdirSync(join(abzug.app, "Belege", "2025"), { recursive: true });
  writeFileSync(join(abzug.app, "Belege", "2025", "rechnung.pdf"), "%PDF-1.4 kein echtes pdf");
  writeFileSync(join(abzug.app, "Belege", "2025", "rechnung.txt"), "Rechnung Musterladen\nSumme 12,34\n");
  const s = starteServer(abzug);
  try {
    const status = await s.werkzeug("status");
    assert.ok(!status.isError);
    const daten = JSON.parse(status.text);
    assert.equal(daten.transaktionen, 675);
    assert.equal(daten.validator.gueltig, true);
    assert.equal(daten.inbox.dateien.length, 1);

    const bericht = await s.werkzeug("pruefbericht");
    assert.ok(!bericht.isError, bericht.text);
    assert.match(bericht.text, /Exitcode: 0/);

    const pdf = await s.werkzeug("datei_lesen", { pfad: "Belege/2025/rechnung.pdf" });
    assert.match(pdf.text, /Textzwilling/);
    assert.match(pdf.text, /Summe 12,34/);

    const bereich = await s.werkzeug("datei_lesen", { pfad: "data/master/transaktionen.jsonl", von_zeile: 2, bis_zeile: 3 });
    assert.equal(bereich.text.trim().split("\n").filter((z) => z.startsWith("{")).length, 2);

    const treffer = await s.werkzeug("dateien_suchen", { muster: "Belege/**/*.txt", text: "musterladen" });
    assert.match(treffer.text, /Belege\/2025\/rechnung\.txt:1:/);
  } finally {
    await s.beenden();
  }
});

test("transaktionen_abfragen rechnet Summen in Cent", async () => {
  const s = starteServer(abzug);
  try {
    const alle = JSON.parse((await s.werkzeug("transaktionen_abfragen", { konto: "KTO-001", gruppieren_nach: "monat" })).text);
    const zeilen = readFileSync(join(abzug.master, "transaktionen.jsonl"), "utf8").trim().split("\n").map((z) => JSON.parse(z))
      .filter((t) => t.konto_id === "KTO-001");
    let cents = 0;
    for (const t of zeilen) {
      const [e, c = ""] = t.betrag.replace("-", "").split(".");
      cents += (t.betrag.startsWith("-") ? -1 : 1) * (Number(e) * 100 + Number((c + "00").slice(0, 2)));
    }
    assert.equal(alle.anzahl, zeilen.length);
    const erwartet = `${cents < 0 ? "-" : ""}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, "0")}`;
    assert.equal(alle.summe, erwartet);
    const summeGruppen = alle.gruppen.reduce((acc, g) => acc + Math.round(Number(g.summe) * 100), 0);
    assert.equal(summeGruppen, cents);
    assert.equal(alle.zeilen, undefined, "Mit Gruppierung ohne mit_zeilen keine Einzelzeilen");

    const gefiltert = JSON.parse((await s.werkzeug("transaktionen_abfragen", { text: "gehalt", betrag_min: "1000.00", limit: 5 })).text);
    assert.equal(gefiltert.zeilen.length, 5);
    assert.ok(gefiltert.anzahl > 5 && gefiltert.abgeschnitten);
    for (const t of gefiltert.zeilen) assert.match(`${t.gegenpartei} ${t.verwendungszweck}`.toLowerCase(), /gehalt/);
  } finally {
    await s.beenden();
  }
});

test("Pfadschutz: ../, absolute Pfade, Symlink-Ausbruch, Belege beim Schreiben", async () => {
  symlinkSync(join(abzug.app, "tools"), join(abzug.app, "data", "ausbruch"));
  const lesen = starteServer(abzug);
  const schreiben = starteServer(abzug, "schreiben");
  try {
    for (const pfad of ["data/../tools/validator.mjs", "../../etc/passwd", "/etc/passwd", join(abzug.master, "konten.json"), "data/ausbruch/validator.mjs", "tools/validator.mjs"]) {
      const r = await lesen.werkzeug("datei_lesen", { pfad });
      assert.equal(r.isError, true, `${pfad} muss abgewiesen werden`);
    }
    const repoDoku = await lesen.werkzeug("datei_lesen", { pfad: "../CONTEXT.md" });
    assert.ok(!repoDoku.isError, repoDoku.text);

    for (const pfad of ["Belege/x.txt", "docs/x.md", "data/ausbruch/x.mjs", "../x.md"]) {
      const r = await schreiben.werkzeug("datei_schreiben", { pfad, inhalt: "x" });
      assert.equal(r.isError, true, `${pfad} darf nicht geschrieben werden`);
    }
  } finally {
    await lesen.beenden();
    await schreiben.beenden();
  }
});

test("Rechte: mit lesen kein Schreiben, keine Schreib-Laeufe", async () => {
  const s = starteServer(abzug, "lesen");
  const vorher = pruefsumme(abzug.master);
  try {
    const r = await s.werkzeug("datei_schreiben", { pfad: "data/inbox/x.txt", inhalt: "x" });
    assert.equal(r.isError, true);
    assert.match(r.text, /recht=schreiben/);
    const f = await s.werkzeug("freigabe", { schreiben: true });
    assert.equal(f.isError, true);
    assert.equal(pruefsumme(abzug.master), vorher);
  } finally {
    await s.beenden();
  }
});

test("Vorschau schreibt nichts, auch bei Tools ohne eigene Vorschau", async () => {
  const s = starteServer(abzug, "schreiben");
  const vorher = pruefsumme(abzug.master);
  try {
    for (const name of ["freigabe", "transfers", "lernen", "nachkategorisieren", "inbox"]) {
      const r = await s.werkzeug(name, {});
      assert.ok(!r.isError, `${name}: ${r.text}`);
      assert.match(r.text, /Vorschau/);
    }
    assert.equal(pruefsumme(abzug.master), vorher);
  } finally {
    await s.beenden();
  }
});

test("Rollback bei Validatorfehler, gueltiges Schreiben bleibt", async () => {
  const s = starteServer(abzug, "schreiben");
  const kontenPfad = join(abzug.master, "konten.json");
  const vorher = readFileSync(kontenPfad, "utf8");
  try {
    const kaputt = await s.werkzeug("datei_schreiben", { pfad: "data/master/konten.json", inhalt: "{ kaputt" });
    assert.equal(kaputt.isError, true);
    assert.match(kaputt.text, /zurueckgesetzt/);
    assert.equal(readFileSync(kontenPfad, "utf8"), vorher);

    const alt = "\"name\": \"Gemeinschaftsgiro\"";
    const ok = await s.werkzeug("datei_ersetzen", { pfad: "data/master/konten.json", alt, neu: "\"name\": \"Gemeinschaftskonto\"" });
    assert.ok(!ok.isError, ok.text);
    assert.match(readFileSync(kontenPfad, "utf8"), /Gemeinschaftskonto/);

    const mehrdeutig = await s.werkzeug("datei_ersetzen", { pfad: "data/master/konten.json", alt: "\"status\": \"aktiv\"", neu: "x" });
    assert.equal(mehrdeutig.isError, true);
  } finally {
    await s.beenden();
  }
});

test("beleg_ablegen: verschiebt mit Zwilling, ueberschreibt nie, nur inbox -> Belege", async () => {
  const inbox = join(abzug.app, "data", "inbox");
  mkdirSync(join(inbox, "processed"), { recursive: true });
  writeFileSync(join(inbox, "processed", "scan0001.pdf"), "%PDF-1.4 a");
  writeFileSync(join(inbox, "processed", "scan0001.txt"), "# Vom Agenten aus dem Bildscan gelesen, 2026-10-11.\nText\n");
  writeFileSync(join(inbox, "scan0002.pdf"), "%PDF-1.4 b");
  const s = starteServer(abzug, "schreiben");
  try {
    const ziel = "Belege/2026/Sonstiges/Muster_Beleg_2026-10-01.pdf";
    const ok = await s.werkzeug("beleg_ablegen", { quelle: "data/inbox/processed/scan0001.pdf", ziel });
    assert.ok(!ok.isError, ok.text);
    assert.equal(readFileSync(join(abzug.app, ziel), "utf8"), "%PDF-1.4 a");
    assert.match(readFileSync(join(abzug.app, ziel.replace(".pdf", ".txt")), "utf8"), /Bildscan/);
    assert.deepEqual(readdirSync(join(inbox, "processed")), []);

    const doppelt = await s.werkzeug("beleg_ablegen", { quelle: "data/inbox/scan0002.pdf", ziel });
    assert.equal(doppelt.isError, true);
    assert.equal(readFileSync(join(abzug.app, ziel), "utf8"), "%PDF-1.4 a");
    assert.equal(readFileSync(join(inbox, "scan0002.pdf"), "utf8"), "%PDF-1.4 b");

    for (const [quelle, z] of [
      ["data/master/konten.json", "Belege/konten.json"],
      ["data/inbox/scan0002.pdf", "data/master/x.pdf"],
      ["data/inbox/scan0002.pdf", "Belege/../data/x.pdf"],
      ["data/inbox/scan0002.pdf", "Belege/2026/x.txt"],
    ]) {
      const r = await s.werkzeug("beleg_ablegen", { quelle, ziel: z });
      assert.equal(r.isError, true, `${quelle} -> ${z} muss abgewiesen werden`);
    }
  } finally {
    await s.beenden();
  }
});

test("Schreib-Lauf einer CLI validiert danach", async () => {
  const s = starteServer(abzug, "schreiben");
  try {
    const r = await s.werkzeug("freigabe", { schreiben: true });
    assert.ok(!r.isError, r.text);
    assert.match(r.text, /Modus: schreiben/);
    assert.match(r.text, /Validator nach dem Schreiben: gueltig/);
  } finally {
    await s.beenden();
  }
});
