import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import * as immobilienTool from "../app/tools/transaktion-immobilie.mjs";
import { loadMasterData } from "../app/tools/validator.mjs";

const { aktualisiereImmobilienbezug } = immobilienTool;

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

function tempFixture() {
  const temp = mkdtempSync(join(tmpdir(), "transaktion-immobilie-"));
  cpSync("tests/fixtures/master-valid", temp, { recursive: true });
  const txPath = join(temp, "transaktionen.jsonl");
  const [fixtureTx] = readFileSync(txPath, "utf8").trim().split(/\r?\n/).map(JSON.parse);
  delete fixtureTx.immobilie_id;
  writeFileSync(txPath, `${JSON.stringify(fixtureTx)}\n`);
  return {
    temp,
    txPath,
    logPath: join(temp, "agent_log.jsonl"),
    fixtureTx,
    dataRoot: new URL("./", pathToFileURL(txPath)),
  };
}

function tempArtefakte(temp) {
  return readdirSync(temp).filter((name) => name.startsWith(".transaktion-immobilie-"));
}

function logEntry(transaktionId) {
  return {
    zeitpunkt: "2026-08-12T12:00:00.000Z",
    anlass: "transaktion-immobilie",
    inputs: ["transaktionen.jsonl", "immobilien.json"],
    anzahl_importiert: 0,
    anzahl_offen: 0,
    anzahl_fehler: 0,
    immobilienbezuege_gesetzt: 1,
    immobilienbezuege_entfernt: 0,
    notiz: "Testlauf",
    betroffene_ids: [transaktionId],
  };
}

async function persistenzFall(fixture, persistenz) {
  const data = await loadMasterData(fixture.dataRoot);
  const out = aktualisiereImmobilienbezug({
    transaktionen: data.transaktionen,
    immobilien: data.immobilien,
    ids: [fixture.fixtureTx.transaktion_id],
    immobilieId: "IMM-001",
  });
  return immobilienTool.persistiereImmobilienbezug({
    dataRoot: fixture.dataRoot,
    data,
    transaktionen: out.transaktionen,
    logEntry: logEntry(fixture.fixtureTx.transaktion_id),
    persistenz,
  });
}

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

test("Stage-Schreibfehler laesst Transaktionen und Log unveraendert und raeumt auf", async () => {
  const fixture = tempFixture();
  try {
    const beforeTx = readFileSync(fixture.txPath, "utf8");
    const persistenz = {
      ...immobilienTool.dateiPersistenz,
      schreibeStage: async (url, inhalt, rolle) => {
        if (rolle === "transaktionen-stage") throw new Error("injizierter Schreibfehler");
        return immobilienTool.dateiPersistenz.schreibeStage(url, inhalt, rolle);
      },
    };

    await assert.rejects(() => persistenzFall(fixture, persistenz), /injizierter Schreibfehler/);
    assert.equal(readFileSync(fixture.txPath, "utf8"), beforeTx);
    assert.equal(existsSync(fixture.logPath), false);
    assert.deepEqual(tempArtefakte(fixture.temp), []);
  } finally {
    rmSync(fixture.temp, { recursive: true, force: true });
  }
});

test("ungueltige Stage-Bytes blockieren vor dem Rename und lassen keine Artefakte zurueck", async () => {
  const fixture = tempFixture();
  try {
    const beforeTx = readFileSync(fixture.txPath, "utf8");
    const persistenz = {
      ...immobilienTool.dateiPersistenz,
      schreibeStage: (url, inhalt, rolle) => immobilienTool.dateiPersistenz.schreibeStage(
        url,
        rolle === "transaktionen-stage" ? "{}\n" : inhalt,
        rolle,
      ),
    };

    await assert.rejects(
      () => persistenzFall(fixture, persistenz),
      /Validierung der temporaeren Transaktionsdatei fehlgeschlagen/,
    );
    assert.equal(readFileSync(fixture.txPath, "utf8"), beforeTx);
    assert.equal(existsSync(fixture.logPath), false);
    assert.deepEqual(tempArtefakte(fixture.temp), []);
  } finally {
    rmSync(fixture.temp, { recursive: true, force: true });
  }
});

test("Post-Validierungsfehler nach Datenaustausch rollt vor dem Log zurueck", async () => {
  const fixture = tempFixture();
  try {
    const beforeTx = readFileSync(fixture.txPath, "utf8");
    const persistenz = {
      ...immobilienTool.dateiPersistenz,
      validiere: (data, phase) => phase === "nach-datenaustausch"
        ? { valid: false, errors: ["injizierter Post-Validierungsfehler"] }
        : immobilienTool.dateiPersistenz.validiere(data, phase),
    };

    await assert.rejects(
      () => persistenzFall(fixture, persistenz),
      /Validierung nach Datenaustausch fehlgeschlagen.*injizierter Post-Validierungsfehler/s,
    );
    assert.equal(readFileSync(fixture.txPath, "utf8"), beforeTx);
    assert.equal(existsSync(fixture.logPath), false);
    assert.deepEqual(tempArtefakte(fixture.temp), []);
  } finally {
    rmSync(fixture.temp, { recursive: true, force: true });
  }
});

