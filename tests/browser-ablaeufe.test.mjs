// Ablauftests im echten Browser (ADR 0037): Filter -> Drilldown, Fokus,
// Demo/Echt-Wechsel, Sitzungssperre und Abmelden. Der App-Server laeuft im
// Testprozess; "Echt" ist eine Kopie der Demodaten, "Demo" die
// versionierten Demodaten. Ohne lokales Chrome werden die Tests uebersprungen,
// in der CI (CI=true) schlagen sie fehl.
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";
import { createAppServer } from "../app/server.mjs";
import { findeChrome, starteBrowser } from "./hilfe-browser.mjs";

const chrome = findeChrome();
if (!chrome && process.env.CI) throw new Error("CI ohne Chrome: Browsertests koennen nicht laufen (CHROME_PATH setzen)");

const appDir = fileURLToPath(new URL("../app", import.meta.url));
// "Echt" ist im Test eine Kopie der Demodaten (vollstaendiger Bestand).
const vorlage = fileURLToPath(new URL("../app/data/demo", import.meta.url));

describe("Ablaeufe im Browser", { skip: chrome ? false : "kein Chrome/Chromium gefunden (CHROME_PATH)", timeout: 120000 }, () => {
  let server;
  let browser;
  let seite;
  let basis;
  let tmp;

  before(async () => {
    tmp = mkdtempSync(join(tmpdir(), "finanzen-ablauf-"));
    cpSync(vorlage, join(tmp, "master"), { recursive: true });
    server = createAppServer({
      appDir,
      inboxDir: join(tmp, "inbox"),
      belegeDir: join(tmp, "Belege"),
      datenDirs: { live: join(tmp, "master"), demo: join(appDir, "data", "demo") },
      log: () => {},
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    basis = `http://127.0.0.1:${server.address().port}`;
    browser = await starteBrowser({ chrome });
    seite = browser.seite;
  });

  after(async () => {
    await browser?.beende();
    await new Promise((resolve) => server?.close(resolve) ?? resolve());
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  // App im gewuenschten Modus frisch laden und warten, bis gezeichnet ist.
  async function oeffne(hash = "#/uebersicht", modus = "demo") {
    await seite.geheZu(`${basis}/`);
    await seite.werte(`localStorage.setItem("finance-m2-data-mode", ${JSON.stringify(modus)}); true`);
    // Eigene Query, damit es ein echtes Laden ist und kein Sprung im Dokument.
    await seite.geheZu(`${basis}/?laden=${Date.now()}${hash}`);
    await seite.warteAuf(`document.querySelector("#app .page-title")`, { text: "App gezeichnet" });
  }

  const chips = () => seite.werte(`[...document.querySelectorAll(".filter-chip")].map((c) => c.textContent.replace(/\\s+/g, " ").trim())`);

  test("Uebersicht -> Kategorie: Buchungen mit gleichem Zeitraum, Filter in URL und als Chips", async () => {
    await oeffne();
    await seite.klicke(`[data-action="kategorie-transactions"][data-kategorie]`);
    await seite.warteAuf(`location.hash.startsWith("#/transaktionen?")`);
    const hash = await seite.werte("location.hash");
    assert.match(hash, /kategorie=KAT-/);
    assert.match(hash, /zeit=range&von=\d{4}-\d{2}-\d{2}&bis=\d{4}-\d{2}-\d{2}/);
    await seite.warteAuf(`document.querySelectorAll(".transaction-row").length > 0`, { text: "Buchungen da" });
    const liste = await chips();
    assert.ok(liste.some((c) => c.startsWith("Kategorie:")), liste.join(" | "));
    assert.ok(liste.some((c) => c.startsWith("Zeitraum:")), liste.join(" | "));
    assert.equal(await seite.werte("document.title"), "Transaktionen · Finanzmodell");

    // Chip entfernen: Filter weg, URL ersetzt (kein neuer Verlaufseintrag).
    const laenge = await seite.werte("history.length");
    await seite.klicke(`.filter-chip-clear[data-filter-name="category"]`);
    await seite.warteAuf(`!location.hash.includes("kategorie=")`);
    assert.equal(await seite.werte("history.length"), laenge);
  });

  test("Sprung aus der Kopfzeile setzt alle Filter zurueck (F20), Detail ist ein neuer Verlaufseintrag", async () => {
    await oeffne("#/transaktionen?herkunft=agent");
    await seite.klicke(`input[data-filter="search"]`);
    await seite.tippe("xyz");
    await seite.warteAuf(`document.querySelector('input[data-filter="search"]').value === "xyz"`);
    // Gleich klicken, waehrend die entprellte Suche noch aussteht: der Klick
    // darf nicht verloren gehen.
    await seite.klicke(`[data-action="filter-open-category"]`);
    await seite.warteAuf(`location.hash === "#/transaktionen?status=offen"`);
    assert.deepEqual(await chips(), ["Status: Kategorie offen"]);
    assert.equal(await seite.werte(`document.querySelector('input[data-filter="search"]').value`), "");

    // Erst wenn die Liste zum neuen Filter da ist (nicht mehr die alte, veraltete).
    await seite.warteAuf(`document.querySelector('section.panel[aria-busy="false"] [data-action="select-transaction"]')`, { text: "Liste zum Filter geladen" });
    await seite.klicke(`[data-action="select-transaction"]`);
    await seite.warteAuf(`document.querySelector(".detail-panel")`, { text: "Detail offen" });
    assert.match(await seite.werte("location.hash"), /^#\/transaktionen\/[^?]+\?status=offen$/);
    await seite.werte("history.back(); true");
    await seite.warteAuf(`location.hash === "#/transaktionen?status=offen" && !document.querySelector(".detail-panel")`, { text: "Zurueck schliesst das Detail" });
  });

  test("Fokus: Tippen in die Suche behaelt Fokus und Text, Esc im Einstellungsmenue fuehrt zum Zahnrad", async () => {
    await oeffne("#/transaktionen");
    await seite.klicke(`input[data-filter="search"]`);
    await seite.tippe("Miete");
    await seite.warteAuf(`document.querySelector(".summary-cell strong")`);
    await new Promise((r) => setTimeout(r, 600));
    assert.deepEqual(await seite.werte(`({ filter: document.activeElement?.dataset.filter, wert: document.activeElement?.value })`), { filter: "search", wert: "Miete" });

    await seite.klicke(`[data-action="toggle-settings-menu"]`);
    await seite.warteAuf(`document.querySelector(".settings-menu")`);
    await seite.taste("Escape", { keyCode: 27 });
    await seite.warteAuf(`!document.querySelector(".settings-menu")`);
    assert.equal(await seite.werte(`document.activeElement?.classList.contains("settings-toggle")`), true);
  });

  test("Fokus: Seitenwechsel ueber die Navigation setzt ihn auf die Ueberschrift; Buchungszeile per Tastatur oeffnen", async () => {
    await oeffne("#/uebersicht");
    await seite.klicke(`.sidebar [data-view="transactions"]`);
    await seite.warteAuf(`document.activeElement?.matches("main h1.page-title") && document.activeElement.textContent.includes("Transaktionen")`, { text: "Fokus auf der Ueberschrift" });
    await seite.warteAuf(`document.querySelector("section.panel[aria-busy='false'] a.zeilen-link[data-action='select-transaction']")`, { text: "Liste geladen" });
    await seite.werte(`document.querySelector("section.panel[aria-busy='false'] a.zeilen-link[data-action='select-transaction']").focus(); true`);
    await seite.taste("Enter", { keyCode: 13, text: "\r" });
    await seite.warteAuf(`document.querySelector(".detail-panel") && location.hash.startsWith("#/transaktionen/TXN-")`, { text: "Detail per Enter" });
  });

  test("Schnellsuche: Strg+K, ID tippen, Enter oeffnet das Objekt", async () => {
    await oeffne("#/uebersicht");
    await seite.taste("k", { code: "KeyK", keyCode: 75, modifiers: 2 });
    await seite.warteAuf(`document.activeElement?.id === "schnellsuche-eingabe"`, { text: "Suchfeld fokussiert" });
    await seite.tippe("KTO-001");
    await seite.warteAuf(`document.querySelector("#suchtreffer li.aktiv")`);
    await seite.taste("Enter", { keyCode: 13, text: "\r" });
    await seite.warteAuf(`location.hash === "#/vermoegen/konten/KTO-001" && !document.querySelector(".schnellsuche")`, { text: "Konto geoeffnet" });
  });

  test("Demo/Echt-Wechsel: neu geladen, anderer Bestand, Auswahl des alten Bestands faellt weg", async () => {
    await oeffne("#/transaktionen?status=offen");
    assert.equal(await seite.werte(`Boolean(document.querySelector(".chip.demo"))`), true);
    await seite.klicke(`[data-action="toggle-settings-menu"]`);
    await seite.klicke(`[data-action="set-setting"][data-setting="data-mode"][data-value="live"]`);
    await seite.warteAuf(`localStorage.getItem("finance-m2-data-mode") === "live" && document.querySelector("#app .page-title") && !document.querySelector(".chip.demo")`, { text: "Echtbestand geladen" });
    const abrufe = await seite.werte(`performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.includes("/api/v1/grunddaten"))`);
    assert.ok(abrufe.length > 0 && abrufe.every((n) => !n.includes("quelle=demo")), abrufe.join(" "));
  });

  test("Sitzungssperre: nach Inaktivitaet sind die Daten weg und die Seite laedt neu", async () => {
    await seite.ersetze("/sitzung.json", { body: JSON.stringify({ sperre_minuten: 0.02 }) });
    await oeffne("#/uebersicht");
    await seite.werte("window.__vorDerSperre = true; true");
    // Kein Ereignis mehr: nach gut einer Sekunde sperrt die App und laedt neu.
    await seite.warteAuf(`!window.__vorDerSperre`, { ms: 8000, text: "Neu geladen nach Sperre" });
  });

  test("Abmelden: mit konfigurierter Logout-URL fuehrt der Knopf dorthin", async () => {
    await seite.ersetze("/sitzung.json", { body: JSON.stringify({ sperre_minuten: 5, abmelden_url: `${basis}/abgemeldet` }) });
    await oeffne("#/uebersicht");
    await seite.klicke(`.sidebar [data-action="abmelden"]`);
    await seite.warteAuf(`location.pathname === "/abgemeldet"`, { text: "Zur Logout-URL" });
  });

  test("keine Skriptfehler im Verlauf", () => {
    assert.deepEqual(seite.fehler, []);
  });
});
