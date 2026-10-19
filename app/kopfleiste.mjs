// app/kopfleiste.mjs
// Zaehler und naechste Agentenaktion der Kopfleiste als reine Funktion ueber
// einen Bestand: rechnet im App-Server (lese-api.mjs, GET /api/v1/kopfleiste)
// mit denselben Modulen wie zuvor der Browser (vermoegen, szenarien,
// next-action). Zurueck gehen nur Zahlen und die Prompts der Aktionen.
import { buildNextAgentActions } from "./next-action.mjs";
import { guardrailWarnungen } from "./szenarien.mjs";
import { kontenGruppen } from "./uebersicht-rechnung.mjs";
import { computeVermoegenChecks } from "./vermoegen.mjs";

// Transfer-Paare: vollstaendig, wenn beide Buchungen existieren, als Transfer
// markiert sind und auf diesen Transfer zeigen.
export function transferPruefung(daten) {
  const tx = new Map((daten.transaktionen ?? []).map((t) => [t.transaktion_id, t]));
  return (daten.transfers ?? []).map((transfer) => {
    const abgang = tx.get(transfer.abgang_transaktion_id);
    const zugang = tx.get(transfer.zugang_transaktion_id);
    const ok = Boolean(abgang && zugang)
      && abgang.ist_transfer === true && zugang.ist_transfer === true
      && abgang.transfer_id === transfer.transfer_id && zugang.transfer_id === transfer.transfer_id;
    return { transfer_id: transfer.transfer_id, betrag: transfer.betrag, ok };
  });
}

// Prognose-Realismus im Fenster von Plan & Ist: nur Monate, die auf allen Konten gebucht sind.
export function prognoseRealismus(daten, heute) {
  return guardrailWarnungen(daten, heute, { vollstaendigBis: kontenGruppen(daten, heute).konten.aeltester });
}

// daten: Bestand mit metadata.dataMode, validation, checks und importfehler
// (wie das Bundle im Browser), heute: Stichtag der Oberflaeche.
export function kopfleisteModell(daten, heute) {
  const datenChecks = (daten.checks ?? []).filter((c) => c.severity === "review" && c.scope !== "transaktion").length;
  const transfers = transferPruefung(daten).filter((t) => !t.ok).length;
  return {
    offene_kategorien: (daten.transaktionen ?? []).filter((t) => t.kategorisierung_status === "offen").length,
    // Was nur in den Checks sichtbar ist; offene Kategorien und Importfehler haben eigene Chips.
    offene_checks: datenChecks + transfers + computeVermoegenChecks(daten, heute).length + prognoseRealismus(daten, heute).length,
    aktionen: buildNextAgentActions(daten).map(({ type, label, count, prompt }) => ({ type, label, count, prompt })),
  };
}
