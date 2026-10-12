// tests/export.test.mjs
// Backup-Export: ZIP-Schreiber, Buchungs-CSV und Server-Endpunkt gegen
// Temp-Verzeichnisse (keine Echtdaten).
import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import http from "node:http";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32 } from "node:zlib";
import { betragDe, buchungenCsv, dosZeit, exportDateiname, exportEintraege, sammleOrdner, zipGroesse, zipTeile } from "../app/export.mjs";
import { createAppServer } from "../app/server.mjs";

// Minimaler Leser fuer stored-ZIPs: geht das zentrale Verzeichnis durch und
// prueft lokale Koepfe, Laengen und CRC.
function leseZip(puffer) {
  const ende = puffer.length - 22;
  assert.equal(puffer.readUInt32LE(ende), 0x06054b50);
  const anzahl = puffer.readUInt16LE(ende + 10);
  let pos = puffer.readUInt32LE(ende + 16);
  const dateien = new Map();
  for (let i = 0; i < anzahl; i += 1) {
    assert.equal(puffer.readUInt32LE(pos), 0x02014b50);
    const pruefsumme = puffer.readUInt32LE(pos + 16);
    const groesse = puffer.readUInt32LE(pos + 24);
    const nameLaenge = puffer.readUInt16LE(pos + 28);
    const offset = puffer.readUInt32LE(pos + 42);
    const name = puffer.subarray(pos + 46, pos + 46 + nameLaenge).toString("utf8");
    assert.equal(puffer.readUInt32LE(offset), 0x04034b50);
    assert.equal(puffer.readUInt16LE(offset + 6) & 0x0800, 0x0800, "UTF-8-Flag");
    const start = offset + 30 + puffer.readUInt16LE(offset + 26);
    const inhalt = puffer.subarray(start, start + groesse);
    assert.equal(crc32(inhalt), pruefsumme, `CRC ${name}`);
    dateien.set(name, inhalt.toString("utf8"));
    pos += 46 + nameLaenge;
  }
  return dateien;
}

async function sammle(gen) {
  const teile = [];
  for await (const teil of gen) teile.push(teil);
  return Buffer.concat(teile);
}

let wurzel, appDir, belegeDir, datenDir, demoDir;

before(async () => {
  wurzel = await mkdtemp(join(tmpdir(), "export-"));
  appDir = join(wurzel, "app");
  belegeDir = join(appDir, "Belege");
  datenDir = join(appDir, "data", "master");
  demoDir = join(appDir, "data", "demo");
  await mkdir(join(belegeDir, "Steuern", "2025"), { recursive: true });
  await mkdir(join(belegeDir, ".versteckt"), { recursive: true });
  await mkdir(datenDir, { recursive: true });
  await mkdir(demoDir, { recursive: true });
  await writeFile(join(appDir, "index.html"), "<!doctype html>");
  await writeFile(join(belegeDir, "Steuern", "2025", "Bescheid.pdf"), "%PDF-Bescheid");
  // NFD wie von macOS: im ZIP soll NFC ankommen.
  await writeFile(join(belegeDir, "Steuern", "Grundsteuer Mühle.pdf"), "%PDF-Grund");
  await writeFile(join(belegeDir, ".DS_Store"), "x");
  await writeFile(join(belegeDir, ".versteckt", "geheim.pdf"), "x");
  await symlink(join(datenDir, "konten.json"), join(belegeDir, "link.json"));
  await writeFile(join(datenDir, "konten.json"), JSON.stringify([{ konto_id: "KTO-001", name: "Giro; gemeinsam" }]));
  await writeFile(join(datenDir, "kategorien.json"), JSON.stringify([{ kategorie_id: "KAT-004", name: "Lebensmittel" }]));
  await writeFile(join(datenDir, "transaktionen.jsonl"), [
    { transaktion_id: "TXN-2", konto_id: "KTO-001", buchungsdatum: "2025-03-02", betrag: "-12.5", gegenpartei: "=HYPERLINK(1)", verwendungszweck: "Einkauf \"Wochenmarkt\"", kategorie_id: "KAT-004", ist_transfer: false, kategorisierung_status: "bestaetigt" },
    { transaktion_id: "TXN-1", konto_id: "KTO-001", buchungsdatum: "2025-03-01", betrag: "1500.00", gegenpartei: "Muster GmbH", verwendungszweck: "Gehalt", kategorie_id: "KAT-001", ist_transfer: false, kategorisierung_status: "bestaetigt" },
  ].map((z) => JSON.stringify(z)).join("\n") + "\n");
  await writeFile(join(demoDir, "transaktionen.jsonl"), "");
  await writeFile(join(demoDir, "demo.json"), "[]");
});

