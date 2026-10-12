import { test } from "node:test";
import assert from "node:assert/strict";
import { szenarioAenderungen } from "../app/szenarien.mjs";

const TODAY = "2026-06-22";
const rz = (id, betrag, kat, extra = {}) => ({ regelzahlung_id: id, bezeichnung: id, betrag, rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-01", status: "bestaetigt", qualitaet: "belegt", erstellt_am: "2026-06-01", kategorie_id: kat, ...extra });
const data = {
  kategorien: [],
  regelzahlungen: [
    rz("RZ-1", "3000.00", "KAT-001", { bezeichnung: "Gehalt alt", aktiv_bis: "2026-12-31" }),
    rz("RZ-2", "-45.00", "KAT-002", { bezeichnung: "Zeitung" }),
    rz("RZ-3", "-1000.00", "KAT-003", { bezeichnung: "Sparen" }),
    rz("RZ-4", "-500.00", "KAT-004", { bezeichnung: "Miete" }),
    rz("RZ-5", "-120.00", "KAT-002", { bezeichnung: "Jahresabo", rhythmus_einheit: "jahr", aktiv_bis: "2027-03-31" }),
  ],
  vorsorge: [],
  zeitwerte: [],
};
const sz = {
  szenario_id: "SZN-001", name: "T", status: "entwurf", stand: TODAY, reichweite_bis: "2028-12-31", erstellt_am: TODAY,
  annahmen: [
    { annahme_id: "A1", art: "regelzahlung-neu", qualitaet: "geschaetzt", name: "Gehalt neu", kategorie_id: "KAT-001", betrag: "3500.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, ab: "2027-01-27", bis: "2027-06-30" },
    { annahme_id: "A2", art: "regelzahlung-aenderung", qualitaet: "geschaetzt", regelzahlung_id: "RZ-2", ab: "2027-01-01", aktion: "beenden" },
    { annahme_id: "A3", art: "regelzahlung-aenderung", qualitaet: "geschaetzt", regelzahlung_id: "RZ-3", ab: "2027-01-02", aktion: "betrag-aendern", betrag: "-250.00" },
    { annahme_id: "A4", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2028-05-10", betrag: "50000.00", begruendung: "Erbschaft" },
  ],
};

test("szenarioAenderungen: chronologisch, mit Ersetzung, Ende im Bestand und Einmalzahlung", () => {
  const liste = szenarioAenderungen(data, sz, TODAY);
  assert.deepEqual(liste.map((a) => [a.datum, a.art, a.name]), [
    ["2027-01-01", "beendet", "Zeitung"],
    ["2027-01-02", "geaendert", "Sparen"],
    ["2027-01-27", "ersetzt", "Gehalt neu"],
    ["2027-04-01", "auslauf", "Jahresabo"],
    ["2027-07-01", "auslauf", "Gehalt neu"],
    ["2028-05-10", "einmalig", "Erbschaft"],
  ]);
  const [zeitung, sparen, gehalt, abo, gehaltEnde, erbe] = liste;
  assert.equal(zeitung.delta_cents, 4500);
  assert.deepEqual(zeitung.quellen, ["annahme"]);
  assert.equal(sparen.alt.betrag, "-1000.00");
  assert.equal(sparen.neu.betrag, "-250.00");
  assert.equal(sparen.delta_cents, 75000);
  assert.equal(gehalt.alt.name, "Gehalt alt");
  assert.equal(gehalt.neu.name, "Gehalt neu");
  assert.equal(gehalt.delta_cents, 50000);
  assert.deepEqual(gehalt.quellen, ["bestand", "annahme"]);
  assert.equal(abo.delta_cents, 1000);
  assert.deepEqual(abo.quellen, ["bestand"]);
  assert.equal(gehaltEnde.delta_cents, -350000);
  assert.equal(erbe.einmal_cents, 5000000);
  assert.equal(erbe.delta_cents, 0);
});

test("szenarioAenderungen: Bestands-Ende entfaellt, wenn eine Annahme die Zahlung frueher beendet", () => {
  const s = { ...sz, annahmen: [{ annahme_id: "A9", art: "regelzahlung-aenderung", qualitaet: "geschaetzt", regelzahlung_id: "RZ-1", ab: "2026-10-01", aktion: "beenden" }] };
  const liste = szenarioAenderungen(data, s, TODAY).filter((a) => a.name === "Gehalt alt");
  assert.deepEqual(liste.map((a) => [a.datum, a.art]), [["2026-10-01", "beendet"]]);
});

test("szenarioAenderungen: nichts ausserhalb von Rechenstart und Horizont", () => {
  const s = { ...sz, reichweite_bis: "2026-12-15", annahmen: [] };
  assert.deepEqual(szenarioAenderungen(data, s, TODAY), []);
});
