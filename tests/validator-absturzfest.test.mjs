import assert from "node:assert/strict";
import { test } from "node:test";
import { validateMasterData, loadMasterData } from "../app/tools/validator.mjs";

// Kaputte Struktur darf den Validator nie werfen lassen: er liefert immer einen Bericht.
const demo = await loadMasterData(new URL("../app/data/demo/", import.meta.url));
const KAPUTT = [null, undefined, {}, [], [null], [1], "x", 1, true];

function pruefeOhneAbsturz(data, beschreibung) {
  let ergebnis;
  assert.doesNotThrow(() => { ergebnis = validateMasterData(data); }, beschreibung);
  assert.equal(typeof ergebnis.valid, "boolean", beschreibung);
  assert.ok(Array.isArray(ergebnis.errors), beschreibung);
  // Das Netz in validateMasterData darf nicht der Grund sein, dass nichts wirft.
  assert.ok(!ergebnis.errors.some((e) => e.startsWith("Querpruefung abgebrochen")), `${beschreibung}: ${ergebnis.errors.find((e) => e.startsWith("Querpruefung"))}`);
  return ergebnis;
}

test("Demobestand ist gueltig (Ausgangslage)", () => {
  const r = validateMasterData(demo);
  assert.equal(r.valid, true, r.errors.join("\n"));
});

test("konten=[null] und konten={} liefern Bericht statt TypeError", () => {
  const a = pruefeOhneAbsturz({ ...demo, konten: [null] }, "konten=[null]");
  assert.equal(a.valid, false);
  assert.match(a.errors.join("\n"), /konten\[0\]: muss ein Objekt sein/);
  const b = pruefeOhneAbsturz({ ...demo, konten: {} }, "konten={}");
  assert.equal(b.valid, false);
  assert.match(b.errors.join("\n"), /konten: muss eine Liste sein/);
});

test("Bestand ohne Objekt (null) liefert Bericht", () => {
  const r = pruefeOhneAbsturz(null, "data=null");
  assert.equal(r.valid, false);
});

test("jede Collection durch Muell ersetzt: kein Absturz", () => {
  for (const name of Object.keys(demo)) {
    for (const wert of KAPUTT) {
      pruefeOhneAbsturz({ ...demo, [name]: wert }, `${name}=${JSON.stringify(wert)}`);
    }
  }
});

test("jedes Feld des ersten Eintrags durch Muell ersetzt: kein Absturz", () => {
  for (const [name, liste] of Object.entries(demo)) {
    if (!Array.isArray(liste) || liste.length === 0) continue;
    for (const feld of Object.keys(liste[0])) {
      for (const wert of KAPUTT) {
        const kopie = [{ ...liste[0], [feld]: wert }, ...liste.slice(1)];
        const r = pruefeOhneAbsturz({ ...demo, [name]: kopie }, `${name}[0].${feld}=${JSON.stringify(wert)}`);
        if (wert === undefined) continue;
        assert.equal(typeof r.valid, "boolean");
      }
    }
  }
});

test("verschachtelte Szenario-Annahmen und Gegenbuchungen als Muell: kein Absturz", () => {
  const sz = demo.szenarien.find((s) => Array.isArray(s.annahmen) && s.annahmen.length > 0);
  assert.ok(sz, "Demo braucht ein Szenario mit Annahmen");
  const annahme = sz.annahmen[0];
  for (const wert of KAPUTT) {
    pruefeOhneAbsturz({ ...demo, szenarien: [{ ...sz, annahmen: [wert] }] }, `annahmen=[${JSON.stringify(wert)}]`);
    pruefeOhneAbsturz({ ...demo, szenarien: [{ ...sz, annahmen: [{ ...annahme, gegenbuchung: wert }] }] }, `gegenbuchung=${JSON.stringify(wert)}`);
    pruefeOhneAbsturz({ ...demo, szenarien: [{ ...sz, annahmen: [{ ...annahme, art: "einmalzahlung", gegenbuchung: { ziel_typ: "vorsorge", neue_position: wert } }] }] }, `neue_position=${JSON.stringify(wert)}`);
  }
});
