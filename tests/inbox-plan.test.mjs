// tests/inbox-plan.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  betroffeneTransaktionsIds,
  importLaufBericht,
  planInbox,
} from "../app/tools/inbox.mjs";

const profile = [
  { profil_id: "musterbankc-csv", quelle: "csv", dateimuster: "^KtoNr_4711000815_Export", konto_id: "KTO-002" },
  { profil_id: "musterbanka-csv", quelle: "csv", dateimuster: "^MusterbankA_Umsaetze", konto_id: "KTO-001" },
];

test("CSV-Laufbericht behaelt die neu geschriebenen Transaktions-IDs", () => {
  const bericht = importLaufBericht({
    auftrag: { datei: "test.csv", art: "csv" },
    profil: { profil_id: "test-profil" },
    normalized: { eintraege: [{}, {}], fehler: [] },
    result: {
      written: [
        { transaktion_id: "TXN-A", kategorisierung_status: "offen" },
        { transaktion_id: "TXN-B", kategorisierung_status: "vorgeschlagen" },
      ],
      skipped_dedupe: [],
      errors: [],
      transfers_matched: [],
    },
  });

  assert.deepEqual(bericht.geschriebene_ids, ["TXN-A", "TXN-B"]);
  assert.equal(bericht.geschrieben, 2);
});

test("Inbox-Protokoll aggregiert betroffene IDs stabil ueber alle CSV-Laeufe", () => {
  const ids = betroffeneTransaktionsIds([
    { art: "pdf-text" },
    { art: "csv", geschriebene_ids: ["TXN-A", "TXN-B"] },
    { art: "csv", geschriebene_ids: [] },
    { art: "csv", geschriebene_ids: ["TXN-C"] },
  ]);
  assert.deepEqual(ids, ["TXN-A", "TXN-B", "TXN-C"]);
});

test("ordnet eine Datei ihrem Profil per dateimuster zu", () => {
  const plan = planInbox({ dateien: ["KtoNr_4711000815_Export_Umsaetze_20260608.csv"], profile });
  assert.equal(plan.auftraege.length, 1);
  assert.equal(plan.auftraege[0].profil_id, "musterbankc-csv");
  assert.equal(plan.auftraege[0].art, "csv");
});

test("zwei passende Profile sind ein Fehler, keine Reihenfolge-Entscheidung", () => {
  const doppelt = [...profile, { profil_id: "zweit", quelle: "csv", dateimuster: "Export", konto_id: "KTO-003" }];
  const plan = planInbox({ dateien: ["KtoNr_4711000815_Export_x.csv"], profile: doppelt });
  assert.deepEqual(plan.auftraege, []);
  assert.match(plan.offen[0].grund, /mehrdeutig/i);
  assert.match(plan.offen[0].grund, /musterbankc-csv/);
});

test("CSV ohne passendes Profil bleibt offen statt geraten zu werden", () => {
  const plan = planInbox({ dateien: ["Fremdbank_export.csv"], profile });
  assert.deepEqual(plan.auftraege, []);
  assert.match(plan.offen[0].grund, /[Kk]ein Profil/);
});

test("PDF bekommt den Textvorlauf, auch ohne Profil — Zeilenextraktion bleibt Agentenarbeit", () => {
  const plan = planInbox({ dateien: ["Kontoauszug-4711000815-2026-05.pdf"], profile });
  assert.equal(plan.auftraege[0].art, "pdf-text");
  assert.equal(plan.auftraege[0].profil_id, null);
});

test("ignoriert Systemdateien und Ordnermarker", () => {
  const plan = planInbox({ dateien: [".DS_Store", ".gitkeep", "KtoNr_4711000815_Export_a.csv"], profile });
  assert.equal(plan.auftraege.length, 1);
  assert.deepEqual(plan.offen, []);
});

test("liefert eine stabile, sortierte Reihenfolge fuer reproduzierbare Laeufe", () => {
  const plan = planInbox({ dateien: ["b.pdf", "a.pdf", "c.pdf"], profile });
  assert.deepEqual(plan.auftraege.map((a) => a.datei), ["a.pdf", "b.pdf", "c.pdf"]);
});

