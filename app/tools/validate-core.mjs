// app/tools/validate-core.mjs
// Reine, deterministische Validierungslogik — keine Node-Abhaengigkeiten.
// Eine Quelle der Wahrheit fuer CLI (tools/validator.mjs) UND Browser (app/main.js):
// "das Tool prueft" gilt damit auch in der UF. Node-I/O (Dateien lesen, CLI) liegt
// bewusst in validator.mjs, damit dieses Modul im Browser importierbar bleibt.
import { toCents, istGueltigerBetrag, hatLeerenZweig } from "./lib/text.mjs";

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
      kontotyp: { type: "string", enum: ["giro", "spar", "tagesgeld", "festgeld", "depot", "kreditkarte", "bar"] },
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
      gutschriften_sondereffekt: { type: "boolean" },
      ohne_einzelposten: { type: "boolean" },
      investition: { type: "boolean" },
      brutto: { type: "boolean" },
      sparziel: { type: "string", enum: ["liquide", "depot", "versicherung"] },
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
      bestaetigt_durch: { type: "string", enum: ["auto", "mensch"] },
      matched_regeln: { type: "array", itemPattern: /^REG-\d{3}$/ },
      bank_referenz: { type: "string" },
      wertstellungsdatum: { type: "string", format: "date" },
      transaktionstyp: { type: "string" },
      kundenreferenz: { type: "string" },
      empfaenger: { type: "string" },
      empfaenger_iban: { type: "string" },
      mandatsreferenz: { type: "string" },
      glaeubiger_id: { type: "string" },
      regelzahlung_id: { type: "string", pattern: /^RZ-\d{3}$/ },
      immobilie_id: { type: "string", pattern: /^IMM-\d{3}$/ },
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
    required: ["regelzahlung_id", "bezeichnung", "betrag", "rhythmus_einheit", "rhythmus_intervall", "anker_datum", "status", "erstellt_am", "qualitaet"],
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
      vorsorge_id: { type: "string", pattern: /^VS-\d{3}$/ },
      konto_id: { type: "string", pattern: /^KTO-\d{3}$/ },
      erstellt_am: { type: "string", format: "date" },
      qualitaet: { type: "string", enum: ["belegt", "geschaetzt"] },
      quelle_hinweis: { type: "string" },
      quelle_standdatum: { type: "string", format: "date" },
      bemerkung: { type: "string" },
    },
  },
  fristen: {
    optional: true,
    required: ["frist_id", "bezeichnung", "art", "datum"],
    fields: {
      frist_id: { type: "string", pattern: /^FR-\d{3}$/ },
      bezeichnung: { type: "string", minLength: 1 },
      art: { type: "string", enum: ["widerspruch", "kuendigung", "entscheidung", "wiedervorlage", "sonstiges"] },
      datum: { type: "string", format: "date" },
      rhythmus_einheit: { type: "string", enum: ["tag", "woche", "monat", "jahr"] },
      rhythmus_intervall: { type: "number", integer: true, min: 1 },
      vorsorge_id: { type: "string", pattern: /^VS-\d{3}$/ },
      darlehen_id: { type: "string", pattern: /^DAR-\d{3}$/ },
      immobilie_id: { type: "string", pattern: /^IMM-\d{3}$/ },
      konto_id: { type: "string", pattern: /^KTO-\d{3}$/ },
      vermoegenswert_id: { type: "string", pattern: /^VMW-\d{3}$/ },
      regelzahlung_id: { type: "string", pattern: /^RZ-\d{3}$/ },
      erledigt_bis: { type: "string", format: "date" },
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
      phasen: { type: "array" },
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
      nutzung: { type: "string", enum: ["selbstgenutzt", "vermietet", "teilvermietet"] },
      // Wohnflaeche in m2, gleiches Format wie Betraege (Decimal-String, zwei Nachkommastellen).
      wohnflaeche: { type: "string", money: true, nonNegative: true },
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
      laufzeit_bis: { type: "string", format: "date" },
      restschuld_laufzeitende: { type: "string", money: true, nonNegative: true },
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
  vorsorge: {
    optional: true,
    required: ["vorsorge_id", "art", "name", "person_id", "status", "kapitalbildend"],
    fields: {
      vorsorge_id: { type: "string", pattern: /^VS-\d{3}$/ },
      art: { type: "string", enum: ["lebensversicherung", "rentenversicherung", "gesetzliche-rente", "betriebsrente", "riester", "ruerup", "schutzversicherung", "sonstig"] },
      name: { type: "string", minLength: 1 },
      versicherungsnummer: { type: "string", minLength: 1 },
      person_id: { type: "string", pattern: /^PER-\d{3}$/ },
      status: { type: "string", enum: ["aktiv", "gekuendigt", "ruhend", "geplant", "laufend", "beendet"] },
      kapitalbildend: { type: "boolean" },
      kapitalwahl: { type: "string", enum: ["offen", "monatsrente", "kapital"] },
      sparte: { type: "string", enum: ["kfz", "haftpflicht", "rechtsschutz", "hausrat", "wohngebaeude", "photovoltaik", "berufsunfaehigkeit", "pflege", "krankenzusatz", "unfall", "risikoleben", "reise", "sonstige"] },
      geprueft_am: { type: "string", format: "date" },
      leistung_beginn: { type: "string", format: "date" },
      ersetzt_vorsorge_id: { type: "string", pattern: /^VS-\d{3}$/ },
      aktiv_bis: { type: "string", format: "date" },
      quelle_hinweis: { type: "string" },
      quelle_standdatum: { type: "string", format: "date" },
      bemerkung: { type: "string" },
      dynamik: { type: "object" },
      beitragsbefreiung: { type: "array", minItems: 1, uniqueItems: true, itemEnum: ["bu", "arbeitslosigkeit"] },
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
      belegstufe: { type: "string", enum: ["E1", "E2", "E3", "E4"] },
    },
  },
  logos: {
    optional: true,
    required: ["logo_id", "name", "gegenpartei_pattern", "domain", "datei", "quelle", "abgerufen_am"],
    fields: {
      logo_id: { type: "string", pattern: /^LOGO-\d{3}$/ },
      name: { type: "string", minLength: 1 },
      gegenpartei_pattern: { type: "string", minLength: 1 },
      domain: { type: "string", pattern: /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/ },
      datei: { type: "string", pattern: /^logos\/[a-z0-9.-]+\.png$/ },
      quelle: { type: "string", pattern: /^(https:\/\/|datei:[^/\\]+$)/ },
      abgerufen_am: { type: "string", format: "date" },
    },
  },
  zeitwerte: {
    optional: true,
    required: ["entitaet", "entitaet_id", "feld", "wert", "standdatum", "qualitaet"],
    fields: {
      entitaet: { type: "string", enum: ["konto", "immobilie", "vermoegenswert", "darlehen", "vorsorge"] },
      entitaet_id: { type: "string", minLength: 1 },
      feld: { type: "string", enum: ["kontostand", "depotwert", "marktwert", "restschuld", "rueckkaufswert", "erwartete_rente", "erwartete_kapitalleistung", "vertragswert", "bu_rente", "erwerbsminderungsrente", "todesfallleistung", "hinterbliebenenrente", "beitragssumme"] },
      wert: { type: "string", money: true },
      standdatum: { type: "string", format: "date" },
      qualitaet: { type: "string", enum: ["belegt", "geschaetzt"] },
      quelle_hinweis: { type: "string" },
    },
  },
};

const vorsorgeArtEnum = schemas.vorsorge.fields.art.enum;
const vorsorgeStatusEnum = schemas.vorsorge.fields.status.enum;
const vorsorgeArt = Object.freeze(Object.fromEntries(vorsorgeArtEnum.map((art) => [art, art])));
const vorsorgeStatus = Object.freeze(Object.fromEntries(vorsorgeStatusEnum.map((status) => [status, status])));

const vorsorgeStatusRente = Object.freeze([
  vorsorgeStatus.geplant,
  vorsorgeStatus.laufend,
  vorsorgeStatus.beendet,
]);
const vorsorgeStatusVertrag = Object.freeze([
  vorsorgeStatus.aktiv,
  vorsorgeStatus.gekuendigt,
  vorsorgeStatus.ruhend,
]);

const erlaubteVorsorgeStatusJeArt = new Map([
  [vorsorgeArt["gesetzliche-rente"], vorsorgeStatusRente],
  [vorsorgeArt.betriebsrente, vorsorgeStatusRente],
  [vorsorgeArt.lebensversicherung, vorsorgeStatusVertrag],
  [vorsorgeArt.schutzversicherung, vorsorgeStatusVertrag],
]);

// Liefert immer einen Bericht, auch bei kaputter Struktur: erst Struktur pruefen,
// dann die Querbezuege nur ueber die strukturell lesbaren Teile (strukturSicher).
export function validateMasterData(data) {
  const errors = [];
  if (!istObjekt(data)) {
    errors.push("Bestand: muss ein Objekt sein");
    data = {};
  }

  for (const [collectionName, schema] of Object.entries(schemas)) {
    if (schema.optional && data[collectionName] === undefined) continue;
    validateCollection(collectionName, data[collectionName], schema, errors);
  }

  // Letztes Netz: ein uebersehener Sonderfall in den Querpruefungen wird zum
  // Fehlereintrag statt zum Absturz von CLI oder App-Start.
  try {
    validateCrossFieldRules(strukturSicher(data), errors);
  } catch (error) {
    errors.push(`Querpruefung abgebrochen: ${error?.message ?? error}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function istObjekt(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Kopie des Bestands, in der jede Collection eine Liste aus Objekten ist: was
// keine Liste ist, wird leer, was kein Objekt ist, faellt heraus. Die
// Strukturfehler dazu meldet validateCollection; Querpruefungen und die App
// (runtime.mjs) arbeiten nur auf dieser Kopie und stuerzen so nicht ab.
export function strukturSicher(data) {
  const quelle = istObjekt(data) ? data : {};
  const sicher = { ...quelle };
  for (const name of Object.keys(schemas)) {
    sicher[name] = Array.isArray(quelle[name]) ? quelle[name].filter(istObjekt) : [];
  }
  return sicher;
}

function validateCollection(collectionName, collection, schema, errors) {
  if (!Array.isArray(collection)) {
    errors.push(`${collectionName}: muss eine Liste sein`);
    return;
  }

  collection.forEach((item, index) => {
    const path = `${collectionName}[${index}]`;
    if (!istObjekt(item)) {
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

  const idField = primaryIdField(schema);
  if (idField) {
    const seen = new Map();
    collection.forEach((item, index) => {
      if (!istObjekt(item)) return;
      const id = item[idField];
      if (typeof id !== "string") return;
      const path = `${collectionName}[${index}].${idField}`;
      if (seen.has(id)) {
        errors.push(`${path}: ${id} doppelt mit ${seen.get(id)}`);
      } else {
        seen.set(id, `${collectionName}[${index}]`);
      }
    });
  }
}

function primaryIdField(schema) {
  return schema.required.find((field) => field.endsWith("_id") && schema.fields[field]?.pattern);
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
    if (rule.itemEnum) {
      value.forEach((entry, index) => {
        if (!rule.itemEnum.includes(entry)) errors.push(`${path}[${index}]: Wert nicht erlaubt`);
      });
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

function validateVorsorgeStatusJeArt(vs, errors) {
  if (typeof vs.art !== "string" || typeof vs.status !== "string") return;

  const erlaubteStatus = erlaubteVorsorgeStatusJeArt.get(vs.art);
  if (!erlaubteStatus || erlaubteStatus.includes(vs.status)) return;

  errors.push(`vorsorge.${vs.vorsorge_id}.status: status ${vs.status} passt nicht zu art ${vs.art}; erlaubt: ${erlaubteStatus.join("|")}`);
}

function validateCrossFieldRules(data, errors) {
  const personen = byId(data.personen, "person_id");
  const konten = byId(data.konten, "konto_id");
  const kategorien = byId(data.kategorien, "kategorie_id");
  const transaktionen = byId(data.transaktionen, "transaktion_id");
  const transfers = byId(data.transfers, "transfer_id");
  const regelzahlungen = byId(data.regelzahlungen, "regelzahlung_id");
  const immobilien = byId(data.immobilien, "immobilie_id");

  data.konten.forEach((konto) => {
    if (!Array.isArray(konto.inhaber_person_ids)) return;
    konto.inhaber_person_ids.forEach((personId) => {
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
    if (["vorgeschlagen", "bestaetigt"].includes(transaktion.kategorisierung_status) && !transaktion.kategorie_id) {
      errors.push(`transaktionen.${transaktion.transaktion_id}.kategorie_id: Pflicht bei ${transaktion.kategorisierung_status}; ${transaktion.kategorisierung_status} braucht kategorie_id`);
    }
    if (transaktion.kategorisierung_status === "offen" && transaktion.kategorie_id) {
      errors.push(`transaktionen.${transaktion.transaktion_id}.kategorie_id: offen darf keine kategorie_id tragen`);
    }
    // Eine Bestaetigung ohne Urheber laesst nicht mehr unterscheiden, ob je ein
    // Mensch hingeschaut hat — davon haengt ab, ob recategorize sie anfassen darf.
    if (transaktion.kategorisierung_status === "bestaetigt" && !transaktion.bestaetigt_durch) {
      errors.push(`transaktionen.${transaktion.transaktion_id}.bestaetigt_durch: Pflicht bei bestaetigt`);
    }
    if (transaktion.kategorisierung_status !== "bestaetigt" && transaktion.bestaetigt_durch) {
      errors.push(`transaktionen.${transaktion.transaktion_id}.bestaetigt_durch: nur erlaubt bei bestaetigt`);
    }
    if (transaktion.kategorie_id && !kategorien.has(transaktion.kategorie_id)) {
      errors.push(`transaktionen.${transaktion.transaktion_id}.kategorie_id: ${transaktion.kategorie_id} existiert nicht`);
    }
    if (transaktion.ist_transfer === true && !transaktion.transfer_id) {
      errors.push(`transaktionen.${transaktion.transaktion_id}.transfer_id: Pflicht bei Transfer`);
    }
    if (transaktion.transfer_id && !transfers.has(transaktion.transfer_id)) {
      errors.push(`transaktionen.${transaktion.transaktion_id}.transfer_id: ${transaktion.transfer_id} existiert nicht`);
    } else if (transaktion.transfer_id) {
      // Beidseitig: die Buchung muss selbst eine Seite genau dieses Transfers sein,
      // sonst zaehlte eine dritte Buchung still als Transfer (und fiele aus Ausgaben).
      const transfer = transfers.get(transaktion.transfer_id);
      if (transaktion.transaktion_id !== transfer.abgang_transaktion_id && transaktion.transaktion_id !== transfer.zugang_transaktion_id) {
        errors.push(`transaktionen.${transaktion.transaktion_id}.transfer_id: Buchung ist keine Seite von ${transaktion.transfer_id}`);
      }
    }
    if (transaktion.regelzahlung_id && !regelzahlungen.has(transaktion.regelzahlung_id)) {
      errors.push(`transaktionen.${transaktion.transaktion_id}.regelzahlung_id: ${transaktion.regelzahlung_id} existiert nicht`);
    }
    if (transaktion.immobilie_id && !immobilien.has(transaktion.immobilie_id)) {
      errors.push(
        `transaktionen.${transaktion.transaktion_id}.immobilie_id: ${transaktion.immobilie_id} existiert nicht`,
      );
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
    if (regel.status === "aktiv" && !regel.gegenpartei_pattern && !regel.verwendungszweck_pattern) {
      errors.push(`kategorisierungsregeln.${regel.regel_id}: aktive Regel braucht gegenpartei_pattern oder verwendungszweck_pattern`);
    }
    // Auch bei inaktiven Regeln: eine Reaktivierung prueft niemand neu.
    for (const feld of ["gegenpartei_pattern", "verwendungszweck_pattern"]) {
      if (typeof regel[feld] === "string" && hatLeerenZweig(regel[feld])) {
        errors.push(`kategorisierungsregeln.${regel.regel_id}.${feld}: leerer Musterzweig (ein Tippfehler wie "A|B|" traefe jede Buchung)`);
      }
    }
  });

  const regelIds = new Set((data.kategorisierungsregeln ?? []).map((r) => r.regel_id));
  data.transaktionen?.forEach((tx) => {
    if (!Array.isArray(tx.matched_regeln)) return;
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
    if (rz.konto_id && !konten.has(rz.konto_id)) {
      errors.push(`regelzahlungen.${rz.regelzahlung_id}.konto_id: ${rz.konto_id} existiert nicht`);
    }
    if (rz.aktiv_bis && rz.anker_datum && rz.aktiv_bis < rz.anker_datum) {
      errors.push(`regelzahlungen.${rz.regelzahlung_id}.aktiv_bis: liegt vor anker_datum`);
    }
  });

  const darlehen = byId(data.darlehen, "darlehen_id");
  const vermoegenswerte = byId(data.vermoegenswerte, "vermoegenswert_id");
  const vorsorge = byId(data.vorsorge, "vorsorge_id");

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
    if (dar.laufzeit_bis && dar.anfangsdatum && dar.laufzeit_bis < dar.anfangsdatum) {
      errors.push(`darlehen.${dar.darlehen_id}.laufzeit_bis: liegt vor anfangsdatum`);
    }
  });

  const zeitwertEntitaeten = {
    konto: konten, immobilie: immobilien, vermoegenswert: vermoegenswerte, darlehen, vorsorge,
  };
  // Welche zeitwerte.feld-Werte je Entitaet fachlich zulaessig sind (Schema-Enum ist global).
  const erlaubteFelder = {
    konto: ["kontostand", "depotwert"],
    immobilie: ["marktwert"],
    vermoegenswert: ["marktwert"],
    darlehen: ["restschuld"],
    vorsorge: ["rueckkaufswert", "erwartete_rente", "erwartete_kapitalleistung", "vertragswert", "bu_rente", "erwerbsminderungsrente", "todesfallleistung", "hinterbliebenenrente", "beitragssumme"],
  };
  // Je (Entitaet, ID, Feld, Standdatum) ein Wert: sonst entschiede die Dateireihenfolge,
  // welcher Wert gilt (aktuellerZeitwert nimmt den ersten). Gleicher Wert doppelt ist harmlos.
  const zeitwertStaende = new Map();
  data.zeitwerte?.forEach((zw, i) => {
    const schluessel = [zw.entitaet, zw.entitaet_id, zw.feld, zw.standdatum].join("|");
    const frueher = zeitwertStaende.get(schluessel);
    if (!frueher) zeitwertStaende.set(schluessel, { index: i, wert: zw.wert });
    else if (frueher.wert !== zw.wert) {
      errors.push(`zeitwerte[${i}]: ${zw.entitaet} ${zw.entitaet_id} ${zw.feld} ${zw.standdatum} hat schon einen anderen Wert (zeitwerte[${frueher.index}])`);
    }
  });
  data.zeitwerte?.forEach((zw, i) => {
    const map = Object.hasOwn(zeitwertEntitaeten, zw.entitaet) ? zeitwertEntitaeten[zw.entitaet] : undefined;
    if (map && !map.has(zw.entitaet_id)) {
      errors.push(`zeitwerte[${i}].entitaet_id: ${zw.entitaet_id} existiert nicht (${zw.entitaet})`);
    }
    const felder = Object.hasOwn(erlaubteFelder, zw.entitaet) ? erlaubteFelder[zw.entitaet] : undefined;
    if (felder && !felder.includes(zw.feld)) {
      errors.push(`zeitwerte[${i}].feld: ${zw.feld} ist fuer ${zw.entitaet} nicht zulaessig (erlaubt: ${felder.join("|")})`);
    }
  });

  data.regelzahlungen?.forEach((rz) => {
    if (rz.darlehen_id && !darlehen.has(rz.darlehen_id)) {
      errors.push(`regelzahlungen.${rz.regelzahlung_id}.darlehen_id: ${rz.darlehen_id} existiert nicht`);
    }
    if (rz.vorsorge_id && !vorsorge.has(rz.vorsorge_id)) {
      errors.push(`regelzahlungen.${rz.regelzahlung_id}.vorsorge_id: ${rz.vorsorge_id} existiert nicht`);
    }
  });

  // Arten ohne Rueckkaufswert koennen nie kapitalbildend sein.
  const nieKapitalbildend = new Set(["gesetzliche-rente", "schutzversicherung"]);
  data.vorsorge?.forEach((vs) => {
    if (!personen.has(vs.person_id)) {
      errors.push(`vorsorge.${vs.vorsorge_id}.person_id: ${vs.person_id} existiert nicht`);
    }
    if (vs.kapitalbildend === true && nieKapitalbildend.has(vs.art)) {
      errors.push(`vorsorge.${vs.vorsorge_id}.kapitalbildend: ${vs.art} hat keinen Rueckkaufswert und kann nicht kapitalbildend sein`);
    }
    // Riester ist zweckgebunden: hoechstens 30 Prozent Einmalzahlung zu Rentenbeginn, der
    // Rueckkaufswert nur bei Kuendigung mit Rueckforderung der Foerderung. Kein Aktivum.
    if (vs.kapitalbildend === true && vs.art === "riester") {
      errors.push(`vorsorge.${vs.vorsorge_id}.kapitalbildend: riester ist zweckgebunden (hoechstens 30 Prozent Einmalzahlung zu Rentenbeginn) und kann nicht kapitalbildend sein; der Rueckkaufswert bleibt als gebundenes Kapital erfasst`);
    }
    validateVorsorgeStatusJeArt(vs, errors);
    if (vs.dynamik !== undefined) pruefeDynamik(`vorsorge.${vs.vorsorge_id}.dynamik`, vs.dynamik, errors);
    if (vs.ersetzt_vorsorge_id) {
      if (vs.ersetzt_vorsorge_id === vs.vorsorge_id) {
        errors.push(`vorsorge.${vs.vorsorge_id}.ersetzt_vorsorge_id: darf nicht auf sich selbst zeigen`);
      } else if (!vorsorge.has(vs.ersetzt_vorsorge_id)) {
        errors.push(`vorsorge.${vs.vorsorge_id}.ersetzt_vorsorge_id: ${vs.ersetzt_vorsorge_id} existiert nicht`);
      }
    }
  });

  validateFristen(data, { vorsorge, darlehen, immobilie: immobilien, konto: konten, vermoegenswert: vermoegenswerte, regelzahlung: regelzahlungen }, errors);
  validateSzenarien(data, errors);
  validateLogos(data.logos ?? [], errors);
}

// Eine Frist haengt an hoechstens einem Objekt; ohne Bezug ist sie ausdruecklich
// erlaubt (z. B. Steuererklaerung). Rhythmus nur als Paar.
export const FRIST_BEZUEGE = ["vorsorge", "darlehen", "immobilie", "konto", "vermoegenswert", "regelzahlung"];

function validateFristen(data, objekte, errors) {
  data.fristen?.forEach((frist) => {
    const prefix = `fristen.${frist.frist_id}`;
    const bezuege = FRIST_BEZUEGE.filter((typ) => Object.hasOwn(frist, `${typ}_id`));
    if (bezuege.length > 1) {
      errors.push(`${prefix}: hoechstens ein Bezug erlaubt (gesetzt: ${bezuege.map((typ) => `${typ}_id`).join(", ")})`);
    }
    for (const typ of bezuege) {
      const id = frist[`${typ}_id`];
      if (!objekte[typ].has(id)) errors.push(`${prefix}.${typ}_id: ${id} existiert nicht`);
    }
    if (Object.hasOwn(frist, "rhythmus_einheit") !== Object.hasOwn(frist, "rhythmus_intervall")) {
      errors.push(`${prefix}: rhythmus_einheit und rhythmus_intervall nur zusammen`);
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
    if (transfer.abgang_transaktion_id === transfer.zugang_transaktion_id) {
      errors.push(`${prefix}: abgang_transaktion_id und zugang_transaktion_id muessen unterschiedliche Transaktionen sein`);
    }
    if (!abgang || !zugang) {
      if (!abgang) errors.push(`${prefix}.abgang_transaktion_id: referenzierte Transaktion ${transfer.abgang_transaktion_id} existiert nicht`);
      if (!zugang) errors.push(`${prefix}.zugang_transaktion_id: referenzierte Transaktion ${transfer.zugang_transaktion_id} existiert nicht`);
      return;
    }
    validateTransferReference(prefix, "abgang_transaktion_id", transfer, abgang, errors);
    validateTransferReference(prefix, "zugang_transaktion_id", transfer, zugang, errors);
    if (abgang.konto_id === zugang.konto_id) {
      errors.push(`${prefix}: interner Transfer braucht unterschiedliche Konten`);
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
    if (referenceCount === 1) {
      const referenceField = transfer.abgang_transaktion_id ? "abgang_transaktion_id" : "zugang_transaktion_id";
      const referenceId = transfer[referenceField];
      const reference = transaktionen.get(referenceId);
      if (!reference) {
        errors.push(`${prefix}.${referenceField}: referenzierte Transaktion ${referenceId} existiert nicht`);
      } else {
        validateTransferReference(prefix, referenceField, transfer, reference, errors);
      }
    }
    if (!transfer.gegenseite_typ) {
      errors.push(`${prefix}.gegenseite_typ: Pflicht bei externem Transfer`);
    }
    if (!transfer.begruendung) {
      errors.push(`${prefix}.begruendung: Pflicht bei externem Transfer`);
    }
  }
}

function validateTransferReference(prefix, field, transfer, transaktion, errors) {
  if (transaktion.ist_transfer !== true) {
    errors.push(`${prefix}.${field}: ${transaktion.transaktion_id} ist nicht als ist_transfer markiert`);
  }
  if (transaktion.transfer_id !== transfer.transfer_id) {
    errors.push(`${prefix}.${field}: ${transaktion.transaktion_id} transfer_id-Rueckverweis fehlt/zeigt nicht auf ${transfer.transfer_id}`);
  }
}

// Phasen sind reine Beschriftung des Zeitstrahls: benannt, aufsteigend, im Horizont.
function validatePhasen(sz, p, errors) {
  if (sz.phasen === undefined) return;
  if (!Array.isArray(sz.phasen)) return;
  let vorher = null;
  sz.phasen.forEach((ph, i) => {
    const pp = `${p}.phasen[${i}]`;
    if (!ph || typeof ph !== "object") { errors.push(`${pp}: muss ein Objekt sein`); return; }
    for (const feld of Object.keys(ph)) if (feld !== "name" && feld !== "ab") errors.push(`${pp}.${feld}: unbekanntes Feld`);
    if (typeof ph.name !== "string" || !ph.name.trim()) errors.push(`${pp}.name: fehlt`);
    if (typeof ph.ab !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(ph.ab)) { errors.push(`${pp}.ab: kein Datum`); return; }
    if (ph.ab > sz.reichweite_bis) errors.push(`${pp}.ab: liegt nach reichweite_bis`);
    if (vorher !== null && ph.ab <= vorher) errors.push(`${pp}.ab: Phasen muessen aufsteigend und ohne doppelte Startdaten sein`);
    vorher = ph.ab;
  });
}

// Logo-Verzeichnis: eine Datei je Domain, Name der Datei folgt der Domain,
// kein leerer Musterteil (der passte auf jede Gegenpartei).
function validateLogos(logos, errors) {
  if (!Array.isArray(logos)) return;
  const domains = new Map();
  logos.forEach((logo, index) => {
    if (!logo || typeof logo !== "object") return;
    const ort = `logos[${index}]`;
    if (typeof logo.domain === "string") {
      if (domains.has(logo.domain)) errors.push(`${ort}.domain: ${logo.domain} doppelt mit ${domains.get(logo.domain)}`);
      else domains.set(logo.domain, ort);
      if (typeof logo.datei === "string" && logo.datei !== `logos/${logo.domain}.png`) errors.push(`${ort}.datei: muss logos/${logo.domain}.png sein`);
    }
    if (typeof logo.gegenpartei_pattern === "string" && hatLeerenZweig(logo.gegenpartei_pattern)) {
      errors.push(`${ort}.gegenpartei_pattern: leerer Musterteil`);
    }
  });
}

function validateSzenarien(data, errors) {
  // Nur AKTIVE Zielpositionen sind gültige Gegenbuchungs-Ziele (Spec).
  const darlehenIds = new Set((data.darlehen ?? []).filter((d) => d.status !== "abgeloest").map((d) => d.darlehen_id));
  const depotIds = new Set((data.konten ?? []).filter((k) => k.kontotyp === "depot" && k.status !== "geschlossen").map((k) => k.konto_id));
  const immoIds = new Set((data.immobilien ?? []).filter((i) => i.status !== "verkauft").map((i) => i.immobilie_id));
  const vmwIds = new Set((data.vermoegenswerte ?? []).filter((v) => v.status !== "veraeussert").map((v) => v.vermoegenswert_id));
  const rzIds = new Set((data.regelzahlungen ?? []).map((r) => r.regelzahlung_id));
  const vorsorgeIds = new Set((data.vorsorge ?? []).map((v) => v.vorsorge_id));
  const personIds = new Set((data.personen ?? []).map((p) => p.person_id));
  const idMengen = { darlehen: darlehenIds, depot: depotIds, immobilie: immoIds, vermoegenswert: vmwIds, vorsorge: vorsorgeIds };

  for (const sz of data.szenarien ?? []) {
    const p = `szenarien.${sz.szenario_id}`;
    if (sz.reichweite_bis < sz.stand) errors.push(`${p}: reichweite_bis liegt vor stand`);
    validatePhasen(sz, p, errors);

    const gesehen = new Set();
    const verkauft = new Set(); // ziel_typ:ziel_id, gegen Doppelverkauf
    for (const a of Array.isArray(sz.annahmen) ? sz.annahmen : []) {
      if (!istObjekt(a)) {
        errors.push(`${p}.annahmen: Eintrag muss ein Objekt sein`);
        continue;
      }
      const ap = `${p}.${a.annahme_id ?? "?"}`;
      if (!a.annahme_id) errors.push(`${ap}: annahme_id fehlt`);
      else if (gesehen.has(a.annahme_id)) errors.push(`${ap}: annahme_id doppelt`);
      gesehen.add(a.annahme_id);

      if (!["einmalzahlung", "regelzahlung-neu", "regelzahlung-aenderung", "vorsorge-leistung", "ereignis"].includes(a.art)) {
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

      if (a.art === "vorsorge-leistung") {
        if (!vorsorgeIds.has(a.vorsorge_id)) errors.push(`${ap}: vorsorge_id ${a.vorsorge_id} existiert nicht`);
        if (!["rente", "kapital"].includes(a.arm)) errors.push(`${ap}: arm ungueltig (rente|kapital)`);
        if (!isIsoDate(a.ab)) errors.push(`${ap}: ab fehlt/ungueltig`);
        if (a.gegenbuchung) errors.push(`${ap}: vorsorge-leistung darf keine gegenbuchung haben (wird zur Rechenzeit erzeugt)`);
        continue;
      }

      if (a.art === "ereignis") {
        if (!["bu", "arbeitslosigkeit"].includes(a.fall)) errors.push(`${ap}: fall ungueltig (bu|arbeitslosigkeit)`);
        if (!personIds.has(a.person_id)) errors.push(`${ap}: person_id ${a.person_id} existiert nicht`);
        if (!isIsoDate(a.ab)) errors.push(`${ap}: ab fehlt/ungueltig`);
        if (a.bis !== undefined && (!isIsoDate(a.bis) || (isIsoDate(a.ab) && a.bis < a.ab))) errors.push(`${ap}: bis ungueltig oder vor ab`);
        if (a.gegenbuchung) errors.push(`${ap}: ereignis darf keine gegenbuchung haben (wird zur Rechenzeit erzeugt)`);
        continue;
      }

      // Art-spezifische Pflichtfelder
      if (a.art === "einmalzahlung") {
        if (!isIsoDate(a.datum)) errors.push(`${ap}: datum fehlt/ungueltig`);
        if (typeof a.betrag !== "string" || !istGueltigerBetrag(a.betrag)) errors.push(`${ap}: betrag fehlt/ungueltig`);
      } else if (a.art === "regelzahlung-neu") {
        if (!isIsoDate(a.ab)) errors.push(`${ap}: ab fehlt/ungueltig`);
        if (a.bis !== undefined) {
          if (!isIsoDate(a.bis)) {
            errors.push(`${ap}: bis fehlt/ungueltig`);
          } else if (isIsoDate(a.ab) && a.bis < a.ab) {
            errors.push(`${ap}: bis liegt vor ab`);
          }
        }
        if (typeof a.betrag !== "string" || !istGueltigerBetrag(a.betrag)) errors.push(`${ap}: betrag fehlt/ungueltig`);
        if (!["tag", "woche", "monat", "jahr"].includes(a.rhythmus_einheit)) errors.push(`${ap}: rhythmus_einheit ungueltig`);
        if (!Number.isInteger(a.rhythmus_intervall) || a.rhythmus_intervall < 1) errors.push(`${ap}: rhythmus_intervall ungueltig`);
      }

      // einmalzahlung | regelzahlung-neu: Cash-Bein + optionale gegenbuchung
      const hatBetrag = typeof a.betrag === "string" && istGueltigerBetrag(a.betrag) && a.betrag !== "0.00";
      if (a.art === "einmalzahlung" && !hatBetrag && !a.gegenbuchung) {
        errors.push(`${ap}: einmalzahlung ohne Betrag und ohne gegenbuchung ist wirkungslos`);
      }

      if (a.gegenbuchung && !istObjekt(a.gegenbuchung)) {
        errors.push(`${ap}: gegenbuchung muss ein Objekt sein`);
      } else if (a.gegenbuchung) {
        const g = a.gegenbuchung;
        const hatZiel = !!g.ziel_id, hatNeu = !!g.neue_position;
        if (hatZiel === hatNeu) errors.push(`${ap}: gegenbuchung braucht genau eines von ziel_id / neue_position`);
        const zielIds = Object.hasOwn(idMengen, g.ziel_typ) ? idMengen[g.ziel_typ] : undefined;
        if (!zielIds) errors.push(`${ap}: gegenbuchung.ziel_typ ungueltig`);
        if (a.art === "regelzahlung-neu") {
          if (!["darlehen", "depot"].includes(g.ziel_typ)) errors.push(`${ap}: wiederkehrende gegenbuchung nur fuer darlehen|depot`);
          if (hatNeu) errors.push(`${ap}: wiederkehrende gegenbuchung braucht bestehende ziel_id`);
        }
        if (hatZiel && zielIds && !zielIds.has(g.ziel_id)) {
          errors.push(`${ap}: gegenbuchung.ziel_id ${g.ziel_id} existiert nicht in ${g.ziel_typ}`);
        }
        if (g.ziel_typ === "depot" && hatZiel && !depotIds.has(g.ziel_id)) {
          errors.push(`${ap}: depot-gegenbuchung verlangt ein Konto mit kontotyp=Depot`);
        }
        if (hatNeu && (!istObjekt(g.neue_position) || !g.neue_position.bezeichnung || !istGueltigerBetrag(g.neue_position.wert))) {
          errors.push(`${ap}: neue_position braucht bezeichnung und gueltigen wert`);
        }
        // Doppelverkauf/-abbau bestehender Sachwert-/Vorsorge-Positionen
        if (hatZiel && (g.ziel_typ === "immobilie" || g.ziel_typ === "vermoegenswert" || g.ziel_typ === "vorsorge")) {
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

// Beitragsdynamik: Erhoehungstermin MM-TT, Schwelle fuer das Erloeschen, je Jahr
// hoechstens eine Entscheidung.
const DYNAMIK_FELDER = new Set(["termin", "erlischt_nach", "verlauf"]);
const DYNAMIK_EINTRAG_FELDER = new Set(["termin", "entscheidung", "bemerkung"]);
const DYNAMIK_ENTSCHEIDUNGEN = ["angenommen", "abgelehnt", "offen"];
function pruefeDynamik(prefix, d, errors) {
  if (!d || typeof d !== "object" || Array.isArray(d)) { errors.push(`${prefix}: muss ein Objekt sein`); return; }
  for (const feld of Object.keys(d)) if (!DYNAMIK_FELDER.has(feld)) errors.push(`${prefix}.${feld}: unbekanntes Feld`);
  if (typeof d.termin !== "string" || !/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(d.termin)) {
    errors.push(`${prefix}.termin: Erhoehungstermin als MM-TT angeben`);
  }
  if (d.erlischt_nach !== undefined && (!Number.isInteger(d.erlischt_nach) || d.erlischt_nach < 1)) {
    errors.push(`${prefix}.erlischt_nach: muss Ganzzahl >= 1 sein`);
  }
  if (d.verlauf === undefined) return;
  if (!Array.isArray(d.verlauf)) { errors.push(`${prefix}.verlauf: muss eine Liste sein`); return; }
  const jahre = new Set();
  d.verlauf.forEach((e, i) => {
    const p = `${prefix}.verlauf[${i}]`;
    if (!e || typeof e !== "object" || Array.isArray(e)) { errors.push(`${p}: muss ein Objekt sein`); return; }
    for (const feld of Object.keys(e)) if (!DYNAMIK_EINTRAG_FELDER.has(feld)) errors.push(`${p}.${feld}: unbekanntes Feld`);
    if (typeof e.termin !== "string" || !isIsoDate(e.termin)) errors.push(`${p}.termin: muss ISO-Datum YYYY-MM-DD sein`);
    else if (jahre.has(e.termin.slice(0, 4))) errors.push(`${p}.termin: ${e.termin.slice(0, 4)} ist schon erfasst, je Jahr eine Entscheidung`);
    else jahre.add(e.termin.slice(0, 4));
    if (!DYNAMIK_ENTSCHEIDUNGEN.includes(e.entscheidung)) errors.push(`${p}.entscheidung: erlaubt sind ${DYNAMIK_ENTSCHEIDUNGEN.join("|")}`);
    if (e.bemerkung !== undefined && typeof e.bemerkung !== "string") errors.push(`${p}.bemerkung: muss string sein`);
  });
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
