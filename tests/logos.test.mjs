// tests/logos.test.mjs
// Logo-Verzeichnis: PNG lesen/schreiben/verkleinern, Zuordnung ueber Muster
// und Vererbung, Kuerzel, Plan, Abruf (mit Fake-Dienst, ohne Netz), Schreiben
// in einen Wegwerf-Datenbestand, Validator. Alle Namen und Domains erfunden.
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateSync, crc32 } from "node:zlib";
import { dekodierePng, istPng, kodierePng, verkleinere } from "../app/tools/lib/png.mjs";
import { kuerzel, kuerzelFarbe, logoFuerText, logoVerzeichnis, KUERZEL_FARBEN } from "../app/logos.mjs";
import { holeLogo, logoBericht, normalisiereDomain, planeLogos, schreibeLogos, uebernehme, dienstUrl } from "../app/tools/logos.mjs";
import { loadMasterData, validateMasterData } from "../app/tools/validator.mjs";

const DEMO = fileURLToPath(new URL("../app/data/demo/", import.meta.url));
const LOGOS_CLI = fileURLToPath(new URL("../app/tools/logos.mjs", import.meta.url));

function einfarbig(breite, hoehe, [r, g, b, a]) {
  const rgba = new Uint8Array(breite * hoehe * 4);
  for (let i = 0; i < breite * hoehe; i += 1) rgba.set([r, g, b, a], i * 4);
  return { breite, hoehe, rgba };
}

function chunk(typ, daten) {
  const kopf = Buffer.alloc(8);
  kopf.writeUInt32BE(daten.length, 0);
  kopf.write(typ, 4, "latin1");
  const pruef = Buffer.alloc(4);
  pruef.writeUInt32BE(crc32(Buffer.concat([kopf.subarray(4), daten])) >>> 0, 0);
  return Buffer.concat([kopf, daten, pruef]);
}

