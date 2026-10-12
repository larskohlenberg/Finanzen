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
    // Statusfragen gehen direkt ans Tool; Pflichtlektuere nur vor Datenarbeit.
    const anleitung = init.result.instructions;
    assert.match(anleitung, /Auswertungen und Statusfragen direkt per Tool/);
    assert.match(anleitung, /Vor Datenarbeit \(Import, Kategorisieren, Regeln, Freigabe, jedes Schreiben\) die Ressource finanzen:\/\/docs\/agent-context/);
    assert.doesNotMatch(anleitung, /Zuerst status/);

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
    assert.deepEqual(Object.keys(daten), ["datenroot", "recht", "transaktionen", "kategorisierung_status", "regeln", "konten", "validator", "inbox"]);
    assert.deepEqual(Object.keys(daten.validator), ["gueltig", "fehler_anzahl", "fehler"]);
    assert.equal(daten.validator.fehler_anzahl, 0);

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

test("status meldet unlesbare Masterdaten im Bericht und im Validator", async () => {
  const kaputt = legeAbzugAn();
  writeFileSync(join(kaputt.master, "konten.json"), "{kaputt");
  const s = starteServer(kaputt);
  try {
    const daten = JSON.parse((await s.werkzeug("status")).text);
    assert.match(daten.masterdaten, /^nicht lesbar: /);
    assert.equal(daten.transaktionen, undefined);
    assert.equal(daten.validator.gueltig, false);
    assert.equal(daten.validator.fehler_anzahl, 1);
    assert.match(daten.validator.fehler[0], /^Masterdaten nicht lesbar: /);
  } finally {
    await s.beenden();
    kaputt.aufraeumen();
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

    const log = await s.werkzeug("datei_schreiben", { pfad: "data/master/agent_log.jsonl", inhalt: "{\"anlass\":\"test\"}", anhaengen: true });
    assert.ok(!log.isError, log.text);
    assert.match(readFileSync(join(abzug.master, "agent_log.jsonl"), "utf8"), /\n\{"anlass":"test"\}\n$/);

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

test("belege_umziehen: Vorschau, dann Umzug samt Zwilling und Verweis", async () => {
  const alt = "Belege/2021/Kredite/DAR-001_Demo_Jahresauszug_2021.pdf";
  const neu = "Belege/Darlehen/DAR-001_Wohnungsdarlehen/2021/DAR-001_Demo_Jahresauszug_2021.pdf";
  mkdirSync(join(abzug.app, "Belege", "2021", "Kredite"), { recursive: true });
  writeFileSync(join(abzug.app, alt), "%PDF-1.4 d");
  writeFileSync(join(abzug.app, alt.replace(".pdf", ".txt")), "Jahresauszug\n");
  const darlehenPfad = join(abzug.master, "darlehen.json");
  writeFileSync(darlehenPfad, readFileSync(darlehenPfad, "utf8").replace("\"Demo-Darlehensauszug\"", JSON.stringify(alt)));
  const s = starteServer(abzug, "schreiben");
  try {
    const vorschau = await s.werkzeug("belege_umziehen", { umzuege: [{ von: alt, nach: neu }] });
    assert.ok(!vorschau.isError, vorschau.text);
    assert.match(vorschau.text, /Modus: Vorschau/);
    assert.match(vorschau.text, /"darlehen\.json": 1/);
    assert.ok(readFileSync(join(abzug.app, alt)));

    const kaputt = await s.werkzeug("belege_umziehen", { umzuege: [{ von: alt, nach: "Belege/x.csv" }], schreiben: true });
    assert.equal(kaputt.isError, true);
    assert.ok(readFileSync(join(abzug.app, alt)));

    const r = await s.werkzeug("belege_umziehen", { umzuege: [{ von: alt, nach: neu }], schreiben: true });
    assert.ok(!r.isError, r.text);
    assert.match(r.text, /Validator nach dem Schreiben: gueltig/);
    assert.equal(readFileSync(join(abzug.app, neu.replace(".pdf", ".txt")), "utf8"), "Jahresauszug\n");
    assert.ok(readFileSync(darlehenPfad, "utf8").includes(neu));
    assert.ok(!readdirSync(join(abzug.app, "Belege")).includes("2021"), "leerer Jahresordner ist weg");
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

test("Parallele Schreibaufrufe einer Sitzung laufen nacheinander: kein verlorenes Anhaengen, kein fremder Rollback", async () => {
  const s = starteServer(abzug, "schreiben");
  const logPfad = join(abzug.master, "agent_log.jsonl");
  const kontenPfad = join(abzug.master, "konten.json");
  const kontenVorher = readFileSync(kontenPfad, "utf8");
  try {
    const anhaengen = Array.from({ length: 6 }, (_, i) =>
      s.werkzeug("datei_schreiben", { pfad: "data/master/agent_log.jsonl", inhalt: `{"anlass":"parallel-${i}"}`, anhaengen: true }));
    // Ein kaputter Schreibvorgang dazwischen darf beim Rollback keine fremden Schreibvorgaenge mitnehmen.
    const kaputt = s.werkzeug("datei_schreiben", { pfad: "data/master/konten.json", inhalt: "{ kaputt" });
    const ergebnisse = await Promise.all([...anhaengen, kaputt]);
    for (const r of ergebnisse.slice(0, 6)) assert.ok(!r.isError, r.text);
    assert.equal(ergebnisse[6].isError, true);
    const log = readFileSync(logPfad, "utf8");
    for (let i = 0; i < 6; i += 1) assert.ok(log.includes(`"parallel-${i}"`), `Eintrag parallel-${i} fehlt`);
    assert.equal(readFileSync(kontenPfad, "utf8"), kontenVorher);
  } finally {
    await s.beenden();
  }
});

test("datei_ersetzen parallel auf dieselbe Datei verliert keine Aenderung", async () => {
  const s = starteServer(abzug, "schreiben");
  const pfad = join(abzug.app, "data", "inbox", "notiz.txt");
  writeFileSync(pfad, "a=1\nb=1\nc=1\n");
  try {
    const r = await Promise.all(["a", "b", "c"].map((k) => s.werkzeug("datei_ersetzen", { pfad: "data/inbox/notiz.txt", alt: `${k}=1`, neu: `${k}=2` })));
    for (const x of r) assert.ok(!x.isError, x.text);
    assert.equal(readFileSync(pfad, "utf8"), "a=2\nb=2\nc=2\n");
  } finally {
    await s.beenden();
  }
});

test("datei_lesen: Bild liefert den Textzwilling, seite:1 das Bild; Groessengrenze und Pfadschutz", async () => {
  const ordner = join(abzug.app, "Belege", "2026", "Bilder");
  mkdirSync(ordner, { recursive: true });
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  writeFileSync(join(ordner, "quittung.png"), png);
  writeFileSync(join(ordner, "quittung.txt"), "# Per OCR (tesseract) erkannt, 2026-10-11.\nSumme 1,00\n");
  writeFileSync(join(ordner, "ohne.jpg"), png);
  writeFileSync(join(ordner, "riesig.jpeg"), Buffer.alloc(5 * 1024 * 1024 + 1));
  mkdirSync(join(abzug.wurzel, "geheim-bild"), { recursive: true });
  writeFileSync(join(abzug.wurzel, "geheim-bild", "z.txt"), "GEHEIM-ZWILLING\n");
  symlinkSync(join(abzug.wurzel, "geheim-bild", "z.txt"), join(ordner, "ausbruch.txt"));
  writeFileSync(join(ordner, "ausbruch.png"), png);
  const s = starteServer(abzug);
  try {
    const text = await s.werkzeug("datei_lesen", { pfad: "Belege/2026/Bilder/quittung.png" });
    assert.ok(!text.isError, text.text);
    assert.match(text.text, /^# Textzwilling Belege\/2026\/Bilder\/quittung\.txt \(das Bild selbst: datei_lesen mit seite:1\)/);
    assert.match(text.text, /Summe 1,00/);

    const bild = await s.werkzeug("datei_lesen", { pfad: "Belege/2026/Bilder/quittung.png", seite: 1 });
    assert.deepEqual(bild.content, [{ type: "image", data: png.toString("base64"), mimeType: "image/png" }]);

    const ohne = await s.werkzeug("datei_lesen", { pfad: "Belege/2026/Bilder/ohne.jpg" });
    assert.equal(ohne.content[0].type, "image");
    assert.equal(ohne.content[0].mimeType, "image/jpeg");

    const gross = await s.werkzeug("datei_lesen", { pfad: "Belege/2026/Bilder/riesig.jpeg" });
    assert.equal(gross.isError, true);

    // Zwilling als Symlink nach draussen wird nicht gelesen; das Bild kommt stattdessen.
    const ausbruch = await s.werkzeug("datei_lesen", { pfad: "Belege/2026/Bilder/ausbruch.png" });
    assert.doesNotMatch(ausbruch.text, /GEHEIM/);
    assert.equal(ausbruch.content[0].type, "image");
  } finally {
    await s.beenden();
  }
});

test("beleg_ablegen: Foto aus der Inbox samt Zwilling", async () => {
  const inbox = join(abzug.app, "data", "inbox");
  writeFileSync(join(inbox, "IMG_0001.jpg"), "jpeg");
  writeFileSync(join(inbox, "IMG_0001.txt"), "# Vom Agenten aus dem Bildscan gelesen, 2026-10-11.\nText\n");
  const s = starteServer(abzug, "schreiben");
  try {
    const ziel = "Belege/2026/Sonstiges/Quittung_Musterladen_2026-10-01.jpg";
    const r = await s.werkzeug("beleg_ablegen", { quelle: "data/inbox/IMG_0001.jpg", ziel });
    assert.ok(!r.isError, r.text);
    assert.equal(readFileSync(join(abzug.app, ziel), "utf8"), "jpeg");
    assert.match(readFileSync(join(abzug.app, ziel.replace(/\.jpg$/, ".txt")), "utf8"), /Text/);
    const falsch = await s.werkzeug("beleg_ablegen", { quelle: "data/inbox/IMG_0001.jpg", ziel: "Belege/x.png" });
    assert.equal(falsch.isError, true);
  } finally {
    await s.beenden();
  }
});
