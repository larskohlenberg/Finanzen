// tests/belege-processed.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { planProcessed, main } from "../app/tools/belege-text.mjs";

const PROBE_PDF = new URL("./fixtures/textzwilling-probe.pdf", import.meta.url);

// Baut Belege/ mit einem abgelegten PDF und processed/ mit zwei Rohdateien:
// einer byte-identischen Dublette unter Downloadnamen und einer fremden.
async function baueLauf() {
  const wurzel = await mkdtemp(join(tmpdir(), "belege-processed-"));
  const wurzelUrl = pathToFileURL(`${wurzel}/`);
  const belegeRoot = new URL("Belege/", wurzelUrl);
  const stagingRoot = new URL("standardized/", wurzelUrl);
  const processedRoot = new URL("processed/", wurzelUrl);

  await mkdir(fileURLToPath(belegeRoot), { recursive: true });
  await mkdir(fileURLToPath(stagingRoot), { recursive: true });
  await mkdir(fileURLToPath(processedRoot), { recursive: true });

  await copyFile(fileURLToPath(PROBE_PDF), fileURLToPath(new URL("KTO-999_Musterbank_Kontoauszug_2026-01.pdf", belegeRoot)));
  await copyFile(fileURLToPath(PROBE_PDF), fileURLToPath(new URL("Kontoauszug-4711000815-2026-01.pdf", processedRoot)));
  await writeFile(new URL("nie-abgelegt.pdf", processedRoot), "voellig anderer Inhalt");

  return { wurzel, belegeRoot, stagingRoot, processedRoot };
}

async function existiert(url) {
  try { await readFile(url); return true; } catch { return false; }
}

test("verarbeitete Rohdatei mit Hash-Treffer unter Belege wird geraeumt", () => {
  const plan = planProcessed({
    belege: [{ pfad: "Belege/Kontoauszuege/KTO-002/TESTREF-026.pdf", hash: "5f52" }],
    processed: [{ name: "Kontoauszug-4711000815-2023-01.pdf", hash: "5f52" }],
  });
  assert.deepEqual(plan.loeschen, [{
    name: "Kontoauszug-4711000815-2023-01.pdf",
    grund: "Hash-Treffer: Belege/Kontoauszuege/KTO-002/TESTREF-026.pdf",
  }]);
  assert.deepEqual(plan.offen, []);
});

test("der Dateiname entscheidet nicht — beim Ablegen wird umbenannt", () => {
  // Der Bestandsfall: die Rohdatei traegt den Bank-Downloadnamen, ihr Beleg
  // wurde beim Ablegen sprechend umbenannt. Nur der Inhalt verbindet beide.
  const plan = planProcessed({
    belege: [{ pfad: "Belege/Kontoauszuege/KTO-002/TESTREF-026.pdf", hash: "2bc4" }],
    processed: [{ name: "Kontoauszug-4711000815-2023-01.pdf", hash: "2bc4" }],
  });
  assert.equal(plan.loeschen.length, 1);
  assert.equal(plan.loeschen[0].name, "Kontoauszug-4711000815-2023-01.pdf");
});

test("Rohdatei ohne Hash-Treffer bleibt liegen und wird gemeldet", () => {
  const plan = planProcessed({
    belege: [{ pfad: "Belege/2025/Rente/a.pdf", hash: "aaa" }],
    processed: [{ name: "Umsatzanzeige - MusterbankB.pdf", hash: "zzz" }],
  });
  assert.deepEqual(plan.loeschen, []);
  assert.deepEqual(plan.offen, [{ ort: "Umsatzanzeige - MusterbankB.pdf", grund: "Beleg noch nicht abgelegt" }]);
});

test("ein Textzwilling belegt keine Rohdatei", () => {
  // Der Zwilling ist abgeleitet und jederzeit neu erzeugbar. Wuerde er als
  // Nachweis gelten, koennte die Rohdatei verschwinden, obwohl das Original
  // nie im Archiv angekommen ist.
  const plan = planProcessed({
    belege: [{ pfad: "Belege/2025/Rente/a.txt", hash: "gleich" }],
    processed: [{ name: "irgendwas.pdf", hash: "gleich" }],
  });
  assert.deepEqual(plan.loeschen, []);
  assert.equal(plan.offen.length, 1);
});

test("eine CSV belegt sich selbst — der Nachweis ist nicht auf PDFs beschraenkt", () => {
  // CSVs unter Belege/ bekommen laut agent-context.md bewusst keinen
  // Textzwilling, sie sind bereits Text. Eine Nachweisregel, die nur PDFs
  // gelten liesse, wuerde jede importierte CSV ewig in processed/ halten.
  const plan = planProcessed({
    belege: [{ pfad: "Belege/Kontoauszuege/KTO-001/KTO-001_Musterbank_Umsatzliste.csv", hash: "c5v" }],
    processed: [{ name: "umsatz-export.csv", hash: "c5v" }],
  });
  assert.equal(plan.loeschen.length, 1);
  assert.deepEqual(plan.offen, []);
});

