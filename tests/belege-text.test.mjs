// tests/belege-text.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { planZwillinge, MARKER_KOPF, GELESEN_KOPF } from "../app/tools/belege-text.mjs";

test("PDF ohne Zwilling steht im Erzeugungsplan", () => {
  const plan = planZwillinge({ belege: [{ pfad: "Belege/2025/Rente/a.pdf" }] });
  assert.deepEqual(plan.erzeugen, [{ pdf: "Belege/2025/Rente/a.pdf", ziel: "Belege/2025/Rente/a.txt" }]);
  assert.deepEqual(plan.offen, []);
});

test("PDF mit vorhandenem Zwilling wird nicht neu erzeugt", () => {
  const plan = planZwillinge({
    belege: [
      { pfad: "Belege/2025/Rente/a.pdf" },
      { pfad: "Belege/2025/Rente/a.txt", hash: "aaa", kopf: "MusterversicherungA Vertrag" },
    ],
  });
  assert.deepEqual(plan.erzeugen, []);
  assert.deepEqual(plan.offen, []);
});

test("CSV unter Belege bekommt keinen Zwilling", () => {
  const plan = planZwillinge({ belege: [{ pfad: "Belege/Kontoauszuege/KTO-001/x.csv" }] });
  assert.deepEqual(plan.erzeugen, []);
  assert.deepEqual(plan.offen, []);
});

test("Marker-Zwilling wird bei jedem Lauf als offene OCR gemeldet", () => {
  const plan = planZwillinge({
    belege: [
      { pfad: "Belege/2025/Versicherungen/scan.pdf" },
      { pfad: "Belege/2025/Versicherungen/scan.txt", hash: "bbb", kopf: `${MARKER_KOPF} — Bildscan, 2 Seiten. Inhalt nur im PDF.` },
    ],
  });
  assert.deepEqual(plan.erzeugen, [], "der Marker zaehlt als vorhandener Zwilling");
  assert.deepEqual(plan.offen, [{ ort: "Belege/2025/Versicherungen/scan.txt", grund: "OCR ausstehend" }]);
});

test("vom Agenten gelesener Zwilling gilt als erledigt", () => {
  const plan = planZwillinge({
    belege: [
      { pfad: "Belege/2025/Versicherungen/scan.pdf" },
      { pfad: "Belege/2025/Versicherungen/scan.txt", hash: "ccc", kopf: `${GELESEN_KOPF} 2026-08-11.` },
    ],
  });
  assert.deepEqual(plan.erzeugen, []);
  assert.deepEqual(plan.offen, [], "gelesen ist kein offener Punkt mehr");
});

test("Zwilling ohne zugehoerigen Beleg wird gemeldet, nicht geloescht", () => {
  const plan = planZwillinge({ belege: [{ pfad: "Belege/2025/Rente/verwaist.txt", hash: "ddd", kopf: "irgendwas" }] });
  assert.deepEqual(plan.erzeugen, []);
  assert.deepEqual(plan.offen, [{ ort: "Belege/2025/Rente/verwaist.txt", grund: "Zwilling ohne Beleg" }]);
});

test("Zwilling und Beleg paaren unabhaengig von der Unicode-Normalform", () => {
  // macOS liefert Dateinamen aus readdir in NFD. Ohne Angleichung faende ein
  // NFC-Zwilling sein NFD-PDF nie und der Lauf wuerde ihn doppelt erzeugen.
  const nfc = "Belege/2025/Sonstiges/Grundstück".normalize("NFC");
  const nfd = nfc.normalize("NFD");
  assert.notEqual(nfc, nfd, "Testvoraussetzung: die Normalformen unterscheiden sich");

  const plan = planZwillinge({ belege: [{ pfad: `${nfd}.pdf` }, { pfad: `${nfc}.txt`, hash: "eee", kopf: "Text" }] });
  assert.deepEqual(plan.erzeugen, []);
  assert.deepEqual(plan.offen, []);
});

test("liefert eine stabile, sortierte Reihenfolge fuer reproduzierbare Laeufe", () => {
  const plan = planZwillinge({ belege: [{ pfad: "Belege/b.pdf" }, { pfad: "Belege/a.pdf" }, { pfad: "Belege/c.pdf" }] });
  assert.deepEqual(plan.erzeugen.map((e) => e.pdf), ["Belege/a.pdf", "Belege/b.pdf", "Belege/c.pdf"]);
});

test("PDF in NFD kommt mit original NFD-Pfad im Erzeugungsplan zurück", () => {
  const nfc = "Belege/2025/Sonstiges/Grundstück".normalize("NFC");
  const nfd = nfc.normalize("NFD");
  assert.notEqual(nfc, nfd, "Testvoraussetzung: die Normalformen unterscheiden sich");

  const plan = planZwillinge({ belege: [{ pfad: `${nfd}.pdf` }] });
  assert.equal(plan.erzeugen[0].pdf, `${nfd}.pdf`, "PDF-Pfad sollte original NFD sein, nicht normalisiert zu NFC");
  assert.equal(plan.erzeugen[0].ziel, `${nfd}.txt`, "Ziel sollte von original NFD abgeleitet sein");
});
