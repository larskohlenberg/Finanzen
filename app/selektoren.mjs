// app/selektoren.mjs
// View-uebergreifende Ableitungen aus dem geladenen Bestand (reine Lesezugriffe,
// kein DOM). Liegen getrennt von den Render-Funktionen, damit mehrere Views und
// die Topbar dieselbe Logik teilen.
import { data, state } from "./runtime.mjs";
import { computeNettovermoegen, computeVermoegenChecks } from "./vermoegen.mjs";
import { anstehendeJahreszahlungen, localTodayIso } from "./liquiditaet.mjs";
import {
  kontoRang,
  kontoSaldoGeladen,
  kontoStandDatum,
  kontoZeile,
  kontenGruppen,
  saldoGeladenerKonten,
  sortierteKonten,
  vermoegenCheckItem,
} from "./uebersicht-rechnung.mjs";

// "Heute" der Oberflaeche: state.heute (fuer Tests mit fester Uhr), sonst das
// lokale Datum. Die Views nehmen ihr Datum hierueber.
export function heuteIso() {
  return state.heute || localTodayIso();
}

// Die Rechnung der Uebersicht liegt DOM-frei in uebersicht-rechnung.mjs (das
// MCP-Tool kennzahlen nutzt sie ebenso); hier wird nur der geladene Bestand
// und der heutige Tag eingesetzt.
export { vermoegenCheckItem };

export function reviewChecks() {
  return data.checks.filter((check) => check.severity === "review");
}

export function currentVermoegenChecks() {
  return computeVermoegenChecks(data, heuteIso());
}

export function overviewJahreszahlungen(monate = 3) {
  return anstehendeJahreszahlungen(data.regelzahlungen, heuteIso(), monate);
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
  return computeNettovermoegen(data, heuteIso());
}

export function overviewAccountGroups() {
  return kontenGruppen(data, heuteIso());
}

export function overviewAccountRow(konto) {
  return kontoZeile(data, konto, heuteIso());
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
