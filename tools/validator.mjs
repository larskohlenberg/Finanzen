import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const schemas = {
  personen: {
    required: ["person_id", "name", "status"],
    fields: {
      person_id: { type: "string", pattern: /^PER-\d{3}$/ },
      name: { type: "string", minLength: 1 },
      status: { type: "string", enum: ["aktiv", "inaktiv"] },
      aktiv_bis: { type: "string", format: "date" },
    },
  },
  konten: {
    required: ["konto_id", "name", "kontotyp", "inhaber_person_ids", "liquiditaetsrelevant", "status"],
    fields: {
      konto_id: { type: "string", pattern: /^KTO-\d{3}$/ },
      name: { type: "string", minLength: 1 },
      kontotyp: { type: "string", enum: ["giro", "spar", "tagesgeld", "depot", "kreditkarte", "bar"] },
      kontoreferenz: { type: "string", minLength: 1 },
      inhaber_person_ids: { type: "array", minItems: 1, itemPattern: /^PER-\d{3}$/, uniqueItems: true },
      liquiditaetsrelevant: { type: "boolean" },
      status: { type: "string", enum: ["aktiv", "geschlossen"] },
      aktiv_bis: { type: "string", format: "date" },
    },
  },
  kategorien: {
    required: ["kategorie_id", "name", "typ", "lebenshaltung_relevant", "status"],
    fields: {
      kategorie_id: { type: "string", pattern: /^KAT-\d{3}$/ },
      name: { type: "string", minLength: 1 },
      typ: { type: "string", enum: ["einnahme", "ausgabe", "neutral"] },
      lebenshaltung_relevant: { type: "boolean" },
      status: { type: "string", enum: ["aktiv", "inaktiv"] },
      aktiv_bis: { type: "string", format: "date" },
    },
  },
  transaktionen: {
    required: [
      "transaktion_id",
      "dedupe_hash",
      "rohquelle",
      "konto_id",
      "buchungsdatum",
      "betrag",
      "gegenpartei",
      "verwendungszweck",
      "kategorisierung_status",
      "ist_transfer",
    ],
    fields: {
      transaktion_id: { type: "string", pattern: /^TXN-\d{8}-\d{6}$/ },
      dedupe_hash: { type: "string", minLength: 1 },
      rohquelle: { type: "string", minLength: 1 },
      konto_id: { type: "string", pattern: /^KTO-\d{3}$/ },
      buchungsdatum: { type: "string", format: "date" },
      betrag: { type: "string", pattern: /^-?\d+\.\d{2}$/ },
      gegenpartei: { type: "string" },
      verwendungszweck: { type: "string" },
      kategorisierung_status: { type: "string", enum: ["offen", "vorgeschlagen", "bestaetigt", "abgelehnt"] },
      ist_transfer: { type: "boolean" },
      kategorie_id: { type: "string", pattern: /^KAT-\d{3}$/ },
      bank_referenz: { type: "string" },
      transfer_id: { type: "string", pattern: /^TRF-\d{8}-\d{3}$/ },
      bemerkung: { type: "string" },
    },
  },
  transfers: {
    required: ["transfer_id", "betrag", "typ"],
    fields: {
      transfer_id: { type: "string", pattern: /^TRF-\d{8}-\d{3}$/ },
      betrag: { type: "string", pattern: /^\d+\.\d{2}$/ },
      typ: { type: "string", enum: ["intern", "extern"] },
      abgang_transaktion_id: { type: "string", pattern: /^TXN-\d{8}-\d{6}$/ },
      zugang_transaktion_id: { type: "string", pattern: /^TXN-\d{8}-\d{6}$/ },
      gegenseite_typ: { type: "string", enum: ["bar", "extern_familie", "extern_sonstiges"] },
      begruendung: { type: "string", minLength: 1 },
    },
  },
  regelzahlungen: {
    optional: true,
    required: ["regelzahlung_id", "bezeichnung", "betrag", "rhythmus_einheit", "rhythmus_intervall", "anker_datum", "status", "erstellt_am"],
    fields: {
      regelzahlung_id: { type: "string", pattern: /^RZ-\d{3}$/ },
      bezeichnung: { type: "string", minLength: 1 },
      betrag: { type: "string", pattern: /^-?\d+\.\d{2}$/ },
      rhythmus_einheit: { type: "string", enum: ["tag", "woche", "monat", "jahr"] },
      rhythmus_intervall: { type: "number", integer: true, min: 1 },
      anker_datum: { type: "string", format: "date" },
      aktiv_bis: { type: "string", format: "date" },
      status: { type: "string", enum: ["vorgeschlagen", "bestaetigt", "abgelehnt"] },
      kategorie_id: { type: "string", pattern: /^KAT-\d{3}$/ },
      erstellt_am: { type: "string", format: "date" },
      bemerkung: { type: "string" },
    },
  },
};

