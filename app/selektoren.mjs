// app/selektoren.mjs
// View-uebergreifende Ableitungen aus dem geladenen Bestand (reine Lesezugriffe,
// kein DOM). Liegen getrennt von den Render-Funktionen, damit mehrere Views und
// die Topbar dieselbe Logik teilen.
import { data, cents } from "./runtime.mjs";
import { computeNettovermoegen, aktuellerZeitwert } from "./vermoegen.mjs";
import { localTodayIso } from "./liquiditaet.mjs";

export function reviewChecks() {
  return data.checks.filter((check) => check.severity === "review");
}

export function openCategoryTransactions() {
  return data.transaktionen.filter((tx) => tx.kategorisierung_status === "offen");
}

export function missingReferenceChecks() {
  return data.checks.filter((check) => check.title_key === "checks.accountReferenceMissing.title");
}

export function accountBalance(kontoId) {
  return data.transaktionen
    .filter((tx) => tx.konto_id === kontoId)
    .reduce((sum, tx) => sum + cents(tx.betrag), 0);
}

export function loadedTotalAccountsBalance() {
  const accountIds = data.konten
    .filter((konto) => konto.kontotyp !== "depot" && konto.liquiditaetsrelevant)
    .map((konto) => konto.konto_id);
  return data.transaktionen
    .filter((tx) => accountIds.includes(tx.konto_id))
    .reduce((sum, tx) => sum + cents(tx.betrag), 0);
}

export function currentNettovermoegen() {
  return computeNettovermoegen(data, localTodayIso());
}

export function overviewAccountStandDate(konto) {
  if (konto.kontotyp === "depot") {
    return aktuellerZeitwert(data.zeitwerte, "konto", konto.konto_id, "depotwert")?.standdatum || "";
  }
  const latestBookingDate = data.transaktionen
    .filter((tx) => tx.konto_id === konto.konto_id)
    .reduce((latest, tx) => (String(tx.buchungsdatum ?? "") > latest ? String(tx.buchungsdatum ?? "") : latest), "");
  return latestBookingDate || aktuellerZeitwert(data.zeitwerte, "konto", konto.konto_id, "kontostand")?.standdatum || "";
}

export function overviewAccountRank(konto) {
  if (konto.kontotyp === "giro") return 0;
  if (konto.kontotyp === "tagesgeld") return 1;
  if (konto.kontotyp === "depot") return 2;
  return 3;
}

export function sortedOverviewAccounts() {
  return data.konten.slice().sort((a, b) => {
    const rank = overviewAccountRank(a) - overviewAccountRank(b);
    if (rank !== 0) return rank;
    const dateCmp = overviewAccountStandDate(b).localeCompare(overviewAccountStandDate(a));
    if (dateCmp !== 0) return dateCmp;
    return a.name.localeCompare(b.name);
  });
}

// Reine Inversion (testbar ohne Modulzustand): matched_regeln -> Regel-Treffer.
export function regelWirkungAus(transaktionen) {
  const map = new Map();
  for (const tx of transaktionen) {
    for (const id of tx.matched_regeln ?? []) {
      let eintrag = map.get(id);
      if (!eintrag) {
        eintrag = { transaktionen: [], anzahl: 0 };
        map.set(id, eintrag);
      }
      eintrag.transaktionen.push(tx);
      eintrag.anzahl += 1;
    }
  }
  return map;
}

// Memoisiert ueber die Array-Referenz: wird nur bei Reload (neues data.transaktionen)
// neu berechnet. Ein O(N)-Tally-Pass, kein String-Matching.
let _wirkungQuelle = null;
let _wirkungCache = null;
export function regelWirkung() {
  if (_wirkungQuelle !== data.transaktionen) {
    _wirkungQuelle = data.transaktionen;
    _wirkungCache = regelWirkungAus(data.transaktionen);
  }
  return _wirkungCache;
}
