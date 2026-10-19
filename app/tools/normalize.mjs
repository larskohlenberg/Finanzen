// app/tools/normalize.mjs
//
// Deterministische CSV-Normalisierung ins standardisierte Importformat, gesteuert
// durch ein Bank-Profil aus `data/import-profile/<id>.json`.
//
// Verhaeltnis zu ADR 0005 ("keine bankspezifischen Parser"): Der Kern der
// Entscheidung ist, dass kein CODE pro Bank entsteht, der bei Formatwechsel
// still bricht. Die Zuordnungs-Intelligenz bleibt beim Agenten — er schreibt das
// Profil EINMAL beim ersten Import einer Bank. Danach ist das Ergebnis dieser
// Intelligenz gespeicherte Konfiguration statt jedes Mal neu erzeugter
// Token-Arbeit. Aendert die Bank ihre Spalten, bricht der Lauf hart und
// benennbar (fehlende Spalte), statt Werte falsch zuzuordnen.
import { centsToDecimal } from "./lib/text.mjs";

// Zerlegt den ganzen Text in Datensaetze statt in Zeilen: ein zitiertes Feld
// darf Zeilenumbrueche enthalten. Ein Umbruch im Feld wird zu einem
// Leerzeichen, weil Verwendungszweck und Gegenpartei einzeilig weiterlaufen.
// Jeder Datensatz traegt seine physische Startzeile (fuer Fehlermeldungen)
// und seinen Rohtext. Bleibt ein Anfuehrungszeichen offen, reicht das Feld bis
// zum Dateiende — das ist kein lesbarer Datensatz, sondern ein harter Fehler.
function parseDatensaetze(text, sep) {
  const datensaetze = [];
  let felder = [];
  let feld = "";
  let inQuotes = false;
  let zeile = 1;
  let start = 0;
  let startZeile = 1;
  const abschliessen = (ende) => {
    felder.push(feld);
    datensaetze.push({
      felder: felder.map((f) => f.replace(/\s*\r?\n\s*/g, " ").trim()),
      zeile: startZeile,
      roh: text.slice(start, ende).replace(/\r$/, ""),
    });
    felder = [];
    feld = "";
  };
  for (let i = 0; i < text.length; i += 1) {
    const zeichen = text[i];
    if (zeichen === '"') {
      if (inQuotes && text[i + 1] === '"') { feld += '"'; i += 1; continue; }
      inQuotes = !inQuotes;
      continue;
    }
    if (zeichen === "\n") {
      zeile += 1;
      if (inQuotes) { feld += zeichen; continue; }
      abschliessen(i);
      start = i + 1;
      startZeile = zeile;
      continue;
    }
    if (zeichen === sep && !inQuotes) { felder.push(feld); feld = ""; continue; }
    feld += zeichen;
  }
  if (inQuotes) {
    throw new Error(`Anfuehrungszeichen aus Zeile ${startZeile} nicht geschlossen — das Feld reicht bis zum Dateiende. Datei pruefen.`);
  }
  if (start < text.length) abschliessen(text.length);
  return datensaetze;
}