export function validateMasterData(data) {
  const errors = [];

  for (const [collectionName, schema] of Object.entries(schemas)) {
    if (schema.optional && data[collectionName] === undefined) continue;
    validateCollection(collectionName, data[collectionName], schema, errors);
  }

  validateCrossFieldRules(data, errors);

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateCollection(collectionName, collection, schema, errors) {
  if (!Array.isArray(collection)) {
    errors.push(`${collectionName}: muss eine Liste sein`);
    return;
  }

  collection.forEach((item, index) => {
    const path = `${collectionName}[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`${path}: muss ein Objekt sein`);
      return;
    }

    for (const field of schema.required) {
      if (!Object.hasOwn(item, field)) {
        errors.push(`${path}.${field}: Pflichtfeld fehlt`);
      }
    }

    for (const field of Object.keys(item)) {
      if (!Object.hasOwn(schema.fields, field)) {
        errors.push(`${path}.${field}: unbekanntes Feld`);
        continue;
      }
      validateField(`${path}.${field}`, item[field], schema.fields[field], errors);
    }
  });
}

function validateField(path, value, rule, errors) {
  if (rule.type === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${path}: muss eine Liste sein`);
      return;
    }
    if (rule.minItems && value.length < rule.minItems) {
      errors.push(`${path}: braucht mindestens ${rule.minItems} Eintrag`);
    }
    if (rule.uniqueItems && new Set(value).size !== value.length) {
      errors.push(`${path}: Eintraege muessen eindeutig sein`);
    }
    if (rule.itemPattern) {
      value.forEach((entry, index) => {
        if (typeof entry !== "string" || !rule.itemPattern.test(entry)) {
          errors.push(`${path}[${index}]: Format ungueltig`);
        }
      });
    }
    return;
  }

  if (typeof value !== rule.type) {
    errors.push(`${path}: muss ${rule.type} sein`);
    return;
  }
  if (rule.integer && !Number.isInteger(value)) {
    errors.push(`${path}: muss eine Ganzzahl sein`);
  }
  if (rule.min !== undefined && value < rule.min) {
    errors.push(`${path}: muss mindestens ${rule.min} sein`);
  }
  if (rule.minLength && value.length < rule.minLength) {
    errors.push(`${path}: darf nicht leer sein`);
  }
  if (rule.enum && !rule.enum.includes(value)) {
    errors.push(`${path}: Wert nicht erlaubt`);
  }
  if (rule.pattern && !rule.pattern.test(value)) {
    errors.push(`${path}: Format ungueltig`);
  }
  if (rule.format === "date" && !isIsoDate(value)) {
    errors.push(`${path}: muss ISO-Datum YYYY-MM-DD sein`);
  }
}

function validateCrossFieldRules(data, errors) {
  const personen = byId(data.personen, "person_id");
  const konten = byId(data.konten, "konto_id");
  const kategorien = byId(data.kategorien, "kategorie_id");
  const transaktionen = byId(data.transaktionen, "transaktion_id");
  const transfers = byId(data.transfers, "transfer_id");

  data.konten?.forEach((konto) => {
    konto.inhaber_person_ids?.forEach((personId) => {
      if (!personen.has(personId)) {
        errors.push(`konten.${konto.konto_id}.inhaber_person_ids: person_id ${personId} existiert nicht`);
      }
    });
  });

  const dedupeHashes = new Map();
  data.transaktionen?.forEach((transaktion) => {
    if (!konten.has(transaktion.konto_id)) {
      errors.push(`transaktionen.${transaktion.transaktion_id}.konto_id: ${transaktion.konto_id} existiert nicht`);
    }
    if (transaktion.kategorisierung_status === "bestaetigt" && !transaktion.kategorie_id) {
      errors.push(`transaktionen.${transaktion.transaktion_id}.kategorie_id: Pflicht bei bestaetigter Kategorisierung`);
    }
    if (transaktion.kategorie_id && !kategorien.has(transaktion.kategorie_id)) {
      errors.push(`transaktionen.${transaktion.transaktion_id}.kategorie_id: ${transaktion.kategorie_id} existiert nicht`);
    }
    if (transaktion.ist_transfer === true && !transaktion.transfer_id) {
      errors.push(`transaktionen.${transaktion.transaktion_id}.transfer_id: Pflicht bei Transfer`);
    }
    if (transaktion.transfer_id && !transfers.has(transaktion.transfer_id)) {
      errors.push(`transaktionen.${transaktion.transaktion_id}.transfer_id: ${transaktion.transfer_id} existiert nicht`);
    }
    if (dedupeHashes.has(transaktion.dedupe_hash)) {
      errors.push(`transaktionen.${transaktion.transaktion_id}.dedupe_hash: doppelt mit ${dedupeHashes.get(transaktion.dedupe_hash)}`);
    } else {
      dedupeHashes.set(transaktion.dedupe_hash, transaktion.transaktion_id);
    }
  });

  data.transfers?.forEach((transfer) => validateTransfer(transfer, transaktionen, errors));

  data.regelzahlungen?.forEach((rz) => {
    if (rz.kategorie_id && !kategorien.has(rz.kategorie_id)) {
      errors.push(`regelzahlungen.${rz.regelzahlung_id}.kategorie_id: ${rz.kategorie_id} existiert nicht`);
    }
    if (rz.aktiv_bis && rz.anker_datum && rz.aktiv_bis < rz.anker_datum) {
      errors.push(`regelzahlungen.${rz.regelzahlung_id}.aktiv_bis: liegt vor anker_datum`);
    }
  });
}

