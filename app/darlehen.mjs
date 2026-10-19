// app/darlehen.mjs
// Ein Zahlungsereignis-Modell fuer Darlehen (Review Welle 2, 2.3): je Termin
// Zahlung, Zins, Tilgung und Rest aus einer Quelle. Bewertung (Restschuld zum
// Stichtag), Darlehensdetails und Szenario (Schuld und Geldabfluss) rechnen
// damit. Rein, Geld in Cent.
//
// Termine und Betraege der Raten:
// - Bestaetigte Regelzahlungen des Darlehens (darlehen_id) sind Gueltigkeits-
//   abschnitte: ihre Termine (Anker bis aktiv_bis) mit ihrem Betrag. Eine
//   Aenderung der Rate ist ein neuer Abschnitt (alte Regelzahlung mit
//   aktiv_bis, neue ab ihrem Anker).
// - Wo keine Regelzahlung gilt, zahlt der Vertragsplan (Sollrate ab
//   Anfangsdatum im Darlehensrhythmus). Eine Regelzahlung gilt ab einer Periode
//   vor ihrem Anker bis aktiv_bis; so ersetzt die Rate am 3. die Vertragsrate
//   am 1. desselben Monats, statt doppelt zu zahlen.
// - Zins je Rate: zinsJePeriodeCents (rhythmus.mjs), ganzzahlig, kaufmaennisch
//   gerundet, nominelle Periode des Zahlungsrhythmus.
// - Zahlung = min(Rate, Rest + Zins): die letzte Rate ist die Schlussrate, am
//   Termin der Rate (bei einer Regelzahlung deren Zahlungsdatum). Deckt die Rate
//   den Zins nicht, waechst der Rest.
// - Sondertilgungen ({ datum, nominal_cents, annahme_id }) tilgen hoechstens den
//   Rest, ohne Zins; am selben Tag zahlt zuerst die Rate.
import { termin, termine, zinsJePeriodeCents } from "./rhythmus.mjs";
import { toCents } from "./tools/lib/text.mjs";

export function darlehensRegelzahlungen(darlehen, regelzahlungen) {
  return (regelzahlungen ?? []).filter((rz) => rz.darlehen_id === darlehen.darlehen_id && rz.status === "bestaetigt" && !rz._gegenbuchung);
}

// Ratentermine nach start.datum bis `bis`, je mit Betrag und Rhythmus.
function ratenTermine(darlehen, nach, bis, regelzahlungen) {
  const rzs = darlehensRegelzahlungen(darlehen, regelzahlungen);
  const raten = [];
  for (const rz of rzs) {
    for (const datum of termine(rz.anker_datum, rz.rhythmus_einheit, rz.rhythmus_intervall, { nach, bis, ende: rz.aktiv_bis })) {
      raten.push({ datum, rate_cents: Math.abs(toCents(rz.betrag)), einheit: rz.rhythmus_einheit, intervall: rz.rhythmus_intervall, quelle: "regelzahlung", regelzahlung_id: rz.regelzahlung_id });
    }
  }
  const gedeckt = (d) => rzs.some((rz) => termin(rz.anker_datum, rz.rhythmus_einheit, rz.rhythmus_intervall, -1) < d && (!rz.aktiv_bis || d <= rz.aktiv_bis));
  if (darlehen.anfangsdatum && darlehen.sollrate) {
    for (const datum of termine(darlehen.anfangsdatum, darlehen.rhythmus_einheit, darlehen.rhythmus_intervall, { nach, bis })) {
      if (!gedeckt(datum)) raten.push({ datum, rate_cents: toCents(darlehen.sollrate), einheit: darlehen.rhythmus_einheit, intervall: darlehen.rhythmus_intervall, quelle: "vertrag" });
    }
  }
  return raten;
}

// start: { datum, rest_cents } (Rest nach allen Zahlungen bis einschliesslich
// datum). Liefert { ereignisse, schluss, abbezahlt_am }; ereignisse aufsteigend,
// je { datum, typ: "rate"|"sondertilgung", quelle, regelzahlung_id?,
// annahme_id?, zahlung_cents, zins_cents, tilgung_cents, rest_cents }.
// Nach der Tilgung entfallen weitere Raten; Sondertilgungen stehen mit 0 da.
export function zahlungsplan(darlehen, { start, bis, regelzahlungen = [], sondertilgungen = [] }) {
  const ereignisse = [
    ...ratenTermine(darlehen, start.datum, bis, regelzahlungen).map((r) => ({ ...r, typ: "rate" })),
    ...sondertilgungen.filter((s) => s.datum > start.datum && s.datum <= bis).map((s) => ({ ...s, typ: "sondertilgung" })),
  ].sort((a, b) => a.datum.localeCompare(b.datum) || (a.typ === b.typ ? String(a.regelzahlung_id ?? a.annahme_id ?? "").localeCompare(String(b.regelzahlung_id ?? b.annahme_id ?? "")) : a.typ === "rate" ? -1 : 1));
  let rest = start.rest_cents;
  let schluss = null;
  const plan = [];
  for (const ev of ereignisse) {
    if (ev.typ === "rate") {
      if (rest <= 0) continue;
      const zins = zinsJePeriodeCents(rest, darlehen.zinssatz, ev.einheit, ev.intervall);
      const zahlung = Math.min(ev.rate_cents, rest + zins);
      rest = rest + zins - zahlung;
      plan.push({ datum: ev.datum, typ: "rate", quelle: ev.quelle, ...(ev.regelzahlung_id ? { regelzahlung_id: ev.regelzahlung_id } : {}), zahlung_cents: zahlung, zins_cents: zins, tilgung_cents: zahlung - zins, rest_cents: rest });
      if (rest === 0 && !schluss) schluss = { datum: ev.datum, via: "rate", zahlung_cents: zahlung, regelzahlung_id: ev.regelzahlung_id ?? null };
    } else {
      const eff = Math.max(0, Math.min(ev.nominal_cents, rest));
      rest -= eff;
      plan.push({ datum: ev.datum, typ: "sondertilgung", quelle: "annahme", annahme_id: ev.annahme_id, zahlung_cents: eff, zins_cents: 0, tilgung_cents: eff, rest_cents: rest });
      if (rest === 0 && eff > 0 && !schluss) schluss = { datum: ev.datum, via: "st", zahlung_cents: eff, regelzahlung_id: null };
    }
  }
  return { ereignisse: plan, schluss, abbezahlt_am: schluss?.datum ?? null };
}
