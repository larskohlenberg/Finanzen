import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";

// Der App-Code ist modularisiert (main.js + runtime/komponenten/views/*). Die
// Contract-Pruefungen gelten fuer den GESAMTEN UI-Code, nicht eine Datei — daher
// alle App-JS-Module (ohne data/Belege) zu einem String zusammenfassen.
// Auslaufend (Massnahme 4.13): Was sich im Browser beobachten laesst, pruefen
// tests/browser-oberflaeche.test.mjs und browser-ablaeufe.test.mjs am Verhalten;
// neue Vertraege bitte dort statt als Quelltext-Muster.
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

test("vermoegen: Tabs je Klasse, Wertstaende als Tabelle auf der Uebersicht, keine Modals", () => {
  assert.match(main, /data-action="show-vermoegen-wertstaende"/);
  assert.match(main, /renderWertstaendeTabelle/);
  assert.match(main, /data-wertstaende-sort/);
  assert.doesNotMatch(main, /renderWertstaendeRail/);
  assert.doesNotMatch(main, /toggle-vermoegen-rail-width/);
  assert.match(main, /renderPositionWertstaende/);
  assert.match(main, /role="tablist"/);
  assert.match(main, /data-action="vermoegen-tab"/);
  // Keine Modals auf der Vermoegensseite (die Schnellsuche ist ein Dialog des Rahmens).
  for (const datei of ["vermoegen.mjs", "vermoegen-objekte.mjs", "vermoegen-teile.mjs", "vermoegen-wertstaende.mjs"]) {
    assert.doesNotMatch(readFileSync(new URL(`../app/views/${datei}`, import.meta.url), "utf8"), /role="dialog"/, datei);
  }
  assert.match(css, /\.layout-with-rail\.rail-wide/s);
  assert.doesNotMatch(main, /rail-edge-toggle/);
  assert.doesNotMatch(main, /has-edge-toggle/);
  assert.doesNotMatch(css, /rail-edge-toggle/);
  assert.doesNotMatch(css, /has-edge-toggle/);
  assert.match(css, /\.detail-panel\s*{[^}]*max-height:\s*calc\(100vh - 36px\)/s);
  assert.match(css, /\.detail-panel\s*{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.balken-diagramm\s*{[^}]*max-width/s);
  assert.match(i18n, /wertstaende:\s*"Wertstände"/);
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
  // Die Aktionen rechnet der Server (kopfleiste.mjs ueber next-action.mjs).
  assert.match(main, /buildNextAgentActions\(daten, \{ today: heute \}\)/);
  assert.match(main, /kopfleisteAntwort\(\)\?\.aktionen/);
  assert.match(main, /data-action="copy-next-agent-prompt"/);
  assert.match(main, /copyNextAgentPrompt\(element\.dataset\.nextActionType\)/);
  assert.match(main, /nextActionCopiedTimer/);
  assert.match(main, /clearTimeout\(rahmen\.nextActionCopiedTimer\)/);
  assert.match(main, /nextActionCopiedTimer = window\.setTimeout/);
  assert.doesNotMatch(main, /action === "filter-open-category" \|\| action === "next-action"/);
  assert.match(main, /renderPromptFallback\(\)/);
  assert.match(i18n, /copyAgentPrompt:\s*"Agenten-Prompt kopieren"/);
  assert.match(i18n, /agentPromptCopied:\s*"Prompt kopiert"/);
});

test("next action prompt menu exposes every candidate as a copy target", () => {
  assert.match(main, /data-action="toggle-next-action-menu"/);
  assert.match(main, /data-next-action-type=/);
  assert.match(main, /state\.nextActionMenuOpen/);
  assert.match(main, /nextActionActions\.map/);
  assert.match(css, /\.next-action-menu/);
});

test("disabled next-action copy buttons do not look interactive", () => {
  assert.match(css, /\.linkish:disabled/);
  assert.match(css, /\.chip:disabled/);
  assert.match(css, /:disabled\s*{[^}]*cursor:\s*(?:default|not-allowed)/s);
  assert.match(css, /:disabled\s*{[^}]*opacity:/s);
  assert.match(css, /:disabled:hover,\s*\n\s*\.linkish:disabled:focus-visible,\s*\n\s*\.chip:disabled:hover,\s*\n\s*\.chip:disabled:focus-visible\s*{[^}]*box-shadow:\s*none/s);
});

test("open-category chip remains the navigation entry for open transactions", () => {
  assert.match(main, /data-action="filter-open-category"/);
  assert.match(main, /const openCategories = kopf\?\.offene_kategorien \?\? 0/);
  assert.match(main, /openCategories > 0 \?[^\n]*chrome\.categoryOpen/);
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

test("filter fields are flat: no per-field box inside the filter bar frame", () => {
  assert.doesNotMatch(css, /\.filter-field\s*{[^}]*border:/s);
  assert.doesNotMatch(css, /\.filter-field\s*{[^}]*background:/s);
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
