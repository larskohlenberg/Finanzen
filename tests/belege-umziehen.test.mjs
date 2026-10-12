import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, readdir, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { planUmzug, ersetzeVerweise, main } from "../app/tools/belege-umziehen.mjs";

test("planUmzug nimmt den Textzwilling mit", () => {
  const plan = planUmzug({
    umzuege: [{ von: "Belege/2025/Kredite/a.pdf", nach: "Belege/Darlehen/DAR-001_X/2025/a.pdf" }],
    vorhandene: ["Belege/2025/Kredite/a.pdf", "Belege/2025/Kredite/a.txt"],
  });
  assert.deepEqual(plan.fehler, []);
  assert.deepEqual(plan.verschiebungen, [
    { von: "Belege/2025/Kredite/a.pdf", nach: "Belege/Darlehen/DAR-001_X/2025/a.pdf" },
    { von: "Belege/2025/Kredite/a.txt", nach: "Belege/Darlehen/DAR-001_X/2025/a.txt" },
  ]);
});

test("planUmzug: CSV hat keinen Zwilling, ein expliziter .txt-Umzug geht", () => {
  const plan = planUmzug({
    umzuege: [
      { von: "Belege/K/x.csv", nach: "Belege/Konten/K/2026/x.csv" },
      { von: "Belege/R/notiz.txt", nach: "Belege/Vorsorge/Allgemein/2026/notiz.txt" },
    ],
    vorhandene: ["Belege/K/x.csv", "Belege/K/x.txt", "Belege/R/notiz.txt"],
  });
  assert.deepEqual(plan.fehler, []);
  assert.equal(plan.verschiebungen.length, 2);
});

test("planUmzug meldet Fehler statt zu raten", () => {
  const plan = planUmzug({
    umzuege: [
      { von: "Belege/a.pdf", nach: "Belege/b.csv" },
      { von: "data/master/konten.json", nach: "Belege/konten.json" },
      { von: "Belege/c.pdf", nach: "Belege/neu/c.pdf" },
      { von: "Belege/d.pdf", nach: "Belege/frei/d.pdf" },
      { von: "Belege/e.pdf", nach: "Belege/frei/d.pdf" },
      { von: "Belege/fehlt.pdf", nach: "Belege/neu/fehlt.pdf" },
      { von: "Belege/../x.pdf", nach: "Belege/y.pdf" },
    ],
    vorhandene: ["Belege/a.pdf", "Belege/c.pdf", "Belege/neu/c.pdf", "Belege/d.pdf", "Belege/e.pdf"],
  });
  const gruende = plan.fehler.map((f) => f.grund);
  assert.ok(gruende.some((g) => g.includes("Endung")));
  assert.ok(gruende.some((g) => g.includes("unter Belege/")));
  assert.ok(gruende.some((g) => g.includes("existiert bereits")));
  assert.ok(gruende.some((g) => g.includes("mehrfach")));
  assert.ok(gruende.some((g) => g.includes("existiert nicht")));
  assert.equal(plan.verschiebungen.length, 0, "bei Fehlern wird nichts verschoben");
});

test("planUmzug: schon verschoben zaehlt als erledigt (Wiederaufnahme)", () => {
  const plan = planUmzug({
    umzuege: [{ von: "Belege/alt/a.pdf", nach: "Belege/neu/a.pdf" }],
    vorhandene: ["Belege/neu/a.pdf", "Belege/neu/a.txt"],
  });
  assert.deepEqual(plan.fehler, []);
  assert.deepEqual(plan.verschiebungen, []);
  assert.deepEqual(plan.erledigt, [
    { von: "Belege/alt/a.pdf", nach: "Belege/neu/a.pdf" },
    { von: "Belege/alt/a.txt", nach: "Belege/neu/a.txt" },
  ]);
  assert.equal(plan.ersetzungen.get("Belege/alt/a.pdf"), "Belege/neu/a.pdf");
});

test("ersetzeVerweise trifft nur ganze Pfade", () => {
  const ersetzungen = new Map([["Belege/2025/a.pdf", "Belege/Neu/2025/a.pdf"]]);
  const text = '{"q":"Belege/2025/a.pdf","r":"Belege/2025/a.pdfx","s":"siehe Belege/2025/a.pdf."}';
  const { text: neu, anzahl } = ersetzeVerweise(text, ersetzungen);
  assert.equal(anzahl, 2);
  assert.equal(neu, '{"q":"Belege/Neu/2025/a.pdf","r":"Belege/2025/a.pdfx","s":"siehe Belege/Neu/2025/a.pdf."}');
});

test("ersetzeVerweise vergleicht in NFC", () => {
  const ersetzungen = new Map([["Belege/Prüfung.pdf".normalize("NFD"), "Belege/Neu/Prüfung.pdf"]]);
  const { anzahl } = ersetzeVerweise("Belege/Prüfung.pdf".normalize("NFC"), ersetzungen);
  assert.equal(anzahl, 1);
});

