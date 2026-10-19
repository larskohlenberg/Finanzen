// app/konten-modell.mjs
// Konten als reine Funktion ueber einen Bestand: rechnet im App-Server
// (lese-api.mjs, GET /api/v1/konten) mit denselben Funktionen wie zuvor der
// Browser (uebersicht-rechnung.mjs, vermoegen.mjs, vermoegen-details.mjs).
// Je Konto nur Zahlen (Wert, Tabellenzeile, Buchungen seit dem Anker,
// Saldoverlauf), dazu die Reihenfolge der Kontentabellen und die Bloecke der
// Vermoegensseite als Konto-Ids. Stammdaten der Konten kennt der Browser.
import { toCents } from "./tools/lib/text.mjs";
import { kontoWert } from "./vermoegen.mjs";
import { kontoSaldoVerlauf } from "./vermoegen-details.mjs";
import { kontenGruppen, kontoZeile, sortierteKonten } from "./uebersicht-rechnung.mjs";

// Buchungen seit dem juengsten Kontostand-Anker bis zum Stichtag (Detail einer
// Kontoposition): Wert minus Anker, wenn der Wert vorwaerts vom Anker kommt;
// Depots, Konten ohne Anker und Rueckrechnungen haben keine.
function seitAnkerCents(wert) {
  if (wert.basis !== "anker+buchungen") return null;
  return wert.wert_cents - toCents(wert.herkunft.wert);
}

const gruppe = (g) => ({
  konto_ids: g.zeilen.map((z) => z.konto.konto_id),
  summe_cents: g.summe_cents,
  belegt: g.belegt,
  gesamt: g.gesamt,
  aeltester: g.aeltester,
});

export function kontenModell(daten, heute) {
  const konten = {};
  for (const konto of daten.konten ?? []) {
    const wert = kontoWert(konto, daten.zeitwerte, daten.transaktionen, heute);
    konten[konto.konto_id] = {
      wert,
      zeile: kontoZeile(daten, konto, heute),
      seit_anker_cents: seitAnkerCents(wert),
      saldo_verlauf: kontoSaldoVerlauf(daten, konto, heute).map((p) => p.wert_cents),
    };
  }
  const g = kontenGruppen(daten, heute);
  return {
    heute,
    konten,
    reihenfolge: sortierteKonten(daten, heute).map((k) => k.konto_id),
    gruppen: { konten: gruppe(g.konten), depots: gruppe(g.depots), weitere: gruppe(g.weitere) },
  };
}