test("eine leere Rohdatei ohne Treffer bleibt liegen", () => {
  // Bewusst anders als planAufraeumen: dort ist ein leerer Textvorlauf ein
  // erwartetes Ergebnis (Bildscan ohne Textebene) und wird geraeumt. Eine
  // leere Rohdatei ist dagegen ein Befund, kein Normalfall — sie zu loeschen
  // wuerde ihn verbergen.
  const plan = planProcessed({
    belege: [],
    processed: [{ name: "leer.pdf", hash: "e3b0" }],
  });
  assert.deepEqual(plan.loeschen, []);
  assert.equal(plan.offen.length, 1);
});

test("bei mehreren Belegen mit gleichem Hash gewinnt der pfad-kleinste", () => {
  // Reproduzierbarkeit: derselbe Bestand muss denselben Bericht ergeben,
  // unabhaengig von der Lesereihenfolge des Dateisystems.
  const plan = planProcessed({
    belege: [
      { pfad: "Belege/2026/Sonstiges/z.pdf", hash: "dup" },
      { pfad: "Belege/2024/Sonstiges/a.pdf", hash: "dup" },
    ],
    processed: [{ name: "roh.pdf", hash: "dup" }],
  });
  assert.equal(plan.loeschen[0].grund, "Hash-Treffer: Belege/2024/Sonstiges/a.pdf");
});

test("ein Verzeichnis-Symlink unter Belege legt den Lauf nicht lahm", async () => {
  // readdir meldet einen Symlink nicht als Verzeichnis, er kommt also als
  // vermeintliche Datei zurueck. Seit jede Datei gehasht wird, laeuft readFile
  // darauf und wuerde mit EISDIR den gesamten Lauf abbrechen — ein einzelner
  // ungewoehnlicher Verzeichniseintrag darf das Werkzeug nicht unbrauchbar
  // machen.
  const { wurzel, belegeRoot, stagingRoot, processedRoot } = await baueLauf();
  await mkdir(fileURLToPath(new URL("ziel/", belegeRoot)), { recursive: true });
  await symlink(fileURLToPath(new URL("ziel/", belegeRoot)), fileURLToPath(new URL("verweis", belegeRoot)));

  const originalLog = console.log;
  console.log = () => {};
  try {
    const bericht = await main({ belegeRoot, stagingRoot, processedRoot });
    assert.ok(
      bericht.geloescht.some((e) => e.name === "Kontoauszug-4711000815-2026-01.pdf"),
      "der Lauf muss trotz des Symlinks zu Ende laufen und die Dublette finden",
    );
  } finally {
    console.log = originalLog;
    await rm(wurzel, { recursive: true, force: true });
  }
});

test("Vorschau ist Default: main() meldet die Dublette, loescht sie aber nicht", async () => {
  // Die wichtigste Eigenschaft einer loeschenden Operation. Ein zu breiter
  // Lauf muss ein Ausdruck auf der Konsole sein, kein Datenverlust.
  const { wurzel, belegeRoot, stagingRoot, processedRoot } = await baueLauf();
  const originalLog = console.log;
  console.log = () => {};
  try {
    const bericht = await main({ belegeRoot, stagingRoot, processedRoot });

    assert.equal(bericht.modus, "vorschau");
    assert.ok(
      bericht.geloescht.some((e) => e.name === "Kontoauszug-4711000815-2026-01.pdf"),
      "die Dublette muss als zu raeumen gemeldet werden",
    );
    assert.ok(
      await existiert(new URL("Kontoauszug-4711000815-2026-01.pdf", processedRoot)),
      "ohne --schreiben darf nichts geloescht werden",
    );
  } finally {
    console.log = originalLog;
    await rm(wurzel, { recursive: true, force: true });
  }
});

test("main() --schreiben raeumt nur die nachgewiesene Dublette und laesst den Rest liegen", async () => {
  const { wurzel, belegeRoot, stagingRoot, processedRoot } = await baueLauf();
  const originalLog = console.log;
  console.log = () => {};
  try {
    const bericht = await main({ belegeRoot, stagingRoot, processedRoot, schreiben: true });

    assert.equal(
      await existiert(new URL("Kontoauszug-4711000815-2026-01.pdf", processedRoot)),
      false,
      "die nachgewiesene Dublette muss verschwinden",
    );
    assert.ok(
      await existiert(new URL("nie-abgelegt.pdf", processedRoot)),
      "eine Rohdatei ohne Nachweis darf nicht angetastet werden",
    );
    assert.ok(
      bericht.offen.some((e) => e.ort === "nie-abgelegt.pdf"),
      "die unbelegte Rohdatei ist der interessante Fall und muss im Bericht stehen",
    );
  } finally {
    console.log = originalLog;
    await rm(wurzel, { recursive: true, force: true });
  }
});