// Palettenbild 2x2 mit 4 Bit je Pixel und tRNS: Index 0 transparent rot, 1 blau.
function palettenPng({ interlace = 0 } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 4;
  ihdr[9] = 3;
  ihdr[12] = interlace;
  const roh = Buffer.from([0, 0x01, 0, 0x10]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("PLTE", Buffer.from([255, 0, 0, 0, 0, 255])),
    chunk("tRNS", Buffer.from([0])),
    chunk("IDAT", deflateSync(roh)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const JPEG_BLAU = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAQABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDz+iiiv7jP46P/2Q==";

const pngAntwort = (bytes, status = 200) => ({ ok: status >= 200 && status < 300, status, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) });

// --- PNG ---------------------------------------------------------------------

test("PNG: schreiben und lesen ergibt dieselben Pixel", () => {
  const bild = einfarbig(3, 2, [10, 20, 30, 200]);
  bild.rgba.set([1, 2, 3, 4], 4);
  const png = kodierePng(bild);
  assert.ok(istPng(png));
  const zurueck = dekodierePng(png);
  assert.equal(zurueck.breite, 3);
  assert.equal(zurueck.hoehe, 2);
  assert.deepEqual([...zurueck.rgba], [...bild.rgba]);
});

test("PNG: Palette mit 4 Bit und tRNS wird zu RGBA", () => {
  const bild = dekodierePng(palettenPng());
  assert.deepEqual([...bild.rgba.slice(0, 8)], [255, 0, 0, 0, 0, 0, 255, 255]);
  assert.deepEqual([...bild.rgba.slice(8, 16)], [0, 0, 255, 255, 255, 0, 0, 0]);
});

test("PNG: kein PNG und interlaced werden abgelehnt", () => {
  assert.throws(() => dekodierePng(Buffer.from("<svg></svg>")), /kein PNG/);
  assert.throws(() => dekodierePng(palettenPng({ interlace: 1 })), /interlaced/);
});

test("PNG: verkleinern mittelt Flaechen und laesst kleine Bilder in Ruhe", () => {
  const gross = einfarbig(128, 128, [0, 0, 0, 255]);
  for (let y = 0; y < 128; y += 1) for (let x = 64; x < 128; x += 1) gross.rgba.set([255, 255, 255, 255], (y * 128 + x) * 4);
  const klein = verkleinere(gross, 64);
  assert.equal(klein.breite, 64);
  assert.equal(klein.hoehe, 64);
  assert.deepEqual([...klein.rgba.slice(0, 4)], [0, 0, 0, 255]);
  assert.deepEqual([...klein.rgba.slice(63 * 4, 64 * 4)], [255, 255, 255, 255]);
  const breit = verkleinere(einfarbig(200, 100, [9, 9, 9, 255]), 64);
  assert.deepEqual([breit.breite, breit.hoehe], [64, 32]);
  const winzig = einfarbig(16, 16, [1, 1, 1, 255]);
  assert.equal(verkleinere(winzig, 64), winzig);
});

test("PNG: transparente Pixel faerben beim Verkleinern nicht ab", () => {
  const bild = einfarbig(2, 1, [255, 0, 0, 255]);
  bild.rgba.set([0, 255, 0, 0], 4);
  const klein = verkleinere(bild, 1);
  assert.deepEqual([...klein.rgba], [255, 0, 0, 128]);
});

// --- Kuerzel und Zuordnung -----------------------------------------------------

test("Kuerzel: Rechtsformen und Fuellwoerter zaehlen nicht", () => {
  assert.equal(kuerzel("Musterladen Markt GmbH"), "MU");
  assert.equal(kuerzel("Beispiel Versicherung AG"), "BV");
  assert.equal(kuerzel("Nordstadt Pflege"), "NP");
  assert.equal(kuerzel("123 4711"), "?");
  assert.equal(kuerzel(""), "?");
});

test("Kuerzelfarbe: fest je Name, unabhaengig von Schreibweise und Leerraum", () => {
  const f = kuerzelFarbe("Musterladen A");
  assert.equal(kuerzelFarbe("  MUSTERLADEN   a "), f);
  assert.ok(f >= 0 && f < KUERZEL_FARBEN);
  const farben = new Set(["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta"].map(kuerzelFarbe));
  assert.ok(farben.size > 3, "Namen verteilen sich auf mehrere Farben");
});

const LOGOS = [
  { logo_id: "LOGO-001", name: "Musterladen", gegenpartei_pattern: "MUSTERLADEN", domain: "musterladen.example", datei: "logos/musterladen.example.png", quelle: "https://x", abgerufen_am: "2026-10-01" },
  { logo_id: "LOGO-002", name: "Musterladen Reisen", gegenpartei_pattern: "MUSTERLADEN REISEN|ML REISEN", domain: "ml-reisen.example", datei: "logos/ml-reisen.example.png", quelle: "https://x", abgerufen_am: "2026-10-01" },
  { logo_id: "LOGO-003", name: "Beispiel Versicherung", gegenpartei_pattern: "BEISPIEL VERS", domain: "beispiel-vers.example", datei: "logos/beispiel-vers.example.png", quelle: "https://x", abgerufen_am: "2026-10-01" },
];

test("Zuordnung: Teiltext lose normalisiert, laengster passender Teil gewinnt", () => {
  assert.equal(logoFuerText(LOGOS, "musterladen  sagt danke 0815")?.logo_id, "LOGO-001");
  assert.equal(logoFuerText(LOGOS, "MUSTERLADEN REISEN GMBH")?.logo_id, "LOGO-002");
  assert.equal(logoFuerText(LOGOS, "ml reisen buchung")?.logo_id, "LOGO-002");
  assert.equal(logoFuerText(LOGOS, "Unbekannt"), null);
  assert.equal(logoFuerText(LOGOS, ""), null);
});

test("Vererbung: Regelzahlung ueber ihre Buchungen, Vorsorge ueber ihre Regelzahlungen", () => {
  const transaktionen = [
    { regelzahlung_id: "RZ-001", gegenpartei: "Beispiel Versicherung AG" },
    { regelzahlung_id: "RZ-001", gegenpartei: "BEISPIEL VERS. Beitrag" },
    { regelzahlung_id: "RZ-002", gegenpartei: "Unbekannte Kasse" },
    { gegenpartei: "Musterladen" },
  ];
  const regelzahlungen = [
    { regelzahlung_id: "RZ-001", bezeichnung: "Beitrag Leben", vorsorge_id: "VS-001" },
    { regelzahlung_id: "RZ-002", bezeichnung: "Musterladen Abo" },
    { regelzahlung_id: "RZ-003", bezeichnung: "ohne Buchung" },
  ];
  const v = logoVerzeichnis({ logos: LOGOS, transaktionen, regelzahlungen });
  assert.equal(v.fuerRegelzahlung(regelzahlungen[0])?.logo_id, "LOGO-003");
  assert.equal(v.fuerRegelzahlung(regelzahlungen[1])?.logo_id, "LOGO-001", "ohne Treffer in den Buchungen zaehlt die Bezeichnung");
  assert.equal(v.fuerRegelzahlung(regelzahlungen[2]), null);
  assert.equal(v.fuerVorsorge({ vorsorge_id: "VS-001", name: "Leben" })?.logo_id, "LOGO-003");
  assert.equal(v.fuerVorsorge({ vorsorge_id: "VS-009", name: "Riester" }), null);
});

// --- Plan, Abruf, Bericht -----------------------------------------------------------

test("Domain: Schema, www., Pfad und Grossschreibung fallen weg", () => {
  assert.equal(normalisiereDomain("https://www.Musterladen.example/pfad?x=1"), "musterladen.example");
  assert.equal(normalisiereDomain("beispiel-vers.example"), "beispiel-vers.example");
  assert.equal(normalisiereDomain("localhost"), null);
  assert.equal(normalisiereDomain("../etc/passwd"), null);
  assert.equal(normalisiereDomain(""), null);
});

test("Plan: neue IDs fortlaufend, gleiche Domain aktualisiert, Fehler je Eintrag", () => {
  const { plan, fehler } = planeLogos({
    logos: LOGOS,
    eintraege: [
      { name: "Neu", domain: "neu.example", muster: "NEU" },
      { name: "Musterladen Neu", domain: "www.musterladen.example", muster: "MUSTERLADEN|MUSTER LADEN" },
      { name: "Auch neu", domain: "auch-neu.example", muster: "AUCH NEU" },
    ],
  });
  assert.deepEqual(fehler, []);
  assert.deepEqual(plan.map((p) => [p.aktion, p.eintrag.logo_id, p.eintrag.datei]), [
    ["neu", "LOGO-004", "logos/neu.example.png"],
    ["aktualisieren", "LOGO-001", "logos/musterladen.example.png"],
    ["neu", "LOGO-005", "logos/auch-neu.example.png"],
  ]);

  const kaputt = planeLogos({ logos: [], eintraege: [
    { name: "", domain: "x", muster: "A||B" },
    { name: "Doppelt", domain: "a.example", muster: "A" },
    { name: "Doppelt", domain: "a.example", muster: "A" },
  ] });
  assert.equal(kaputt.plan.length, 1);
  assert.ok(kaputt.fehler.some((f) => /eintraege\[0\]\.domain/.test(f)));
  assert.ok(kaputt.fehler.some((f) => /eintraege\[0\]\.name/.test(f)));
  assert.ok(kaputt.fehler.some((f) => /eintraege\[0\]\.muster/.test(f)));
  assert.ok(kaputt.fehler.some((f) => /eintraege\[2\]\.domain: a\.example doppelt/.test(f)));
});

test("Abruf: PNG wird auf 64 px verkleinert, Quelle ist die Dienst-URL", async () => {
  const aufrufe = [];
  const holen = async (url) => {
    aufrufe.push(url);
    return pngAntwort(kodierePng(einfarbig(128, 128, [0, 128, 255, 255])));
  };
  const r = await holeLogo("musterladen.example", { holen });
  assert.equal(r.ok, true);
  assert.equal(r.quelle, dienstUrl("musterladen.example"));
  assert.deepEqual(aufrufe, ["https://www.google.com/s2/favicons?domain=musterladen.example&sz=128"]);
  assert.deepEqual([r.breite, r.hoehe], [64, 64]);
  assert.equal(dekodierePng(r.png).breite, 64);
  assert.equal(r.hinweis, undefined);
});

test("Abruf: JPEG-Antwort wird als PNG abgelegt", async () => {
  // Erfundenes 16x16-JPEG, einfarbig (0, 128, 255), erzeugt mit libjpeg.
  const jpeg = Buffer.from(JPEG_BLAU, "base64");
  const r = await holeLogo("musterladen.example", { holen: async () => pngAntwort(jpeg) });
  assert.equal(r.ok, true);
  assert.ok(istPng(r.png));
  const bild = dekodierePng(r.png);
  assert.deepEqual([bild.breite, bild.hoehe], [16, 16]);
  const [rot, gruen, blau, alpha] = bild.rgba.subarray(8 * 16 * 4 + 8 * 4, 8 * 16 * 4 + 8 * 4 + 4);
  assert.ok(Math.abs(rot - 0) <= 3 && Math.abs(gruen - 128) <= 3 && Math.abs(blau - 255) <= 3 && alpha === 255);
  const kaputt = await holeLogo("a.example", { holen: async () => pngAntwort(jpeg.subarray(0, 30)) });
  assert.match(kaputt.fehler, /JPEG nicht lesbar/);
});

test("Abruf: 404, weder PNG noch JPEG, Netzfehler und winzige Bilder", async () => {
  assert.match((await holeLogo("a.example", { holen: async () => pngAntwort(Buffer.from("x"), 404) })).fehler, /404/);
  assert.match((await holeLogo("a.example", { holen: async () => pngAntwort(Buffer.from("<svg/>")) })).fehler, /weder PNG noch JPEG/);
  assert.match((await holeLogo("a.example", { holen: async () => { throw new Error("offline"); } })).fehler, /offline/);
  const winzig = await holeLogo("a.example", { holen: async () => pngAntwort(kodierePng(einfarbig(16, 16, [1, 2, 3, 255]))) });
  assert.equal(winzig.ok, true);
  assert.match(winzig.hinweis, /16x16/);
});

test("Bericht: haeufigste Gegenparteien ohne Logo, fehlende Dateien, Regelzahlungen und Vorsorge", () => {
  const bericht = logoBericht({
    logos: LOGOS.slice(0, 1),
    transaktionen: [
      { gegenpartei: "Musterladen 1", buchungsdatum: "2026-01-01" },
      { gegenpartei: "Kiosk Nord", buchungsdatum: "2026-01-02", regelzahlung_id: "RZ-001" },
      { gegenpartei: "kiosk  nord", buchungsdatum: "2026-02-02" },
      { gegenpartei: "Baeckerei", buchungsdatum: "2026-01-03" },
      { gegenpartei: "", buchungsdatum: "2026-01-04" },
    ],
    regelzahlungen: [{ regelzahlung_id: "RZ-001", bezeichnung: "Kiosk", status: "bestaetigt", vorsorge_id: "VS-001" }],
    vorsorge: [{ vorsorge_id: "VS-001", name: "Rente" }],
  }, { top: 1, vorhandeneDateien: new Set() });
  assert.equal(bericht.buchungen_mit_gegenpartei, 4);
  assert.equal(bericht.buchungen_mit_logo, 1);
  assert.equal(bericht.gegenparteien_ohne_logo, 2);
  assert.deepEqual(bericht.haeufigste_ohne_logo, [{ gegenpartei: "Kiosk Nord", buchungen: 2, zuletzt: "2026-02-02" }]);
  assert.deepEqual(bericht.dateien_fehlen, ["LOGO-001 logos/musterladen.example.png"]);
  assert.deepEqual(bericht.regelzahlungen_ohne_logo, ["RZ-001 Kiosk"]);
  assert.deepEqual(bericht.vorsorge_ohne_logo, ["VS-001 Rente"]);
});

// --- Schreiben und Validator -----------------------------------------------------

async function wegwerfBestand() {
  const ordner = await mkdtemp(join(tmpdir(), "logos-test-"));
  await cp(DEMO, ordner, { recursive: true });
  return ordner;
}

test("Schreiben: PNG, logos.json und Protokoll; Bestand bleibt gueltig", async () => {
  const ordner = await wegwerfBestand();
  try {
    const root = pathToFileURL(`${ordner}/`);
    const data = await loadMasterData(root);
    const { plan } = planeLogos({ logos: data.logos, eintraege: [{ name: "Musterladen", domain: "musterladen.example", muster: "MusterladenA|MusterladenB" }, { name: "Fehlt", domain: "fehlt.example", muster: "FEHLT" }] });
    const ergebnisse = [
      { ...plan[0], abruf: await holeLogo("musterladen.example", { holen: async () => pngAntwort(kodierePng(einfarbig(32, 32, [5, 5, 5, 255]))) }) },
      { ...plan[1], abruf: { ok: false, quelle: dienstUrl("fehlt.example"), fehler: "404" } },
    ];
    const logos = uebernehme(data.logos, ergebnisse, "2026-10-16");
    const r = await schreibeLogos(root, data, ergebnisse, logos, new Date("2026-10-16T10:00:00Z"));
    assert.deepEqual(r, { ok: true, anzahl: 1, fehler: [] });

    const json = JSON.parse(await readFile(join(ordner, "logos.json"), "utf8"));
    assert.deepEqual(json, [{ logo_id: "LOGO-001", name: "Musterladen", gegenpartei_pattern: "MusterladenA|MusterladenB", domain: "musterladen.example", datei: "logos/musterladen.example.png", quelle: dienstUrl("musterladen.example"), abgerufen_am: "2026-10-16" }]);
    assert.equal(dekodierePng(await readFile(join(ordner, "logos", "musterladen.example.png"))).breite, 32);
    const protokoll = (await readFile(join(ordner, "agent_log.jsonl"), "utf8")).trim().split("\n").map((z) => JSON.parse(z)).at(-1);
    assert.equal(protokoll.anlass, "logos");
    assert.deepEqual(protokoll.betroffene_ids, ["LOGO-001"]);
    assert.deepEqual(protokoll.fehlgeschlagen, ["fehlt.example"]);
    await assert.rejects(stat(join(ordner, "logos", "fehlt.example.png")));
  } finally {
    await rm(ordner, { recursive: true, force: true });
  }
});

test("Validator: Datei passt zur Domain, Domain eindeutig, kein leerer Musterteil", () => {
  const basis = LOGOS[0];
  const fehler = (logos) => validateMasterData({ personen: [], konten: [], kategorien: [], transaktionen: [], transfers: [], regelzahlungen: [], logos }).errors.filter((f) => f.startsWith("logos"));
  assert.deepEqual(fehler([basis]), []);
  assert.match(fehler([{ ...basis, datei: "logos/anders.example.png" }]).join(), /muss logos\/musterladen\.example\.png sein/);
  assert.match(fehler([basis, { ...basis, logo_id: "LOGO-002" }]).join(), /doppelt/);
  assert.match(fehler([{ ...basis, gegenpartei_pattern: "A|" }]).join(), /leerer Musterteil/);
  assert.match(fehler([{ ...basis, datei: "logos/../x.png" }]).join(), /datei: (Format ungueltig|muss)/);
  assert.match(fehler([{ ...basis, quelle: "http://unsicher" }]).join(), /quelle: Format ungueltig/);
  assert.match(fehler([{ ...basis, farbe: "rot" }]).join(), /unbekanntes Feld/);
});

// --- CLI ---------------------------------------------------------------------

function cli(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [LOGOS_CLI, ...args], (error, stdout, stderr) => resolve({ code: error ? error.code : 0, stdout, stderr }));
  });
}

test("CLI: ohne Datenbestand Abbruch, Bericht schreibt nichts, ungueltiger Plan ruft nichts ab", async () => {
  assert.equal((await cli([])).code, 2);
  const ordner = await wegwerfBestand();
  try {
    const bericht = await cli([ordner, "--top", "3"]);
    assert.equal(bericht.code, 0, bericht.stderr);
    const json = JSON.parse(bericht.stdout.slice(0, bericht.stdout.lastIndexOf("}") + 1));
    assert.equal(json.logos, 0);
    assert.equal(json.haeufigste_ohne_logo.length, 3);
    assert.match(bericht.stdout, /nichts geschrieben/);
    const plan = await cli([ordner, "--domain", "nicht gueltig", "--name", "X", "--muster", "X", "--schreiben"]);
    assert.equal(plan.code, 2);
    assert.match(plan.stderr, /keine gueltige Domain/);
    await assert.rejects(stat(join(ordner, "logos")));
  } finally {
    await rm(ordner, { recursive: true, force: true });
  }
});
