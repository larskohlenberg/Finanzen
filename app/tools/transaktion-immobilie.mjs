import { randomUUID } from "node:crypto";
import { open, readFile, rename, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dataRootFromArg } from "./data-root.mjs";
import { loadMasterData, validateMasterData } from "./validator.mjs";

export function aktualisiereImmobilienbezug({
  transaktionen,
  immobilien,
  ids,
  immobilieId,
  entfernen = false,
  ersetzen = false,
}) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error("ids ist Pflicht");
  }
  if (Boolean(immobilieId) === Boolean(entfernen)) {
    throw new Error("genau eine Aktion angeben: --immobilie oder --entfernen");
  }
  if (entfernen && ersetzen) {
    throw new Error("--ersetzen ist nur zusammen mit --immobilie erlaubt");
  }
  if (immobilieId && !(immobilien ?? []).some((imm) => imm.immobilie_id === immobilieId)) {
    throw new Error(`immobilie_id ${immobilieId} existiert nicht`);
  }

  const gesucht = [...new Set(ids)];
  const byId = new Map(transaktionen.map((entry) => [entry.transaktion_id, entry]));
  const nichtGefunden = gesucht.filter((id) => !byId.has(id));
  const konflikte = entfernen || ersetzen
    ? []
    : gesucht.filter((id) => {
        const current = byId.get(id)?.immobilie_id;
        return current && current !== immobilieId;
      });
  const report = {
    betroffen: gesucht.length - nichtGefunden.length,
    gesetzt: 0,
    entfernt: 0,
    unveraendert: 0,
    konflikte,
    nicht_gefunden: nichtGefunden,
  };

  if (nichtGefunden.length || konflikte.length) {
    return { transaktionen, report, blockiert: true };
  }

  const ziel = new Set(gesucht);
  const next = transaktionen.map((entry) => {
    if (!ziel.has(entry.transaktion_id)) return entry;
    if (entfernen) {
      if (!Object.hasOwn(entry, "immobilie_id")) {
        report.unveraendert += 1;
        return entry;
      }
      const copy = { ...entry };
      delete copy.immobilie_id;
      report.entfernt += 1;
      return copy;
    }
    if (entry.immobilie_id === immobilieId) {
      report.unveraendert += 1;
      return entry;
    }
    report.gesetzt += 1;
    return { ...entry, immobilie_id: immobilieId };
  });

  return { transaktionen: next, report, blockiert: false };
}

