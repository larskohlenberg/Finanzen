import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const main = readFileSync(new URL("../app/main.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/styles.css", import.meta.url), "utf8");
const i18n = readFileSync(new URL("../app/i18n.js", import.meta.url), "utf8");

test("app shell has no visible Runde 2 subtitle in sidebar rendering", () => {
  assert.doesNotMatch(main, /brand-subtitle/);
  assert.doesNotMatch(main, /appSubtitle/);
});

test("body does not force a desktop minimum width", () => {
  assert.doesNotMatch(css, /body\s*{[^}]*min-width:\s*1040px/s);
});

test("table wrappers own horizontal overflow", () => {
  assert.match(css, /\.table-wrap\s*{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /table\s*{[^}]*min-width:/s);
});

test("transaction and vermoegen filters use the shared table filter renderer", () => {
  assert.match(main, /function renderTableFilters\(/);
  assert.match(main, /renderTableFilters\(\s*{[\s\S]*transactionFilters/s);
  assert.match(main, /renderTableFilters\(\s*{[\s\S]*vermoegenFilters/s);
});

test("filter clear controls are inline and never absolutely positioned above fields", () => {
  assert.match(css, /\.filter-clear/);
  assert.doesNotMatch(css, /\.filter-clear\s*{[^}]*position:\s*absolute/s);
});

test("manual CRUD labels are not rendered as primary screen actions", () => {
  assert.doesNotMatch(main, />\s*(Neu|Neues Konto|Konto hinzufügen|Konto hinzufuegen|Bearbeiten)\s*</);
});

test("local lucide icon helper is used instead of glyph-only navigation", () => {
  assert.match(main, /from "\.\/icons\.js"/);
  assert.match(main, /iconSvg\(/);
  assert.doesNotMatch(main, /\["vermoegen",\s*"nav\.vermoegen",\s*"▲"\]/);
});

test("generic leads are omitted for overview and transactions", () => {
  assert.match(main, /renderPageHead\(t\("overview\.title"\),\s*""/);
  assert.match(main, /renderPageHead\(t\("transactions\.title"\),\s*""/);
});

test("detail rails have close controls", () => {
  assert.match(main, /data-action="close-detail-rail"/);
  assert.match(i18n, /closeDetails/);
});

test("account masterdata table renders account reference column", () => {
  assert.match(i18n, /accountReference:\s*"Kontoreferenz"/);
  assert.match(i18n, /accountReference:\s*"Account reference"/);
  assert.match(main, /t\("labels\.accountReference"\)/);
  assert.match(main, /konto\.kontoreferenz/);
});

test("liquiditaetsprognose keeps granularity controls and expandable rows", () => {
  assert.match(main, /data-liquiditaet-gran/);
  assert.match(main, /data-liquiditaet-toggle/);
  assert.match(main, /renderLiquiditaetPrognoseDetail/);
  assert.match(main, /state\.liquiditaet\.granularitaet/);
  assert.match(css, /\.liquiditaet-detail \.row-toggle/);
  assert.match(i18n, /gran:\s*{\s*monat:/);
});

test("work status chip never claims validation passed unconditionally", () => {
  // Der Browser validiert nicht (metadata.validation = "not-run-in-browser") —
  // die UI darf keinen pauschalen Erfolgs-Chip rendern, sondern verweist auf den externen Lauf.
  assert.doesNotMatch(main, /chrome\.validationPassed/);
  assert.match(main, /chrome\.validationExternal/);
  assert.match(i18n, /validationExternal:\s*"Validierung extern"/);
  assert.match(i18n, /validationExternal:\s*"Validation external"/);
});

test("next action shows the live open-category count, not a hardcoded number", () => {
  assert.doesNotMatch(i18n, /nextActionText:\s*"1 /);
  assert.doesNotMatch(i18n, /nextActionText:\s*"Review 1 /);
  // Beide Renderstellen (Topbar-Chip und Overview-Panel) müssen die echte Anzahl voranstellen.
  const renders = main.match(/openCategoryTransactions\(\)\.length[^\n]*overview\.nextActionText/g) ?? [];
  assert.equal(renders.length, 2);
});
