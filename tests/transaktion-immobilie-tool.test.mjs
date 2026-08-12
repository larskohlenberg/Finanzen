import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { aktualisiereImmobilienbezug } from "../app/tools/transaktion-immobilie.mjs";

const immobilien = [{ immobilie_id: "IMM-001" }, { immobilie_id: "IMM-002" }];
const tx = (id, over = {}) => ({
  transaktion_id: id,
  konto_id: "KTO-001",
  buchungsdatum: "2026-01-01",
  betrag: "-10.00",
  gegenpartei: "Testfirma",
  verwendungszweck: "Test",
  kategorisierung_status: "bestaetigt",
  kategorie_id: "KAT-001",
  kategorie_herkunft: "manuell",
  ist_transfer: false,
  ...over,
});

test("setzt den Bezug und laesst fachfremde Felder unveraendert", () => {
  const original = tx("TXN-A");
  const out = aktualisiereImmobilienbezug({
    transaktionen: [original],
    immobilien,
    ids: ["TXN-A"],
    immobilieId: "IMM-001",
  });

  assert.equal(out.blockiert, false);
  assert.deepEqual(out.transaktionen[0], { ...original, immobilie_id: "IMM-001" });
  assert.deepEqual(out.report, {
    betroffen: 1,
    gesetzt: 1,
    entfernt: 0,
    unveraendert: 0,
    konflikte: [],
    nicht_gefunden: [],
  });
});

test("identischer Zweitlauf ist idempotent", () => {
  const original = tx("TXN-A", { immobilie_id: "IMM-001" });
  const out = aktualisiereImmobilienbezug({
    transaktionen: [original],
    immobilien,
    ids: ["TXN-A"],
    immobilieId: "IMM-001",
  });

  assert.equal(out.report.unveraendert, 1);
  assert.equal(out.report.gesetzt, 0);
  assert.deepEqual(out.transaktionen, [original]);
});

test("abweichender bestehender Bezug blockiert atomar ohne --ersetzen", () => {
  const a = tx("TXN-A", { immobilie_id: "IMM-002" });
  const b = tx("TXN-B");
  const out = aktualisiereImmobilienbezug({
    transaktionen: [a, b],
    immobilien,
    ids: ["TXN-A", "TXN-B"],
    immobilieId: "IMM-001",
  });

  assert.equal(out.blockiert, true);
  assert.deepEqual(out.report.konflikte, ["TXN-A"]);
  assert.deepEqual(out.transaktionen, [a, b]);
});

test("--ersetzen erlaubt die bewusste Korrektur", () => {
  const out = aktualisiereImmobilienbezug({
    transaktionen: [tx("TXN-A", { immobilie_id: "IMM-002" })],
    immobilien,
    ids: ["TXN-A"],
    immobilieId: "IMM-001",
    ersetzen: true,
  });
  assert.equal(out.blockiert, false);
  assert.equal(out.transaktionen[0].immobilie_id, "IMM-001");
  assert.equal(out.report.gesetzt, 1);
});

test("--entfernen loescht nur immobilie_id", () => {
  const original = tx("TXN-A", { immobilie_id: "IMM-001" });
  const out = aktualisiereImmobilienbezug({
    transaktionen: [original],
    immobilien,
    ids: ["TXN-A"],
    entfernen: true,
  });
  assert.equal(Object.hasOwn(out.transaktionen[0], "immobilie_id"), false);
  assert.equal(out.transaktionen[0].kategorie_id, original.kategorie_id);
  assert.equal(out.report.entfernt, 1);
});

test("unbekannte Transaktions-ID blockiert den gesamten Lauf", () => {
  const original = tx("TXN-A");
  const out = aktualisiereImmobilienbezug({
    transaktionen: [original],
    immobilien,
    ids: ["TXN-A", "TXN-FEHLT"],
    immobilieId: "IMM-001",
  });
  assert.equal(out.blockiert, true);
  assert.deepEqual(out.report.nicht_gefunden, ["TXN-FEHLT"]);
  assert.deepEqual(out.transaktionen, [original]);
});

test("unbekannte Immobilie und widerspruechliche Optionen sind Fehler", () => {
  assert.throws(
    () => aktualisiereImmobilienbezug({
      transaktionen: [tx("TXN-A")],
      immobilien,
      ids: ["TXN-A"],
      immobilieId: "IMM-999",
    }),
    /IMM-999.*existiert nicht/,
  );
  assert.throws(
    () => aktualisiereImmobilienbezug({
      transaktionen: [tx("TXN-A")],
      immobilien,
      ids: ["TXN-A"],
      immobilieId: "IMM-001",
      entfernen: true,
    }),
    /genau eine Aktion/,
  );
});

test("CLI-Vorschau schreibt nichts; --schreiben persistiert, validiert und protokolliert", () => {
  const temp = mkdtempSync(join(tmpdir(), "transaktion-immobilie-"));
  try {
    cpSync("tests/fixtures/master-valid", temp, { recursive: true });
    const txPath = join(temp, "transaktionen.jsonl");
    const [fixtureTx] = readFileSync(txPath, "utf8").trim().split(/\r?\n/).map(JSON.parse);
    delete fixtureTx.immobilie_id;
    writeFileSync(txPath, `${JSON.stringify(fixtureTx)}\n`);
    const before = readFileSync(txPath, "utf8");
    const tool = "app/tools/transaktion-immobilie.mjs";
    const args = [
      tool,
      `--ids=${fixtureTx.transaktion_id}`,
      "--immobilie=IMM-001",
      temp,
    ];

    const preview = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(preview.status, 0, preview.stderr);
    assert.match(preview.stdout, /"modus": "vorschau"/);
    assert.equal(readFileSync(txPath, "utf8"), before);
    assert.equal(existsSync(join(temp, "agent_log.jsonl")), false);

    const write = spawnSync(process.execPath, [...args, "--schreiben"], { encoding: "utf8" });
    assert.equal(write.status, 0, write.stderr);
    const [written] = readFileSync(txPath, "utf8").trim().split(/\r?\n/).map(JSON.parse);
    assert.equal(written.immobilie_id, "IMM-001");
    const log = readFileSync(join(temp, "agent_log.jsonl"), "utf8")
      .trim().split(/\r?\n/).map(JSON.parse);
    assert.equal(log.length, 1);
    assert.equal(log[0].anlass, "transaktion-immobilie");
    assert.deepEqual(log[0].betroffene_ids, [fixtureTx.transaktion_id]);
    assert.equal(log[0].immobilienbezuege_gesetzt, 1);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
