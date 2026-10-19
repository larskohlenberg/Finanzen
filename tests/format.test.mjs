import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { formatierer, escapeHtml, fuelle, LOCALE } from "../app/format.mjs";

// Intl setzt zwischen Zahl und Waehrung ein schmales Leerzeichen (U+00A0/U+202F);
// fuer den Vergleich auf ein normales Leerzeichen bringen.
const n = (s) => s.replace(/[  ]/g, " ");

test("format: eine Locale je Sprache, Englisch einheitlich en-GB", () => {
  assert.equal(LOCALE.de, "de-DE");
  assert.equal(LOCALE.en, "en-GB");
  assert.equal(formatierer("xx"), formatierer("de"), "unbekannte Sprache faellt auf Deutsch zurueck");
});

test("format: Formatierer werden je Sprache einmal angelegt", () => {
  assert.equal(formatierer("de"), formatierer("de"));
  assert.notEqual(formatierer("de"), formatierer("en"));
});

test("format: Geld exakt (Details) und gerundet (Kacheln)", () => {
  const de = formatierer("de");
  assert.equal(n(de.geld(123456)), "1.234,56 €");
  assert.equal(n(de.geld(-5)), "-0,05 €");
  assert.equal(n(de.geldGanz(123456)), "1.235 €");
  assert.equal(n(de.geldGanz(-123450)), "-1.235 €");
  assert.equal(n(de.geldMitVorzeichen(1000)), "+10 €");
  const en = formatierer("en");
  assert.equal(n(en.geld(123456)), "€1,234.56");
  assert.equal(n(en.geldGanz(123456)), "€1,235");
});

test("format: Prozent, Zahl, Tausender", () => {
  const de = formatierer("de");
  assert.equal(n(de.prozent(0.305)), "31 %");
  assert.equal(n(de.prozent(0.305, 1)), "30,5 %");
  assert.equal(n(de.prozentMitVorzeichen(0.1)), "+10 %");
  assert.equal(de.prozent(null), "–");
  assert.equal(de.zahl(1234.5, 1), "1.234,5");
  assert.equal(n(de.tausend(1234500)), "12,3 T€");
  assert.equal(n(formatierer("en").tausend(1234500)), "12.3 k€");
});

test("format: Datum und Monat ohne Zeitzonenverschiebung", () => {
  const de = formatierer("de");
  assert.equal(de.datum("2026-01-01"), "1.1.2026");
  assert.equal(de.monat("2026-03"), "März 2026");
  assert.equal(de.monatKurz("2026-03"), "Mär");
  assert.equal(de.monatJahrKurz("2026-03"), "März 2026");
  assert.equal(formatierer("en").datum("2026-01-31"), "31/01/2026");
  assert.equal(formatierer("en").monat("2026-03"), "March 2026");
  assert.equal(de.datum(""), "");
  assert.equal(de.datum(null), "");
  assert.equal(de.datum("2026-10-19T10:00:00Z"), "", "Zeitstempel sind kein Kalenderdatum");
  assert.equal(de.groesse(undefined), "");
  assert.equal(de.groesse(5_000_000), "4,8 MB");
});

test("format: fuelle ersetzt benannte Platzhalter, auch mehrfach", () => {
  assert.equal(fuelle("{n} von {gesamt} ({n})", { n: 3, gesamt: 7 }), "3 von 7 (3)");
  assert.equal(fuelle("ohne {x}", {}), "ohne {x}");
});

test("format: escapeHtml maskiert alle fuenf Zeichen", () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#039;&amp;&#039;&lt;/a&gt;");
  assert.equal(escapeHtml(null), "");
});

// Vertrag: Formatierer entstehen nur in format.mjs. Views und Bausteine nehmen
// sie von dort, damit Sprache, Locale und Rundung an einer Stelle liegen.
test("format: nur format.mjs legt Intl-Formatierer an, nur eine escape-Funktion", () => {
  const appDir = fileURLToPath(new URL("../app", import.meta.url));
  const dateien = [
    ...readdirSync(appDir).filter((f) => /\.(mjs|js)$/.test(f)).map((f) => join(appDir, f)),
    ...readdirSync(join(appDir, "views")).map((f) => join(appDir, "views", f)),
  ];
  const verstoesse = [];
  for (const datei of dateien) {
    if (datei.endsWith("format.mjs") || datei.endsWith("i18n.js")) continue;
    const text = readFileSync(datei, "utf8");
    if (/new Intl\.(NumberFormat|DateTimeFormat)|\.toLocale(Date)?String\(/.test(text)) verstoesse.push(`${datei}: Intl`);
    if (/function (esc|escapeHtml)\(/.test(text)) verstoesse.push(`${datei}: eigene escape-Funktion`);
  }
  assert.deepEqual(verstoesse, []);
});