function validateTransfer(transfer, transaktionen, errors) {
  const prefix = `transfers.${transfer.transfer_id}`;
  const abgang = transfer.abgang_transaktion_id ? transaktionen.get(transfer.abgang_transaktion_id) : undefined;
  const zugang = transfer.zugang_transaktion_id ? transaktionen.get(transfer.zugang_transaktion_id) : undefined;

  if (transfer.typ === "intern") {
    if (!transfer.abgang_transaktion_id || !transfer.zugang_transaktion_id) {
      errors.push(`${prefix}: interner Transfer braucht abgang_transaktion_id und zugang_transaktion_id`);
      return;
    }
    if (!abgang || !zugang) {
      errors.push(`${prefix}: referenzierte Transaktionen existieren nicht`);
      return;
    }
    if (toCents(abgang.betrag) + toCents(zugang.betrag) !== 0) {
      errors.push(`${prefix}: Betraege sind nicht gegenlaeufig und betragsgleich`);
    }
    if (Math.abs(toCents(abgang.betrag)) !== toCents(transfer.betrag)) {
      errors.push(`${prefix}.betrag: passt nicht zu den Transaktionen`);
    }
  }

  if (transfer.typ === "extern") {
    const referenceCount = Number(Boolean(transfer.abgang_transaktion_id)) + Number(Boolean(transfer.zugang_transaktion_id));
    if (referenceCount !== 1) {
      errors.push(`${prefix}: externer Transfer braucht genau eine Transaktion`);
    }
    if (!transfer.gegenseite_typ) {
      errors.push(`${prefix}.gegenseite_typ: Pflicht bei externem Transfer`);
    }
    if (!transfer.begruendung) {
      errors.push(`${prefix}.begruendung: Pflicht bei externem Transfer`);
    }
  }
}

function byId(collection = [], idField) {
  return new Map(collection.map((item) => [item[idField], item]));
}

function isIsoDate(value) {
  if (!datePattern.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function toCents(decimalString) {
  const sign = decimalString.startsWith("-") ? -1 : 1;
  const unsigned = decimalString.replace("-", "");
  const [euros, cents] = unsigned.split(".");
  return sign * (Number(euros) * 100 + Number(cents));
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readJsonl(path) {
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

export async function loadMasterData(root = new URL("../data/master/", import.meta.url)) {
  return {
    personen: await readJson(new URL("personen.json", root)),
    konten: await readJson(new URL("konten.json", root)),
    kategorien: await readJson(new URL("kategorien.json", root)),
    transaktionen: await readJsonl(new URL("transaktionen.jsonl", root)),
    transfers: await readJson(new URL("transfers.json", root)),
    regelzahlungen: await readJson(new URL("regelzahlungen.json", root)),
  };
}

async function main() {
  const root = process.argv[2] ? new URL(`${process.argv[2].replace(/\/?$/, "/")}`, `file://${process.cwd()}/`) : undefined;
  const result = validateMasterData(await loadMasterData(root));
  if (result.valid) {
    console.log("M1 validation passed");
    return;
  }
  console.error("M1 validation failed");
  for (const error of result.errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
