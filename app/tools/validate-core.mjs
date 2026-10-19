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
      person_id: { type: "string", pattern: /^PER-\d{3,}$/ },
      name: { type: "string", minLength: 1 },
      status: { type: "string", enum: ["aktiv", "inaktiv"] },
      aktiv_bis: { type: "string", format: "date" },
    },
  },
  konten: {
    required: ["konto_id", "name", "kontotyp", "inhaber_person_ids", "liquiditaetsrelevant", "status"],
    fields: {
      konto_id: { type: "string", pattern: /^KTO-\d{3,}$/ },
      name: { type: "string", minLength: 1 },
      kontotyp: { type: "string", enum: ["giro", "spar", "tagesgeld", "festgeld", "depot", "kreditkarte", "bar"] },
      kontoreferenz: { type: "string", minLength: 1 },
      inhaber_person_ids: { type: "array", minItems: 1, itemPattern: /^PER-\d{3,}$/, uniqueItems: true },
      liquiditaetsrelevant: { type: "boolean" },
      status: { type: "string", enum: ["aktiv", "geschlossen"] },
      aktiv_bis: { type: "string", format: "date" },
    },
  },
  kategorien: {
    required: ["kategorie_id", "name", "typ", "lebenshaltung_relevant", "status"],
    fields: {
      kategorie_id: { type: "string", pattern: /^KAT-\d{3,}$/ },
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
      konto_id: { type: "string", pattern: /^KTO-\d{3,}$/ },
      buchungsdatum: { type: "string", format: "date" },
      betrag: { type: "string", money: true },
      gegenpartei: { type: "string" },
      verwendungszweck: { type: "string" },
      kategorisierung_status: { type: "string", enum: ["offen", "vorgeschlagen", "bestaetigt", "abgelehnt"] },
      ist_transfer: { type: "boolean" },
      kategorie_id: { type: "string", pattern: /^KAT-\d{3,}$/ },
      kategorie_herkunft: { type: "string", enum: ["regel", "agent", "manuell"] },
      bestaetigt_durch: { type: "string", enum: ["auto", "mensch"] },
      matched_regeln: { type: "array", itemPattern: /^REG-\d{3,}$/ },
      bank_referenz: { type: "string" },
      wertstellungsdatum: { type: "string", format: "date" },
      transaktionstyp: { type: "string" },
      kundenreferenz: { type: "string" },
      empfaenger: { type: "string" },
      empfaenger_iban: { type: "string" },
      mandatsreferenz: { type: "string" },
      glaeubiger_id: { type: "string" },
      regelzahlung_id: { type: "string", pattern: /^RZ-\d{3,}$/ },
      immobilie_id: { type: "string", pattern: /^IMM-\d{3,}$/ },
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
      regelzahlung_id: { type: "string", pattern: /^RZ-\d{3,}$/ },
      bezeichnung: { type: "string", minLength: 1 },
      betrag: { type: "string", money: true },
      rhythmus_einheit: { type: "string", enum: ["tag", "woche", "monat", "jahr"] },
      rhythmus_intervall: { type: "number", integer: true, min: 1 },
      anker_datum: { type: "string", format: "date" },
      aktiv_bis: { type: "string", format: "date" },
      status: { type: "string", enum: ["vorgeschlagen", "bestaetigt", "abgelehnt"] },
      kategorie_id: { type: "string", pattern: /^KAT-\d{3,}$/ },
      darlehen_id: { type: "string", pattern: /^DAR-\d{3,}$/ },
      vorsorge_id: { type: "string", pattern: /^VS-\d{3,}$/ },
      konto_id: { type: "string", pattern: /^KTO-\d{3,}$/ },
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
      frist_id: { type: "string", pattern: /^FR-\d{3,}$/ },
      bezeichnung: { type: "string", minLength: 1 },
      art: { type: "string", enum: ["widerspruch", "kuendigung", "entscheidung", "wiedervorlage", "sonstiges"] },
      datum: { type: "string", format: "date" },
      rhythmus_einheit: { type: "string", enum: ["tag", "woche", "monat", "jahr"] },
      rhythmus_intervall: { type: "number", integer: true, min: 1 },
      vorsorge_id: { type: "string", pattern: /^VS-\d{3,}$/ },
      darlehen_id: { type: "string", pattern: /^DAR-\d{3,}$/ },
      immobilie_id: { type: "string", pattern: /^IMM-\d{3,}$/ },
      konto_id: { type: "string", pattern: /^KTO-\d{3,}$/ },
      vermoegenswert_id: { type: "string", pattern: /^VMW-\d{3,}$/ },
      regelzahlung_id: { type: "string", pattern: /^RZ-\d{3,}$/ },
      erledigt_bis: { type: "string", format: "date" },
      bemerkung: { type: "string" },
    },
  },
  szenarien: {
    optional: true,
    required: ["szenario_id", "name", "status", "stand", "reichweite_bis", "erstellt_am", "annahmen"],
    fields: {
      szenario_id: { type: "string", pattern: /^SZN-\d{3,}$/ },
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
      immobilie_id: { type: "string", pattern: /^IMM-\d{3,}$/ },
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
      darlehen_id: { type: "string", pattern: /^DAR-\d{3,}$/ },
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
      immobilie_id: { type: "string", pattern: /^IMM-\d{3,}$/ },
      konto_id: { type: "string", pattern: /^KTO-\d{3,}$/ },
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
      vermoegenswert_id: { type: "string", pattern: /^VMW-\d{3,}$/ },
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
      vorsorge_id: { type: "string", pattern: /^VS-\d{3,}$/ },
      art: { type: "string", enum: ["lebensversicherung", "rentenversicherung", "gesetzliche-rente", "betriebsrente", "riester", "ruerup", "schutzversicherung", "sonstig"] },
      name: { type: "string", minLength: 1 },
      versicherungsnummer: { type: "string", minLength: 1 },
      person_id: { type: "string", pattern: /^PER-\d{3,}$/ },
      status: { type: "string", enum: ["aktiv", "gekuendigt", "ruhend", "geplant", "laufend", "beendet"] },
      kapitalbildend: { type: "boolean" },
      kapitalwahl: { type: "string", enum: ["offen", "monatsrente", "kapital"] },
      sparte: { type: "string", enum: ["kfz", "haftpflicht", "rechtsschutz", "hausrat", "wohngebaeude", "photovoltaik", "berufsunfaehigkeit", "pflege", "krankenzusatz", "unfall", "risikoleben", "reise", "sonstige"] },
      geprueft_am: { type: "string", format: "date" },
      leistung_beginn: { type: "string", format: "date" },
      ersetzt_vorsorge_id: { type: "string", pattern: /^VS-\d{3,}$/ },
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
      regel_id: { type: "string", pattern: /^REG-\d{3,}$/ },
      gegenpartei_pattern: { type: "string", minLength: 1 },
      verwendungszweck_pattern: { type: "string", minLength: 1 },
      konto_id: { type: "string", pattern: /^KTO-\d{3,}$/ },
      vorzeichen: { type: "string", enum: ["einnahme", "ausgabe"] },
      kategorie_id: { type: "string", pattern: /^KAT-\d{3,}$/ },
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
      logo_id: { type: "string", pattern: /^LOGO-\d{3,}$/ },
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
//
// Ergebnis: `errors` (Meldungstexte, wie bisher) und `befunde` in derselben
// Reihenfolge, je { code, stufe, sammlung, objekt, feld, meldung }. `code` ist
// stabil je Pruefung, `objekt` die ID des Datensatzes (nie der Zeilenindex,
// wo eine ID lesbar ist): Rueckrollung und Schreiblaeufe vergleichen vorher und
// nachher ueber neueBefunde, nicht ueber den Text.
export function validateMasterData(data) {
  const errors = [];
  if (!istObjekt(data)) {
    melde(errors, "typ", "Bestand", "muss ein Objekt sein");
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
    melde(errors, "konsistenz", `Querpruefung abgebrochen`, `${error?.message ?? error}`);
  }

  return {
    valid: errors.length === 0,
    errors: errors.map((b) => b.meldung),
    befunde: errors,
  };
}

// Haengt einen Befund an. `pfad` ist der lesbare Ort wie bisher
// ("transaktionen.TXN-….kategorie_id", "konten[3].name"); Sammlung, Objekt und
// Feld werden daraus gelesen, `objekt` laesst sich ueberschreiben (Zeilenindex
// durch ID ersetzen, Zeitwerte ohne eigene ID).
function melde(befunde, code, pfad, text, objekt) {
  const ort = zerlegePfad(pfad);
  befunde.push({
    code,
    stufe: "fehler",
    sammlung: ort.sammlung,
    objekt: objekt ?? ort.objekt,
    feld: ort.feld,
    text,
    meldung: `${pfad}: ${text}`,
  });
}

function zerlegePfad(pfad) {
  const m = /^([a-z_]+)(?:\[(\d+)\]|\.([^.]+))?(?:\.(.+))?$/i.exec(pfad);
  if (!m) return { sammlung: pfad, objekt: null, feld: null };
  return { sammlung: m[1], objekt: m[2] !== undefined ? `#${m[2]}` : (m[3] ?? null), feld: m[4] ?? null };
}

// Zum Ort gehoert auch die Art der Pruefung: der Meldungstext ohne die
// eingesetzten Werte (IDs, Zahlen, Zeilenindex). Sonst fielen verschiedene
// Pruefungen am selben Objekt ohne eigenes Feld (Szenario-Annahmen,
// Transfers) zusammen, und ein neuer Fehler versteckte sich hinter einem alten.
function pruefungsArt(text) {
  return String(text ?? "").replace(/\b[A-Z]{2,4}-[0-9a-f-]+\b/g, "<id>").replace(/\d+/g, "#");
}

function befundSchluessel(b) {
  return typeof b === "string" ? b : `${b.code}|${b.sammlung}|${b.objekt ?? ""}|${b.feld ?? ""}|${pruefungsArt(b.text)}`;
}

// Befunde in `nachher`, die `vorher` nicht hatte, als Multimenge ueber
// (Code, Sammlung, Objekt, Feld, Art der Pruefung): ein Datensatz, der nur weiterrueckt, bleibt
// derselbe Befund; ein zweiter gleichartiger Fehler am selben Ort ist neu.
// Nimmt auch reine Meldungstexte (dann zaehlt der Text).
export function neueBefunde(vorher, nachher) {
  const bekannt = new Map();
  for (const b of vorher) bekannt.set(befundSchluessel(b), (bekannt.get(befundSchluessel(b)) ?? 0) + 1);
  return nachher.filter((b) => {
    const k = befundSchluessel(b);
    const n = bekannt.get(k) ?? 0;
    if (n > 0) {
      bekannt.set(k, n - 1);
      return false;
    }
    return true;
  });
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
    melde(errors, "typ", `${collectionName}`, `muss eine Liste sein`);
    return;
  }

  const idField = primaryIdField(schema);
  collection.forEach((item, index) => {
    const path = `${collectionName}[${index}]`;
    if (!istObjekt(item)) {
      melde(errors, "typ", `${path}`, `muss ein Objekt sein`);
      return;
    }
    // Objekt im Befund: die ID, wenn lesbar, sonst Zeitwert-Schluessel oder Index.
    const objekt = objektKennung(collectionName, item, idField) ?? `#${index}`;

    for (const field of schema.required) {
      if (!Object.hasOwn(item, field)) {
        melde(errors, "pflichtfeld", `${path}.${field}`, `Pflichtfeld fehlt`, objekt);
      }
    }

    for (const field of Object.keys(item)) {
      if (!Object.hasOwn(schema.fields, field)) {
        melde(errors, "unbekanntes-feld", `${path}.${field}`, `unbekanntes Feld`, objekt);
        continue;
      }
      validateField(`${path}.${field}`, item[field], schema.fields[field], errors, objekt);
    }
  });

  if (idField) {
    const seen = new Map();
    collection.forEach((item, index) => {
      if (!istObjekt(item)) return;
      const id = item[idField];
      if (typeof id !== "string") return;
      const path = `${collectionName}[${index}].${idField}`;
      if (seen.has(id)) {
        melde(errors, "doppelt", `${path}`, `${id} doppelt mit ${seen.get(id)}`, id);
      } else {
        seen.set(id, `${collectionName}[${index}]`);
      }
    });
  }
}

function objektKennung(collectionName, item, idField) {
  if (collectionName === "zeitwerte") return zeitwertKennung(item);
  return idField && typeof item[idField] === "string" ? item[idField] : null;
}

// Zeitwerte haben keine eigene ID; fachlich eindeutig ist (Entitaet, ID, Feld, Datum).
function zeitwertKennung(zw) {
  return [zw.entitaet, zw.entitaet_id, zw.feld, zw.standdatum].map((t) => (typeof t === "string" ? t : "?")).join(":");
}

function primaryIdField(schema) {
  return schema.required.find((field) => field.endsWith("_id") && schema.fields[field]?.pattern);
}

function validateField(path, value, rule, errors, objekt) {
  if (rule.type === "array") {
    if (!Array.isArray(value)) {
      melde(errors, "typ", `${path}`, `muss eine Liste sein`, objekt);
      return;
    }
    if (rule.minItems && value.length < rule.minItems) {
      melde(errors, "zahl", `${path}`, `braucht mindestens ${rule.minItems} Eintrag`, objekt);
    }
    if (rule.uniqueItems && new Set(value).size !== value.length) {
      melde(errors, "doppelt", `${path}`, `Eintraege muessen eindeutig sein`, objekt);
    }
    if (rule.itemEnum) {
      value.forEach((entry, index) => {
        if (!rule.itemEnum.includes(entry)) melde(errors, "wert-nicht-erlaubt", `${path}[${index}]`, `Wert nicht erlaubt`, objekt);
      });
    }
    if (rule.itemPattern) {
      value.forEach((entry, index) => {
        if (typeof entry !== "string" || !rule.itemPattern.test(entry)) {
          melde(errors, "format", `${path}[${index}]`, `Format ungueltig`, objekt);
        }
      });
    }
    return;
  }

  if (typeof value !== rule.type) {
    melde(errors, "typ", `${path}`, `muss ${rule.type} sein`, objekt);
    return;
  }
  if (rule.integer && !Number.isInteger(value)) {
    melde(errors, "zahl", `${path}`, `muss eine Ganzzahl sein`, objekt);
  }
  if (rule.min !== undefined && value < rule.min) {
    melde(errors, "zahl", `${path}`, `muss mindestens ${rule.min} sein`, objekt);
  }
  if (rule.minLength && value.length < rule.minLength) {
    melde(errors, "leer", `${path}`, `darf nicht leer sein`, objekt);
  }
  if (rule.enum && !rule.enum.includes(value)) {
    melde(errors, "wert-nicht-erlaubt", `${path}`, `Wert nicht erlaubt`, objekt);
  }
  if (rule.pattern && !rule.pattern.test(value)) {
    melde(errors, "format", `${path}`, `Format ungueltig`, objekt);
  }
  if (rule.money && !istGueltigerBetrag(value)) {
    melde(errors, "betrag", `${path}`, `kein gueltiger Betrag (zwei Nachkommastellen, keine fuehrenden Nullen, kein -0.00)`, objekt);
  }
  if (rule.nonNegative && istGueltigerBetrag(value) && value.startsWith("-")) {
    melde(errors, "betrag-negativ", `${path}`, `darf nicht negativ sein`, objekt);
  }
  if (rule.format === "date" && !isIsoDate(value)) {
    melde(errors, "datum", `${path}`, `muss ISO-Datum YYYY-MM-DD sein`, objekt);
  }
}

function validateVorsorgeStatusJeArt(vs, errors) {
  if (typeof vs.art !== "string" || typeof vs.status !== "string") return;

  const erlaubteStatus = erlaubteVorsorgeStatusJeArt.get(vs.art);
  if (!erlaubteStatus || erlaubteStatus.includes(vs.status)) return;

  melde(errors, "konsistenz", `vorsorge.${vs.vorsorge_id}.status`, `status ${vs.status} passt nicht zu art ${vs.art}; erlaubt: ${erlaubteStatus.join("|")}`);
}

// Zustandstabelle der Kategorisierung: die einzigen legalen Kombinationen aus
// Status, Herkunft, bestaetigt_durch, Regelbezug (matched_regeln) und Kategorie.
// `herkunft: null` heisst: Feld fehlt; `bestaetigt_durch`/`matched_regeln`
// zaehlen die erlaubten Auspraegungen auf (null bzw. false = Feld fehlt).
//
// Herkunftsvertrag: `kategorie_herkunft` und `matched_regeln` halten die
// Entscheidung fest, wie sie damals fiel, nicht die heutige Regelwirkung. Die
// Kategorie einer bestaetigten Regel-Buchung muss deshalb nicht der Kategorie
// gleichen, die ihre Regeln heute liefern (Widersprueche zeigt der
// Pruefbericht). Nach einer Regelaenderung darf der Regelbezug einer
// Bestaetigung fehlen (recategorize: "Quelle nicht mehr ermittelbar"); ein
// offener Regelvorschlag braucht ihn immer. Wer was setzt: import/recategorize
// (offen, vorgeschlagen+regel), agent_vorschlag (vorgeschlagen+agent),
// freigabe (bestaetigt+auto), bestaetigen (bestaetigt+mensch, manuell, abgelehnt).
export const KATEGORISIERUNG_ZUSTAENDE = Object.freeze([
  { status: "offen", herkunft: null, kategorie: false, bestaetigt_durch: [null], matched_regeln: [false, true] },
  { status: "vorgeschlagen", herkunft: "regel", kategorie: true, bestaetigt_durch: [null], matched_regeln: [true] },
  { status: "vorgeschlagen", herkunft: "agent", kategorie: true, bestaetigt_durch: [null], matched_regeln: [false] },
  { status: "bestaetigt", herkunft: "regel", kategorie: true, bestaetigt_durch: ["auto", "mensch"], matched_regeln: [true, false] },
  { status: "bestaetigt", herkunft: "agent", kategorie: true, bestaetigt_durch: ["auto", "mensch"], matched_regeln: [false] },
  { status: "bestaetigt", herkunft: "manuell", kategorie: true, bestaetigt_durch: ["mensch"], matched_regeln: [false] },
  { status: "abgelehnt", herkunft: null, kategorie: false, bestaetigt_durch: [null], matched_regeln: [false] },
]);

const HERKUNFT_TEXT = { manuell: "manueller Herkunft", agent: "Agenten-Herkunft", regel: "Regel-Herkunft" };

function pruefeKategorisierungZustand(tx, errors) {
  const zeilen = KATEGORISIERUNG_ZUSTAENDE.filter((z) => z.status === tx.kategorisierung_status);
  if (zeilen.length === 0) return; // unbekannter Status: meldet die Feldpruefung
  const ort = (feld) => `transaktionen.${tx.transaktion_id}.${feld}`;
  const status = tx.kategorisierung_status;
  const herkunft = tx.kategorie_herkunft ?? null;
  const zeile = zeilen.find((z) => z.herkunft === herkunft);
  if (!zeile) {
    const erlaubt = zeilen.map((z) => z.herkunft ?? "keine");
    melde(errors, "kategorisierung-zustand", ort("kategorie_herkunft"), herkunft === null
      ? `Pflicht bei ${status} (erlaubt: ${erlaubt.join("|")})`
      : `${herkunft} nicht erlaubt bei ${status} (erlaubt: ${erlaubt.join("|")})`);
  }
  // Ohne passende Zeile gilt, was irgendeine Zeile dieses Status erlaubt.
  const moeglich = zeile ? [zeile] : zeilen;

  const hatKategorie = Boolean(tx.kategorie_id);
  if (zeilen[0].kategorie && !hatKategorie) {
    melde(errors, "kategorisierung-zustand", ort("kategorie_id"), `Pflicht bei ${status}; ${status} braucht kategorie_id`);
  } else if (!zeilen[0].kategorie && hatKategorie) {
    melde(errors, "kategorisierung-zustand", ort("kategorie_id"), `${status} darf keine kategorie_id tragen`);
  }

  // Eine Bestaetigung ohne Urheber laesst nicht mehr unterscheiden, ob je ein
  // Mensch hingeschaut hat — davon haengt ab, ob recategorize sie anfassen darf.
  const durch = tx.bestaetigt_durch ?? null;
  if (!moeglich.some((z) => z.bestaetigt_durch.includes(durch))) {
    const text = durch === null ? `Pflicht bei ${status}`
      : status !== "bestaetigt" ? "nur erlaubt bei bestaetigt"
        : `${durch} nicht erlaubt bei ${HERKUNFT_TEXT[herkunft] ?? status} (erlaubt: ${zeile.bestaetigt_durch.join("|")})`;
    melde(errors, "kategorisierung-zustand", ort("bestaetigt_durch"), text);
  }

  if (Array.isArray(tx.matched_regeln) && tx.matched_regeln.length === 0) {
    melde(errors, "kategorisierung-zustand", ort("matched_regeln"), "leere Liste nicht erlaubt (Feld weglassen)");
    return;
  }
  const regelbezug = Array.isArray(tx.matched_regeln);
  if (!moeglich.some((z) => z.matched_regeln.includes(regelbezug))) {
    const text = regelbezug
      ? `nicht erlaubt bei ${zeile && herkunft ? HERKUNFT_TEXT[herkunft] : status}`
      : `Pflicht bei ${status} mit ${HERKUNFT_TEXT[herkunft] ?? "dieser Herkunft"}`;
    melde(errors, "kategorisierung-zustand", ort("matched_regeln"), text);
  }
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
        melde(errors, "verweis", `konten.${konto.konto_id}.inhaber_person_ids`, `person_id ${personId} existiert nicht`);
      }
    });
  });

  const dedupeHashes = new Map();
  data.transaktionen?.forEach((transaktion) => {
    if (!konten.has(transaktion.konto_id)) {
      melde(errors, "verweis", `transaktionen.${transaktion.transaktion_id}.konto_id`, `${transaktion.konto_id} existiert nicht`);
    }
    pruefeKategorisierungZustand(transaktion, errors);
    if (transaktion.kategorie_id && !kategorien.has(transaktion.kategorie_id)) {
      melde(errors, "verweis", `transaktionen.${transaktion.transaktion_id}.kategorie_id`, `${transaktion.kategorie_id} existiert nicht`);
    }
    if (transaktion.ist_transfer === true && !transaktion.transfer_id) {
      melde(errors, "konsistenz", `transaktionen.${transaktion.transaktion_id}.transfer_id`, `Pflicht bei Transfer`);
    }
    if (transaktion.transfer_id && !transfers.has(transaktion.transfer_id)) {
      melde(errors, "verweis", `transaktionen.${transaktion.transaktion_id}.transfer_id`, `${transaktion.transfer_id} existiert nicht`);
    } else if (transaktion.transfer_id) {
      // Beidseitig: die Buchung muss selbst eine Seite genau dieses Transfers sein,
      // sonst zaehlte eine dritte Buchung still als Transfer (und fiele aus Ausgaben).
      const transfer = transfers.get(transaktion.transfer_id);
      if (transaktion.transaktion_id !== transfer.abgang_transaktion_id && transaktion.transaktion_id !== transfer.zugang_transaktion_id) {
        melde(errors, "konsistenz", `transaktionen.${transaktion.transaktion_id}.transfer_id`, `Buchung ist keine Seite von ${transaktion.transfer_id}`);
      }
    }
    if (transaktion.regelzahlung_id && !regelzahlungen.has(transaktion.regelzahlung_id)) {
      melde(errors, "verweis", `transaktionen.${transaktion.transaktion_id}.regelzahlung_id`, `${transaktion.regelzahlung_id} existiert nicht`);
    }
    if (transaktion.immobilie_id && !immobilien.has(transaktion.immobilie_id)) {
      melde(errors, "verweis", `transaktionen.${transaktion.transaktion_id}.immobilie_id`, `${transaktion.immobilie_id} existiert nicht`);
    }
    if (dedupeHashes.has(transaktion.dedupe_hash)) {
      melde(errors, "doppelt", `transaktionen.${transaktion.transaktion_id}.dedupe_hash`, `doppelt mit ${dedupeHashes.get(transaktion.dedupe_hash)}`);
    } else {
      dedupeHashes.set(transaktion.dedupe_hash, transaktion.transaktion_id);
    }
  });

  data.kategorisierungsregeln?.forEach((regel) => {
    if (regel.kategorie_id && !kategorien.has(regel.kategorie_id)) {
      melde(errors, "verweis", `kategorisierungsregeln.${regel.regel_id}.kategorie_id`, `${regel.kategorie_id} existiert nicht`);
    }
    if (regel.konto_id && !konten.has(regel.konto_id)) {
      melde(errors, "verweis", `kategorisierungsregeln.${regel.regel_id}.konto_id`, `${regel.konto_id} existiert nicht`);
    }
    if (regel.status === "aktiv" && !regel.gegenpartei_pattern && !regel.verwendungszweck_pattern) {
      melde(errors, "konsistenz", `kategorisierungsregeln.${regel.regel_id}`, `aktive Regel braucht gegenpartei_pattern oder verwendungszweck_pattern`);
    }
    // Auch bei inaktiven Regeln: eine Reaktivierung prueft niemand neu.
    for (const feld of ["gegenpartei_pattern", "verwendungszweck_pattern"]) {
      if (typeof regel[feld] === "string" && hatLeerenZweig(regel[feld])) {
        melde(errors, "musterzweig", `kategorisierungsregeln.${regel.regel_id}.${feld}`, `leerer Musterzweig (ein Tippfehler wie "A|B|" traefe jede Buchung)`);
      }
    }
  });

  const regelIds = new Set((data.kategorisierungsregeln ?? []).map((r) => r.regel_id));
  data.transaktionen?.forEach((tx) => {
    if (!Array.isArray(tx.matched_regeln)) return;
    for (const id of tx.matched_regeln) {
      if (!regelIds.has(id)) {
        melde(errors, "verweis", `transaktionen.${tx.transaktion_id}.matched_regeln`, `${id} existiert nicht`);
      }
    }
  });

  data.transfers?.forEach((transfer) => validateTransfer(transfer, transaktionen, errors));

  data.regelzahlungen?.forEach((rz) => {
    if (rz.kategorie_id && !kategorien.has(rz.kategorie_id)) {
      melde(errors, "verweis", `regelzahlungen.${rz.regelzahlung_id}.kategorie_id`, `${rz.kategorie_id} existiert nicht`);
    }
    if (rz.konto_id && !konten.has(rz.konto_id)) {
      melde(errors, "verweis", `regelzahlungen.${rz.regelzahlung_id}.konto_id`, `${rz.konto_id} existiert nicht`);
    }
    if (rz.aktiv_bis && rz.anker_datum && rz.aktiv_bis < rz.anker_datum) {
      melde(errors, "konsistenz", `regelzahlungen.${rz.regelzahlung_id}.aktiv_bis`, `liegt vor anker_datum`);
    }
  });

  const darlehen = byId(data.darlehen, "darlehen_id");
  const vermoegenswerte = byId(data.vermoegenswerte, "vermoegenswert_id");
  const vorsorge = byId(data.vorsorge, "vorsorge_id");

  data.immobilien?.forEach((imm) => pruefeAnteile(`immobilien.${imm.immobilie_id}`, imm.eigentumsanteile, personen, errors));
  data.vermoegenswerte?.forEach((vmw) => pruefeAnteile(`vermoegenswerte.${vmw.vermoegenswert_id}`, vmw.eigentumsanteile, personen, errors));

  data.darlehen?.forEach((dar) => {
    if (dar.immobilie_id && !immobilien.has(dar.immobilie_id)) {
      melde(errors, "verweis", `darlehen.${dar.darlehen_id}.immobilie_id`, `${dar.immobilie_id} existiert nicht`);
    }
    if (dar.konto_id && !konten.has(dar.konto_id)) {
      melde(errors, "verweis", `darlehen.${dar.darlehen_id}.konto_id`, `${dar.konto_id} existiert nicht`);
    }
    if (dar.aktiv_bis && dar.anfangsdatum && dar.aktiv_bis < dar.anfangsdatum) {
      melde(errors, "konsistenz", `darlehen.${dar.darlehen_id}.aktiv_bis`, `liegt vor anfangsdatum`);
    }
    if (dar.laufzeit_bis && dar.anfangsdatum && dar.laufzeit_bis < dar.anfangsdatum) {
      melde(errors, "konsistenz", `darlehen.${dar.darlehen_id}.laufzeit_bis`, `liegt vor anfangsdatum`);
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
      melde(errors, "zeitwert-doppelt", `zeitwerte[${i}]`, `${zw.entitaet} ${zw.entitaet_id} ${zw.feld} ${zw.standdatum} hat schon einen anderen Wert (zeitwerte[${frueher.index}])`, zeitwertKennung(zw));
    }
  });
  data.zeitwerte?.forEach((zw, i) => {
    const map = Object.hasOwn(zeitwertEntitaeten, zw.entitaet) ? zeitwertEntitaeten[zw.entitaet] : undefined;
    if (map && !map.has(zw.entitaet_id)) {
      melde(errors, "verweis", `zeitwerte[${i}].entitaet_id`, `${zw.entitaet_id} existiert nicht (${zw.entitaet})`, zeitwertKennung(zw));
    }
    const felder = Object.hasOwn(erlaubteFelder, zw.entitaet) ? erlaubteFelder[zw.entitaet] : undefined;
    if (felder && !felder.includes(zw.feld)) {
      melde(errors, "konsistenz", `zeitwerte[${i}].feld`, `${zw.feld} ist fuer ${zw.entitaet} nicht zulaessig (erlaubt: ${felder.join("|")})`, zeitwertKennung(zw));
    }
  });

  data.regelzahlungen?.forEach((rz) => {
    if (rz.darlehen_id && !darlehen.has(rz.darlehen_id)) {
      melde(errors, "verweis", `regelzahlungen.${rz.regelzahlung_id}.darlehen_id`, `${rz.darlehen_id} existiert nicht`);
    }
    if (rz.vorsorge_id && !vorsorge.has(rz.vorsorge_id)) {
      melde(errors, "verweis", `regelzahlungen.${rz.regelzahlung_id}.vorsorge_id`, `${rz.vorsorge_id} existiert nicht`);
    }
  });

  // Arten ohne Rueckkaufswert koennen nie kapitalbildend sein.
  const nieKapitalbildend = new Set(["gesetzliche-rente", "schutzversicherung"]);
  data.vorsorge?.forEach((vs) => {
    if (!personen.has(vs.person_id)) {
      melde(errors, "verweis", `vorsorge.${vs.vorsorge_id}.person_id`, `${vs.person_id} existiert nicht`);
    }
    if (vs.kapitalbildend === true && nieKapitalbildend.has(vs.art)) {
      melde(errors, "konsistenz", `vorsorge.${vs.vorsorge_id}.kapitalbildend`, `${vs.art} hat keinen Rueckkaufswert und kann nicht kapitalbildend sein`);
    }
    // Riester ist zweckgebunden: hoechstens 30 Prozent Einmalzahlung zu Rentenbeginn, der
    // Rueckkaufswert nur bei Kuendigung mit Rueckforderung der Foerderung. Kein Aktivum.
    if (vs.kapitalbildend === true && vs.art === "riester") {
      melde(errors, "konsistenz", `vorsorge.${vs.vorsorge_id}.kapitalbildend`, `riester ist zweckgebunden (hoechstens 30 Prozent Einmalzahlung zu Rentenbeginn) und kann nicht kapitalbildend sein; der Rueckkaufswert bleibt als gebundenes Kapital erfasst`);
    }
    validateVorsorgeStatusJeArt(vs, errors);
    if (vs.dynamik !== undefined) pruefeDynamik(`vorsorge.${vs.vorsorge_id}.dynamik`, vs.dynamik, errors);
    if (vs.ersetzt_vorsorge_id) {
      if (vs.ersetzt_vorsorge_id === vs.vorsorge_id) {
        melde(errors, "konsistenz", `vorsorge.${vs.vorsorge_id}.ersetzt_vorsorge_id`, `darf nicht auf sich selbst zeigen`);
      } else if (!vorsorge.has(vs.ersetzt_vorsorge_id)) {
        melde(errors, "verweis", `vorsorge.${vs.vorsorge_id}.ersetzt_vorsorge_id`, `${vs.ersetzt_vorsorge_id} existiert nicht`);
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
      melde(errors, "frist-bezug", prefix, `hoechstens ein Bezug erlaubt (gesetzt: ${bezuege.map((typ) => `${typ}_id`).join(", ")})`);
    }
    for (const typ of bezuege) {
      const id = frist[`${typ}_id`];
      if (!objekte[typ].has(id)) melde(errors, "verweis", `${prefix}.${typ}_id`, `${id} existiert nicht`);
    }
    if (Object.hasOwn(frist, "rhythmus_einheit") !== Object.hasOwn(frist, "rhythmus_intervall")) {
      melde(errors, "konsistenz", `${prefix}`, `rhythmus_einheit und rhythmus_intervall nur zusammen`);
    }
  });
}