test("Logfehler nach Datenaustausch rollt Transaktionen und vollstaendigen Log zurueck", async () => {
  const fixture = tempFixture();
  try {
    const alterLog = `${JSON.stringify({ zeitpunkt: "2026-08-11T10:00:00.000Z", anlass: "bestand" })}\n`;
    writeFileSync(fixture.logPath, alterLog);
    const beforeTx = readFileSync(fixture.txPath, "utf8");
    const persistenz = {
      ...immobilienTool.dateiPersistenz,
      benenneUm: async (von, nach, rolle) => {
        if (rolle === "log-commit") throw new Error("injizierter Logfehler");
        return immobilienTool.dateiPersistenz.benenneUm(von, nach, rolle);
      },
    };

    await assert.rejects(() => persistenzFall(fixture, persistenz), /injizierter Logfehler/);
    assert.equal(readFileSync(fixture.txPath, "utf8"), beforeTx);
    assert.equal(readFileSync(fixture.logPath, "utf8"), alterLog);
    assert.doesNotThrow(() => readFileSync(fixture.logPath, "utf8").trim().split(/\r?\n/).map(JSON.parse));
    assert.deepEqual(tempArtefakte(fixture.temp), []);
  } finally {
    rmSync(fixture.temp, { recursive: true, force: true });
  }
});

test("gescheiterter Transaktions-Rollback behaelt das Recovery-Backup und meldet seinen Pfad", async () => {
  const fixture = tempFixture();
  try {
    const beforeTx = readFileSync(fixture.txPath, "utf8");
    const persistenz = {
      ...immobilienTool.dateiPersistenz,
      validiere: (data, phase) => phase === "nach-datenaustausch"
        ? { valid: false, errors: ["injizierter Primaerfehler"] }
        : immobilienTool.dateiPersistenz.validiere(data, phase),
      benenneUm: async (von, nach, rolle) => {
        if (rolle === "transaktionen-rollback") throw new Error("injizierter Rollbackfehler");
        return immobilienTool.dateiPersistenz.benenneUm(von, nach, rolle);
      },
    };

    let fehler;
    try {
      await persistenzFall(fixture, persistenz);
    } catch (error) {
      fehler = error;
    }

    assert.ok(fehler instanceof AggregateError);
    assert.match(fehler.message, /injizierter Primaerfehler/);
    const artefakte = tempArtefakte(fixture.temp);
    assert.equal(artefakte.length, 1);
    assert.match(artefakte[0], /-transaktionen-backup\.tmp$/);
    const backupPath = join(fixture.temp, artefakte[0]);
    assert.equal(readFileSync(backupPath, "utf8"), beforeTx);
    assert.deepEqual(fehler.recoveryPfade, [backupPath]);
    assert.match(fehler.message, new RegExp(backupPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    rmSync(fixture.temp, { recursive: true, force: true });
  }
});

test("gescheiterter Log-Rollback behaelt nur das alte Log als Recovery-Backup", async () => {
  const fixture = tempFixture();
  try {
    const alterLog = `${JSON.stringify({ zeitpunkt: "2026-08-11T10:00:00.000Z", anlass: "bestand" })}\n`;
    writeFileSync(fixture.logPath, alterLog);
    const persistenz = {
      ...immobilienTool.dateiPersistenz,
      benenneUm: async (von, nach, rolle) => {
        if (rolle === "log-rollback") throw new Error("injizierter Log-Rollbackfehler");
        return immobilienTool.dateiPersistenz.benenneUm(von, nach, rolle);
      },
      synchronisiereVerzeichnis: async (url, rolle) => {
        if (rolle === "nach-commit") throw new Error("injizierter Primaerfehler nach Log-Commit");
        return immobilienTool.dateiPersistenz.synchronisiereVerzeichnis(url, rolle);
      },
    };

    let fehler;
    try {
      await persistenzFall(fixture, persistenz);
    } catch (error) {
      fehler = error;
    }

    assert.ok(fehler instanceof AggregateError);
    const artefakte = tempArtefakte(fixture.temp);
    assert.equal(artefakte.length, 1);
    assert.match(artefakte[0], /-log-backup\.tmp$/);
    const backupPath = join(fixture.temp, artefakte[0]);
    assert.equal(readFileSync(backupPath, "utf8"), alterLog);
    assert.deepEqual(fehler.recoveryPfade, [backupPath]);
    assert.match(fehler.message, new RegExp(backupPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    rmSync(fixture.temp, { recursive: true, force: true });
  }
});
