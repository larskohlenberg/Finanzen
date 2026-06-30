import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { istGueltigerBetrag } from "../app/tools/lib/text.mjs";

async function readSchema(name) {
  return JSON.parse(await readFile(new URL(`../app/schemas/${name}.schema.json`, import.meta.url), "utf8"));
}

function schemaProperties(schema) {
  return schema.items?.properties ?? schema.properties;
}

const schemaFields = [
  { schema: "transaktionen", field: "betrag", signed: true },
  { schema: "regelzahlungen", field: "betrag", signed: true },
  { schema: "importformat", field: "betrag", signed: true },
  { schema: "zeitwerte", field: "wert", signed: true },
  { schema: "immobilien", field: "anschaffungskosten", signed: false },
  { schema: "darlehen", field: "anfangsbetrag", signed: false },
  { schema: "darlehen", field: "sollrate", signed: false },
  { schema: "darlehen", field: "restschuld_laufzeitende", signed: false },
  { schema: "transfers", field: "betrag", signed: false },
];

const betraege = ["0.00", "1.50", "123.45", "-1.50", "01.50", "00.00", "-0.00", "1.5", ""];

test("Betragspatterns der JSON-Schemas entsprechen der Core-Regel", async () => {
  for (const { schema, field, signed } of schemaFields) {
    const json = await readSchema(schema);
    const pattern = schemaProperties(json)[field].pattern;
    const regex = new RegExp(pattern);

    for (const betrag of betraege) {
      const coreAkzeptiert = istGueltigerBetrag(betrag) && (signed || !betrag.startsWith("-"));
      assert.equal(
        regex.test(betrag),
        coreAkzeptiert,
        `${schema}.${field} muss ${JSON.stringify(betrag)} wie der Core ${coreAkzeptiert ? "akzeptieren" : "ablehnen"}`,
      );
    }
  }
});
