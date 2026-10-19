// Buchungsliste (app/transaktionen-abfrage.mjs): Betrag von/bis, Richtung,
// Regelzahlung als Filter und Summen je Gruppe ueber den ganzen Filter.
import assert from "node:assert/strict";
import test from "node:test";
import { filtereTransaktionen, transaktionenSeite } from "../app/transaktionen-abfrage.mjs";
import { transaktionenParameter } from "../app/lese-api.mjs";

const tx = (id, datum, betrag, extra = {}) => ({ transaktion_id: id, buchungsdatum: datum, betrag, konto_id: "KTO-1", gegenpartei: "Laden", ...extra });
const daten = {
  kategorien: [{ kategorie_id: "KAT-1", name: "Lebensmittel" }, { kategorie_id: "KAT-2", name: "Gehalt" }],
  transaktionen: [
    tx("T1", "2026-01-05", "-12.50", { kategorie_id: "KAT-1" }),
    tx("T2", "2026-01-20", "-640.00", { kategorie_id: "KAT-1", regelzahlung_id: "RZ-1", gegenpartei: "Vermieter" }),
    tx("T3", "2026-02-01", "3000.00", { kategorie_id: "KAT-2", gegenpartei: "Arbeitgeber" }),
    tx("T4", "2026-02-03", "-500.00", { regelzahlung_id: "RZ-1", gegenpartei: "Vermieter" }),
  ],
};
const ids = (liste) => liste.map((t) => t.transaktion_id);

test("Richtung: Einnahmen sind positive, Ausgaben negative Betraege", () => {
  assert.deepEqual(ids(filtereTransaktionen(daten, { richtung: "einnahme" })), ["T3"]);
  assert.deepEqual(ids(filtereTransaktionen(daten, { richtung: "ausgabe" })), ["T1", "T2", "T4"]);
});

test("Betrag von/bis gilt fuer den Betrag ohne Vorzeichen, Grenzen eingeschlossen", () => {
  assert.deepEqual(ids(filtereTransaktionen(daten, { betragVon: "500" })), ["T2", "T3", "T4"]);
  assert.deepEqual(ids(filtereTransaktionen(daten, { betragVon: "500", richtung: "ausgabe" })), ["T2", "T4"], "alle Abbuchungen ab 500 €");
  assert.deepEqual(ids(filtereTransaktionen(daten, { betragBis: "12.50" })), ["T1"]);
  assert.deepEqual(ids(filtereTransaktionen(daten, { betragVon: "13", betragBis: "640" })), ["T2", "T4"]);
});

test("Regelzahlung als Filter", () => {
  assert.deepEqual(ids(filtereTransaktionen(daten, { regelzahlung: "RZ-1" })), ["T2", "T4"]);
});

test("Gruppen: Anzahl und Summe je Kategorie, Monat oder Gegenpartei ueber den ganzen Filter", () => {
  const kategorie = transaktionenSeite(daten, { gruppe: "kategorie", groesse: 10, ohneKategorie: "Ohne Kategorie" }).gruppen;
  assert.deepEqual(kategorie, [
    { schluessel: "KAT-2", name: "Gehalt", anzahl: 1, summe_cent: 300000, letzte: "2026-02-01" },
    { schluessel: "KAT-1", name: "Lebensmittel", anzahl: 2, summe_cent: -65250, letzte: "2026-01-20" },
    { schluessel: "", name: "Ohne Kategorie", anzahl: 1, summe_cent: -50000, letzte: "2026-02-03" },
  ], "nach Betrag ohne Vorzeichen absteigend");
  const monat = transaktionenSeite(daten, { gruppe: "monat", filter: { richtung: "ausgabe" } }).gruppen;
  assert.deepEqual(monat, [
    { schluessel: "2026-02", name: "2026-02", anzahl: 1, summe_cent: -50000, letzte: "2026-02-03" },
    { schluessel: "2026-01", name: "2026-01", anzahl: 2, summe_cent: -65250, letzte: "2026-01-20" },
  ], "Monate neueste zuerst");
  const gegenpartei = transaktionenSeite(daten, { gruppe: "gegenpartei" }).gruppen;
  assert.equal(gegenpartei[0].schluessel, "Arbeitgeber");
  assert.deepEqual(gegenpartei.find((g) => g.schluessel === "Vermieter"), { schluessel: "Vermieter", name: "Vermieter", anzahl: 2, summe_cent: -114000, letzte: "2026-02-03" });
  assert.equal(transaktionenSeite(daten, {}).gruppen, null, "ohne Gruppierung keine Gruppen");
});

test("API-Parameter: neue Filter und Gruppe werden geprueft", () => {
  const p = transaktionenParameter(new URLSearchParams("betragVon=500&richtung=ausgabe&regelzahlung=RZ-1&gruppe=monat"));
  assert.equal(p.filter.betragVon, "500");
  assert.equal(p.filter.richtung, "ausgabe");
  assert.equal(p.filter.regelzahlung, "RZ-1");
  assert.equal(p.gruppe, "monat");
  assert.throws(() => transaktionenParameter(new URLSearchParams("betragVon=abc")), /betragVon/);
  assert.throws(() => transaktionenParameter(new URLSearchParams("richtung=quer")), /richtung/);
  assert.throws(() => transaktionenParameter(new URLSearchParams("gruppe=konto")), /gruppe/);
});

test("Gruppenzeilen lassen sich exakt filtern: ohne Kategorie und genaue Gegenpartei", () => {
  assert.deepEqual(ids(filtereTransaktionen(daten, { category: "ohne" })), ["T4"]);
  assert.deepEqual(ids(filtereTransaktionen(daten, { gegenpartei: "Vermieter" })), ["T2", "T4"]);
  assert.deepEqual(ids(filtereTransaktionen(daten, { gegenpartei: "Verm" })), [], "kein Teiltreffer");
});

test("Gruppe Regelzahlung: Anzahl, Summe und letzte Buchung je Regelzahlung", () => {
  const rz = transaktionenSeite({ ...daten, regelzahlungen: [{ regelzahlung_id: "RZ-1", bezeichnung: "Miete" }] }, { gruppe: "regelzahlung" }).gruppen;
  assert.deepEqual(rz.find((g) => g.schluessel === "RZ-1"), { schluessel: "RZ-1", name: "Miete", anzahl: 2, summe_cent: -114000, letzte: "2026-02-03" });
  assert.deepEqual(rz.find((g) => g.schluessel === ""), { schluessel: "", name: "", anzahl: 2, summe_cent: 298750, letzte: "2026-02-01" });
});

test("Klasse: nur laufende Buchungen (ohne Transfers und neutrale Kategorien)", () => {
  const mit = {
    ...daten,
    kategorien: [...daten.kategorien, { kategorie_id: "KAT-9", name: "Sparen", typ: "neutral" }],
    transaktionen: [...daten.transaktionen, tx("T5", "2026-02-04", "-50.00", { ist_transfer: true }), tx("T6", "2026-02-05", "-70.00", { kategorie_id: "KAT-9" })],
  };
  assert.deepEqual(ids(filtereTransaktionen(mit, { klasse: "laufend" })), ["T1", "T2", "T3", "T4"]);
  assert.deepEqual(ids(filtereTransaktionen(mit, { klasse: "neutral" })), ["T6"]);
  assert.throws(() => transaktionenParameter(new URLSearchParams("klasse=quatsch")), /klasse/);
});