test("Umlaut-Dateinamen treffen ihr Profil unabhaengig von der Unicode-Normalform", () => {
  // macOS liefert Dateinamen aus readdir in NFD ("a" + kombinierendes Trema),
  // ein von Hand geschriebenes Profil traegt NFC ("ä"). Ohne Angleichung
  // findet das Muster seine Datei nie — und der Lauf meldet stillschweigend
  // "kein Profil" statt zu importieren.
  const nfc = "KtoNr_4711000815_Export_Umsätze_20260608.csv".normalize("NFC");
  const nfd = nfc.normalize("NFD");
  const mitUmlaut = [{ profil_id: "musterbankc-csv", quelle: "csv", dateimuster: "^KtoNr_4711000815_Export_Umsätze.*\\.csv$", konto_id: "KTO-002" }];

  assert.notEqual(nfc, nfd, "Testvoraussetzung: die beiden Normalformen unterscheiden sich");
  for (const [form, datei] of [["NFC", nfc], ["NFD", nfd]]) {
    const plan = planInbox({ dateien: [datei], profile: mitUmlaut });
    assert.equal(plan.auftraege.length, 1, `${form}: Datei muss ihr Profil finden`);
    assert.equal(plan.auftraege[0].profil_id, "musterbankc-csv");
  }
});

test("unbekannte Dateiendung landet nachvollziehbar im Offen-Topf", () => {
  const plan = planInbox({ dateien: ["notiz.txt"], profile });
  assert.deepEqual(plan.auftraege, []);
  assert.match(plan.offen[0].grund, /Dateityp/);
});

test("Unterordner mit verarbeitbaren Dateien wird gemeldet statt still uebersehen", () => {
  // Ein Bankdownload landet als Ordner in der Inbox. Der flache Lauf sieht ihn
  // nicht — dann sieht der Eingang leer aus, obwohl 42 Auszuege darin liegen.
  const dateien = Array.from({ length: 42 }, (_, i) => `Kontoauszug-${String(i).padStart(2, "0")}.pdf`);
  const plan = planInbox({
    dateien: [],
    unterordner: [{ name: "Kontoauszuege", dateien }],
    profile,
  });

  assert.deepEqual(plan.unterordner, [{ ordner: "Kontoauszuege", dateien: 42 }]);
});

test("Pipeline-Ordner melden sich nicht — sie sind das Ziel, nicht der Eingang", () => {
  const plan = planInbox({
    dateien: [],
    unterordner: [
      { name: "processed", dateien: ["alt.csv"] },
      { name: "standardized", dateien: ["alt.txt", "vorlauf.pdf"] },
      { name: "error", dateien: ["kaputt.csv"] },
    ],
    profile,
  });

  assert.deepEqual(plan.unterordner, []);
});

test("Unterordner ohne verarbeitbare Datei schweigt — nur CSV und PDF sind Buchungsquellen", () => {
  const plan = planInbox({
    dateien: [],
    unterordner: [{ name: "Notizen", dateien: ["merkzettel.txt", ".DS_Store", "bild.png"] }],
    profile,
  });

  assert.deepEqual(plan.unterordner, []);
});

test("zaehlt verschachtelte Dateien mit und meldet den Ordnernamen in NFC", () => {
  // macOS liefert Ordnernamen aus readdir in NFD. Ungeglaettet steht im Bericht
  // ein Name, den der Nutzer so nicht wiederfindet — siehe planInbox oben.
  const nfc = "Kontoauszüge".normalize("NFC");
  assert.notEqual(nfc, nfc.normalize("NFD"), "Testvoraussetzung: die Normalformen unterscheiden sich");

  const plan = planInbox({
    dateien: [],
    unterordner: [{ name: nfc.normalize("NFD"), dateien: ["a.pdf", "2024/Konto/b.pdf", "2024/notiz.txt"] }],
    profile,
  });

  assert.deepEqual(plan.unterordner, [{ ordner: nfc, dateien: 2 }]);
});
