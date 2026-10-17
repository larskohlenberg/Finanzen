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
  if (konto.kontotyp === "depot") return 2;
  return 3;
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

// Monatliche Einnahmen und Ausgaben: Durchschnitt der letzten zwoelf vollen
// Monate aus den Buchungen, die vor dem laufenden Monat und spaetestens mit dem
// Monat der letzten Buchung enden (so drueckt ein noch nicht importierter Monat
// den Schnitt nicht). Transfers und neutrale Kategorien (Sparen &
// Umbuchung) zaehlen nicht, "Noch zu klaeren" und Buchungen ohne Kategorie nach
// Vorzeichen. Eine Erstattung in einer Ausgabenkategorie mindert die Ausgaben.
// Bei kuerzerer Historie wird nur durch die Monate seit der ersten Buchung geteilt.
const KATEGORIE_UNGEKLAERT = "KAT-012";

export function monatsMittel(data, today) {
  const laufend = today.slice(0, 7);
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
  const seite = () => ({ je_monat: monate.map(() => 0), je_kategorie: new Map() });
  const einnahmen = seite();
  const ausgaben = seite();

  for (const tx of data.transaktionen ?? []) {
    if (tx.ist_transfer === true) continue;
    const i = index.get(tx.buchungsdatum?.slice(0, 7));
    if (i === undefined) continue;
    const cents = toCents(tx.betrag);
    const kat = typ.get(tx.kategorie_id);
    let ziel;
    if (kat?.typ === "einnahme") ziel = einnahmen;
    else if (kat?.typ === "ausgabe") ziel = ausgaben;
    else if (!kat || tx.kategorie_id === KATEGORIE_UNGEKLAERT) ziel = cents >= 0 ? einnahmen : ausgaben;
    else continue;
    const wert = ziel === einnahmen ? cents : -cents;
    ziel.je_monat[i] += wert;
    const key = tx.kategorie_id ?? "";
    ziel.je_kategorie.set(key, (ziel.je_kategorie.get(key) ?? 0) + wert);
  }

  const n = monate.length;
  const mittel = (summe) => (n ? Math.round(summe / n) : 0);
  const auswerten = (s) => ({
    mittel_cents: mittel(s.je_monat.reduce((a, b) => a + b, 0)),
    je_monat: s.je_monat,
    kategorien: [...s.je_kategorie]
      .map(([kategorie_id, summe]) => ({ kategorie_id, name: typ.get(kategorie_id)?.name ?? kategorie_id, mittel_cents: mittel(summe) }))
      .filter((k) => k.mittel_cents > 0)
      .sort((a, b) => b.mittel_cents - a.mittel_cents),
  });
  const letzterTag = n ? new Date(Date.UTC(Number(monate.at(-1).slice(0, 4)), Number(monate.at(-1).slice(5, 7)), 0)).toISOString().slice(0, 10) : "";
  return {
    monate,
    anzahl_monate: n,
    von: n ? `${monate[0]}-01` : "",
    bis: letzterTag,
    einnahmen: auswerten(einnahmen),
    ausgaben: auswerten(ausgaben),
  };
}