after(async () => {
  await rm(wurzel, { recursive: true, force: true });
});

test("zipTeile: gueltige stored-ZIP, Laenge wie vorab berechnet", async () => {
  const eintraege = [
    { name: "a.txt", groesse: 5, geaendert: new Date(2025, 0, 2, 3, 4, 6), lies: async () => Buffer.from("hallo") },
    { name: "Ordner/ü.txt", groesse: 0, geaendert: new Date(), lies: async () => Buffer.alloc(0) },
  ];
  const zip = await sammle(zipTeile(eintraege));
  assert.equal(zip.length, zipGroesse(eintraege));
  const dateien = leseZip(zip);
  assert.deepEqual([...dateien.keys()], ["a.txt", "Ordner/ü.txt"]);
  assert.equal(dateien.get("a.txt"), "hallo");
});

test("zipTeile: geaenderte Datei bricht ab", async () => {
  const eintraege = [{ name: "a.txt", groesse: 3, geaendert: new Date(), lies: async () => Buffer.from("laenger") }];
  await assert.rejects(sammle(zipTeile(eintraege)), /Groesse hat sich/);
});

test("zipTeile: ueber 65535 Eintraege wird abgelehnt", async () => {
  const eintrag = { name: "a", groesse: 0, geaendert: new Date(), lies: async () => Buffer.alloc(0) };
  await assert.rejects(sammle(zipTeile(Array(70000).fill(eintrag))), /zu viele Dateien/);
});

test("dosZeit: Datum und Uhrzeit im DOS-Format, vor 1980 auf 1980-01-01", () => {
  assert.deepEqual(dosZeit(new Date(2025, 2, 15, 13, 45, 31)), { zeit: (13 << 11) | (45 << 5) | 15, tag: (45 << 9) | (3 << 5) | 15 });
  assert.deepEqual(dosZeit(new Date(1970, 0, 1)), { zeit: 0, tag: 33 });
});

test("sammleOrdner: rekursiv, ohne Dotfiles und Symlinks, Namen in NFC", async () => {
  const namen = (await sammleOrdner(belegeDir, "Belege")).map((e) => e.name);
  assert.deepEqual(namen, ["Belege/Steuern/2025/Bescheid.pdf", "Belege/Steuern/Grundsteuer Mühle.pdf"]);
  assert.deepEqual(await sammleOrdner(join(wurzel, "fehlt"), "X"), []);
});

test("betragDe: Dezimalkomma ohne Tausenderpunkt", () => {
  assert.equal(betragDe("1500.00"), "1500,00");
  assert.equal(betragDe("-12.5"), "-12,50");
  assert.equal(betragDe("-0.07"), "-0,07");
});

test("buchungenCsv: Excel-tauglich, sortiert, Namen statt IDs, Formeln entschaerft", () => {
  const csv = buchungenCsv(
    [
      { transaktion_id: "TXN-2", konto_id: "KTO-001", buchungsdatum: "2025-03-02", betrag: "-12.50", gegenpartei: "=SUMME(A1)", verwendungszweck: "a;b", kategorie_id: "KAT-004", ist_transfer: true, kategorisierung_status: "bestaetigt" },
      { transaktion_id: "TXN-1", konto_id: "KTO-009", buchungsdatum: "2025-03-01", betrag: "3.00", gegenpartei: "X", verwendungszweck: "", kategorie_id: "KAT-404" },
    ],
    { kategorien: [{ kategorie_id: "KAT-004", name: "Lebensmittel" }], konten: [{ konto_id: "KTO-001", name: "Giro" }] },
  );
  assert.ok(csv.startsWith("﻿Datum;Konto;Betrag;"));
  const zeilen = csv.slice(1).split("\r\n");
  assert.equal(zeilen[1], "01.03.2025;KTO-009;3,00;X;;KAT-404;nein;;;TXN-1");
  assert.equal(zeilen[2], "02.03.2025;Giro;-12,50;'=SUMME(A1);\"a;b\";Lebensmittel;ja;bestaetigt;;TXN-2");
  assert.equal(zeilen.at(-1), "");
});