function validateTransfer(transfer, transaktionen, errors) {
  const prefix = `transfers.${transfer.transfer_id}`;
  const abgang = transfer.abgang_transaktion_id ? transaktionen.get(transfer.abgang_transaktion_id) : undefined;
  const zugang = transfer.zugang_transaktion_id ? transaktionen.get(transfer.zugang_transaktion_id) : undefined;

  if (transfer.typ === "intern") {
    if (!transfer.abgang_transaktion_id || !transfer.zugang_transaktion_id) {
      melde(errors, "konsistenz", `${prefix}`, `interner Transfer braucht abgang_transaktion_id und zugang_transaktion_id`);
      return;
    }
    if (transfer.abgang_transaktion_id === transfer.zugang_transaktion_id) {
      melde(errors, "konsistenz", `${prefix}`, `abgang_transaktion_id und zugang_transaktion_id muessen unterschiedliche Transaktionen sein`);
    }
    if (!abgang || !zugang) {
      if (!abgang) melde(errors, "verweis", `${prefix}.abgang_transaktion_id`, `referenzierte Transaktion ${transfer.abgang_transaktion_id} existiert nicht`);
      if (!zugang) melde(errors, "verweis", `${prefix}.zugang_transaktion_id`, `referenzierte Transaktion ${transfer.zugang_transaktion_id} existiert nicht`);
      return;
    }
    validateTransferReference(prefix, "abgang_transaktion_id", transfer, abgang, errors);
    validateTransferReference(prefix, "zugang_transaktion_id", transfer, zugang, errors);
    if (abgang.konto_id === zugang.konto_id) {
      melde(errors, "konsistenz", `${prefix}`, `interner Transfer braucht unterschiedliche Konten`);
    }
    if (toCents(abgang.betrag) + toCents(zugang.betrag) !== 0) {
      melde(errors, "konsistenz", `${prefix}`, `Betraege sind nicht gegenlaeufig und betragsgleich`);
    }
    if (Math.abs(toCents(abgang.betrag)) !== toCents(transfer.betrag)) {
      melde(errors, "konsistenz", `${prefix}.betrag`, `passt nicht zu den Transaktionen`);
    }
  }

  if (transfer.typ === "extern") {
    const referenceCount = Number(Boolean(transfer.abgang_transaktion_id)) + Number(Boolean(transfer.zugang_transaktion_id));
    if (referenceCount !== 1) {
      melde(errors, "konsistenz", `${prefix}`, `externer Transfer braucht genau eine Transaktion`);
    }
    if (referenceCount === 1) {
      const referenceField = transfer.abgang_transaktion_id ? "abgang_transaktion_id" : "zugang_transaktion_id";
      const referenceId = transfer[referenceField];
      const reference = transaktionen.get(referenceId);
      if (!reference) {
        melde(errors, "verweis", `${prefix}.${referenceField}`, `referenzierte Transaktion ${referenceId} existiert nicht`);
      } else {
        validateTransferReference(prefix, referenceField, transfer, reference, errors);
      }
    }
    if (!transfer.gegenseite_typ) {
      melde(errors, "konsistenz", `${prefix}.gegenseite_typ`, `Pflicht bei externem Transfer`);
    }
    if (!transfer.begruendung) {
      melde(errors, "konsistenz", `${prefix}.begruendung`, `Pflicht bei externem Transfer`);
    }
  }
}

