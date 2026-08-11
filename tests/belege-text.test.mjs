// tests/belege-text.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { planZwillinge, planAufraeumen, istLeer, seitenZahl, markerText, MARKER_KOPF, GELESEN_KOPF, extrahiere, main } from "../app/tools/belege-text.mjs";

const execFileAsync = promisify(execFile);
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const PROBE_PDF = new URL("./fixtures/textzwilling-probe.pdf", import.meta.url);

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
      { pfad: "Belege/2025/Versicherungen/scan.txt", hash: "ccc", kopf: `${GELESEN_KOPF}, 2026-08-11.` },
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
  // bleiben, auch wenn er ein Umlaut in NFD-Zerlegung enthaelt: Der Pfad wird
  // in planAufraeumen nie normalisiert, weil er dort nie als Vergleichsschluessel
  // dient — das ist allein der Hash, und ein SHA-256-Hex-String hat nichts,
  // das sich normalisieren liesse.
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

test("istLeer erkennt einen Bildscan-Extrakt aus reinen Form-Feeds", () => {
  // Der Bestandsfall: die drei MusterversicherungA-Belege liefern exakt "\f\f" bzw "\f\f\f".
  assert.equal(istLeer("\f\f"), true);
  assert.equal(istLeer(""), true);
  assert.equal(istLeer("   \n\n \f "), true);
  assert.equal(istLeer("MusterversicherungA\f"), false);
});

test("seitenZahl zaehlt Form-Feeds — pdftotext setzt einen pro Seite", () => {
  assert.equal(seitenZahl("\f\f"), 2);
  assert.equal(seitenZahl("\f\f\f"), 3);
  assert.equal(seitenZahl("Text ohne Seitenwechsel"), 0);
});

test("markerText schreibt die vereinbarte Kopfzeile", () => {
  assert.equal(markerText(2), "# Kein Textlayer — Bildscan, 2 Seiten. Inhalt nur im PDF.\n");
  assert.ok(markerText(2).startsWith(MARKER_KOPF), "der Marker muss von planZwillinge wiedererkannt werden");
});

test("extrahiere (stdout) liefert exakt die Bytes, die pdftotext auch in eine Datei schreiben wuerde", async () => {
  // Das ist die eigentliche Voraussetzung fuer den Hash-Abgleich in planAufraeumen:
  // inbox.mjs erzeugt den Staging-Vorlauf per Datei-Ausgabe, belege-text.mjs den
  // Zwilling per Stdout + JS-String-Umweg. Weichen die Bytes irgendwo ab (BOM,
  // Zeilenende, Encoding), findet der Hash-Abgleich nie mehr einen Treffer —
  // und das faellt niemandem auf, weil "kein Treffer" wie "noch nicht abgelegt" aussieht.
  const viaStdout = await extrahiere(PROBE_PDF);

  const tempDir = await mkdtemp(join(tmpdir(), "belege-text-roundtrip-"));
  try {
    const outFile = join(tempDir, "out.txt");
    await execFileAsync("pdftotext", ["-layout", fileURLToPath(PROBE_PDF), outFile]);
    const viaDatei = await readFile(outFile);

    assert.equal(
      sha256(Buffer.from(viaStdout, "utf8")),
      sha256(viaDatei),
      "Stdout-Extrakt (nach utf8-Hin-und-Rueckwandlung) und Datei-Ausgabe muessen denselben Hash ergeben"
    );

    // Ohne diese Zusicherung koennte der Test auch dann gruen bleiben, wenn
    // beide Seiten identisch kaputt sind (z.B. beide liefern nur "?" statt Umlaute).
    assert.match(viaStdout, /[äöüßÄÖÜ]/, "das Extrakt muss die Umlaute der Fixture enthalten");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("main() erzeugt den Zwilling und raeumt Staging ausschliesslich im injizierten Tempverzeichnis auf", async () => {
  const wurzel = await mkdtemp(join(tmpdir(), "belege-text-main-"));
  const wurzelUrl = pathToFileURL(`${wurzel}/`);
  const belegeRoot = new URL("Belege/", wurzelUrl);
  const stagingRoot = new URL("standardized/", wurzelUrl);

  await mkdir(fileURLToPath(belegeRoot), { recursive: true });
  await mkdir(fileURLToPath(stagingRoot), { recursive: true });
  await copyFile(fileURLToPath(PROBE_PDF), fileURLToPath(new URL("probe.pdf", belegeRoot)));

  const erwarteterText = await extrahiere(PROBE_PDF);

  // Ein Staging-Vorlauf, dessen Inhalt exakt dem kuenftigen Zwilling entspricht...
  await writeFile(new URL("passend.txt", stagingRoot), erwarteterText, "utf8");
  // ...und einer ohne jeden Treffer, der deshalb liegen bleiben muss.
  await writeFile(new URL("unpassend.txt", stagingRoot), "Voellig anderer Inhalt ohne Treffer.", "utf8");

  const originalLog = console.log;
  console.log = () => {};
  try {
    const bericht = await main({ belegeRoot, stagingRoot, schreiben: true });

    const zwilling = await readFile(new URL("probe.txt", belegeRoot));
    assert.equal(zwilling.toString("utf8"), erwarteterText, "der Zwilling muss byte-identisch zum Extrakt sein");

    assert.deepEqual(bericht.geloescht.map((e) => e.name), ["passend.txt"]);
    assert.deepEqual(bericht.offen.map((e) => e.ort), ["unpassend.txt"]);

    await assert.rejects(readFile(new URL("passend.txt", stagingRoot)), "passend.txt muss geloescht sein");
    await assert.doesNotReject(readFile(new URL("unpassend.txt", stagingRoot)), "unpassend.txt darf nicht angetastet werden");
  } finally {
    console.log = originalLog;
    await rm(wurzel, { recursive: true, force: true });
  }
});
