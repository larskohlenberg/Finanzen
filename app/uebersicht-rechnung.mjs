// app/uebersicht-rechnung.mjs
// Reine Rechnung hinter der Uebersicht: kein DOM, kein Modulzustand, der Bestand
// kommt als Argument. Die Uebersicht (ueber selektoren.mjs) und das MCP-Tool
// `kennzahlen` rufen dieselben Funktionen, damit beide gleich rechnen.
import { toCents } from "./tools/lib/text.mjs";
import { aktuellerZeitwert, computeVermoegenChecks } from "./vermoegen.mjs";

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

export function kontoStandDatum(data, konto) {
  if (konto.kontotyp === "depot") {
    return aktuellerZeitwert(data.zeitwerte, "konto", konto.konto_id, "depotwert")?.standdatum || "";
  }
  const latestBookingDate = data.transaktionen
    .filter((tx) => tx.konto_id === konto.konto_id)
    .reduce((latest, tx) => (String(tx.buchungsdatum ?? "") > latest ? String(tx.buchungsdatum ?? "") : latest), "");
  return latestBookingDate || aktuellerZeitwert(data.zeitwerte, "konto", konto.konto_id, "kontostand")?.standdatum || "";
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
