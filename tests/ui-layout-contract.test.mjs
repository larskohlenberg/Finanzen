import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";

// Der App-Code ist modularisiert (main.js + runtime/komponenten/views/*). Die
// Contract-Pruefungen gelten fuer den GESAMTEN UI-Code, nicht eine Datei — daher
// alle App-JS-Module (ohne data/Belege) zu einem String zusammenfassen.
function readAppJs(dir) {
  let out = "";
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "data" || entry.name === "Belege") continue;
    if (entry.name === "i18n.js") continue; // Woerterbuch, separat als `i18n` geprueft
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out += readAppJs(full);
    else if (/\.(mjs|js)$/.test(entry.name)) out += readFileSync(full, "utf8") + "\n";
  }
  return out;
}

const appDir = fileURLToPath(new URL("../app", import.meta.url));
const main = readAppJs(appDir);
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

test("search clear sits visually inside the search input, anchored to its own control row", () => {
  // Frueher: ✕ schwebte absolut ueber fremden Feldern (Bug). Heute gewollt:
  // Overlay an der rechten Innenkante des Suchfelds, verankert an der eigenen Row.
  assert.match(css, /\.filter-field-search \.filter-control-row\s*{[^}]*position:\s*relative/s);
  assert.match(css, /\.filter-field-search \.filter-clear\s*{[^}]*position:\s*absolute/s);
  assert.match(css, /\.filter-field-search input\[type="search"\]\s*{[^}]*padding-right/s);
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

test("vermoegen value states use the existing detail rail pattern, not tabs or modals", () => {
  assert.match(main, /data-action="show-vermoegen-wertstaende"/);
  assert.match(main, /data-action="toggle-vermoegen-rail-width"/);
  assert.match(main, /state\.vermoegenRailMode === "wertstaende"/);
  assert.match(main, /iconSvg\(railWide \? "chevronRight" : "chevronLeft"/);
  assert.doesNotMatch(main, /iconSvg\(railWide \? "panelNarrow" : "panelWide"/);
  assert.doesNotMatch(main, /data-action="toggle-vermoegen-rail-width"[^>]*>\$\{escapeHtml\(railWide \? t\("vermoegen\.railNarrow"\) : t\("vermoegen\.railWide"\)\)\}/);
  assert.match(main, /renderWertstaendeRail/);
  assert.match(main, /renderPositionWertstaende/);
  assert.match(main, /vermoegenRailMode/);
  assert.doesNotMatch(main, /vermoegen-tab/);
  assert.doesNotMatch(main, /role="dialog"[\s\S]*wertstaende/);
  assert.match(css, /\.layout-with-rail\.rail-wide/s);
  assert.match(main, /<div class="detail-actions">[\s\S]*data-action="toggle-vermoegen-rail-width"[\s\S]*data-action="close-vermoegen-detail-rail"[\s\S]*<\/div>/);
  assert.doesNotMatch(main, /rail-edge-toggle/);
  assert.doesNotMatch(main, /has-edge-toggle/);
  assert.doesNotMatch(css, /rail-edge-toggle/);
  assert.doesNotMatch(css, /has-edge-toggle/);
  assert.match(css, /\.detail-panel\s*{[^}]*max-height:\s*calc\(100vh - 36px\)/s);
  assert.match(css, /\.detail-panel\s*{[^}]*overflow-y:\s*auto/s);
  assert.match(i18n, /wertstaende:\s*"Wertstände"/);
  assert.match(i18n, /allWertstaende:\s*"Alle Wertstände"/);
});

test("transaction detail key-value rows stack and wrap in the narrow rail", () => {
  assert.match(css, /\.detail-list-row\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.detail-list-label,\s*\.detail-list-value,\s*\.detail-value\s*{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.detail-list-label,\s*\.detail-list-value,\s*\.detail-value\s*{[^}]*min-width:\s*0/s);
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

test("work status chip reflects real in-app validation, never an unconditional pass", () => {
  // §8.3: Die App validiert jetzt selbst (gleiche Logik wie das CLI). Der Erfolgs-Chip
  // ist an das echte Ergebnis gebunden, nie pauschal; bei Fehlern erscheint ein Banner.
  // Das alte "Validierung extern"-Framing ist damit abgeloest.
  assert.match(main, /data\.validation\?\.valid/);
  assert.match(main, /chrome\.validationPassed/);
  assert.match(main, /chrome\.validationFailed/);
  assert.match(main, /renderValidationBanner\(\)/);
  assert.doesNotMatch(main, /chrome\.validationExternal/);
});

test("work status offers an explicit data reload action", () => {
  assert.match(main, /data-action="reload-data"/);
  assert.match(main, /url\.searchParams\.set\("_reload"/);
  assert.match(main, /window\.location\.assign\(url\)/);
  assert.match(i18n, /reloadData:\s*"Daten neu laden"/);
  assert.match(i18n, /reloadData:\s*"Reload data"/);
});

test("next action copies an agent prompt instead of duplicating open-category navigation", () => {
  assert.match(main, /from "\.\/next-action\.mjs"/);
  assert.match(main, /buildNextAgentAction\(data\)/);
  assert.match(main, /data-action="copy-next-agent-prompt"/);
  assert.match(main, /copyNextAgentPrompt\(\)/);
  assert.doesNotMatch(main, /action === "filter-open-category" \|\| action === "next-action"/);
  assert.match(main, /renderPromptFallback\(\)/);
  assert.match(i18n, /copyAgentPrompt:\s*"Agenten-Prompt kopieren"/);
  assert.match(i18n, /agentPromptCopied:\s*"Prompt kopiert"/);
});

test("open-category chip remains the navigation entry for open transactions", () => {
  assert.match(main, /data-action="filter-open-category"/);
  assert.match(main, /openCategoryTransactions\(\)\.length[^\n]*chrome\.categoryOpen/);
});

test("IBAN fields render with grouped display format", () => {
  assert.match(main, /formatIban\(konto\.kontoreferenz\)/);
  assert.match(main, /formatIban\(tx\.empfaenger_iban\)/);
});

test("transaction detail labels counterparty IBAN by booking direction", () => {
  assert.match(i18n, /senderIban:\s*"Sender-IBAN"/);
  assert.match(i18n, /senderIban:\s*"Sender IBAN"/);
  assert.match(main, /function transactionIbanLabel\(tx\)/);
  assert.match(main, /tx\.transaktionstyp === "Eingang"/);
  assert.match(main, /\[transactionIbanLabel\(tx\), formatIban\(tx\.empfaenger_iban\)\]/);
});

test("transactions view has a local search over loaded transactions", () => {
  assert.match(main, /name:\s*"search"/);
  assert.match(main, /matchesQuery\(/);
  assert.match(main, /addEventListener\("input"/);
  assert.match(i18n, /filterSearch:\s*"Suche"/);
  assert.match(i18n, /filterSearch:\s*"Search"/);
});

test("transactions view offers a booking-date period filter", () => {
  assert.match(main, /timeMode:\s*"none"/);
  assert.match(main, /function transactionMatchesTimeFilter\(tx\)/);
  assert.match(main, /tx\.buchungsdatum/);
  assert.match(main, /searchFields:\s*\[[\s\S]*name:\s*"search"/);
  assert.match(main, /timeFields:\s*transactionTimeFilterFields\(\)/);
  assert.match(main, /fields:\s*\[[\s\S]*name:\s*"account"[\s\S]*name:\s*"transfer"/);
  assert.match(main, /filter-search-row/);
  assert.match(main, /filter-time-row/);
  assert.match(main, /filter-primary-row/);
  assert.match(css, /\.filter-search-row\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.filter-time-row\s*{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(140px,\s*180px\)\)/s);
  assert.match(css, /\.filter-primary-row\s*{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(140px,\s*1fr\)\)/s);
  assert.match(main, /transactionTimeFilterFields\(\)/);
  assert.match(main, /name:\s*"timeMode"/);
  assert.match(main, /name:\s*"dateFrom"/);
  assert.match(main, /name:\s*"dateTo"/);
  assert.match(main, /name:\s*"month"/);
  assert.match(main, /options:\s*transactionMonthOptions\(\)/);
  assert.doesNotMatch(main, /t\("transactions\.allMonths"\)/);
  assert.doesNotMatch(i18n, /allMonths/);
  assert.match(main, /state\.transactionFilters\.month = transactionMonthOptions\(\)\[0\]\?\.\[0\]/);
  assert.match(main, /name:\s*"quarterYear"/);
  assert.match(main, /options:\s*transactionYearOptions\(\)/);
  assert.match(main, /name:\s*"quarter"/);
  assert.match(main, /name:\s*"year"/);
  assert.match(main, /function applyTransactionTimeModeDefaults\(mode\)/);
  assert.match(main, /latestMonth/);
  assert.match(main, /Math\.ceil\(Number\(latestMonth\.slice\(5, 7\)\) \/ 3\)/);
  assert.match(main, /transactionFilterActiveCount\(\)/);
  assert.match(i18n, /filterTime:\s*"Zeitraum"/);
  assert.match(i18n, /timeModeRange:\s*"Von-Bis"/);
  assert.match(i18n, /timeModeMonth:\s*"Monat"/);
  assert.match(i18n, /timeModeQuarter:\s*"Quartal"/);
  assert.match(i18n, /timeModeYear:\s*"Jahr"/);
});

test("transactions table supports page size selection and direct page jumps", () => {
  assert.match(main, /function renderTransactionTableToolbar\(\)/);
  assert.match(main, /data-filter="pageSize"/);
  assert.match(main, /\["10", "10"\]/);
  assert.match(main, /\["20", "20"\]/);
  assert.match(main, /\["50", "50"\]/);
  assert.match(main, /\["100", "100"\]/);
  assert.match(main, /function paginationItems\(currentPage, pageCount\)/);
  assert.match(main, /data-action="page-first"/);
  assert.match(main, /data-action="page-last"/);
  assert.match(main, /data-action="page-jump"/);
  assert.match(main, /data-page=/);
  assert.match(main, /state\.pageSize = Number\(filter\.value\)/);
  assert.match(i18n, /rowsPerPage:\s*"Zeilen"/);
  assert.match(i18n, /firstPage:\s*"Erste"/);
  assert.match(i18n, /lastPage:\s*"Letzte"/);
});

test("filter bar: search spans the full row and has exactly one clear control", () => {
  assert.match(main, /filter-field-search/);
  assert.match(css, /\.filter-field-search\s*{[^}]*grid-column:\s*1 \/ -1/s);
  assert.match(css, /::-webkit-search-cancel-button\s*{[^}]*appearance:\s*none/s);
});

test("filter fields are flat: no per-field box inside the filter bar frame", () => {
  assert.doesNotMatch(css, /\.filter-field\s*{[^}]*border:/s);
  assert.doesNotMatch(css, /\.filter-field\s*{[^}]*background:/s);
});

test("filter reset lives in a footer with an active-filter count, not a floating overlay", () => {
  // Fester Platz statt absolutem Overlay: Fusszeile mit Trennlinie + Anzahl,
  // damit klar wird, dass der Reset fuer alle Filter gilt.
  assert.doesNotMatch(css, /\.filter-actions\s*{[^}]*position:\s*absolute/s);
  assert.match(css, /\.filter-actions\s*{[^}]*border-top/s);
  assert.match(main, /filter-active-count/);
  assert.match(main, /Object\.values\(filters\)\.filter\(Boolean\)\.length/);
  assert.match(i18n, /filterActiveOther:\s*"Filter aktiv"/);
});

test("select filters clear via their all-option: clear button only on search field", () => {
  assert.match(main, /type === "search" && active/);
});

test("mobile navigation is a fixed bottom tab bar with a more menu", () => {
  assert.match(main, /class="tabbar"/);
  assert.match(main, /data-action="toggle-more-menu"/);
  assert.match(css, /\.tabbar\s*{\s*display:\s*none/s);
  assert.match(css, /\.tabbar\s*{[^}]*position:\s*fixed/s);
  assert.match(css, /\.sidebar \.nav\s*{[^}]*display:\s*none/s);
  assert.match(i18n, /more:\s*"Mehr"/);
});

test("collapsed sidebar hides the meta text instead of wrapping it in the narrow rail", () => {
  assert.match(css, /\.sidebar-collapsed \.sidebar-meta\s*{\s*display:\s*none;\s*}/s);
});

test("uppercase eyebrow labels share one harmonized treatment", () => {
  // th, Gruppenzeile, Filter-Label, Reset und Detail-Label nutzen eine
  // gemeinsame Versalien-Behandlung, damit sie nicht wie verschiedene Schriften wirken.
  const shared = css.match(/th,\s*\.group-row td,\s*\.filter-field label,\s*\.filter-reset,\s*\.detail-label\s*{([^}]*)}/s);
  assert.ok(shared, "gemeinsame Eyebrow-Regel fehlt");
  assert.match(shared[1], /text-transform:\s*uppercase/);
  assert.match(shared[1], /letter-spacing:\s*0\.04em/);
  assert.match(shared[1], /font-weight:\s*700/);
  // die alte uneinheitliche 0.05em-Sperrung der Filter-Labels ist verschwunden
  assert.doesNotMatch(css, /letter-spacing:\s*0\.05em/);
});

test("desktop nav order matches the mobile reading order", () => {
  // Desktop-Sidebar und mobile Tab-Bar+Mehr-Menü leiten ihre Reihenfolge beide
  // aus navItems ab — vermoegen steht vor regelzahlungen (analog zur Mobilseite).
  const block = main.match(/const navItems = \[(.*?)\];/s)[1];
  const order = [...block.matchAll(/\["(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, [
    "overview", "transactions", "liquiditaet", "vermoegen",
    "regelzahlungen", "masterdata", "checks", "export",
  ]);
});

test("stacked detail panel keeps spacing from the preceding content", () => {
  // Unter dem Rail-Breakpoint stapelt sich der Detail-Bereich unter der Tabelle
  // und braucht Abstand — er nutzt .detail-panel (nicht .rail).
  assert.match(css, /\.detail-panel\s*{[^}]*margin-top/s);
});

test("scrollbar gutter is reserved so the top bar does not shift between views", () => {
  // Seiten unterschiedlicher Hoehe blenden den Scrollbalken ein/aus; ohne
  // reservierten Gutter springt das Layout (inkl. Top-Bar) horizontal.
  assert.match(css, /scrollbar-gutter:\s*stable/);
});

test("stacked app-shell packs rows to the top so the topbar position is stable across views", () => {
  // Bei min-height:100vh streckt das Grid sonst die Zeilen und schiebt je nach
  // Inhaltshoehe Leerraum ueber die Topbar -> vertikales Springen beim Wechsel.
  assert.match(css, /\.app-shell[^{]*{[^}]*align-content:\s*start/s);
});
