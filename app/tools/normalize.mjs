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

function splitLine(line, sep) {
  const felder = [];
  let aktuell = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const zeichen = line[i];
    if (zeichen === '"') {
      if (inQuotes && line[i + 1] === '"') { aktuell += '"'; i += 1; continue; }
      inQuotes = !inQuotes;
      continue;
    }
    if (zeichen === sep && !inQuotes) { felder.push(aktuell); aktuell = ""; continue; }
    aktuell += zeichen;
  }
  felder.push(aktuell);
  return felder.map((f) => f.trim());
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

function parseCents(rohwert, dezimal) {
  const wert = String(rohwert ?? "").trim();
  if (wert === "") return null;
  const tausender = dezimal === "," ? "." : ",";
  const bereinigt = wert.split(tausender).join("").replace(dezimal, ".").replace(/\s|€|EUR/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(bereinigt)) return null;
  const negativ = bereinigt.startsWith("-");
  const [euro, frac = ""] = bereinigt.replace("-", "").split(".");
  const cents = Number(euro) * 100 + Number((frac + "00").slice(0, 2));
  return negativ ? -cents : cents;
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
  const zeilen = String(text).replace(/^﻿/, "").split(/\r?\n/);
  const kopfIndex = zeilen.findIndex((z) => z.includes(profil.kopfzeile) && splitLine(z, sep).length > 1);
  if (kopfIndex === -1) {
    throw new Error(`Kopfzeile nicht gefunden — Profil ${profil.profil_id} erwartet eine Zeile mit "${profil.kopfzeile}"`);
  }

  const spalten = splitLine(zeilen[kopfIndex], sep);
  const spaltenIndex = new Map(spalten.map((name, i) => [name, i]));
  const fehlend = benoetigteSpalten(profil.felder).filter((name) => !spaltenIndex.has(name));
  if (fehlend.length) {
    throw new Error(`Profil ${profil.profil_id}: Spalte(n) nicht in der Datei: ${fehlend.join(", ")} — Format geaendert? Profil pruefen.`);
  }

  const eintraege = [];
  const fehler = [];

  for (let i = kopfIndex + 1; i < zeilen.length; i += 1) {
    const zeilennummer = i + 1;
    const zeile = splitLine(zeilen[i], sep);
    if (zeile.every((f) => f === "")) continue;

    const betragSpec = profil.felder.betrag;
    let cents = null;
    if (betragSpec.soll || betragSpec.haben) {
      const soll = parseCents(zeile[spaltenIndex.get(betragSpec.soll)], profil.dezimal);
      const haben = parseCents(zeile[spaltenIndex.get(betragSpec.haben)], profil.dezimal);
      if (soll !== null) cents = -Math.abs(soll);
      else if (haben !== null) cents = Math.abs(haben);
    } else {
      cents = parseCents(zeile[spaltenIndex.get(betragSpec.spalte)], profil.dezimal);
    }
    if (cents === null) {
      fehler.push({ zeile: zeilennummer, grund: "Betrag nicht lesbar (weder Soll noch Haben gefuellt)", rohzeile: zeilen[i] });
      continue;
    }

    const buchungsdatum = parseDatum(feldWert(profil.felder.buchungsdatum, zeile, spaltenIndex), profil.datumsformat);
    if (!buchungsdatum) {
      fehler.push({ zeile: zeilennummer, grund: `Buchungsdatum nicht im Format ${profil.datumsformat}`, rohzeile: zeilen[i] });
      continue;
    }

    const eintrag = {
      konto_id: profil.konto_id,
      buchungsdatum,
      betrag: centsToDecimal(cents),
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
