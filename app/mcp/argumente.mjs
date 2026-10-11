// app/mcp/argumente.mjs
// Minimaler Pruefer fuer die Tool-Argumente gegen das jeweilige inputSchema.
// Deckt genau die Schema-Bausteine ab, die die Tools verwenden.
export function pruefeArgumente(schema, args) {
  const fehler = [];
  pruefe(schema, args, "", fehler);
  return fehler;
}

function pruefe(schema, wert, ort, fehler) {
  const name = ort || "Argumente";
  switch (schema.type) {
    case "object": {
      if (wert === null || typeof wert !== "object" || Array.isArray(wert)) { fehler.push(`${name}: Objekt erwartet`); return; }
      for (const pflicht of schema.required ?? []) {
        if (wert[pflicht] === undefined) fehler.push(`${ort ? `${ort}.` : ""}${pflicht}: Pflichtfeld fehlt`);
      }
      for (const [schluessel, v] of Object.entries(wert)) {
        const unter = schema.properties?.[schluessel];
        if (!unter) {
          if (schema.additionalProperties === false) fehler.push(`${ort ? `${ort}.` : ""}${schluessel}: unbekanntes Argument`);
          continue;
        }
        pruefe(unter, v, `${ort ? `${ort}.` : ""}${schluessel}`, fehler);
      }
      return;
    }
    case "array":
      if (!Array.isArray(wert)) { fehler.push(`${name}: Liste erwartet`); return; }
      if (schema.minItems !== undefined && wert.length < schema.minItems) fehler.push(`${name}: mindestens ${schema.minItems} Eintrag/Eintraege`);
      if (schema.maxItems !== undefined && wert.length > schema.maxItems) fehler.push(`${name}: hoechstens ${schema.maxItems} Eintraege`);
      if (schema.items) wert.forEach((v, i) => pruefe(schema.items, v, `${name}[${i}]`, fehler));
      return;
    case "string":
      if (typeof wert !== "string") { fehler.push(`${name}: Text erwartet`); return; }
      if (schema.enum && !schema.enum.includes(wert)) fehler.push(`${name}: erlaubt sind ${schema.enum.join(", ")}`);
      if (schema.pattern && !new RegExp(schema.pattern).test(wert)) fehler.push(`${name}: Format ${schema.pattern} erwartet`);
      if (schema.maxLength !== undefined && wert.length > schema.maxLength) fehler.push(`${name}: zu lang`);
      return;
    case "integer":
      if (!Number.isInteger(wert)) { fehler.push(`${name}: ganze Zahl erwartet`); return; }
      if (schema.minimum !== undefined && wert < schema.minimum) fehler.push(`${name}: mindestens ${schema.minimum}`);
      if (schema.maximum !== undefined && wert > schema.maximum) fehler.push(`${name}: hoechstens ${schema.maximum}`);
      return;
    case "boolean":
      if (typeof wert !== "boolean") fehler.push(`${name}: true/false erwartet`);
      return;
    default:
      // Freie Objekte (z. B. Regelkandidaten) werden vom Fach-Tool geprueft.
      return;
  }
}
