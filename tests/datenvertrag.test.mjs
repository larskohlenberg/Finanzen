// tests/datenvertrag.test.mjs
// 1B.2: Eine Vertragsquelle. Fuehrend sind die Schemas in validate-core
// (DATENVERTRAG); die JSON-Schemas unter app/schemas/ sind Doku und muessen
// Feld fuer Feld daraus folgen. Weicht eine Datei ab, ist dieser Test rot.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DATENVERTRAG } from "../app/tools/validate-core.mjs";
import { feldAlsJsonSchema, jsonSchemaDatei } from "../app/tools/lib/vertrag.mjs";

function liesSchema(sammlung) {
  return JSON.parse(readFileSync(new URL(`../app/schemas/${jsonSchemaDatei(sammlung)}`, import.meta.url), "utf8"));
}

// Eintragsschema: Sammlungen sind Listen, zeitwerte.jsonl beschreibt eine Zeile.
function eintrag(json) {
  return json.type === "array" ? json.items : json;
}

test("jede Sammlung des Validators hat eine JSON-Schema-Datei", () => {
  for (const sammlung of Object.keys(DATENVERTRAG)) {
    assert.doesNotThrow(() => liesSchema(sammlung), sammlung);
  }
});

for (const [sammlung, vertrag] of Object.entries(DATENVERTRAG)) {
  test(`JSON-Schema ${sammlung} folgt dem Validator`, () => {
    const json = eintrag(liesSchema(sammlung));
    assert.equal(json.additionalProperties, false, `${sammlung}: additionalProperties`);
    assert.deepEqual([...json.required].sort(), [...vertrag.required].sort(), `${sammlung}: required`);
    assert.deepEqual(Object.keys(json.properties).sort(), Object.keys(vertrag.fields).sort(), `${sammlung}: Felder`);
    for (const [feld, regel] of Object.entries(vertrag.fields)) {
      const erwartet = feldAlsJsonSchema(regel);
      const ist = json.properties[feld];
      // Die Doku darf beschreiben (description) und Unterstrukturen ausfuehren,
      // die der Validator als Querpruefung haelt; was der Validator als Feldregel
      // kennt, muss sie genau so sagen.
      for (const [schluessel, wert] of Object.entries(erwartet)) {
        assert.deepEqual(ist[schluessel], wert, `${sammlung}.${feld}.${schluessel}`);
      }
      for (const schluessel of ["pattern", "enum", "format", "minLength", "minimum", "minItems", "uniqueItems"]) {
        if (!(schluessel in erwartet)) assert.equal(ist[schluessel], undefined, `${sammlung}.${feld}.${schluessel} steht nur in der Doku`);
      }
    }
  });
}

test("Betragsmuster der JSON-Schemas entsprechen istGueltigerBetrag", async () => {
  const { istGueltigerBetrag } = await import("../app/tools/lib/text.mjs");
  const { BETRAG_MUSTER, BETRAG_MUSTER_NICHT_NEGATIV } = await import("../app/tools/lib/vertrag.mjs");
  const muster = new RegExp(BETRAG_MUSTER);
  const nichtNegativ = new RegExp(BETRAG_MUSTER_NICHT_NEGATIV);
  for (const wert of ["0.00", "-0.00", "1.00", "-1.00", "01.00", "1.0", "1.000", "1234.56", "-1234.56", "1,00", "", "+1.00"]) {
    assert.equal(muster.test(wert), istGueltigerBetrag(wert), wert);
    assert.equal(nichtNegativ.test(wert), istGueltigerBetrag(wert) && !wert.startsWith("-"), wert);
  }
});
