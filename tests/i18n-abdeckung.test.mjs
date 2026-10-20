// Abdeckung der Texte (Review 3.9): Deutsch und Englisch haben dieselben
// Schluessel, und jeder Schluessel wird im App-Code benutzt, woertlich oder
// ueber ein dynamisches Praefix (t(`status.${s}`)). Ein ungenutzter Schluessel
// ist toter Text und wird entfernt statt gepflegt.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

globalThis.window = globalThis;
await import("../app/i18n.js");

const blaetter = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? blaetter(v, `${p}${k}.`) : [`${p}${k}`]));
const de = blaetter(window.FINANCE_I18N.de);
const en = blaetter(window.FINANCE_I18N.en);

const appDir = fileURLToPath(new URL("../app", import.meta.url));
function code(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (["data", "Belege", "docs", "schemas"].includes(e.name)) return [];
    const pfad = join(dir, e.name);
    if (e.isDirectory()) return code(pfad);
    return /\.(mjs|js)$/.test(e.name) && e.name !== "i18n.js" ? [readFileSync(pfad, "utf8")] : [];
  });
}
const quelltext = code(appDir).join("\n");
// Praefixe dynamischer Schluessel: `status.${…}` bzw. "checksPage.warnCode." + …
const praefixe = [...quelltext.matchAll(/[`"']([A-Za-z0-9_.-]+\.)(?:\$\{|["']\s*\+)/g)].map((m) => m[1]);

test("de und en haben dieselben Schluessel", () => {
  assert.deepEqual(de.filter((k) => !en.includes(k)), [], "nur in de");
  assert.deepEqual(en.filter((k) => !de.includes(k)), [], "nur in en");
});

test("jeder Schluessel wird benutzt (woertlich oder ueber ein dynamisches Praefix)", () => {
  const benutzt = (k) => quelltext.includes(`"${k}"`) || quelltext.includes(`'${k}'`) || quelltext.includes(`\`${k}\``) || praefixe.some((p) => k.startsWith(p));
  assert.deepEqual(de.filter((k) => !benutzt(k)), []);
});

test("jeder woertlich aufgerufene Schluessel existiert", () => {
  const aufrufe = [...quelltext.matchAll(/\bt[f]?\(\s*["']([A-Za-z0-9_.-]+)["']/g)].map((m) => m[1]);
  const vorhanden = new Set(de);
  // Ein Schluessel kann auf ein Objekt zeigen (t() liefert dann den Pfad): nur Blaetter zaehlen.
  assert.deepEqual([...new Set(aufrufe.filter((k) => !vorhanden.has(k)))], []);
});
