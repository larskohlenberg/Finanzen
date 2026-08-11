// tests/belege-text.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { planZwillinge, planAufraeumen, MARKER_KOPF, GELESEN_KOPF } from "../app/tools/belege-text.mjs";

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

test("Eingangsarray wird nicht mutiert", () => {
  const belege = [
    { pfad: "Belege/c.pdf" },
    { pfad: "Belege/a.pdf" },
    { pfad: "Belege/b.pdf" }
  ];
  const reihenfolgeVorher = belege.map(b => b.pfad);

  planZwillinge({ belege });

  const reihenfolgeNachher = belege.map(b => b.pfad);
  assert.deepEqual(reihenfolgeNachher, reihenfolgeVorher, "Eingangsarray sollte unveraendert bleiben");
});

test("Textvorlauf mit Hash-Treffer ist redundant und wird geloescht", () => {
  const plan = planAufraeumen({
    zwillinge: [{ pfad: "Belege/Kontoauszuege/KTO-002/TESTREF-026.txt", hash: "5f52" }],
    staging: [{ name: "Kontoauszug-4711000815-2023-01.txt", hash: "5f52", zeichen: 4200 }],
  });
  assert.deepEqual(plan.loeschen, [{
    name: "Kontoauszug-4711000815-2023-01.txt",
    grund: "Hash-Treffer: Belege/Kontoauszuege/KTO-002/TESTREF-026.txt",
  }]);
  assert.deepEqual(plan.offen, []);
});

test("der Name spielt keine Rolle — nur der Inhalt entscheidet", () => {
  // Genau der Bestandsfall: 41 Textvorlaeufe tragen den Bank-Downloadnamen,
  // ihre Belege wurden beim Ablegen sprechend umbenannt.
  const plan = planAufraeumen({
    zwillinge: [{ pfad: "Belege/2026/Rente/2026_DRV-Bund_Altersrente_Rentenauskunft_12-345678-A-000.txt", hash: "2bc4" }],
    staging: [{ name: "Rentenauskunft Altersrente.txt", hash: "2bc4", zeichen: 9100 }],
  });
  assert.equal(plan.loeschen.length, 1);
  assert.equal(plan.loeschen[0].name, "Rentenauskunft Altersrente.txt");
});

test("Textvorlauf ohne Hash-Treffer bleibt liegen und wird gemeldet", () => {
  const plan = planAufraeumen({
    zwillinge: [{ pfad: "Belege/2025/Rente/a.txt", hash: "aaa" }],
    staging: [{ name: "Umsatzanzeige - MusterbankB.txt", hash: "zzz", zeichen: 5000 }],
  });
  assert.deepEqual(plan.loeschen, []);
  assert.deepEqual(plan.offen, [{ ort: "Umsatzanzeige - MusterbankB.txt", grund: "Beleg noch nicht abgelegt" }]);
});

test("leerer Textvorlauf wird immer geraeumt, auch ohne Hash-Treffer", () => {
  // Der Extrakt eines Bildscans besteht nur aus Form-Feeds. Er traegt keine
  // Information, findet nie einen Partner und bliebe sonst ewig als
  // vermeintlich offener Punkt liegen.
  const plan = planAufraeumen({
    zwillinge: [],
    staging: [{ name: "2025_MusterversicherungA_Testversicherung_Vertrag_A_Nachtrag_TEST-VERTRAG-001.txt", hash: "leer3", zeichen: 0 }],
  });
  assert.deepEqual(plan.loeschen, [{
    name: "2025_MusterversicherungA_Testversicherung_Vertrag_A_Nachtrag_TEST-VERTRAG-001.txt",
    grund: "leerer Textvorlauf",
  }]);
  assert.deepEqual(plan.offen, []);
});

test("leerer Vorlauf gewinnt gegen einen Hash-Treffer und meldet den einfachen Grund", () => {
  const plan = planAufraeumen({
    zwillinge: [{ pfad: "Belege/2025/Versicherungen/scan.txt", hash: "leer2" }],
    staging: [{ name: "scan.txt", hash: "leer2", zeichen: 0 }],
  });
  assert.deepEqual(plan.loeschen, [{ name: "scan.txt", grund: "leerer Textvorlauf" }]);
});

test("liefert eine stabile, sortierte Reihenfolge", () => {
  const plan = planAufraeumen({
    zwillinge: [],
    staging: [
      { name: "c.txt", hash: "c", zeichen: 5 },
      { name: "a.txt", hash: "a", zeichen: 5 },
      { name: "b.txt", hash: "b", zeichen: 5 },
    ],
  });
  assert.deepEqual(plan.offen.map((eintrag) => eintrag.ort), ["a.txt", "b.txt", "c.txt"]);
});

test("Hash-Treffer kommt mit original NFD-Pfad im Grund zurück", () => {
  // macOS liefert Dateinamen in NFD. Der Pfad sollte im grund unveraendert
  // bleiben, auch wenn er ein Umlaut in NFD-Zerlegung enthaelt. Nur der Hash
  // ist ein Vergleichsschluessel und wird normalisiert.
  const nfc = "Belege/2025/Sonstiges/Grundstück.txt".normalize("NFC");
  const nfd = nfc.normalize("NFD");
  assert.notEqual(nfc, nfd, "Testvoraussetzung: die Normalformen unterscheiden sich");

  const plan = planAufraeumen({
    zwillinge: [{ pfad: nfd, hash: "treffer123" }],
    staging: [{ name: "Grundstueck-staging.txt", hash: "treffer123", zeichen: 5000 }],
  });
  assert.equal(plan.loeschen.length, 1);
  assert.equal(plan.loeschen[0].grund, `Hash-Treffer: ${nfd}`, "grund sollte original NFD-Pfad enthalten, nicht NFC-normalisiert");
  assert.equal(plan.offen.length, 0);
});