export const dateiPersistenz = {
  lese(url) {
    return readFile(url, "utf8");
  },
  async schreibeStage(url, inhalt) {
    const handle = await open(url, "wx", 0o600);
    try {
      await handle.writeFile(inhalt, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  },
  benenneUm(von, nach) {
    return rename(von, nach);
  },
  async entferne(url) {
    try {
      await unlink(url);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  },
  async synchronisiereVerzeichnis(url) {
    const handle = await open(url, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  },
  validiere(data) {
    return validateMasterData(data);
  },
};

function temporaerePfade(dataRoot) {
  const lauf = `${process.pid}-${randomUUID()}`;
  const pfad = (rolle) => new URL(`.transaktion-immobilie-${lauf}-${rolle}.tmp`, dataRoot);
  return {
    transaktionenStage: pfad("transaktionen-stage"),
    transaktionenBackup: pfad("transaktionen-backup"),
    logStage: pfad("log-stage"),
    logBackup: pfad("log-backup"),
  };
}

function parseJsonl(text, bezeichnung) {
  return text.split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${bezeichnung}, Zeile ${index + 1}: ${error.message}`);
      }
    });
}

function validierungsfehler(prefix, result) {
  if (result.valid) return;
  throw new Error(`${prefix}:\n${result.errors.join("\n")}`);
}

async function leseOptional(persistenz, url) {
  try {
    return { vorhanden: true, inhalt: await persistenz.lese(url) };
  } catch (error) {
    if (error.code === "ENOENT") return { vorhanden: false, inhalt: "" };
    throw error;
  }
}

async function raeumeTemporaerePfadeAuf(persistenz, pfade, behalten = new Set()) {
  const fehler = [];
  for (const url of Object.values(pfade)) {
    if (behalten.has(url.href)) continue;
    try {
      await persistenz.entferne(url, "temp-aufraeumen");
    } catch (error) {
      fehler.push(error);
    }
  }
  return fehler;
}

async function rollback({
  persistenz,
  dataRoot,
  transaktionenUrl,
  logUrl,
  pfade,
  transaktionenCommitBegonnen,
  logCommitBegonnen,
  logVorhanden,
}) {
  const fehler = [];
  const recoveryPfade = [];
  const behalten = new Set();
  if (logCommitBegonnen) {
    try {
      if (logVorhanden) {
        await persistenz.benenneUm(pfade.logBackup, logUrl, "log-rollback");
      } else {
        await persistenz.entferne(logUrl, "log-rollback");
      }
    } catch (error) {
      fehler.push(error);
      const recoveryPfad = logVorhanden ? pfade.logBackup : logUrl;
      recoveryPfade.push(recoveryPfad);
      if (logVorhanden) behalten.add(pfade.logBackup.href);
    }
  }
  if (transaktionenCommitBegonnen) {
    try {
      await persistenz.benenneUm(
        pfade.transaktionenBackup,
        transaktionenUrl,
        "transaktionen-rollback",
      );
    } catch (error) {
      fehler.push(error);
      recoveryPfade.push(pfade.transaktionenBackup);
      behalten.add(pfade.transaktionenBackup.href);
    }
  }
  try {
    await persistenz.synchronisiereVerzeichnis(dataRoot, "rollback");
  } catch (error) {
    fehler.push(error);
  }
  return { fehler, recoveryPfade, behalten };
}

function mitRecoveryPfaden(error, recoveryPfade) {
  const dateipfade = recoveryPfade.map((url) => fileURLToPath(url));
  const aggregate = new AggregateError(
    error.errors,
    `${error.message}; Recovery-Dateien: ${dateipfade.join(", ")}`,
  );
  aggregate.recoveryPfade = dateipfade;
  return aggregate;
}

export async function persistiereImmobilienbezug({
  dataRoot,
  data,
  transaktionen,
  logEntry,
  persistenz = dateiPersistenz,
}) {
  const transaktionenUrl = new URL("transaktionen.jsonl", dataRoot);
  const logUrl = new URL("agent_log.jsonl", dataRoot);
  const pfade = temporaerePfade(dataRoot);
  const originalTransaktionen = await persistenz.lese(transaktionenUrl, "transaktionen-original");
  const originalLog = await leseOptional(persistenz, logUrl);
  const transaktionenText = transaktionen.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
  const logPrefix = originalLog.inhalt.length === 0 || originalLog.inhalt.endsWith("\n")
    ? originalLog.inhalt
    : `${originalLog.inhalt}\n`;
  const logText = `${logPrefix}${JSON.stringify(logEntry)}\n`;
  let transaktionenCommitBegonnen = false;
  let logCommitBegonnen = false;
  let hauptfehler;
  let temporaerePfadeBehalten = new Set();

  try {
    validierungsfehler(
      "Validierung vor Schreiben fehlgeschlagen",
      await persistenz.validiere({ ...data, transaktionen }, "vor-schreiben"),
    );

    await persistenz.schreibeStage(
      pfade.transaktionenStage,
      transaktionenText,
      "transaktionen-stage",
    );
    const stageTransaktionen = parseJsonl(
      await persistenz.lese(pfade.transaktionenStage, "transaktionen-stage"),
      "Temporaere Transaktionsdatei ist kein gueltiges JSONL",
    );
    validierungsfehler(
      "Validierung der temporaeren Transaktionsdatei fehlgeschlagen",
      await persistenz.validiere(
        { ...data, transaktionen: stageTransaktionen },
        "transaktionen-stage",
      ),
    );

    await persistenz.schreibeStage(pfade.logStage, logText, "log-stage");
    parseJsonl(
      await persistenz.lese(pfade.logStage, "log-stage"),
      "Temporaere Logdatei ist kein gueltiges JSONL",
    );
    await persistenz.schreibeStage(
      pfade.transaktionenBackup,
      originalTransaktionen,
      "transaktionen-backup",
    );
    if (originalLog.vorhanden) {
      await persistenz.schreibeStage(pfade.logBackup, originalLog.inhalt, "log-backup");
    }
    await persistenz.synchronisiereVerzeichnis(dataRoot, "vor-commit");

    transaktionenCommitBegonnen = true;
    await persistenz.benenneUm(
      pfade.transaktionenStage,
      transaktionenUrl,
      "transaktionen-commit",
    );
    validierungsfehler(
      "Validierung nach Datenaustausch fehlgeschlagen",
      await persistenz.validiere(await loadMasterData(dataRoot), "nach-datenaustausch"),
    );

    logCommitBegonnen = true;
    await persistenz.benenneUm(pfade.logStage, logUrl, "log-commit");
    await persistenz.synchronisiereVerzeichnis(dataRoot, "nach-commit");
  } catch (error) {
    hauptfehler = error;
    if (transaktionenCommitBegonnen) {
      const rollbackErgebnis = await rollback({
        persistenz,
        dataRoot,
        transaktionenUrl,
        logUrl,
        pfade,
        transaktionenCommitBegonnen,
        logCommitBegonnen,
        logVorhanden: originalLog.vorhanden,
      });
      temporaerePfadeBehalten = rollbackErgebnis.behalten;
      if (rollbackErgebnis.fehler.length > 0) {
        hauptfehler = mitRecoveryPfaden(new AggregateError(
          [error, ...rollbackErgebnis.fehler],
          `Schreibvorgang fehlgeschlagen und Rollback unvollstaendig: ${error.message}`,
        ), rollbackErgebnis.recoveryPfade);
      }
    }
  }

  const aufraeumFehler = await raeumeTemporaerePfadeAuf(
    persistenz,
    pfade,
    temporaerePfadeBehalten,
  );
  if (hauptfehler) {
    if (aufraeumFehler.length > 0) {
      const error = new AggregateError(
        [hauptfehler, ...aufraeumFehler],
        `${hauptfehler.message}; temporaere Dateien konnten nicht vollstaendig entfernt werden`,
      );
      if (hauptfehler.recoveryPfade) error.recoveryPfade = hauptfehler.recoveryPfade;
      throw error;
    }
    throw hauptfehler;
  }
  if (aufraeumFehler.length > 0) {
    throw new AggregateError(aufraeumFehler, "Temporaere Dateien konnten nicht entfernt werden");
  }
}

function parseArgs(argv) {
  const args = {
    ids: [],
    immobilieId: undefined,
    entfernen: false,
    ersetzen: false,
    schreiben: false,
    root: undefined,
  };
  for (const arg of argv) {
    if (arg === "--entfernen") {
      args.entfernen = true;
    } else if (arg === "--ersetzen") {
      args.ersetzen = true;
    } else if (arg === "--schreiben") {
      args.schreiben = true;
    } else if (arg.startsWith("--ids=")) {
      args.ids = arg.slice("--ids=".length).split(",")
        .map((value) => value.trim()).filter(Boolean);
    } else if (arg.startsWith("--immobilie=")) {
      args.immobilieId = arg.slice("--immobilie=".length);
    } else if (arg.startsWith("--")) {
      throw new Error(`unbekanntes Argument: ${arg}`);
    } else if (args.root === undefined) {
      args.root = arg;
    } else {
      throw new Error(`mehr als ein Datenroot angegeben: ${arg}`);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataRoot = dataRootFromArg(
    args.root,
    new URL("../data/master/", import.meta.url),
    new URL("../", import.meta.url),
  );
  const data = await loadMasterData(dataRoot);
  const out = aktualisiereImmobilienbezug({
    transaktionen: data.transaktionen,
    immobilien: data.immobilien,
    ids: args.ids,
    immobilieId: args.immobilieId,
    entfernen: args.entfernen,
    ersetzen: args.ersetzen,
  });

  if (out.blockiert) {
    console.log(JSON.stringify({ modus: "blockiert", ...out.report }, null, 2));
    process.exitCode = 2;
    return;
  }
  if (!args.schreiben) {
    console.log(JSON.stringify({ modus: "vorschau", ...out.report }, null, 2));
    return;
  }

  const logEntry = {
    zeitpunkt: new Date().toISOString(),
    anlass: "transaktion-immobilie",
    inputs: ["transaktionen.jsonl", "immobilien.json"],
    anzahl_importiert: 0,
    anzahl_offen: 0,
    anzahl_fehler: 0,
    immobilienbezuege_gesetzt: out.report.gesetzt,
    immobilienbezuege_entfernt: out.report.entfernt,
    notiz: args.entfernen
      ? "Immobilienbezug von Transaktionen entfernt"
      : `Immobilienbezug ${args.immobilieId} an Transaktionen gesetzt`,
    betroffene_ids: [...new Set(args.ids)],
  };
  await persistiereImmobilienbezug({
    dataRoot,
    data,
    transaktionen: out.transaktionen,
    logEntry,
  });
  console.log(JSON.stringify({ modus: "geschrieben", ...out.report }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
