// app/selektoren.mjs
// View-uebergreifende Ableitungen aus dem geladenen Bestand (reine Lesezugriffe,
// kein DOM). Liegen getrennt von den Render-Funktionen, damit mehrere Views und
// die Topbar dieselbe Logik teilen.
import { data } from "./runtime.mjs";
import { computeNettovermoegen, computeVermoegenChecks } from "./vermoegen.mjs";
import { localTodayIso } from "./liquiditaet.mjs";
import {
  checkItems,
  checkVorschau,
  kontoRang,
  kontoSaldoGeladen,
  kontoStandDatum,
  kontoZeile,
  kontenGruppen,
  saldoGeladenerKonten,
  sortierteKonten,
  vermoegenCheckItem,
} from "./uebersicht-rechnung.mjs";

// Die Rechnung der Uebersicht liegt DOM-frei in uebersicht-rechnung.mjs (das
// MCP-Tool kennzahlen nutzt sie ebenso); hier wird nur der geladene Bestand
// und der heutige Tag eingesetzt.
export { vermoegenCheckItem };

export function reviewChecks() {
  return data.checks.filter((check) => check.severity === "review");
}

export function currentVermoegenChecks() {
  return computeVermoegenChecks(data, localTodayIso());
}

export function currentCheckItems() {
  return checkItems(data, localTodayIso());
}

export function overviewCheckPreviewItems(limit = 4) {
  return checkVorschau(currentCheckItems(), limit);
}

export function openCategoryTransactions() {
  return data.transaktionen.filter((tx) => tx.kategorisierung_status === "offen");
}

export function missingReferenceChecks() {
  return data.checks.filter((check) => check.title_key === "checks.accountReferenceMissing.title");
}

export function accountBalance(kontoId) {
  return kontoSaldoGeladen(data, kontoId);
}

export function loadedTotalAccountsBalance() {
  return saldoGeladenerKonten(data);
}

export function currentNettovermoegen() {
  return computeNettovermoegen(data, localTodayIso());
}

export function overviewAccountGroups() {
  return kontenGruppen(data, localTodayIso());
}

export function overviewAccountRow(konto) {
  return kontoZeile(data, konto, localTodayIso());
}

export function overviewAccountStandDate(konto) {
  return kontoStandDatum(data, konto);
}

export function overviewAccountRank(konto) {
  return kontoRang(konto);
}

export function sortedOverviewAccounts() {
  return sortierteKonten(data);
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
