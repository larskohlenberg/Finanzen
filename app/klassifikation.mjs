// app/klassifikation.mjs
// Zentrale Klassifikation der Buchungen (Review Welle 2, 2.2). Jede Buchung
// bekommt genau eine Klasse; jede Kennzahl waehlt daraus aus:
//
//   transfer      Umbuchung zwischen eigenen Konten (ist_transfer)
//   startzustand  Anfangssaldo eines Kontos beim Import (transaktionstyp)
//   investition   Kategorie mit investition (Modernisierung samt Zuschuss)
//   sondereffekt  Gutschrift einer Kategorie mit gutschriften_sondereffekt
//                 (Steuererstattung); Belastungen derselben Kategorie bleiben laufend
//   neutral       neutrale Kategorie ausser "Noch zu klaeren" (Sparen, Umbuchung)
//   laufend       alles andere, auch "Noch zu klaeren" und ohne Kategorie
//
// Auswahl je Kennzahl (AUSWAHL): laufende Einnahmen und Ausgaben nur
// "laufend"; das Sparen dazu "neutral" (wohin der Ueberschuss fliesst);
// Kontostand und Liquiditaet nehmen alle Buchungen. Kennzahlen ueber Monate
// liefern ihre Monatsliste, ihren Umfang (Importabdeckung je Konto) und ihre
// Ausschluesse (Anzahl und Summe je ausgeschlossener Klasse) mit.
//
// Vollstaendigkeit: Ein Monat zaehlt erst, wenn jedes Konto der Auswahl bis zu
// seinem letzten Tag belegt ist. "Belegt bis" je Konto ist die letzte Buchung
// oder der letzte Kontostand-Anker bis zum Stichtag, je nachdem, was spaeter
// liegt. Ruhige Konten bekommen keine automatische Ausnahme (Entscheidung E3):
// ein neuer Kontostand belegt den Zeitraum ohne Buchungen. Die Auswahl sind die
// verfuegbaren Konten (liquiditaetsrelevant, kein Depot, kein Bargeld, am
// Stichtag offen) und wird mit ausgegeben.
import { aktivAm } from "./bewertung.mjs";
import { toCents } from "./tools/lib/text.mjs";

export const KATEGORIE_UNGEKLAERT = "KAT-012";
export const STARTZUSTAND = "Startzustand";
export const KLASSEN = Object.freeze(["laufend", "neutral", "transfer", "startzustand", "investition", "sondereffekt"]);
export const AUSGESCHLOSSEN = Object.freeze(["transfer", "startzustand", "investition", "sondereffekt"]);
export const AUSWAHL = Object.freeze({
  einnahmen_ausgaben: Object.freeze(["laufend"]),
  sparen: Object.freeze(["laufend", "neutral"]),
  kontostand: KLASSEN,
});

export function kategorienIndex(data) {
  return new Map((data.kategorien ?? []).map((k) => [k.kategorie_id, k]));
}

export function buchungsKlasse(tx, typ) {
  if (tx.ist_transfer === true) return "transfer";
  if (tx.transaktionstyp === STARTZUSTAND) return "startzustand";
  const id = tx.kategorie_id ?? "";
  const k = typ.get(id);
  if (k?.investition === true) return "investition";
  if (k?.gutschriften_sondereffekt === true && toCents(tx.betrag) > 0) return "sondereffekt";
  if (k?.typ === "neutral" && id !== KATEGORIE_UNGEKLAERT) return "neutral";
  return "laufend";
}

// Zaehler fuer die Ausschluesse einer Kennzahl: je Klasse Anzahl und Summe.
export function ausschlussZaehler() {
  const z = Object.fromEntries(AUSGESCHLOSSEN.map((k) => [k, { anzahl: 0, summe_cents: 0 }]));
  return {
    zaehle(klasse, cents) {
      if (!z[klasse]) return;
      z[klasse].anzahl += 1;
      z[klasse].summe_cents += cents;
    },
    ergebnis: () => z,
  };
}

const verfuegbar = (konto, today) => konto.kontotyp !== "depot" && konto.kontotyp !== "bar" && konto.liquiditaetsrelevant === true && aktivAm(konto, "geschlossen", today);

// Importabdeckung je verfuegbarem Konto zum Stichtag: von (erste Buchung),
// belegt_bis (letzte Buchung oder letzter Kontostand-Anker bis zum Stichtag).
// vollstaendig_bis ist das frueheste belegt_bis, begrenzt_durch das Konto dazu.
export function importAbdeckung(data, today) {
  const konten = (data.konten ?? []).filter((k) => verfuegbar(k, today)).map((k) => ({ konto_id: k.konto_id, name: k.name, von: "", belegt_bis: "" }));
  const index = new Map(konten.map((k) => [k.konto_id, k]));
  for (const tx of data.transaktionen ?? []) {
    const k = index.get(tx.konto_id);
    if (!k || !tx.buchungsdatum || tx.buchungsdatum > today) continue;
    if (!k.von || tx.buchungsdatum < k.von) k.von = tx.buchungsdatum;
    if (tx.buchungsdatum > k.belegt_bis) k.belegt_bis = tx.buchungsdatum;
  }
  for (const zw of data.zeitwerte ?? []) {
    const k = zw.entitaet === "konto" && zw.feld === "kontostand" ? index.get(zw.entitaet_id) : null;
    if (k && zw.standdatum <= today && zw.standdatum > k.belegt_bis) k.belegt_bis = zw.standdatum;
  }
  let grenze = null;
  for (const k of konten) if (k.belegt_bis && (!grenze || k.belegt_bis < grenze.belegt_bis)) grenze = k;
  return { konten, vollstaendig_bis: grenze?.belegt_bis ?? "", begrenzt_durch: grenze?.konto_id ?? "" };
}
