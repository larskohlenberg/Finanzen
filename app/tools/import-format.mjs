// app/tools/import-format.mjs
import { istGueltigerBetrag } from "./lib/text.mjs";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const regelzahlungPattern = /^RZ-\d{3}$/;
const optionalStringFields = [
  "bank_referenz",
  "transaktionstyp",
  "kundenreferenz",
  "empfaenger",
  "empfaenger_iban",
  "mandatsreferenz",
  "glaeubiger_id",
];

function isIsoDate(value) {
  if (typeof value !== "string" || !datePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function validateImportEntry(entry, kontenIds, regelzahlungIds = new Set()) {
  const errors = [];

  if (typeof entry.konto_id !== "string") {
    errors.push("konto_id: Pflichtfeld fehlt");
  } else if (!kontenIds.has(entry.konto_id)) {
    errors.push(`konto_id: ${entry.konto_id} unbekannt`);
  }

  if (!isIsoDate(entry.buchungsdatum)) {
    errors.push("buchungsdatum: muss ISO-Datum YYYY-MM-DD sein");
  }

  if (typeof entry.betrag !== "string") {
    errors.push("betrag: Pflichtfeld fehlt");
  } else if (!istGueltigerBetrag(entry.betrag)) {
    errors.push("betrag: kein gueltiger Betrag (zwei Nachkommastellen, keine fuehrenden Nullen, kein -0.00)");
  }

  if (typeof entry.gegenpartei !== "string") errors.push("gegenpartei: muss string sein");
  if (typeof entry.verwendungszweck !== "string") errors.push("verwendungszweck: muss string sein");

  if (typeof entry.rohquelle !== "string" || entry.rohquelle.trim().length === 0) {
    errors.push("rohquelle: Pflichtfeld fehlt");
  }

  if (Object.hasOwn(entry, "wertstellungsdatum") && !isIsoDate(entry.wertstellungsdatum)) {
    errors.push("wertstellungsdatum: muss ISO-Datum YYYY-MM-DD sein");
  }

  for (const field of optionalStringFields) {
    if (Object.hasOwn(entry, field) && typeof entry[field] !== "string") {
      errors.push(`${field}: muss string sein`);
    }
  }

  if (Object.hasOwn(entry, "regelzahlung_id")) {
    if (typeof entry.regelzahlung_id !== "string" || !regelzahlungPattern.test(entry.regelzahlung_id)) {
      errors.push("regelzahlung_id: Format ungueltig (invalid format)");
    } else if (!regelzahlungIds.has(entry.regelzahlung_id)) {
      errors.push(`regelzahlung_id: ${entry.regelzahlung_id} unbekannt (unknown)`);
    }
  }

  return errors;
}

// --- Importprofil -------------------------------------------------------------
// Struktur gegen schemas/importprofil.schema.json, ohne Validator-Abhaengigkeit:
// Profile sind keine Masterdaten, sie werden vor jeder Nutzung im Inbox-Lauf
// geprueft. Zusaetzlich zum Schema: dateimuster und muster muessen sich als
// regulaerer Ausdruck uebersetzen lassen, und eine Herkunft ist genau eins von
// {spalte[, muster, gruppe]} oder {konstante}.
const PROFIL_PFLICHT = ["profil_id", "quelle", "dateimuster", "konto_id", "kopfzeile", "datumsformat", "dezimal", "felder"];
const PROFIL_FELDER = new Set([...PROFIL_PFLICHT, "bezeichnung", "trennzeichen", "beleg_ziel"]);
const PROFIL_ZIELFELDER = new Set([
  "buchungsdatum", "wertstellungsdatum", "betrag", "gegenpartei", "verwendungszweck", "transaktionstyp",
  "kundenreferenz", "empfaenger", "empfaenger_iban", "mandatsreferenz", "glaeubiger_id", "bank_referenz",
]);
const HERKUNFT_FELDER = new Set(["spalte", "muster", "gruppe", "konstante"]);
const DATUMSFORMATE = ["DD.MM.YYYY", "DD/MM/YYYY", "YYYY-MM-DD"];

const istObjekt = (wert) => wert !== null && typeof wert === "object" && !Array.isArray(wert);

function regexFehler(pfad, wert) {
  try {
    new RegExp(wert);
    return [];
  } catch (error) {
    return [`${pfad}: kein gueltiger regulaerer Ausdruck (${error.message})`];
  }
}

function herkunftFehler(pfad, spec) {
  if (!istObjekt(spec)) return [`${pfad}: muss ein Objekt sein`];
  const fehler = [];
  for (const feld of Object.keys(spec)) {
    if (!HERKUNFT_FELDER.has(feld)) fehler.push(`${pfad}: unbekanntes Feld ${feld}`);
  }
  const hatSpalte = Object.hasOwn(spec, "spalte");
  const hatKonstante = Object.hasOwn(spec, "konstante");
  if (hatSpalte && hatKonstante) fehler.push(`${pfad}: spalte und konstante schliessen sich aus`);
  else if (!hatSpalte && !hatKonstante) fehler.push(`${pfad}: braucht spalte oder konstante`);
  if (hatSpalte && typeof spec.spalte !== "string") fehler.push(`${pfad}.spalte: muss string sein`);
  if (hatKonstante && typeof spec.konstante !== "string") fehler.push(`${pfad}.konstante: muss string sein`);
  if (!hatSpalte && (Object.hasOwn(spec, "muster") || Object.hasOwn(spec, "gruppe"))) fehler.push(`${pfad}: muster und gruppe nur zusammen mit spalte`);
  if (Object.hasOwn(spec, "muster")) {
    if (typeof spec.muster !== "string") fehler.push(`${pfad}.muster: muss string sein`);
    else fehler.push(...regexFehler(`${pfad}.muster`, spec.muster));
  }
  if (Object.hasOwn(spec, "gruppe") && !(Number.isInteger(spec.gruppe) && spec.gruppe >= 1)) {
    fehler.push(`${pfad}.gruppe: muss eine ganze Zahl ab 1 sein`);
  }
  return fehler;
}

function betragFehler(spec) {
  if (istObjekt(spec) && (Object.hasOwn(spec, "soll") || Object.hasOwn(spec, "haben"))) {
    const fehler = [];
    for (const feld of Object.keys(spec)) {
      if (feld !== "soll" && feld !== "haben") fehler.push(`felder.betrag: unbekanntes Feld ${feld}`);
    }
    for (const feld of ["soll", "haben"]) {
      if (typeof spec[feld] !== "string" || spec[feld] === "") fehler.push(`felder.betrag.${feld}: Pflichtfeld fehlt (Soll/Haben braucht beide Spalten)`);
    }
    return fehler;
  }
  return herkunftFehler("felder.betrag", spec);
}

export function validateImportProfil(profil) {
  if (!istObjekt(profil)) return ["Profil muss ein JSON-Objekt sein"];
  const fehler = [];
  for (const feld of PROFIL_PFLICHT) {
    if (!Object.hasOwn(profil, feld)) fehler.push(`${feld}: Pflichtfeld fehlt`);
  }
  for (const feld of Object.keys(profil)) {
    if (!PROFIL_FELDER.has(feld)) fehler.push(`unbekanntes Feld ${feld}`);
  }
  for (const feld of ["profil_id", "dateimuster", "konto_id", "kopfzeile", "bezeichnung", "trennzeichen", "beleg_ziel"]) {
    if (Object.hasOwn(profil, feld) && typeof profil[feld] !== "string") fehler.push(`${feld}: muss string sein`);
  }
  if (typeof profil.profil_id === "string" && !/^[a-z0-9-]+$/.test(profil.profil_id)) fehler.push("profil_id: nur Kleinbuchstaben, Ziffern und Bindestrich");
  if (typeof profil.konto_id === "string" && !/^KTO-\d{3}$/.test(profil.konto_id)) fehler.push("konto_id: muss dem Muster KTO-NNN folgen");
  if (typeof profil.dateimuster === "string") fehler.push(...regexFehler("dateimuster", profil.dateimuster));
  if (typeof profil.kopfzeile === "string" && profil.kopfzeile.trim() === "") fehler.push("kopfzeile: darf nicht leer sein");
  if (typeof profil.trennzeichen === "string" && profil.trennzeichen === "") fehler.push("trennzeichen: darf nicht leer sein");
  if (Object.hasOwn(profil, "quelle") && profil.quelle !== "csv") fehler.push(`quelle: muss "csv" sein`);
  if (Object.hasOwn(profil, "datumsformat") && !DATUMSFORMATE.includes(profil.datumsformat)) fehler.push(`datumsformat: muss eins von ${DATUMSFORMATE.join(", ")} sein`);
  if (Object.hasOwn(profil, "dezimal") && profil.dezimal !== "," && profil.dezimal !== ".") fehler.push(`dezimal: muss "," oder "." sein`);

  if (Object.hasOwn(profil, "felder")) {
    if (!istObjekt(profil.felder)) {
      fehler.push("felder: muss ein Objekt sein");
    } else {
      for (const feld of ["buchungsdatum", "betrag"]) {
        if (!Object.hasOwn(profil.felder, feld)) fehler.push(`felder.${feld}: Pflichtfeld fehlt`);
      }
      for (const [feld, spec] of Object.entries(profil.felder)) {
        if (!PROFIL_ZIELFELDER.has(feld)) fehler.push(`felder: unbekanntes Feld ${feld}`);
        else if (feld === "betrag") fehler.push(...betragFehler(spec));
        else fehler.push(...herkunftFehler(`felder.${feld}`, spec));
      }
    }
  }
  return fehler;
}
