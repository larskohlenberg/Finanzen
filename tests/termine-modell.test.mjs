import assert from "node:assert/strict";
import test from "node:test";
import { regelzahlungStand, regelzahlungZeilen, UEBERFAELLIG_TOLERANZ_TAGE } from "../app/termine-modell.mjs";

const rz = (id, extra = {}) => ({ regelzahlung_id: id, bezeichnung: id, betrag: "-10.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-01", status: "bestaetigt", ...extra });
const heute = "2026-05-20";

test("ueberfaellig: erwartete Buchung (letzte + Rhythmus) plus Toleranz ist vorbei", () => {
  assert.equal(UEBERFAELLIG_TOLERANZ_TAGE, 10);
  // letzte 2026-04-01 -> erwartet 2026-05-01, + 10 Tage = 11.5. < 20.5.
  assert.equal(regelzahlungStand(rz("A"), { letzte: "2026-04-01", anzahl: 4, summe_cent: -4000 }, heute).ueberfaellig, true);
  // letzte 2026-04-15 -> erwartet 15.5., + 10 Tage = 25.5. > 20.5.
  assert.equal(regelzahlungStand(rz("A"), { letzte: "2026-04-15", anzahl: 4 }, heute).ueberfaellig, false);
  // ohne zugeordnete Buchung keine Aussage (Konto nicht importiert, Zuordnung offen)
  assert.equal(regelzahlungStand(rz("A"), null, heute).ueberfaellig, false);
});

test("ueberfaellig misst am Importstand des Kontos, nicht am heutigen Tag", () => {
  const miete = rz("A", { konto_id: "KTO-1" });
  const gruppe = { letzte: "2026-03-01", anzahl: 3 };
  // erwartet 1.4., + 10 Tage = 11.4.; Konto erst bis 5.4. importiert -> keine Aussage moeglich
  const liegt = regelzahlungStand(miete, gruppe, heute, { "KTO-1": "2026-04-05" });
  assert.equal(liegt.ueberfaellig, false);
  assert.equal(liegt.importstand, "2026-04-05");
  // Konto bis 30.4. importiert, Buchung fehlt trotzdem -> ueberfaellig
  assert.equal(regelzahlungStand(miete, gruppe, heute, { "KTO-1": "2026-04-30" }).ueberfaellig, true);
  // Importstand nach heute (Vorausbuchung) zaehlt hoechstens bis heute
  assert.equal(regelzahlungStand(miete, gruppe, heute, { "KTO-1": "2026-06-30" }).importstand, heute);
  // ohne Konto an der Regelzahlung gilt heute
  assert.equal(regelzahlungStand(rz("A"), gruppe, heute, { "KTO-1": "2026-04-05" }).ueberfaellig, true);
  // ueber regelzahlungZeilen durchgereicht
  const zeilen = regelzahlungZeilen([miete], [{ schluessel: "A", ...gruppe }], heute, { zeigen: "ueberfaellig", importstand: { "KTO-1": "2026-04-05" } });
  assert.deepEqual(zeilen, []);
});

test("nicht ueberfaellig: abgelehnt, vorgeschlagen oder beendet", () => {
  const alt = { letzte: "2025-01-01", anzahl: 1 };
  assert.equal(regelzahlungStand(rz("A", { status: "abgelehnt" }), alt, heute).ueberfaellig, false);
  assert.equal(regelzahlungStand(rz("A", { status: "vorgeschlagen" }), alt, heute).ueberfaellig, false);
  const beendet = regelzahlungStand(rz("A", { aktiv_bis: "2026-03-31" }), alt, heute);
  assert.equal(beendet.ueberfaellig, false);
  assert.equal(beendet.beendet, true);
});

test("Zeilen: filtern nach aktiv/ueberfaellig/beendet, sortieren nach Feldern", () => {
  const liste = [rz("A", { bezeichnung: "Strom", betrag: "-80.00" }), rz("B", { bezeichnung: "Miete", betrag: "-900.00" }), rz("C", { bezeichnung: "Alt", aktiv_bis: "2025-12-31" })];
  const gruppen = [{ schluessel: "A", letzte: "2026-05-10", anzahl: 5 }, { schluessel: "B", letzte: "2026-03-01", anzahl: 3 }];
  const ids = (z) => z.map((x) => x.rz.regelzahlung_id);
  assert.deepEqual(ids(regelzahlungZeilen(liste, gruppen, heute, { zeigen: "ueberfaellig" })), ["B"]);
  assert.deepEqual(ids(regelzahlungZeilen(liste, null, heute, { zeigen: "ueberfaellig" })), [], "vor dem Laden nichts ueberfaellig");
  assert.deepEqual(ids(regelzahlungZeilen(liste, gruppen, heute, { zeigen: "beendet" })), ["C"]);
  assert.deepEqual(ids(regelzahlungZeilen(liste, gruppen, heute, { zeigen: "aktiv", immer: "C" })), ["C", "B", "A"], "angesteuerte bleibt sichtbar");
  assert.deepEqual(ids(regelzahlungZeilen(liste, gruppen, heute, { zeigen: "aktiv" })), ["B", "A"], "Standard: nach Bezeichnung");
  assert.deepEqual(ids(regelzahlungZeilen(liste, gruppen, heute, { sort: { key: "betrag", dir: "asc" } })), ["B", "A", "C"]);
  assert.deepEqual(ids(regelzahlungZeilen(liste, gruppen, heute, { sort: { key: "letzte", dir: "desc" } })), ["A", "B", "C"], "ohne Buchung zuletzt");
  const a = regelzahlungZeilen(liste, gruppen, heute, {}).find((z) => z.rz.regelzahlung_id === "A");
  assert.equal(a.letzte, "2026-05-10");
  assert.equal(a.anzahl, 5);
  assert.equal(a.naechste, "2026-06-01");
});

import { vergleichsZeitraeume } from "../app/termine-modell.mjs";

test("Jahresvergleich: bisheriges Jahr bis Ende des letzten vollen Monats gegen dieselben Monate im Vorjahr", () => {
  assert.deepEqual(vergleichsZeitraeume("2026-10-20"), {
    aktuell: { von: "2026-01-01", bis: "2026-09-30" },
    vorjahr: { von: "2025-01-01", bis: "2025-09-30" },
  });
  // Im Januar gibt es noch keinen vollen Monat: ganzes Vorjahr gegen das Jahr davor.
  assert.deepEqual(vergleichsZeitraeume("2026-01-15"), {
    aktuell: { von: "2025-01-01", bis: "2025-12-31" },
    vorjahr: { von: "2024-01-01", bis: "2024-12-31" },
  });
  // Schaltjahr: Februar endet im Vorjahr am 28.
  assert.deepEqual(vergleichsZeitraeume("2024-03-05").vorjahr, { von: "2023-01-01", bis: "2023-02-28" });
});
