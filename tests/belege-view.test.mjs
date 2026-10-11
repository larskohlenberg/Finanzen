// tests/belege-view.test.mjs
// Dokumente-Ansicht gegen eine gestubbte /api/belege-Antwort: Baum, Liste,
// Zwillinge, Suche, Detail mit Zusammenfassung und Links, API-Ausfall.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

let apiAntwort = null;
globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.window = globalThis;
globalThis.fetch = async (path) => {
  const cleanPath = String(path).replace(/^\.\//, "").replace(/\?.*$/, "");
  if (cleanPath === "api/belege") {
    if (!apiAntwort) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, json: async () => apiAntwort };
  }
  const body = readFileSync(new URL(`../app/${cleanPath}`, import.meta.url), "utf8");
  return { ok: true, json: async () => JSON.parse(body), text: async () => body };
};
await import("../app/i18n.js");

const { data, state } = await import("../app/runtime.mjs");
const view = await import("../app/views/belege.mjs");

const PDF = "Belege/Kontoauszuege/KTO-001/auszug_2026-01.pdf";
const CSV = "Belege/Kontoauszuege/KTO-001/umsaetze_2026-01.csv";
const SCAN = "Belege/2025/Rente/<scan>.pdf";

const kontoId = data.konten[0].konto_id;
data.transaktionen.push(
  { transaktion_id: "TXN-V1", konto_id: kontoId, buchungsdatum: "2026-01-03", betrag: "-1.00", rohquelle: CSV },
  { transaktion_id: "TXN-V2", konto_id: kontoId, buchungsdatum: "2026-01-28", betrag: "-2.00", rohquelle: CSV },
);
const runtime = await import("../app/runtime.mjs");
for (const tx of data.transaktionen.slice(-2)) runtime.transaktionenById.set(tx.transaktion_id, tx);
data.zeitwerte.push({ entitaet: "konto", entitaet_id: kontoId, feld: "kontostand", wert: "1.00", standdatum: "2026-01-31", qualitaet: "belegt", quelle_hinweis: `Auszug ${PDF}` });

const ISO = "2026-02-01T10:00:00.000Z";
apiAntwort = {
  dateien: [
    { pfad: SCAN, groesse: 10, geaendert: ISO, typ: "pdf" },
    { pfad: "Belege/2025/Rente/<scan>.txt", groesse: 5, geaendert: ISO, typ: "txt", ocrAusstehend: true },
    { pfad: PDF, groesse: 2048, geaendert: ISO, typ: "pdf" },
    { pfad: "Belege/Kontoauszuege/KTO-001/auszug_2026-01.txt", groesse: 99, geaendert: ISO, typ: "txt" },
    { pfad: CSV, groesse: 300, geaendert: ISO, typ: "csv" },
  ],
};
await view.ladeBelege(() => {});

test("Wurzel: Baum mit Anzahl ohne Textzwillinge, keine Rohnamen unescaped", () => {
  state.selectedBeleg = "";
  const html = view.renderBelege();
  assert.match(html, /role="tree"/);
  assert.match(html, /data-beleg="Belege\/Kontoauszuege"/);
  assert.match(html, /belege-anzahl">3</, "Wurzel zaehlt 3 Dateien ohne Zwillinge");
  assert.doesNotMatch(html, /<scan>/);
  assert.match(html, /belege-ordnerzeile/, "Unterordner stehen in der Liste");
});

test("Ordner zeigt Dateien mit Textstatus und Verknuepfungsanzahl", () => {
  state.selectedBeleg = "Belege/Kontoauszuege/KTO-001";
  const html = view.renderBelege();
  assert.match(html, /auszug_2026-01\.pdf/);
  assert.match(html, /umsaetze_2026-01\.csv/);
  assert.doesNotMatch(html, /auszug_2026-01\.txt/);
  assert.match(html, /durchsuchbar/);
  assert.match(html, /data-beleg-sort="verknuepft"/);
  view.setBelegeZwillinge(true);
  assert.match(view.renderBelege(), /auszug_2026-01\.txt/);
  view.setBelegeZwillinge(false);
});

test("Suche filtert ueber alle Ordner", () => {
  state.selectedBeleg = "";
  view.setBelegeSuche("scan");
  const html = view.renderBelege();
  assert.match(html, /&lt;scan&gt;\.pdf/);
  assert.doesNotMatch(html, /umsaetze_2026-01\.csv<\/span>/);
  assert.match(html, /OCR ausstehend/);
  view.setBelegeSuche("");
});

test("Detail: Transaktionen nur als Zusammenfassung mit Filter-Link", () => {
  state.selectedBeleg = CSV;
  const html = view.renderBelege();
  assert.match(html, /Quelle für 2 Buchungen/);
  assert.match(html, /href="#\/transaktionen\/dokument\/Kontoauszuege\/KTO-001\/umsaetze_2026-01\.csv"/);
  assert.match(html, /href="Belege\/Kontoauszuege\/KTO-001\/umsaetze_2026-01\.csv" target="_blank" rel="noopener"/);
  assert.match(html, /download="umsaetze_2026-01\.csv"/);
  assert.doesNotMatch(html, /TXN-V1/, "keine Einzelbuchungen");
  assert.doesNotMatch(html, /\bBeleg\b/);
});

test("Detail: andere Datensaetze einzeln mit Detailroute", () => {
  state.selectedBeleg = PDF;
  const html = view.renderBelege();
  assert.match(html, /Verknüpfte Datensätze/);
  assert.match(html, new RegExp(`href="#/vermoegen/konto:${kontoId}"`));
  assert.match(html, /Textzwilling/);
});

test("Ohne App-Server: freundlicher Hinweis statt Fehler", async () => {
  apiAntwort = null;
  await view.ladeBelege(() => {});
  assert.match(view.renderBelege(), /App-Server/);
});

test("Bilder: Typ Bild, Textzwilling per OCR, Oeffnen und Herunterladen", async () => {
  apiAntwort = {
    dateien: [
      { pfad: "Belege/2026/Sonstiges/quittung.jpg", groesse: 1000, geaendert: ISO, typ: "jpg" },
      { pfad: "Belege/2026/Sonstiges/quittung.txt", groesse: 50, geaendert: ISO, typ: "txt" },
      { pfad: "Belege/2026/Sonstiges/foto.png", groesse: 1000, geaendert: ISO, typ: "png" },
      { pfad: "Belege/2026/Sonstiges/foto.txt", groesse: 50, geaendert: ISO, typ: "txt", ocrAusstehend: true },
      { pfad: "Belege/2026/Sonstiges/alt.heic", groesse: 1000, geaendert: ISO, typ: "heic" },
    ],
  };
  await view.ladeBelege(() => {});
  state.selectedBeleg = "Belege/2026/Sonstiges";
  let html = view.renderBelege();
  assert.equal((html.match(/<td>Bild<\/td>/g) ?? []).length, 3, "png, jpg und heic heissen Bild");
  assert.doesNotMatch(html, /quittung\.txt/, "Zwilling eines Bildes ist versteckt");
  assert.match(html, /durchsuchbar/);
  assert.match(html, /OCR ausstehend/);

  state.selectedBeleg = "Belege/2026/Sonstiges/quittung.jpg";
  html = view.renderBelege();
  assert.match(html, /href="Belege\/2026\/Sonstiges\/quittung\.jpg" target="_blank" rel="noopener"/);
  assert.match(html, /download="quittung\.jpg"/);
  assert.match(html, /Textzwilling/);
  state.lang = "en";
  assert.match(view.renderBelege(), /Image/);
  state.lang = "de";
});
