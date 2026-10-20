// Diffusor-Modus (app/diffusor.mjs): verdeckte Betraege, Platzhalter fuer Namen.
// Erfundene Namen und Betraege.
import assert from "node:assert/strict";
import test from "node:test";
import { formatierer } from "../app/format.mjs";
import {
  STELLEN, ZEICHEN, erstelleErsetzer, istVerdeckt, pseudonymTabelle, verdeckeBetrag,
  verdeckeFreitext, verdeckeText, verschleierterFormatierer, zeichenFolge, zerlege,
} from "../app/diffusor.mjs";

const SALZ = "test";

const namen = {
  person: (n) => `Person ${n}`,
  konto: (art, kennung) => `${art} ${kennung}`,
  vorsorge: (art, n) => `${art} ${n}`,
  immobilie: (n) => `Immobilie ${n}`,
  darlehen: (n) => `Darlehen ${n}`,
  vermoegenswert: (n) => `Vermoegenswert ${n}`,
  regelzahlung: (kategorie, n) => `${kategorie} ${n}`,
  gegenpartei: (n) => `Gegenpartei ${n}`,
  kontoArt: (typ) => ({ giro: "Giro", tagesgeld: "Tagesgeld" })[typ] ?? "Konto",
  vorsorgeArt: (art) => ({ riester: "Riester" })[art] ?? "Vertrag",
  kategorie: (id) => ({ "KAT-1": "Wohnen", "KAT-2": "Kindergeld" })[id] ?? "Regelzahlung",
};

const bestand = {
  personen: [{ name: "Erika Beispiel" }, { name: "Max Beispiel" }],
  konten: [
    { name: "Hausbank Giro", kontotyp: "giro" },
    { name: "Zweitbank Giro", kontotyp: "giro" },
    { name: "Polster", kontotyp: "tagesgeld" },
  ],
  vorsorge: [{ name: "Riester Erika (Versicherer X)", art: "riester" }],
  immobilien: [{ bezeichnung: "Wohnung Seestrasse" }],
  regelzahlungen: [
    { bezeichnung: "Miete Seestrasse", kategorie_id: "KAT-1" },
    { bezeichnung: "Kindergeld", kategorie_id: "KAT-2" },
  ],
  kategorien: [{ name: "Wohnen" }, { name: "Kindergeld" }],
  logos: [{ name: "Supermarkt Y" }],
};

test("diffusor: Zeichenfolge fest je Salz und Schluessel, immer gleich lang", () => {
  assert.equal(zeichenFolge("123456", SALZ), zeichenFolge("123456", SALZ));
  assert.notEqual(zeichenFolge("123456", SALZ), zeichenFolge("123456", "anderes"));
  assert.equal([...zeichenFolge("1", SALZ)].length, STELLEN);
  assert.equal([...zeichenFolge("123456789", SALZ)].length, STELLEN);
  assert.ok([...zeichenFolge("42", SALZ)].every((z) => ZEICHEN.includes(z)));
});

test("diffusor: Betrag verliert seine Ziffern, Vorzeichen und Waehrung bleiben", () => {
  const de = verdeckeBetrag("-1.234,56 €", SALZ);
  assert.match(de, /^-\S+ €$/u);
  assert.doesNotMatch(de, /\d/);
  assert.equal([...de.slice(1, -2)].length, STELLEN, "kleine und grosse Betraege gleich lang");
  assert.equal([...verdeckeBetrag("5 €", SALZ).slice(0, -2)].length, STELLEN);
  assert.match(verdeckeBetrag("€1,234.56", SALZ), /^€\S+$/u);
});

test("diffusor: verschleierter Formatierer verdeckt Geld, laesst Prozent und Datum", () => {
  const f = verschleierterFormatierer(formatierer("de"), SALZ);
  for (const text of [f.geld(123456), f.geldGanz(-500), f.geldMitVorzeichen(1000), f.tausend(1230000)]) {
    assert.doesNotMatch(text, /\d/, text);
    assert.ok(istVerdeckt(text));
  }
  assert.match(f.prozent(0.31), /31/);
  assert.equal(f.datum("2026-05-01"), formatierer("de").datum("2026-05-01"));
});

test("diffusor: Platzhalter je Art, laengste Namen zuerst, Kategorienamen bleiben", () => {
  const tabelle = pseudonymTabelle(bestand, namen);
  const karte = new Map(tabelle);
  assert.equal(karte.get("Erika Beispiel"), "Person 1");
  assert.equal(karte.get("Erika"), "Person 1", "Vorname allein");
  assert.equal(karte.get("Hausbank Giro"), "Giro A");
  assert.equal(karte.get("Zweitbank Giro"), "Giro B");
  assert.equal(karte.get("Polster"), "Tagesgeld A");
  assert.equal(karte.get("Riester Erika (Versicherer X)"), "Riester 1");
  assert.equal(karte.get("Wohnung Seestrasse"), "Immobilie 1");
  assert.equal(karte.get("Miete Seestrasse"), "Wohnen 1");
  assert.equal(karte.has("Kindergeld"), false, "heisst wie eine Kategorie");
  assert.equal(karte.get("Supermarkt Y"), "Gegenpartei 1");
  const laengen = tabelle.map(([echt]) => echt.length);
  assert.deepEqual(laengen, [...laengen].sort((a, b) => b - a));
});

test("diffusor: Text ersetzt ganze Woerter, Betraege und markiert schon Verdecktes", () => {
  const ersetzer = erstelleErsetzer(pseudonymTabelle(bestand, namen));
  assert.equal(verdeckeText("Umbuchung von Hausbank Giro auf Polster", ersetzer, SALZ), "Umbuchung von Giro A auf Tagesgeld A");
  assert.equal(verdeckeText("Erikas Rad", ersetzer, SALZ), "Erikas Rad", "nur ganze Woerter");
  assert.equal(verdeckeText("erika beispiel", ersetzer, SALZ), "Person 1", "ohne Gross-/Kleinschreibung");
  const geld = verdeckeText("Saldo 1.234,56 € am 2026-05-01", ersetzer, SALZ);
  assert.doesNotMatch(geld, /1\.234/);
  assert.match(geld, /am 2026-05-01$/, "Datum bleibt");
  const teile = zerlege(`Wert ${zeichenFolge("1", SALZ)} €`, ersetzer, SALZ);
  assert.ok(teile.some((t) => t.verdeckt), "Verdecktes wird fuer die Walze markiert");
  const nurMarkiert = zerlege("Polster: 12 €", ersetzer, SALZ, { ersetzen: false });
  assert.equal(nurMarkiert.map((t) => t.text).join(""), "Polster: 12 €");
  assert.equal(nurMarkiert.filter((t) => t.verdeckt).length, 2);
});

test("diffusor: Freitext wird Wort fuer Wort zu Zeichen, Leerraum bleibt", () => {
  const text = verdeckeFreitext("Gehalt Erika 2026-05", SALZ);
  assert.equal(text.split(" ").length, 3);
  assert.doesNotMatch(text, /[A-Za-z0-9]/);
});
