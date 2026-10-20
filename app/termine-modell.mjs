// app/termine-modell.mjs
// Regelzahlungen auf der Seite Termine (rein, ohne DOM): letzte Buchung,
// naechste Faelligkeit, "ueberfaellig", Filter und Sortierung. Die Buchungen
// je Regelzahlung (Anzahl, letzte) liefert der Server als Gruppen der
// Buchungsliste (gruppe=regelzahlung).
//
// Ueberfaellig (fachlich): eine bestaetigte, noch laufende Regelzahlung mit
// mindestens einer zugeordneten Buchung, deren naechste erwartete Buchung
// (letzte Buchung plus ein Rhythmus) laenger als UEBERFAELLIG_TOLERANZ_TAGE
// zurueckliegt. Die Toleranz faengt Wochenenden, Feiertage und spaete
// Lastschriften ab. Ohne zugeordnete Buchung (Konto nicht importiert, Zuordnung
// nicht gelaufen) ist keine Aussage moeglich; solange die Buchungen nicht
// geladen sind (gruppen null) auch nicht.
import { addInterval, naechsteFaelligkeit, toCents } from "./liquiditaet.mjs";

export const UEBERFAELLIG_TOLERANZ_TAGE = 10;
export const ZEIGEN = Object.freeze(["alle", "aktiv", "ueberfaellig", "beendet"]);
const SORTIERUNG = Object.freeze(["bezeichnung", "betrag", "naechste", "letzte"]);

export function regelzahlungStand(rz, gruppe, heute) {
  const letzte = gruppe?.letzte || "";
  const beendet = rz.status === "abgelehnt" || Boolean(rz.aktiv_bis && rz.aktiv_bis < heute);
  const erwartet = letzte ? addInterval(letzte, rz.rhythmus_einheit, rz.rhythmus_intervall) : "";
  const ueberfaellig = !beendet && rz.status === "bestaetigt" && Boolean(erwartet)
    && addInterval(erwartet, "tag", UEBERFAELLIG_TOLERANZ_TAGE) < heute;
  return {
    rz,
    letzte,
    anzahl: gruppe?.anzahl ?? 0,
    summe_cent: gruppe?.summe_cent ?? 0,
    naechste: beendet ? "" : naechsteFaelligkeit(rz, heute) || "",
    erwartet,
    beendet,
    ueberfaellig,
  };
}

const vergleiche = (a, b) => String(a).localeCompare(String(b), "de");

// zeigen: alle | aktiv | ueberfaellig | beendet; sort: { key, dir }. immer:
// diese Regelzahlung bleibt in jeder Auswahl (angesteuert, z. B. per Link).
// Leere Daten (keine Buchung, kein Termin) stehen bei jeder Richtung hinten.
export function regelzahlungZeilen(regelzahlungen, gruppen, heute, { zeigen = "alle", sort = { key: "bezeichnung", dir: "asc" }, immer = "" } = {}) {
  // gruppen null: Buchungen noch nicht geladen -> keine Aussage zu "ueberfaellig".
  const je = new Map((gruppen ?? []).map((g) => [g.schluessel, g]));
  const zeilen = (regelzahlungen ?? []).map((rz) => regelzahlungStand(rz, je.get(rz.regelzahlung_id), heute))
    .map((z) => (gruppen === null ? { ...z, ueberfaellig: false } : z))
    .filter((z) => z.rz.regelzahlung_id === immer ? true
      : zeigen === "aktiv" ? !z.beendet
      : zeigen === "ueberfaellig" ? z.ueberfaellig
        : zeigen === "beendet" ? z.beendet : true);
  const faktor = sort.dir === "desc" ? -1 : 1;
  const wert = {
    bezeichnung: (z) => z.rz.bezeichnung ?? "",
    betrag: (z) => toCents(z.rz.betrag),
    naechste: (z) => z.naechste,
    letzte: (z) => z.letzte,
  }[SORTIERUNG.includes(sort.key) ? sort.key : "bezeichnung"];
  return zeilen.sort((a, b) => {
    const wa = wert(a);
    const wb = wert(b);
    if (wa === "" && wb !== "") return 1;
    if (wb === "" && wa !== "") return -1;
    const cmp = typeof wa === "number" ? wa - wb : vergleiche(wa, wb);
    return cmp * faktor || vergleiche(a.rz.regelzahlung_id, b.rz.regelzahlung_id);
  });
}

// Jahresvergleich je Kategorie mit vergleichbaren Zeitraeumen: das laufende
// Jahr bis zum Ende des letzten vollen Monats gegen dieselben Monate des
// Vorjahres; im Januar das ganze Vorjahr gegen das Jahr davor.
export function vergleichsZeitraeume(heute) {
  const monatsAnfang = `${heute.slice(0, 7)}-01`;
  const letzterTag = addInterval(monatsAnfang, "tag", -1);
  const jahr = Number(letzterTag.slice(0, 4));
  const aktuell = { von: `${jahr}-01-01`, bis: letzterTag };
  const bisVorjahr = addInterval(`${jahr - 1}${letzterTag.slice(4, 8)}01`, "monat", 1);
  return { aktuell, vorjahr: { von: `${jahr - 1}-01-01`, bis: addInterval(bisVorjahr, "tag", -1) } };
}
