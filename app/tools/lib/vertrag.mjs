// @ts-check
// app/tools/lib/vertrag.mjs
// Uebersetzt die Feldregeln des Validators (DATENVERTRAG in validate-core.mjs)
// in JSON-Schema. Die Dateien unter app/schemas/ sind Doku; der Test
// tests/datenvertrag.test.mjs haelt sie damit deckungsgleich.

/**
 * Feldregel, wie validate-core sie fuehrt.
 * @typedef {object} Feldregel
 * @property {"string"|"number"|"boolean"|"object"|"array"} type
 * @property {RegExp} [pattern]
 * @property {string[]} [enum]
 * @property {"date"} [format]
 * @property {number} [minLength]
 * @property {boolean} [integer]
 * @property {number} [min]
 * @property {boolean} [money]  Decimal-String mit zwei Nachkommastellen
 * @property {boolean} [nonNegative]
 * @property {number} [minItems]
 * @property {boolean} [uniqueItems]
 * @property {RegExp} [itemPattern]
 * @property {string[]} [itemEnum]
 */

/**
 * Vertrag einer Sammlung.
 * @typedef {object} Sammlungsvertrag
 * @property {string[]} required
 * @property {Record<string, Feldregel>} fields
 * @property {boolean} [optional]  Datei darf fehlen
 */

// Die Betragsgrammatik von istGueltigerBetrag (lib/text.mjs) als JSON-Muster.
export const BETRAG_MUSTER = "^(?!-0\\.00$)-?(0|[1-9]\\d*)\\.\\d{2}$";
export const BETRAG_MUSTER_NICHT_NEGATIV = "^(0|[1-9]\\d*)\\.\\d{2}$";

/**
 * @param {Feldregel} regel
 * @returns {Record<string, unknown>}
 */
export function feldAlsJsonSchema(regel) {
  /** @type {Record<string, unknown>} */
  const json = { type: regel.type === "number" && regel.integer ? "integer" : regel.type };
  if (regel.money) json.pattern = regel.nonNegative ? BETRAG_MUSTER_NICHT_NEGATIV : BETRAG_MUSTER;
  if (regel.pattern) json.pattern = muster(regel.pattern);
  if (regel.enum) json.enum = [...regel.enum];
  if (regel.format) json.format = regel.format;
  if (regel.minLength) json.minLength = regel.minLength;
  if (regel.min !== undefined) json.minimum = regel.min;
  if (regel.minItems) json.minItems = regel.minItems;
  if (regel.uniqueItems) json.uniqueItems = true;
  if (regel.itemPattern) json.items = { type: "string", pattern: muster(regel.itemPattern) };
  if (regel.itemEnum) json.items = { type: "string", enum: [...regel.itemEnum] };
  return json;
}

// RegExp.source maskiert "/" ("\\/"); JSON-Schema-Muster brauchen das nicht.
/** @param {RegExp} re */
function muster(re) {
  return re.source.replace(/\\\//g, "/");
}

/** @param {string} sammlung */
export function jsonSchemaDatei(sammlung) {
  return `${sammlung}.schema.json`;
}