async function aufbau() {
  const basis = await mkdtemp(path.join(tmpdir(), "belege-umziehen-"));
  const belege = path.join(basis, "Belege");
  const daten = path.join(basis, "data", "master");
  await mkdir(path.join(belege, "2025", "Kredite"), { recursive: true });
  await mkdir(daten, { recursive: true });
  await writeFile(path.join(belege, "2025", "Kredite", "a.pdf"), "PDF");
  await writeFile(path.join(belege, "2025", "Kredite", "a.txt"), "Text");
  await writeFile(path.join(daten, "darlehen.json"), JSON.stringify([{ darlehen_id: "DAR-001", quelle_hinweis: "Belege/2025/Kredite/a.pdf" }]));
  await writeFile(path.join(daten, "zeitwerte.jsonl"), `${JSON.stringify({ quelle_hinweis: "Belege/2025/Kredite/a.pdf, S. 2" })}\n`);
  await writeFile(path.join(daten, "agent_log.jsonl"), `${JSON.stringify({ notiz: "Belege/2025/Kredite/a.pdf" })}\n`);
  const plan = path.join(basis, "plan.json");
  await writeFile(plan, JSON.stringify([{ von: "Belege/2025/Kredite/a.pdf", nach: "Belege/Darlehen/DAR-001_X/2025/a.pdf" }]));
  return { basis, belege, daten, plan };
}

const urlVon = (ordner) => pathToFileURL(`${ordner}${path.sep}`);

test("main: Vorschau schreibt nichts", async () => {
  const { belege, daten, plan } = await aufbau();
  const bericht = await main({ datenRoot: urlVon(daten), belegeRoot: urlVon(belege), planDatei: plan, schreiben: false });
  assert.equal(bericht.modus, "vorschau");
  assert.equal(bericht.verschoben.length, 2);
  assert.deepEqual(bericht.verweise, { "darlehen.json": 1, "zeitwerte.jsonl": 1 });
  assert.ok(await stat(path.join(belege, "2025", "Kredite", "a.pdf")));
  assert.match(await readFile(path.join(daten, "darlehen.json"), "utf8"), /2025\/Kredite/);
});

test("main: schreiben verschiebt, schreibt Verweise um, laesst das Protokoll und raeumt leere Ordner", async () => {
  const { belege, daten, plan } = await aufbau();
  const bericht = await main({ datenRoot: urlVon(daten), belegeRoot: urlVon(belege), planDatei: plan, schreiben: true });
  assert.equal(bericht.modus, "geschrieben");
  assert.equal(await readFile(path.join(belege, "Darlehen", "DAR-001_X", "2025", "a.txt"), "utf8"), "Text");
  assert.match(await readFile(path.join(daten, "darlehen.json"), "utf8"), /Belege\/Darlehen\/DAR-001_X\/2025\/a\.pdf/);
  assert.match(await readFile(path.join(daten, "zeitwerte.jsonl"), "utf8"), /Belege\/Darlehen\/DAR-001_X\/2025\/a\.pdf, S\. 2/);
  assert.match(await readFile(path.join(daten, "agent_log.jsonl"), "utf8"), /2025\/Kredite/);
  assert.deepEqual(await readdir(belege), ["Darlehen"]);
  assert.deepEqual(bericht.verwaist, []);
});

test("main: Fehler im Plan bricht vor jeder Aenderung ab", async () => {
  const { basis, belege, daten } = await aufbau();
  const plan = path.join(basis, "kaputt.json");
  await writeFile(plan, JSON.stringify([{ von: "Belege/2025/Kredite/a.pdf", nach: "Belege/x.csv" }]));
  const bericht = await main({ datenRoot: urlVon(daten), belegeRoot: urlVon(belege), planDatei: plan, schreiben: true });
  assert.equal(bericht.fehler.length, 1);
  assert.equal(bericht.verschoben.length, 0);
  assert.ok(await stat(path.join(belege, "2025", "Kredite", "a.pdf")));
});

test("main: Ziel hinter einem Symlink wird weder ueberschrieben noch ausserhalb angelegt", async () => {
  const { basis, belege, daten } = await aufbau();
  const draussen = path.join(basis, "draussen");
  await mkdir(draussen, { recursive: true });
  await writeFile(path.join(draussen, "a.pdf"), "FREMD");
  await symlink(draussen, path.join(belege, "Link"));
  const plan = path.join(basis, "link.json");
  await writeFile(plan, JSON.stringify([{ von: "Belege/2025/Kredite/a.pdf", nach: "Belege/Link/a.pdf" }]));
  const bericht = await main({ datenRoot: urlVon(daten), belegeRoot: urlVon(belege), planDatei: plan, schreiben: true });
  assert.ok(bericht.fehler.some((f) => /existiert bereits|aus Belege\/ heraus/.test(f.grund)));
  assert.equal(await readFile(path.join(draussen, "a.pdf"), "utf8"), "FREMD");
  assert.ok(await stat(path.join(belege, "2025", "Kredite", "a.pdf")));

  await writeFile(plan, JSON.stringify([{ von: "Belege/2025/Kredite/a.pdf", nach: "Belege/Link/neu/b.pdf" }]));
  const raus = await main({ datenRoot: urlVon(daten), belegeRoot: urlVon(belege), planDatei: plan, schreiben: true });
  assert.ok(raus.fehler.some((f) => /aus Belege\/ heraus/.test(f.grund)));
  assert.deepEqual(await readdir(draussen), ["a.pdf"]);
});
