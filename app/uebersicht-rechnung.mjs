// app/uebersicht-rechnung.mjs
// Reine Rechnung hinter der Uebersicht: kein DOM, kein Modulzustand, der Bestand
// kommt als Argument. Die Uebersicht (ueber selektoren.mjs) und das MCP-Tool
// `kennzahlen` rufen dieselben Funktionen, damit beide gleich rechnen.
import { toCents } from "./tools/lib/text.mjs";
import { aktuellerZeitwert, computeVermoegenChecks, kontoWert, standVeraltet } from "./vermoegen.mjs";

// Summe aller geladenen Buchungen eines Kontos (kein Anfangssaldo, kein Stichtag).
export function kontoSaldoGeladen(data, kontoId) {
  return data.transaktionen
    .filter((tx) => tx.konto_id === kontoId)
    .reduce((sum, tx) => sum + toCents(tx.betrag), 0);
}

// KPI "Summe geladener Bewegungen": liquiditaetsrelevante Konten ohne Depots.
export function saldoGeladenerKonten(data) {
  const accountIds = data.konten
    .filter((konto) => konto.kontotyp !== "depot" && konto.liquiditaetsrelevant)
    .map((konto) => konto.konto_id);
  return data.transaktionen
    .filter((tx) => accountIds.includes(tx.konto_id))
    .reduce((sum, tx) => sum + toCents(tx.betrag), 0);
}

function letzteBuchung(data, kontoId) {
  return data.transaktionen
    .filter((tx) => tx.konto_id === kontoId)
    .reduce((latest, tx) => (String(tx.buchungsdatum ?? "") > latest ? String(tx.buchungsdatum ?? "") : latest), "");
}

// Eine Zeile der Kontentabelle: Wert zum Stichtag aus derselben Rechnung wie das
// Nettovermoegen (Depot = Depotwert, sonst belegter Anker + Buchungen danach),
// dazu Qualitaet, Stichtag des Belegs und ob dieser Stand veraltet ist
// (Schwellen wie der Check bewertung-veraltet). wert_cents null = kein Zeitwert.
export function kontoZeile(data, konto, today) {
  const w = kontoWert(konto, data.zeitwerte, data.transaktionen, today);
  return {
    wert_cents: w.wert_cents,
    qualitaet: w.qualitaet,
    belegdatum: w.standdatum ?? "",
    basis: w.basis,
    veraltet: w.wert_cents !== null && standVeraltet(konto, w.standdatum, data.transaktionen, today),
  };
}

// Konten, die ins "Verfuegbare Geld" der Uebersicht einfliessen.
export function istVerfuegbaresKonto(konto) {
  return konto.kontotyp !== "depot" && konto.kontotyp !== "bar" && konto.liquiditaetsrelevant === true && konto.status !== "geschlossen";
}

function istOffenesDepot(konto) {
  return konto.kontotyp === "depot" && konto.status !== "geschlossen";
}

function kontoGruppe(data, konten, today) {
  const zeilen = konten.map((konto) => ({ konto, zeile: kontoZeile(data, konto, today) }));
  const enthalten = zeilen.filter((z) => z.zeile.wert_cents !== null);
  return {
    zeilen,
    summe_cents: enthalten.reduce((summe, z) => summe + z.zeile.wert_cents, 0),
    belegt: enthalten.filter((z) => z.zeile.qualitaet === "belegt").length,
    gesamt: zeilen.length,
    aeltester: enthalten.map((z) => z.zeile.belegdatum).filter(Boolean).sort()[0] ?? "",
  };
}

// Kontentabelle in Bloecken: konten (Summe = Verfuegbares Geld, Kachel der
// Uebersicht), depots, weitere (nicht liquide, bar, geschlossen; ohne Summe).
export function kontenGruppen(data, today) {
  const sortiert = sortierteKonten(data);
  return {
    konten: kontoGruppe(data, sortiert.filter(istVerfuegbaresKonto), today),
    depots: kontoGruppe(data, sortiert.filter(istOffenesDepot), today),
    weitere: kontoGruppe(data, sortiert.filter((k) => !istVerfuegbaresKonto(k) && !istOffenesDepot(k)), today),
  };
}

export function kontoStandDatum(data, konto) {
  if (konto.kontotyp === "depot") {
    return aktuellerZeitwert(data.zeitwerte, "konto", konto.konto_id, "depotwert")?.standdatum || "";
  }
  return letzteBuchung(data, konto.konto_id) || aktuellerZeitwert(data.zeitwerte, "konto", konto.konto_id, "kontostand")?.standdatum || "";
}