function parseDatum(rohwert, format) {
  const wert = String(rohwert ?? "").trim();
  const muster = format === "DD.MM.YYYY" ? /^(\d{2})\.(\d{2})\.(\d{4})$/
    : format === "DD/MM/YYYY" ? /^(\d{2})\/(\d{2})\/(\d{4})$/
    : /^(\d{4})-(\d{2})-(\d{2})$/;
  const treffer = wert.match(muster);
  if (!treffer) return null;
  const [jahr, monat, tag] = format === "YYYY-MM-DD"
    ? [treffer[1], treffer[2], treffer[3]]
    : [treffer[3], treffer[2], treffer[1]];
  const iso = `${jahr}-${monat}-${tag}`;
  const datum = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(datum.valueOf()) || datum.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

// Strikte Betragsgrammatik je Profil: optionales Vorzeichen, der Ganzzahlteil
// entweder ohne Gruppierung oder durchgehend in Dreiergruppen, bis zu zwei
// Nachkommastellen. Bei Dezimalkomma ist "12.34" deshalb kein Betrag statt
// still 1.234,00. Ein Waehrungszeichen davor oder dahinter ist erlaubt.
function betragsGrammatik(dezimal) {
  const d = dezimal === "." ? "\\." : ",";
  const t = dezimal === "." ? "," : "\\.";
  return new RegExp(`^([+-])?(\\d{1,3}(?:${t}\\d{3})+|\\d+)(?:${d}(\\d{1,2}))?$`);
}

// { leer: true } fuer ein leeres Feld, { cents } fuer einen Betrag,
// { unlesbar: true } fuer alles andere. Leer und unlesbar sind verschieden:
// ein unlesbarer Wert darf nie wie ein leerer behandelt werden.
function leseBetrag(rohwert, grammatik) {
  const wert = String(rohwert ?? "").trim().replace(/^(?:EUR|€)\s*|\s*(?:EUR|€)$/g, "");
  if (wert === "") return { leer: true };
  const treffer = wert.match(grammatik);
  if (!treffer) return { unlesbar: true };
  const [, vorzeichen, ganz, frac = ""] = treffer;
  const cents = Number(ganz.replace(/[.,]/g, "")) * 100 + Number(frac.padEnd(2, "0"));
  return { cents: vorzeichen === "-" ? -cents : cents };
}

// Soll/Haben-Regel: ein leeres Feld und 0,00 zaehlen beide als "nicht
// gefuellt". Genau eine Seite ungleich null bestimmt den Betrag (Soll negativ,
// Haben positiv). Beide ungleich null ist ein Konflikt, beide leer ein
// fehlender Betrag; eine ausdrueckliche 0,00 ohne Gegenseite bleibt 0,00.
function betragAusSollHaben(sollRoh, habenRoh, grammatik) {
  const soll = leseBetrag(sollRoh, grammatik);
  const haben = leseBetrag(habenRoh, grammatik);
  if (soll.unlesbar) return { grund: `Soll nicht lesbar: "${sollRoh}"` };
  if (haben.unlesbar) return { grund: `Haben nicht lesbar: "${habenRoh}"` };
  if (soll.leer && haben.leer) return { grund: "Betrag fehlt (weder Soll noch Haben gefuellt)" };
  const sollCents = Math.abs(soll.cents ?? 0);
  const habenCents = Math.abs(haben.cents ?? 0);
  if (sollCents !== 0 && habenCents !== 0) {
    return { grund: `Soll und Haben zugleich gefuellt ("${sollRoh}" / "${habenRoh}") — Richtung nicht eindeutig` };
  }
  return { cents: sollCents !== 0 ? -sollCents : habenCents };
}

function betragAusSpalte(roh, grammatik) {
  const betrag = leseBetrag(roh, grammatik);
  if (betrag.unlesbar) return { grund: `Betrag nicht lesbar: "${roh}"` };
  if (betrag.leer) return { grund: "Betrag fehlt" };
  return betrag;
}

function feldWert(spec, zeile, spaltenIndex) {
  if (Object.hasOwn(spec, "konstante")) return spec.konstante;
  const roh = zeile[spaltenIndex.get(spec.spalte)] ?? "";
  if (!spec.muster) return roh;
  const treffer = roh.match(new RegExp(spec.muster));
  // Kein Treffer heisst: leer lassen. Nie raten — eine falsche Gegenpartei
  // waere schlimmer als eine fehlende.
  return treffer ? (treffer[spec.gruppe ?? 1] ?? "").trim() : "";
}

function benoetigteSpalten(felder) {
  const namen = new Set();
  for (const spec of Object.values(felder)) {
    if (spec.spalte) namen.add(spec.spalte);
    if (spec.soll) namen.add(spec.soll);
    if (spec.haben) namen.add(spec.haben);
  }
  return [...namen];
}

export function normalizeCsv({ text, profil, rohquelle }) {
  const sep = profil.trennzeichen ?? ";";
  if (profil.dezimal !== "," && profil.dezimal !== ".") {
    throw new Error(`Profil ${profil.profil_id}: dezimal muss "," oder "." sein — ohne Dezimalzeichen ist kein Betrag eindeutig lesbar`);
  }
  const grammatik = betragsGrammatik(profil.dezimal);
  const datensaetze = parseDatensaetze(String(text).replace(/^﻿/, ""), sep);
  const kopfIndex = datensaetze.findIndex((d) => d.roh.includes(profil.kopfzeile) && d.felder.length > 1);
  if (kopfIndex === -1) {
    throw new Error(`Kopfzeile nicht gefunden — Profil ${profil.profil_id} erwartet eine Zeile mit "${profil.kopfzeile}"`);
  }

  const spalten = datensaetze[kopfIndex].felder;
  const spaltenIndex = new Map(spalten.map((name, i) => [name, i]));
  const fehlend = benoetigteSpalten(profil.felder).filter((name) => !spaltenIndex.has(name));
  if (fehlend.length) {
    throw new Error(`Profil ${profil.profil_id}: Spalte(n) nicht in der Datei: ${fehlend.join(", ")} — Format geaendert? Profil pruefen.`);
  }

  const eintraege = [];
  const fehler = [];

  for (const datensatz of datensaetze.slice(kopfIndex + 1)) {
    const { felder: zeile, zeile: zeilennummer, roh: rohzeile } = datensatz;
    if (zeile.every((f) => f === "")) continue;

    const betragSpec = profil.felder.betrag;
    const betrag = betragSpec.soll || betragSpec.haben
      ? betragAusSollHaben(zeile[spaltenIndex.get(betragSpec.soll)], zeile[spaltenIndex.get(betragSpec.haben)], grammatik)
      : betragAusSpalte(zeile[spaltenIndex.get(betragSpec.spalte)], grammatik);
    if (betrag.grund) {
      fehler.push({ zeile: zeilennummer, grund: betrag.grund, rohzeile });
      continue;
    }

    const buchungsdatum = parseDatum(feldWert(profil.felder.buchungsdatum, zeile, spaltenIndex), profil.datumsformat);
    if (!buchungsdatum) {
      fehler.push({ zeile: zeilennummer, grund: `Buchungsdatum nicht im Format ${profil.datumsformat}`, rohzeile });
      continue;
    }

    const eintrag = {
      konto_id: profil.konto_id,
      buchungsdatum,
      betrag: centsToDecimal(betrag.cents),
      gegenpartei: feldWert(profil.felder.gegenpartei ?? { konstante: "" }, zeile, spaltenIndex),
      verwendungszweck: feldWert(profil.felder.verwendungszweck ?? { konstante: "" }, zeile, spaltenIndex),
      rohquelle,
    };

    for (const [name, spec] of Object.entries(profil.felder)) {
      if (["buchungsdatum", "betrag", "gegenpartei", "verwendungszweck"].includes(name)) continue;
      const wert = feldWert(spec, zeile, spaltenIndex);
      if (wert === "") continue;
      if (name === "wertstellungsdatum") {
        const iso = parseDatum(wert, profil.datumsformat);
        if (iso) eintrag.wertstellungsdatum = iso;
        continue;
      }
      eintrag[name] = wert;
    }

    eintraege.push(eintrag);
  }

  return { eintraege, fehler };
}