function validateTransferReference(prefix, field, transfer, transaktion, errors) {
  if (transaktion.ist_transfer !== true) {
    melde(errors, "konsistenz", `${prefix}.${field}`, `${transaktion.transaktion_id} ist nicht als ist_transfer markiert`);
  }
  if (transaktion.transfer_id !== transfer.transfer_id) {
    melde(errors, "konsistenz", `${prefix}.${field}`, `${transaktion.transaktion_id} transfer_id-Rueckverweis fehlt/zeigt nicht auf ${transfer.transfer_id}`);
  }
}

// Phasen sind reine Beschriftung des Zeitstrahls: benannt, aufsteigend, im Horizont.
function validatePhasen(sz, p, errors) {
  if (sz.phasen === undefined) return;
  if (!Array.isArray(sz.phasen)) return;
  let vorher = null;
  sz.phasen.forEach((ph, i) => {
    const pp = `${p}.phasen[${i}]`;
    if (!ph || typeof ph !== "object") { melde(errors, "typ", `${pp}`, `muss ein Objekt sein`); return; }
    for (const feld of Object.keys(ph)) if (feld !== "name" && feld !== "ab") melde(errors, "unbekanntes-feld", `${pp}.${feld}`, `unbekanntes Feld`);
    if (typeof ph.name !== "string" || !ph.name.trim()) melde(errors, "konsistenz", `${pp}.name`, `fehlt`);
    if (typeof ph.ab !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(ph.ab)) { melde(errors, "konsistenz", `${pp}.ab`, `kein Datum`); return; }
    if (ph.ab > sz.reichweite_bis) melde(errors, "konsistenz", `${pp}.ab`, `liegt nach reichweite_bis`);
    if (vorher !== null && ph.ab <= vorher) melde(errors, "doppelt", `${pp}.ab`, `Phasen muessen aufsteigend und ohne doppelte Startdaten sein`);
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
      if (domains.has(logo.domain)) melde(errors, "doppelt", `${ort}.domain`, `${logo.domain} doppelt mit ${domains.get(logo.domain)}`);
      else domains.set(logo.domain, ort);
      if (typeof logo.datei === "string" && logo.datei !== `logos/${logo.domain}.png`) melde(errors, "konsistenz", `${ort}.datei`, `muss logos/${logo.domain}.png sein`);
    }
    if (typeof logo.gegenpartei_pattern === "string" && hatLeerenZweig(logo.gegenpartei_pattern)) {
      melde(errors, "musterzweig", `${ort}.gegenpartei_pattern`, `leerer Musterteil`);
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
    if (sz.reichweite_bis < sz.stand) melde(errors, "konsistenz", `${p}`, `reichweite_bis liegt vor stand`);
    validatePhasen(sz, p, errors);

    const gesehen = new Set();
    const verkauft = new Set(); // ziel_typ:ziel_id, gegen Doppelverkauf
    for (const a of Array.isArray(sz.annahmen) ? sz.annahmen : []) {
      if (!istObjekt(a)) {
        melde(errors, "konsistenz", `${p}.annahmen`, `Eintrag muss ein Objekt sein`);
        continue;
      }
      const ap = `${p}.${a.annahme_id ?? "?"}`;
      if (!a.annahme_id) melde(errors, "konsistenz", `${ap}`, `annahme_id fehlt`);
      else if (gesehen.has(a.annahme_id)) melde(errors, "doppelt", `${ap}`, `annahme_id doppelt`);
      gesehen.add(a.annahme_id);

      if (!["einmalzahlung", "regelzahlung-neu", "regelzahlung-aenderung", "vorsorge-leistung", "ereignis"].includes(a.art)) {
        melde(errors, "konsistenz", `${ap}`, `art unbekannt`);
        continue;
      }
      if (!["belegt", "geschaetzt", "offen"].includes(a.qualitaet)) melde(errors, "konsistenz", `${ap}`, `qualitaet ungueltig`);

      if (a.art === "regelzahlung-aenderung") {
        if (!rzIds.has(a.regelzahlung_id)) melde(errors, "verweis", `${ap}`, `regelzahlung_id ${a.regelzahlung_id} existiert nicht`);
        if (!isIsoDate(a.ab)) melde(errors, "konsistenz", `${ap}`, `ab fehlt/ungueltig`);
        if (!["beenden", "betrag-aendern"].includes(a.aktion)) melde(errors, "konsistenz", `${ap}`, `aktion ungueltig`);
        if (a.aktion === "betrag-aendern" && !istGueltigerBetrag(a.betrag)) melde(errors, "konsistenz", `${ap}`, `betrag-aendern braucht gueltigen betrag`);
        if (a.gegenbuchung) melde(errors, "konsistenz", `${ap}`, `regelzahlung-aenderung darf keine gegenbuchung haben`);
        continue;
      }

      if (a.art === "vorsorge-leistung") {
        if (!vorsorgeIds.has(a.vorsorge_id)) melde(errors, "verweis", `${ap}`, `vorsorge_id ${a.vorsorge_id} existiert nicht`);
        if (!["rente", "kapital"].includes(a.arm)) melde(errors, "konsistenz", `${ap}`, `arm ungueltig (rente|kapital)`);
        if (!isIsoDate(a.ab)) melde(errors, "konsistenz", `${ap}`, `ab fehlt/ungueltig`);
        if (a.gegenbuchung) melde(errors, "konsistenz", `${ap}`, `vorsorge-leistung darf keine gegenbuchung haben (wird zur Rechenzeit erzeugt)`);
        continue;
      }

      if (a.art === "ereignis") {
        if (!["bu", "arbeitslosigkeit"].includes(a.fall)) melde(errors, "konsistenz", `${ap}`, `fall ungueltig (bu|arbeitslosigkeit)`);
        if (!personIds.has(a.person_id)) melde(errors, "verweis", `${ap}`, `person_id ${a.person_id} existiert nicht`);
        if (!isIsoDate(a.ab)) melde(errors, "konsistenz", `${ap}`, `ab fehlt/ungueltig`);
        if (a.bis !== undefined && (!isIsoDate(a.bis) || (isIsoDate(a.ab) && a.bis < a.ab))) melde(errors, "konsistenz", `${ap}`, `bis ungueltig oder vor ab`);
        if (a.gegenbuchung) melde(errors, "konsistenz", `${ap}`, `ereignis darf keine gegenbuchung haben (wird zur Rechenzeit erzeugt)`);
        continue;
      }

      // Art-spezifische Pflichtfelder
      if (a.art === "einmalzahlung") {
        if (!isIsoDate(a.datum)) melde(errors, "konsistenz", `${ap}`, `datum fehlt/ungueltig`);
        if (typeof a.betrag !== "string" || !istGueltigerBetrag(a.betrag)) melde(errors, "konsistenz", `${ap}`, `betrag fehlt/ungueltig`);
      } else if (a.art === "regelzahlung-neu") {
        if (!isIsoDate(a.ab)) melde(errors, "konsistenz", `${ap}`, `ab fehlt/ungueltig`);
        if (a.bis !== undefined) {
          if (!isIsoDate(a.bis)) {
            melde(errors, "konsistenz", `${ap}`, `bis fehlt/ungueltig`);
          } else if (isIsoDate(a.ab) && a.bis < a.ab) {
            melde(errors, "konsistenz", `${ap}`, `bis liegt vor ab`);
          }
        }
        if (typeof a.betrag !== "string" || !istGueltigerBetrag(a.betrag)) melde(errors, "konsistenz", `${ap}`, `betrag fehlt/ungueltig`);
        if (!["tag", "woche", "monat", "jahr"].includes(a.rhythmus_einheit)) melde(errors, "konsistenz", `${ap}`, `rhythmus_einheit ungueltig`);
        if (!Number.isInteger(a.rhythmus_intervall) || a.rhythmus_intervall < 1) melde(errors, "konsistenz", `${ap}`, `rhythmus_intervall ungueltig`);
      }

      // einmalzahlung | regelzahlung-neu: Cash-Bein + optionale gegenbuchung
      const hatBetrag = typeof a.betrag === "string" && istGueltigerBetrag(a.betrag) && a.betrag !== "0.00";
      if (a.art === "einmalzahlung" && !hatBetrag && !a.gegenbuchung) {
        melde(errors, "konsistenz", `${ap}`, `einmalzahlung ohne Betrag und ohne gegenbuchung ist wirkungslos`);
      }

      if (a.gegenbuchung && !istObjekt(a.gegenbuchung)) {
        melde(errors, "konsistenz", `${ap}`, `gegenbuchung muss ein Objekt sein`);
      } else if (a.gegenbuchung) {
        const g = a.gegenbuchung;
        const hatZiel = !!g.ziel_id, hatNeu = !!g.neue_position;
        if (hatZiel === hatNeu) melde(errors, "konsistenz", `${ap}`, `gegenbuchung braucht genau eines von ziel_id / neue_position`);
        const zielIds = Object.hasOwn(idMengen, g.ziel_typ) ? idMengen[g.ziel_typ] : undefined;
        if (!zielIds) melde(errors, "konsistenz", `${ap}`, `gegenbuchung.ziel_typ ungueltig`);
        if (a.art === "regelzahlung-neu") {
          if (!["darlehen", "depot"].includes(g.ziel_typ)) melde(errors, "konsistenz", `${ap}`, `wiederkehrende gegenbuchung nur fuer darlehen|depot`);
          if (hatNeu) melde(errors, "konsistenz", `${ap}`, `wiederkehrende gegenbuchung braucht bestehende ziel_id`);
        }
        if (hatZiel && zielIds && !zielIds.has(g.ziel_id)) {
          melde(errors, "verweis", `${ap}`, `gegenbuchung.ziel_id ${g.ziel_id} existiert nicht in ${g.ziel_typ}`);
        }
        if (g.ziel_typ === "depot" && hatZiel && !depotIds.has(g.ziel_id)) {
          melde(errors, "konsistenz", `${ap}`, `depot-gegenbuchung verlangt ein Konto mit kontotyp=Depot`);
        }
        if (hatNeu && (!istObjekt(g.neue_position) || !g.neue_position.bezeichnung || !istGueltigerBetrag(g.neue_position.wert))) {
          melde(errors, "konsistenz", `${ap}`, `neue_position braucht bezeichnung und gueltigen wert`);
        }
        // Doppelverkauf/-abbau bestehender Sachwert-/Vorsorge-Positionen
        if (hatZiel && (g.ziel_typ === "immobilie" || g.ziel_typ === "vermoegenswert" || g.ziel_typ === "vorsorge")) {
          const key = `${g.ziel_typ}:${g.ziel_id}`;
          if (verkauft.has(key)) melde(errors, "konsistenz", `${ap}`, `Position ${g.ziel_id} wird im Szenario mehrfach abgebaut`);
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
  if (!d || typeof d !== "object" || Array.isArray(d)) { melde(errors, "typ", `${prefix}`, `muss ein Objekt sein`); return; }
  for (const feld of Object.keys(d)) if (!DYNAMIK_FELDER.has(feld)) melde(errors, "unbekanntes-feld", `${prefix}.${feld}`, `unbekanntes Feld`);
  if (typeof d.termin !== "string" || !/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(d.termin)) {
    melde(errors, "konsistenz", `${prefix}.termin`, `Erhoehungstermin als MM-TT angeben`);
  }
  if (d.erlischt_nach !== undefined && (!Number.isInteger(d.erlischt_nach) || d.erlischt_nach < 1)) {
    melde(errors, "zahl", `${prefix}.erlischt_nach`, `muss Ganzzahl >= 1 sein`);
  }
  if (d.verlauf === undefined) return;
  if (!Array.isArray(d.verlauf)) { melde(errors, "typ", `${prefix}.verlauf`, `muss eine Liste sein`); return; }
  const jahre = new Set();
  d.verlauf.forEach((e, i) => {
    const p = `${prefix}.verlauf[${i}]`;
    if (!e || typeof e !== "object" || Array.isArray(e)) { melde(errors, "typ", `${p}`, `muss ein Objekt sein`); return; }
    for (const feld of Object.keys(e)) if (!DYNAMIK_EINTRAG_FELDER.has(feld)) melde(errors, "unbekanntes-feld", `${p}.${feld}`, `unbekanntes Feld`);
    if (typeof e.termin !== "string" || !isIsoDate(e.termin)) melde(errors, "datum", `${p}.termin`, `muss ISO-Datum YYYY-MM-DD sein`);
    else if (jahre.has(e.termin.slice(0, 4))) melde(errors, "konsistenz", `${p}.termin`, `${e.termin.slice(0, 4)} ist schon erfasst, je Jahr eine Entscheidung`);
    else jahre.add(e.termin.slice(0, 4));
    if (!DYNAMIK_ENTSCHEIDUNGEN.includes(e.entscheidung)) melde(errors, "konsistenz", `${p}.entscheidung`, `erlaubt sind ${DYNAMIK_ENTSCHEIDUNGEN.join("|")}`);
    if (e.bemerkung !== undefined && typeof e.bemerkung !== "string") melde(errors, "typ", `${p}.bemerkung`, `muss string sein`);
  });
}

// Prueft Eigentumsanteile als exakte Brueche: person_id existiert (ausser extern),
// zaehler/nenner Ganzzahl >= 1, und die Bruch-Summe genau 1 (Integer-Arithmetik).
function pruefeAnteile(prefix, anteile, personenMap, errors) {
  if (!Array.isArray(anteile)) return;
  let num = 0, den = 1;
  anteile.forEach((a, i) => {
    const p = `${prefix}.eigentumsanteile[${i}]`;
    if (!a || typeof a !== "object") { melde(errors, "typ", `${p}`, `muss ein Objekt sein`); return; }
    const extern = a.extern === true;
    if (!extern && !personenMap.has(a.person_id)) {
      melde(errors, "verweis", `${p}.person_id`, `${a.person_id} existiert nicht`);
    }
    if (!Number.isInteger(a.zaehler) || a.zaehler < 1) melde(errors, "zahl", `${p}.zaehler`, `muss Ganzzahl >= 1 sein`);
    if (!Number.isInteger(a.nenner) || a.nenner < 1) melde(errors, "zahl", `${p}.nenner`, `muss Ganzzahl >= 1 sein`);
    if (Number.isInteger(a.zaehler) && Number.isInteger(a.nenner) && a.nenner >= 1) {
      num = num * a.nenner + a.zaehler * den;
      den = den * a.nenner;
    }
  });
  if (num !== den) {
    melde(errors, "konsistenz", `${prefix}.eigentumsanteile`, `Summe der Anteile muss genau 1 sein`);
  }
}

function isIsoDate(value) {
  if (!datePattern.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