export function kontoRang(konto) {
  if (konto.kontotyp === "giro") return 0;
  if (konto.kontotyp === "tagesgeld") return 1;
  if (konto.kontotyp === "festgeld") return 2;
  if (konto.kontotyp === "depot") return 3;
  return 4;
}

export function sortierteKonten(data) {
  return data.konten.slice().sort((a, b) => {
    const rank = kontoRang(a) - kontoRang(b);
    if (rank !== 0) return rank;
    const dateCmp = kontoStandDatum(data, b).localeCompare(kontoStandDatum(data, a));
    if (dateCmp !== 0) return dateCmp;
    return a.name.localeCompare(b.name);
  });
}

export function vermoegenCheckItem(check) {
  return {
    scope: "vermoegen",
    severity: "review",
    title_key: `vermoegen.checkArt.${check.art}`,
    detail: check.text,
    entity_id: check.entitaet_id,
    entitaet: check.entitaet,
  };
}

export function checkItems(data, today) {
  return [
    ...data.checks,
    ...computeVermoegenChecks(data, today).map(vermoegenCheckItem),
  ];
}

// Check-Vorschau der Uebersicht: Review-Checks zuerst, dann der Rest.
export function checkVorschau(items, limit = 4) {
  return [
    ...items.filter((check) => check.severity === "review"),
    ...items.filter((check) => check.severity !== "review"),
  ].slice(0, limit);
}

// Monatliche Einnahmen, Ausgaben und Sparquote: Durchschnitt der letzten zwoelf
// vollen Monate aus den Buchungen, die vor dem laufenden Monat und spaetestens
// mit dem Monat der letzten Buchung enden (so drueckt ein noch nicht importierter
// Monat den Schnitt nicht). Transfers zaehlen nicht.
// - Einnahme- und Ausgabenkategorien (auch "Noch zu klaeren" und Buchungen ohne
//   Kategorie) zaehlen netto je Kategorie: Ueberwiegen die Gutschriften (etwa
//   Steuererstattungen, Kindergeld), ist die Kategorie eine Einnahme, sonst eine
//   Ausgabe. Eine einzelne Erstattung mindert so nur ihre Kategorie.
// - Gutschriften einer Kategorie mit gutschriften_sondereffekt (Steuererstattung)
//   sind keine laufende Einnahme: sie stehen als Sondereffekt daneben.
// - Kategorien mit investition (Modernisierung samt Zuschuss) zaehlen gar nicht.
// - Kategorien mit brutto teilen nach Vorzeichen: Gutschriften als Einnahme,
//   Belastungen als Ausgabe (je eine Zeile unter derselben Kategorie).
// - Neutrale Kategorien sind keine Ausgaben. In der Sparquote zeigen die mit
//   sparziel "depot" bzw. "versicherung", was in Depots und Vertraege fliesst;
//   der Rest des Ueberschusses bleibt kurzfristig liquide (Konten, Tagesgeld,
//   Festgeld; negativ: aus Ruecklagen entnommen).
// Bei kuerzerer Historie wird nur durch die Monate seit der ersten Buchung geteilt.
// vollstaendigBis (aeltester Kontenstand): ein Monat zaehlt erst, wenn alle Konten
// bis zu seinem letzten Tag belegt sind, sonst fehlen noch Buchungen.
const KATEGORIE_UNGEKLAERT = "KAT-012";

function letzterVollerMonat(datum) {
  const [y, m, d] = datum.split("-").map(Number);
  const monatsletzter = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d >= monatsletzter ? datum.slice(0, 7) : new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
}