test("exportEintraege: Dokumente, Daten mit CSV, komplett beides", async () => {
  const namen = async (art) => (await exportEintraege(art, { datenDir, belegeDir })).map((e) => e.name);
  assert.deepEqual(await namen("dokumente"), ["Belege/Steuern/2025/Bescheid.pdf", "Belege/Steuern/Grundsteuer Mühle.pdf"]);
  assert.deepEqual(await namen("daten"), ["Daten/kategorien.json", "Daten/konten.json", "Daten/transaktionen.jsonl", "Daten/buchungen.csv"]);
  assert.equal((await namen("komplett")).length, 6);
  await assert.rejects(exportEintraege("alles", { datenDir, belegeDir }), /unbekannte Exportart/);
});

test("exportDateiname: Art und Datum", () => {
  assert.equal(exportDateiname("komplett", new Date(2026, 9, 2)), "finanzen-backup-2026-10-02.zip");
  assert.equal(exportDateiname("dokumente", new Date(2026, 9, 2)), "finanzen-dokumente-2026-10-02.zip");
});

// --- Server-Endpunkt -------------------------------------------------------------

function hole(port, path, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path, method }, (res) => {
      const teile = [];
      res.on("data", (c) => teile.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(teile) }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function mitServer(fn) {
  const logs = [];
  const server = createAppServer({ appDir, inboxDir: join(appDir, "data", "inbox"), log: (z) => logs.push(z) });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await fn(server.address().port, logs);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("GET /api/export/komplett: ZIP mit Belegen, Daten und CSV", async () => {
  await mitServer(async (port, logs) => {
    const antwort = await hole(port, "/api/export/komplett");
    assert.equal(antwort.status, 200);
    assert.equal(antwort.headers["content-type"], "application/zip");
    assert.equal(Number(antwort.headers["content-length"]), antwort.body.length);
    assert.match(antwort.headers["content-disposition"], /^attachment; filename="finanzen-backup-\d{4}-\d{2}-\d{2}\.zip"$/);
    const dateien = leseZip(antwort.body);
    assert.equal(dateien.get("Belege/Steuern/2025/Bescheid.pdf"), "%PDF-Bescheid");
    assert.match(dateien.get("Daten/buchungen.csv"), /01\.03\.2025;"Giro; gemeinsam";1500,00;Muster GmbH;Gehalt;KAT-001/);
    assert.match(dateien.get("Daten/buchungen.csv"), /'=HYPERLINK\(1\);"Einkauf ""Wochenmarkt""";Lebensmittel/);
    assert.ok(logs.some((z) => /export art=komplett quelle=live dateien=6/.test(z)));
  });
});

test("GET /api/export/daten?quelle=demo nimmt die Demodaten", async () => {
  await mitServer(async (port) => {
    const dateien = leseZip((await hole(port, "/api/export/daten?quelle=demo")).body);
    assert.deepEqual([...dateien.keys()], ["Daten/demo.json", "Daten/transaktionen.jsonl", "Daten/buchungen.csv"]);
  });
});

test("Export: unbekannte Art 404, andere Methode 405", async () => {
  await mitServer(async (port) => {
    assert.equal((await hole(port, "/api/export/alles")).status, 404);
    assert.equal((await hole(port, "/api/export/dokumente", "POST")).status, 405);
  });
});

test("Export-ZIP besteht unzip -t (falls vorhanden)", async (t) => {
  await mitServer(async (port) => {
    const datei = join(wurzel, "test.zip");
    await writeFile(datei, (await hole(port, "/api/export/komplett")).body);
    const ergebnis = await new Promise((resolve) => execFile("unzip", ["-t", datei], (fehler, stdout) => resolve({ fehler, stdout })));
    if (ergebnis.fehler?.code === "ENOENT") return t.skip("unzip nicht installiert");
    assert.equal(ergebnis.fehler, null, ergebnis.stdout);
    assert.match(ergebnis.stdout, /No errors detected/);
  });
});
