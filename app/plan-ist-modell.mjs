// app/plan-ist-modell.mjs
// Plan & Ist als reine Funktion ueber einen Bestand: rechnet im App-Server
// (lese-api.mjs, GET /api/v1/plan-ist) mit denselben Funktionen wie zuvor die
// Ansicht (plan-ist.mjs). Zurueck gehen die Monate des Bestands, die
// Rechnung des gewaehlten Zeitraums (Einzelposten nur mit Id, Datum,
// Gegenpartei, Betrag) und je Periode des Verlaufs nur die Summen.
import { importAbdeckung } from "./klassifikation.mjs";
import { bestandsMonate, perioden, planIst, zeitraumMonate } from "./plan-ist.mjs";

export const GRANULARITAETEN = Object.freeze(["monat", "quartal", "jahr"]);

const seite = (s) => ({
  ...s,
  kategorien: s.kategorien.map((k) => ({
    ...k,
    einzel_buchungen: (k.einzel_buchungen ?? []).map(({ transaktion_id, datum, gegenpartei, betrag_cents }) => ({ transaktion_id, datum, gegenpartei, betrag_cents })),
  })),
});

// Nur, was Verlaufsgrafik und -tabelle lesen.
const summen = (r) => ({
  einnahmen: { ist_cents: r.einnahmen.ist_cents, plan_cents: r.einnahmen.plan_cents },
  ausgaben: { ist_cents: r.ausgaben.ist_cents, plan_cents: r.ausgaben.plan_cents },
  sparen: {
    ist: { ueberschuss_cents: r.sparen.ist.ueberschuss_cents, quote: r.sparen.ist.quote },
    plan: { ueberschuss_cents: r.sparen.plan.ueberschuss_cents, quote: r.sparen.plan.quote },
  },
});

// Die drei Teile einzeln, damit der Server sie getrennt merken kann: die
// Monate je Stichtag, den Verlauf je Granularitaet, die Rechnung je Zeitraum.

// Nur Monate, die auf allen Konten vollstaendig gebucht sind.
export function planIstMonate(daten, heute) {
  return bestandsMonate(daten, heute, { vollstaendigBis: importAbdeckung(daten, heute).vollstaendig_bis });
}

export function planIstRechnung(daten, alle, periode = "") {
  const r = planIst(daten, zeitraumMonate(alle, periode));
  const kontoName = new Map((daten.konten ?? []).map((k) => [k.konto_id, k.name]));
  return {
    ...r,
    einnahmen: seite(r.einnahmen),
    ausgaben: seite(r.ausgaben),
    luecken: r.luecken.map((l) => ({ ...l, konto_name: kontoName.get(l.konto_id) ?? l.konto_id })),
  };
}

export function planIstVerlauf(daten, alle, granularitaet = "jahr") {
  return perioden(alle, granularitaet).map((p) => ({ ...p, r: summen(planIst(daten, p.monate)) }));
}

export function planIstModell(daten, { heute, periode = "", granularitaet = "jahr" }) {
  const alle = planIstMonate(daten, heute);
  return { heute, alle, umfang: importAbdeckung(daten, heute), r: planIstRechnung(daten, alle, periode), verlauf: planIstVerlauf(daten, alle, granularitaet) };
}