export function monatsMittel(data, today, { vollstaendigBis = "" } = {}) {
  const grenze = vollstaendigBis ? letzterVollerMonat(vollstaendigBis) : "";
  const laufend = grenze && grenze < today.slice(0, 7) ? new Date(Date.UTC(Number(grenze.slice(0, 4)), Number(grenze.slice(5, 7)), 1)).toISOString().slice(0, 7) : today.slice(0, 7);
  const vorher = (data.transaktionen ?? []).map((tx) => tx.buchungsdatum?.slice(0, 7)).filter((m) => m && m < laufend).sort();
  const monate = [];
  if (vorher.length) {
    const [jahr, monat] = vorher.at(-1).split("-").map(Number);
    for (let i = 11; i >= 0; i--) {
      const m = new Date(Date.UTC(jahr, monat - 1 - i, 1)).toISOString().slice(0, 7);
      if (m >= vorher[0]) monate.push(m);
    }
  }
  const index = new Map(monate.map((m, i) => [m, i]));
  const typ = new Map((data.kategorien ?? []).map((k) => [k.kategorie_id, k]));
  const istNeutral = (id) => typ.get(id)?.typ === "neutral" && id !== KATEGORIE_UNGEKLAERT;
  const sondereffekte = new Map();

  // Netto je Kategorie, gesamt und je Monat (Vorzeichen wie gebucht).
  const netto = new Map();
  for (const tx of data.transaktionen ?? []) {
    if (tx.ist_transfer === true) continue;
    const i = index.get(tx.buchungsdatum?.slice(0, 7));
    if (i === undefined) continue;
    const id = tx.kategorie_id ?? "";
    if (typ.get(id)?.investition === true) continue;
    const cents = toCents(tx.betrag);
    const key = typ.get(id)?.brutto === true ? `${id}${cents >= 0 ? "+" : "-"}` : id;
    if (cents > 0 && typ.get(id)?.gutschriften_sondereffekt === true) {
      const se = sondereffekte.get(id) ?? { kategorie_id: id, name: typ.get(id).name, summe_cents: 0, buchungen: [] };
      se.summe_cents += cents;
      se.buchungen.push({ datum: tx.buchungsdatum, betrag_cents: cents });
      sondereffekte.set(id, se);
      continue;
    }
    const k = netto.get(key) ?? { kategorie_id: id, summe: 0, je_monat: monate.map(() => 0) };
    k.summe += cents;
    k.je_monat[i] += cents;
    netto.set(key, k);
  }

  const n = monate.length;
  const mittel = (summe) => (n ? Math.round(summe / n) : 0);
  const name = (id) => typ.get(id)?.name ?? id;
  const seite = (vorzeichen) => {
    const keys = [...netto].filter(([, k]) => !istNeutral(k.kategorie_id) && (vorzeichen > 0 ? k.summe >= 0 : k.summe < 0));
    const je_monat = monate.map((_, i) => keys.reduce((a, [, k]) => a + vorzeichen * k.je_monat[i], 0));
    return {
      mittel_cents: mittel(keys.reduce((a, [, k]) => a + vorzeichen * k.summe, 0)),
      je_monat,
      kategorien: keys
        .map(([, k]) => ({ kategorie_id: k.kategorie_id, name: name(k.kategorie_id), mittel_cents: mittel(vorzeichen * k.summe) }))
        .filter((k) => k.mittel_cents > 0)
        .sort((a, b) => b.mittel_cents - a.mittel_cents),
    };
  };
  const einnahmen = seite(1);
  const ausgaben = seite(-1);

  const ueberschuss = einnahmen.mittel_cents - ausgaben.mittel_cents;
  const zielSumme = (ziel) => mittel(0 - [...netto].filter(([id]) => istNeutral(id) && typ.get(id)?.sparziel === ziel).reduce((a, [, k]) => a + k.summe, 0));
  const depot = zielSumme("depot");
  const versicherung = zielSumme("versicherung");
  const zielKategorien = (ziel) => (data.kategorien ?? []).filter((k) => k.typ === "neutral" && k.sparziel === ziel).map((k) => k.kategorie_id);
  // Kurzfristig liquide in Teile: was in liquide Kategorien floss (Festgeld) und
  // der Rest auf Konten und Tagesgeld (negativ: dort entnommen).
  const liquide = ueberschuss - depot - versicherung;
  const liquideTeile = zielKategorien("liquide")
    .map((id) => ({ kategorie_id: id, name: name(id), mittel_cents: mittel(0 - (netto.get(id)?.summe ?? 0)) }))
    .filter((k) => k.mittel_cents !== 0);
  const sparen = {
    ueberschuss_cents: ueberschuss,
    quote: einnahmen.mittel_cents > 0 ? ueberschuss / einnahmen.mittel_cents : null,
    ziele: [
      { ziel: "liquide", mittel_cents: liquide, kategorien: [], teile: liquideTeile, konten_cents: liquide - liquideTeile.reduce((a, k) => a + k.mittel_cents, 0) },
      { ziel: "depot", mittel_cents: depot, kategorien: zielKategorien("depot") },
      { ziel: "versicherung", mittel_cents: versicherung, kategorien: zielKategorien("versicherung") },
    ],
  };

  const letzterTag = n ? new Date(Date.UTC(Number(monate.at(-1).slice(0, 4)), Number(monate.at(-1).slice(5, 7)), 0)).toISOString().slice(0, 10) : "";
  return {
    monate,
    anzahl_monate: n,
    von: n ? `${monate[0]}-01` : "",
    bis: letzterTag,
    einnahmen,
    ausgaben,
    sparen,
    sondereffekte: [...sondereffekte.values()],
  };
}
