// app/tools/validate-core.mjs
// Reine, deterministische Validierungslogik — keine Node-Abhaengigkeiten.
// Eine Quelle der Wahrheit fuer CLI (tools/validator.mjs) UND Browser (app/main.js):
// "das Tool prueft" gilt damit auch in der UF. Node-I/O (Dateien lesen, CLI) liegt
// bewusst in validator.mjs, damit dieses Modul im Browser importierbar bleibt.
import { toCents, istGueltigerBetrag } from "./lib/text.mjs";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
// Opake UUID-Identifier mit Typ-Praefix (kein Datum/keine laufende Nummer).
const TXN_ID = /^TXN-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TRF_ID = /^TRF-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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
      transaktion_id: { type: "string", pattern: TXN_ID },
      dedupe_hash: { type: "string", minLength: 1 },
      rohquelle: { type: "string", minLength: 1 },
      konto_id: { type: "string", pattern: /^KTO-\d{3}$/ },
      buchungsdatum: { type: "string", format: "date" },
      betrag: { type: "string", money: true },
      gegenpartei: { type: "string" },
      verwendungszweck: { type: "string" },
      kategorisierung_status: { type: "string", enum: ["offen", "vorgeschlagen", "bestaetigt", "abgelehnt"] },
      ist_transfer: { type: "boolean" },
      kategorie_id: { type: "string", pattern: /^KAT-\d{3}$/ },
      kategorie_herkunft: { type: "string", enum: ["regel", "agent", "manuell"] },
      matched_regeln: { type: "array", itemPattern: /^REG-\d{3}$/ },
      bank_referenz: { type: "string" },
      wertstellungsdatum: { type: "string", format: "date" },
      transaktionstyp: { type: "string" },
      kundenreferenz: { type: "string" },
      empfaenger: { type: "string" },
      empfaenger_iban: { type: "string" },
      mandatsreferenz: { type: "string" },
      glaeubiger_id: { type: "string" },
      transfer_id: { type: "string", pattern: TRF_ID },
      bemerkung: { type: "string" },
    },
  },
  transfers: {
    required: ["transfer_id", "betrag", "typ"],
    fields: {
      transfer_id: { type: "string", pattern: TRF_ID },
      betrag: { type: "string", money: true, nonNegative: true },
      typ: { type: "string", enum: ["intern", "extern"] },
      abgang_transaktion_id: { type: "string", pattern: TXN_ID },
      zugang_transaktion_id: { type: "string", pattern: TXN_ID },
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
      betrag: { type: "string", money: true },
      rhythmus_einheit: { type: "string", enum: ["tag", "woche", "monat", "jahr"] },
      rhythmus_intervall: { type: "number", integer: true, min: 1 },
      anker_datum: { type: "string", format: "date" },
      aktiv_bis: { type: "string", format: "date" },
      status: { type: "string", enum: ["vorgeschlagen", "bestaetigt", "abgelehnt"] },
      kategorie_id: { type: "string", pattern: /^KAT-\d{3}$/ },
      darlehen_id: { type: "string", pattern: /^DAR-\d{3}$/ },
      erstellt_am: { type: "string", format: "date" },
      qualitaet: { type: "string", enum: ["belegt", "geschaetzt"] },
      quelle_hinweis: { type: "string" },
      quelle_standdatum: { type: "string", format: "date" },
      bemerkung: { type: "string" },
    },
  },
  szenarien: {
    optional: true,
    required: ["szenario_id", "name", "status", "stand", "reichweite_bis", "erstellt_am", "annahmen"],
    fields: {
      szenario_id: { type: "string", pattern: /^SZN-\d{3}$/ },
      name: { type: "string", minLength: 1 },
      beschreibung: { type: "string" },
      status: { type: "string", enum: ["entwurf", "bestaetigt", "verworfen"] },
      stand: { type: "string", format: "date" },
      reichweite_bis: { type: "string", format: "date" },
      erstellt_am: { type: "string", format: "date" },
      annahmen: { type: "array" },
    },
  },
  immobilien: {
    optional: true,
    required: ["immobilie_id", "bezeichnung", "eigentumsanteile", "status"],
    fields: {
      immobilie_id: { type: "string", pattern: /^IMM-\d{3}$/ },
      bezeichnung: { type: "string", minLength: 1 },
      eigentumsanteile: { type: "array", minItems: 1 },
      status: { type: "string", enum: ["aktiv", "verkauft"] },
      adresse: { type: "string" },
      anschaffungsdatum: { type: "string", format: "date" },
      anschaffungskosten: { type: "string", money: true, nonNegative: true },
      quelle_hinweis: { type: "string" },
      quelle_standdatum: { type: "string", format: "date" },
      aktiv_bis: { type: "string", format: "date" },
      bemerkung: { type: "string" },
    },
  },
  darlehen: {
    optional: true,
    required: ["darlehen_id", "bezeichnung", "status", "anfangsbetrag", "anfangsdatum", "zinssatz", "sollrate", "rhythmus_einheit", "rhythmus_intervall"],
    fields: {
      darlehen_id: { type: "string", pattern: /^DAR-\d{3}$/ },
      bezeichnung: { type: "string", minLength: 1 },
      status: { type: "string", enum: ["aktiv", "abgeloest"] },
      anfangsbetrag: { type: "string", money: true, nonNegative: true },
      anfangsdatum: { type: "string", format: "date" },
      zinssatz: { type: "string", pattern: /^\d+\.\d{2,4}$/ },
      sollrate: { type: "string", money: true, nonNegative: true },
      rhythmus_einheit: { type: "string", enum: ["tag", "woche", "monat", "jahr"] },
      rhythmus_intervall: { type: "number", integer: true, min: 1 },
      immobilie_id: { type: "string", pattern: /^IMM-\d{3}$/ },
      konto_id: { type: "string", pattern: /^KTO-\d{3}$/ },
      zinsbindung_bis: { type: "string", format: "date" },
      aktiv_bis: { type: "string", format: "date" },
      quelle_hinweis: { type: "string" },
      quelle_standdatum: { type: "string", format: "date" },
      bemerkung: { type: "string" },
    },
  },
  vermoegenswerte: {
    optional: true,
    required: ["vermoegenswert_id", "typ", "bezeichnung", "eigentumsanteile", "status"],
    fields: {
      vermoegenswert_id: { type: "string", pattern: /^VMW-\d{3}$/ },
      typ: { type: "string", enum: ["edelmetall", "beteiligung", "sonstiges"] },
      bezeichnung: { type: "string", minLength: 1 },
      eigentumsanteile: { type: "array", minItems: 1 },
      status: { type: "string", enum: ["aktiv", "veraeussert"] },
      quelle_hinweis: { type: "string" },
      quelle_standdatum: { type: "string", format: "date" },
      aktiv_bis: { type: "string", format: "date" },
      bemerkung: { type: "string" },
    },
  },
  kategorisierungsregeln: {
    optional: true,
    required: ["regel_id", "kategorie_id", "status", "erstellt_am", "kommentar"],
    fields: {
      regel_id: { type: "string", pattern: /^REG-\d{3}$/ },
      gegenpartei_pattern: { type: "string", minLength: 1 },
      verwendungszweck_pattern: { type: "string", minLength: 1 },
      konto_id: { type: "string", pattern: /^KTO-\d{3}$/ },
      vorzeichen: { type: "string", enum: ["einnahme", "ausgabe"] },
      kategorie_id: { type: "string", pattern: /^KAT-\d{3}$/ },
      status: { type: "string", enum: ["aktiv", "inaktiv"] },
      erstellt_am: { type: "string", format: "date" },
      kommentar: { type: "string", minLength: 1 },
    },
  },
  zeitwerte: {
    optional: true,
    required: ["entitaet", "entitaet_id", "feld", "wert", "standdatum", "qualitaet"],
    fields: {
      entitaet: { type: "string", enum: ["konto", "immobilie", "vermoegenswert", "darlehen"] },
      entitaet_id: { type: "string", minLength: 1 },
      feld: { type: "string", enum: ["kontostand", "depotwert", "marktwert", "restschuld"] },
      wert: { type: "string", money: true },
      standdatum: { type: "string", format: "date" },
      qualitaet: { type: "string", enum: ["belegt", "geschaetzt"] },
      quelle_hinweis: { type: "string" },
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
  if (rule.money && !istGueltigerBetrag(value)) {
    errors.push(`${path}: kein gueltiger Betrag (zwei Nachkommastellen, keine fuehrenden Nullen, kein -0.00)`);
  }
  if (rule.nonNegative && istGueltigerBetrag(value) && value.startsWith("-")) {
    errors.push(`${path}: darf nicht negativ sein`);
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

  data.kategorisierungsregeln?.forEach((regel) => {
    if (regel.kategorie_id && !kategorien.has(regel.kategorie_id)) {
      errors.push(`kategorisierungsregeln.${regel.regel_id}.kategorie_id: ${regel.kategorie_id} existiert nicht`);
    }
    if (regel.konto_id && !konten.has(regel.konto_id)) {
      errors.push(`kategorisierungsregeln.${regel.regel_id}.konto_id: ${regel.konto_id} existiert nicht`);
    }
  });

  const regelIds = new Set((data.kategorisierungsregeln ?? []).map((r) => r.regel_id));
  data.transaktionen?.forEach((tx) => {
    if (!Object.hasOwn(tx, "matched_regeln")) return;
    if (tx.kategorie_herkunft === "manuell") {
      errors.push(`transaktionen.${tx.transaktion_id}.matched_regeln: nicht erlaubt bei manueller Herkunft`);
    }
    if (tx.kategorie_herkunft === "agent") {
      errors.push(`transaktionen.${tx.transaktion_id}.matched_regeln: nicht erlaubt bei Agenten-Herkunft`);
    }
    if (tx.kategorisierung_status === "abgelehnt") {
      errors.push(`transaktionen.${tx.transaktion_id}.matched_regeln: nicht erlaubt bei abgelehnt`);
    }
    for (const id of tx.matched_regeln) {
      if (!regelIds.has(id)) {
        errors.push(`transaktionen.${tx.transaktion_id}.matched_regeln: ${id} existiert nicht`);
      }
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

  const immobilien = byId(data.immobilien, "immobilie_id");
  const darlehen = byId(data.darlehen, "darlehen_id");
  const vermoegenswerte = byId(data.vermoegenswerte, "vermoegenswert_id");

  data.immobilien?.forEach((imm) => pruefeAnteile(`immobilien.${imm.immobilie_id}`, imm.eigentumsanteile, personen, errors));
  data.vermoegenswerte?.forEach((vmw) => pruefeAnteile(`vermoegenswerte.${vmw.vermoegenswert_id}`, vmw.eigentumsanteile, personen, errors));

  data.darlehen?.forEach((dar) => {
    if (dar.immobilie_id && !immobilien.has(dar.immobilie_id)) {
      errors.push(`darlehen.${dar.darlehen_id}.immobilie_id: ${dar.immobilie_id} existiert nicht`);
    }
    if (dar.konto_id && !konten.has(dar.konto_id)) {
      errors.push(`darlehen.${dar.darlehen_id}.konto_id: ${dar.konto_id} existiert nicht`);
    }
    if (dar.aktiv_bis && dar.anfangsdatum && dar.aktiv_bis < dar.anfangsdatum) {
      errors.push(`darlehen.${dar.darlehen_id}.aktiv_bis: liegt vor anfangsdatum`);
    }
  });

  const zeitwertEntitaeten = {
    konto: konten, immobilie: immobilien, vermoegenswert: vermoegenswerte, darlehen,
  };
  data.zeitwerte?.forEach((zw, i) => {
    const map = zeitwertEntitaeten[zw.entitaet];
    if (map && !map.has(zw.entitaet_id)) {
      errors.push(`zeitwerte[${i}].entitaet_id: ${zw.entitaet_id} existiert nicht (${zw.entitaet})`);
    }
  });

  data.regelzahlungen?.forEach((rz) => {
    if (rz.darlehen_id && !darlehen.has(rz.darlehen_id)) {
      errors.push(`regelzahlungen.${rz.regelzahlung_id}.darlehen_id: ${rz.darlehen_id} existiert nicht`);
    }
  });

  validateSzenarien(data, errors);
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

function validateSzenarien(data, errors) {
  // Nur AKTIVE Zielpositionen sind gültige Gegenbuchungs-Ziele (Spec).
  const darlehenIds = new Set((data.darlehen ?? []).filter((d) => d.status !== "abgeloest").map((d) => d.darlehen_id));
  const depotIds = new Set((data.konten ?? []).filter((k) => k.kontotyp === "depot" && k.status !== "geschlossen").map((k) => k.konto_id));
  const immoIds = new Set((data.immobilien ?? []).filter((i) => i.status !== "verkauft").map((i) => i.immobilie_id));
  const vmwIds = new Set((data.vermoegenswerte ?? []).filter((v) => v.status !== "veraeussert").map((v) => v.vermoegenswert_id));
  const rzIds = new Set((data.regelzahlungen ?? []).map((r) => r.regelzahlung_id));
  const idMengen = { darlehen: darlehenIds, depot: depotIds, immobilie: immoIds, vermoegenswert: vmwIds };

  for (const sz of data.szenarien ?? []) {
    const p = `szenarien.${sz.szenario_id}`;
    if (sz.reichweite_bis < sz.stand) errors.push(`${p}: reichweite_bis liegt vor stand`);

    const gesehen = new Set();
    const verkauft = new Set(); // ziel_typ:ziel_id, gegen Doppelverkauf
    for (const a of sz.annahmen ?? []) {
      const ap = `${p}.${a.annahme_id ?? "?"}`;
      if (!a.annahme_id) errors.push(`${ap}: annahme_id fehlt`);
      else if (gesehen.has(a.annahme_id)) errors.push(`${ap}: annahme_id doppelt`);
      gesehen.add(a.annahme_id);

      if (!["einmalzahlung", "regelzahlung-neu", "regelzahlung-aenderung"].includes(a.art)) {
        errors.push(`${ap}: art unbekannt`);
        continue;
      }
      if (!["belegt", "geschaetzt", "offen"].includes(a.qualitaet)) errors.push(`${ap}: qualitaet ungueltig`);

      if (a.art === "regelzahlung-aenderung") {
        if (!rzIds.has(a.regelzahlung_id)) errors.push(`${ap}: regelzahlung_id ${a.regelzahlung_id} existiert nicht`);
        if (!isIsoDate(a.ab)) errors.push(`${ap}: ab fehlt/ungueltig`);
        if (!["beenden", "betrag-aendern"].includes(a.aktion)) errors.push(`${ap}: aktion ungueltig`);
        if (a.aktion === "betrag-aendern" && !istGueltigerBetrag(a.betrag)) errors.push(`${ap}: betrag-aendern braucht gueltigen betrag`);
        if (a.gegenbuchung) errors.push(`${ap}: regelzahlung-aenderung darf keine gegenbuchung haben`);
        continue;
      }

      // Art-spezifische Pflichtfelder
      if (a.art === "einmalzahlung") {
        if (!isIsoDate(a.datum)) errors.push(`${ap}: datum fehlt/ungueltig`);
        if (typeof a.betrag !== "string" || !istGueltigerBetrag(a.betrag)) errors.push(`${ap}: betrag fehlt/ungueltig`);
      } else if (a.art === "regelzahlung-neu") {
        if (!isIsoDate(a.ab)) errors.push(`${ap}: ab fehlt/ungueltig`);
        if (typeof a.betrag !== "string" || !istGueltigerBetrag(a.betrag)) errors.push(`${ap}: betrag fehlt/ungueltig`);
        if (!["tag", "woche", "monat", "jahr"].includes(a.rhythmus_einheit)) errors.push(`${ap}: rhythmus_einheit ungueltig`);
        if (!Number.isInteger(a.rhythmus_intervall) || a.rhythmus_intervall < 1) errors.push(`${ap}: rhythmus_intervall ungueltig`);
      }

      // einmalzahlung | regelzahlung-neu: Cash-Bein + optionale gegenbuchung
      const hatBetrag = typeof a.betrag === "string" && istGueltigerBetrag(a.betrag) && a.betrag !== "0.00";
      if (a.art === "einmalzahlung" && !hatBetrag && !a.gegenbuchung) {
        errors.push(`${ap}: einmalzahlung ohne Betrag und ohne gegenbuchung ist wirkungslos`);
      }

      if (a.gegenbuchung) {
        const g = a.gegenbuchung;
        const hatZiel = !!g.ziel_id, hatNeu = !!g.neue_position;
        if (hatZiel === hatNeu) errors.push(`${ap}: gegenbuchung braucht genau eines von ziel_id / neue_position`);
        if (!idMengen[g.ziel_typ]) errors.push(`${ap}: gegenbuchung.ziel_typ ungueltig`);
        if (a.art === "regelzahlung-neu") {
          if (!["darlehen", "depot"].includes(g.ziel_typ)) errors.push(`${ap}: wiederkehrende gegenbuchung nur fuer darlehen|depot`);
          if (hatNeu) errors.push(`${ap}: wiederkehrende gegenbuchung braucht bestehende ziel_id`);
        }
        if (hatZiel && idMengen[g.ziel_typ] && !idMengen[g.ziel_typ].has(g.ziel_id)) {
          errors.push(`${ap}: gegenbuchung.ziel_id ${g.ziel_id} existiert nicht in ${g.ziel_typ}`);
        }
        if (g.ziel_typ === "depot" && hatZiel && !depotIds.has(g.ziel_id)) {
          errors.push(`${ap}: depot-gegenbuchung verlangt ein Konto mit kontotyp=Depot`);
        }
        if (hatNeu && (!g.neue_position.bezeichnung || !istGueltigerBetrag(g.neue_position.wert))) {
          errors.push(`${ap}: neue_position braucht bezeichnung und gueltigen wert`);
        }
        // Doppelverkauf/-abbau bestehender Sachwert-Positionen
        if (hatZiel && (g.ziel_typ === "immobilie" || g.ziel_typ === "vermoegenswert")) {
          const key = `${g.ziel_typ}:${g.ziel_id}`;
          if (verkauft.has(key)) errors.push(`${ap}: Position ${g.ziel_id} wird im Szenario mehrfach abgebaut`);
          verkauft.add(key);
        }
      }
    }
  }
}

function byId(collection = [], idField) {
  return new Map(collection.map((item) => [item[idField], item]));
}

// Prueft Eigentumsanteile als exakte Brueche: person_id existiert (ausser extern),
// zaehler/nenner Ganzzahl >= 1, und die Bruch-Summe genau 1 (Integer-Arithmetik).
function pruefeAnteile(prefix, anteile, personenMap, errors) {
  if (!Array.isArray(anteile)) return;
  let num = 0, den = 1;
  anteile.forEach((a, i) => {
    const p = `${prefix}.eigentumsanteile[${i}]`;
    if (!a || typeof a !== "object") { errors.push(`${p}: muss ein Objekt sein`); return; }
    const extern = a.extern === true;
    if (!extern && !personenMap.has(a.person_id)) {
      errors.push(`${p}.person_id: ${a.person_id} existiert nicht`);
    }
    if (!Number.isInteger(a.zaehler) || a.zaehler < 1) errors.push(`${p}.zaehler: muss Ganzzahl >= 1 sein`);
    if (!Number.isInteger(a.nenner) || a.nenner < 1) errors.push(`${p}.nenner: muss Ganzzahl >= 1 sein`);
    if (Number.isInteger(a.zaehler) && Number.isInteger(a.nenner) && a.nenner >= 1) {
      num = num * a.nenner + a.zaehler * den;
      den = den * a.nenner;
    }
  });
  if (num !== den) {
    errors.push(`${prefix}.eigentumsanteile: Summe der Anteile muss genau 1 sein`);
  }
}

function isIsoDate(value) {
  if (!datePattern.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
