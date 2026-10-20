// Verhalten der Oberflaeche im echten Browser (Massnahme 4.13): loest die
// Quelltext-Regex-Vertraege aus ui-layout-contract.test.mjs ab. Geprueft wird,
// was der Nutzer sieht und tut (Filterleiste, Blaettern, Zeitraum, Detail,
// Einstellungen, mobile Navigation, Liquiditaet), nicht wie der Code heisst.
// Demodaten; ohne lokales Chrome uebersprungen, in der CI (CI=true) Pflicht.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";
import { createAppServer } from "../app/server.mjs";
import { findeChrome, starteBrowser } from "./hilfe-browser.mjs";

const chrome = findeChrome();
if (!chrome && process.env.CI) throw new Error("CI ohne Chrome: Browsertests koennen nicht laufen (CHROME_PATH setzen)");

const appDir = fileURLToPath(new URL("../app", import.meta.url));
const demo = join(appDir, "data", "demo");

describe("Oberflaeche im Browser", { skip: chrome ? false : "kein Chrome/Chromium gefunden (CHROME_PATH)", timeout: 120000 }, () => {
  let server;
  let browser;
  let seite;
  let basis;
  let tmp;

  before(async () => {
    tmp = mkdtempSync(join(tmpdir(), "finanzen-oberflaeche-"));
    server = createAppServer({
      appDir,
      inboxDir: join(tmp, "inbox"),
      belegeDir: join(tmp, "Belege"),
      datenDirs: { live: demo, demo },
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

  async function oeffne(hash) {
    await seite.geheZu(`${basis}/`);
    await seite.werte(`localStorage.clear(); localStorage.setItem("finance-m2-data-mode", "demo"); true`);
    await seite.geheZu(`${basis}/?laden=${Date.now()}${hash}`);
    await seite.warteAuf(`document.querySelector("#app .page-title")`, { text: "App gezeichnet" });
  }
  const listeGeladen = () => seite.warteAuf(`document.querySelector('section.panel[aria-busy="false"] .transaction-row')`, { text: "Liste geladen" });
  // Auswahl wie ein Nutzer aendern: Wert setzen und change ausloesen.
  const waehle = (selektor, wert) => seite.werte(`(() => { const el = document.querySelector(${JSON.stringify(selektor)}); el.value = ${JSON.stringify(wert)}; el.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
  const ersteZeile = () => seite.werte(`document.querySelector('section.panel[aria-busy="false"] .transaction-row .zeilen-link')?.getAttribute("href")`);
  // Erst wenn die Liste zur neuen Seite da ist; der Blaetterer zeigt sie schon vorher.
  const warteAufZeile = (nicht) => seite.warteAuf(`(() => { const h = document.querySelector('section.panel[aria-busy="false"] .transaction-row .zeilen-link')?.getAttribute("href"); return h && h !== ${JSON.stringify(nicht)}; })()`, { text: "neue Seite geladen" });
  const seitenText = () => seite.werte(`document.querySelector(".pagination > span").textContent.replace(/\\s+/g, " ").trim()`);

  test("Buchungsliste: Zeilen je Seite waehlen, erste/letzte Seite und direkter Sprung", async () => {
    await oeffne("#/transaktionen");
    await listeGeladen();
    assert.deepEqual(await seite.werte(`[...document.querySelectorAll('select[data-filter="pageSize"] option')].map((o) => o.value)`), ["10", "20", "50", "100"]);
    await waehle(`select[data-filter="pageSize"]`, "10");
    await seite.warteAuf(`document.querySelectorAll(".transaction-row").length === 10`, { text: "10 Zeilen" });
    assert.match(await seitenText(), /^Seite 1 \/ (\d+) · 1-10 von \d+$/);
    const seiten = Number((await seitenText()).match(/\/ (\d+)/)[1]);
    assert.ok(seiten > 2, "Demodaten fuellen mehr als zwei Seiten");

    const seite1 = await ersteZeile();
    await seite.klicke(`[data-action="page-jump"][data-page="2"]`);
    await seite.warteAuf(`document.querySelector('.page-number.active')?.dataset.page === "2"`, { text: "Seite 2" });
    await warteAufZeile(seite1);
    assert.match(await seitenText(), /^Seite 2 \/ \d+ · 11-20 /);
    await seite.klicke(`[data-action="page-last"]`);
    await seite.warteAuf(`document.querySelector('.page-number.active')?.dataset.page === "${seiten}"`, { text: "letzte Seite" });
    assert.equal(await seite.werte(`document.querySelector('[data-action="page-last"]').disabled`), true);
    await seite.klicke(`[data-action="page-first"]`);
    await seite.warteAuf(`document.querySelector('.page-number.active')?.dataset.page === "1"`, { text: "erste Seite" });
    await seite.warteAuf(`document.querySelector('section.panel[aria-busy="false"] .transaction-row .zeilen-link')?.getAttribute("href") === ${JSON.stringify(seite1)}`, { text: "wieder Seite 1" });
    assert.equal(await seite.werte(`document.querySelector('[data-action="page-first"]').disabled`), true);
  });

  test("Filterleiste: Suche ueber die ganze Breite, nur sie hat ein Loeschkreuz, Zuruecksetzen mit Zaehler in der Fusszeile", async () => {
    await oeffne("#/transaktionen");
    await listeGeladen();
    const breiten = await seite.werte(`(() => { const feld = document.querySelector(".filter-field-search"); const zeile = feld.closest(".filter-grid"); return { feld: feld.getBoundingClientRect().width, zeile: zeile.getBoundingClientRect().width }; })()`);
    assert.ok(Math.abs(breiten.feld - breiten.zeile) < 2, JSON.stringify(breiten));
    // Ohne aktiven Filter: Platz fuer den Reset bleibt reserviert, aber unsichtbar und gesperrt.
    assert.deepEqual(await seite.werte(`(() => { const g = document.querySelector(".filter-reset-group"); return { sichtbar: getComputedStyle(g).visibility, gesperrt: g.querySelector(".filter-reset").disabled }; })()`), { sichtbar: "hidden", gesperrt: true });
    assert.equal(await seite.werte(`document.querySelectorAll(".filter-clear").length`), 0);

    await waehle(`select[data-filter="account"]`, await seite.werte(`document.querySelector('select[data-filter="account"] option:nth-child(2)').value`));
    await seite.warteAuf(`document.querySelector(".filter-active-count")?.textContent.trim() === "1 Filter aktiv"`, { text: "Zaehler 1" });
    assert.equal(await seite.werte(`document.querySelectorAll(".filter-clear").length`), 0, "Auswahlfelder leert man ueber ihre Alle-Option");

    // Suchbegriff: Gegenpartei der ersten Zeile; danach enthaelt jede Zeile ihn.
    await listeGeladen();
    const treffer = () => seite.werte(`Number(document.querySelector(".filter-result-count").textContent.trim().split(" ")[0])`);
    const vorSuche = await treffer();
    const begriff = await seite.werte(`(() => { const zelle = document.querySelector(".transaction-row td:nth-child(3)"); return (zelle.querySelector(".mit-logo > span:last-child") ?? zelle).textContent.trim(); })()`);
    await seite.klicke(`input[data-filter="search"]`);
    await seite.tippe(begriff);
    await seite.warteAuf(`document.querySelector(".filter-active-count")?.textContent.trim() === "2 Filter aktiv"`, { text: "Zaehler 2" });
    const kreuz = await seite.werte(`(() => { const k = [...document.querySelectorAll(".filter-clear")]; const feld = document.querySelector('input[data-filter="search"]').getBoundingClientRect(); const r = k[0].getBoundingClientRect(); return { anzahl: k.length, imFeld: r.left >= feld.left && r.right <= feld.right && r.top >= feld.top - 1 && r.bottom <= feld.bottom + 1 }; })()`);
    assert.deepEqual(kreuz, { anzahl: 1, imFeld: true });
    await seite.warteAuf(`document.querySelector('section.panel[aria-busy="false"]') && Number(document.querySelector(".filter-result-count").textContent.trim().split(" ")[0]) < ${vorSuche}`, { text: "Suche filtert" });
    const zeilen = await seite.werte(`[...document.querySelectorAll(".transaction-row")].map((r) => r.textContent.toLowerCase())`);
    assert.ok(zeilen.length > 0 && zeilen.every((z) => z.includes(begriff.toLowerCase())), begriff);
    // Gleiche Schriftgroesse fuer Trefferzahl und Blaetterleiste.
    assert.equal(await seite.werte(`getComputedStyle(document.querySelector(".filter-result-count")).fontSize`), await seite.werte(`getComputedStyle(document.querySelector(".pagination")).fontSize`));

    await seite.klicke(`.filter-reset`);
    await seite.warteAuf(`document.querySelector(".filter-reset")?.disabled && document.querySelector('input[data-filter="search"]').value === ""`, { text: "alles zurueckgesetzt" });
    await listeGeladen();
    assert.equal(await seite.werte(`document.querySelector('select[data-filter="account"]').value`), "");
    assert.equal(await seite.werte(`document.querySelector(".filter-active-count").textContent.trim()`), "");
    await seite.warteAuf(`Number(document.querySelector(".filter-result-count").textContent.trim().split(" ")[0]) === Number(document.querySelector(".filter-result-count").textContent.trim().split(" ")[2])`, { text: "alle Treffer" });
  });

  test("Filteranordnung: Suche und Zeitraum in einer Kopfzeile, die uebrigen Filter in drei beschrifteten Gruppen", async () => {
    await oeffne("#/transaktionen");
    await listeGeladen();
    const kopf = await seite.werte(`[...document.querySelectorAll(".filter-kopf [data-filter]")].map((el) => el.dataset.filter)`);
    assert.deepEqual(kopf, ["search", "timeMode"]);
    const gruppen = await seite.werte(`[...document.querySelectorAll(".filter-gruppe")].map((g) => [g.querySelector(".filter-gruppe-titel").textContent.trim(), [...g.querySelectorAll("[data-filter]")].map((el) => el.dataset.filter)])`);
    assert.deepEqual(gruppen.map(([, f]) => f), [["account", "category", "regelzahlung"], ["richtung", "betragVon", "betragBis"], ["status", "origin", "transfer"]]);
    assert.ok(gruppen.every(([titel]) => titel.length > 0), "jede Gruppe hat eine Ueberschrift");
    // Suche und Zeitraum stehen auf dem Desktop auf einer Hoehe.
    const oben = await seite.werte(`[document.querySelector('input[data-filter="search"]'), document.querySelector('select[data-filter="timeMode"]')].map((el) => Math.round(el.getBoundingClientRect().top))`);
    assert.equal(oben[0], oben[1], "eine Zeile");
    // Betragsfelder so hoch wie die Auswahlfelder.
    const hoehen = await seite.werte(`[document.querySelector('input[data-filter="betragVon"]'), document.querySelector('select[data-filter="richtung"]')].map((el) => Math.round(el.getBoundingClientRect().height))`);
    assert.equal(hoehen[0], hoehen[1]);
  });

  test("Zeitraumfilter: Monat, Quartal und Von-Bis blenden ihre Felder ein und belegen sie mit dem juengsten Zeitraum", async () => {
    await oeffne("#/transaktionen");
    await listeGeladen();
    const modi = await seite.werte(`[...document.querySelectorAll('select[data-filter="timeMode"] option')].map((o) => o.value)`);
    assert.deepEqual(modi, ["none", "range", "month", "quarter", "year"]);
    const felder = () => seite.werte(`[...document.querySelectorAll(".filter-time-row [data-filter]")].map((el) => el.dataset.filter)`);
    assert.deepEqual(await felder(), ["timeMode"]);

    await waehle(`select[data-filter="timeMode"]`, "month");
    await seite.warteAuf(`document.querySelector('select[data-filter="month"]')`, { text: "Monatsauswahl" });
    const monat = await seite.werte(`document.querySelector('select[data-filter="month"]').value`);
    const ersterMonat = await seite.werte(`document.querySelector('select[data-filter="month"] option').value`);
    assert.match(monat, /^\d{4}-\d{2}$/);
    assert.equal(monat, ersterMonat, "juengster Monat vorbelegt, keine Alle-Monate-Option");
    await seite.warteAuf(`location.hash.includes("zeit=month")`);
    await listeGeladen();
    // Buchungsdatum steht als T.M.JJJJ in der ersten Spalte.
    const daten = await seite.werte(`[...document.querySelectorAll(".transaction-row .zeilen-link")].map((a) => a.textContent.trim())`);
    const [jahr, mm] = monat.split("-");
    assert.ok(daten.length > 0 && daten.every((d) => d.endsWith(`.${Number(mm)}.${jahr}`)), daten.join(","));

    await waehle(`select[data-filter="timeMode"]`, "quarter");
    await seite.warteAuf(`document.querySelector('select[data-filter="quarter"]')`, { text: "Quartalsauswahl" });
    assert.deepEqual(await felder(), ["timeMode", "quarterYear", "quarter"]);
    assert.equal(await seite.werte(`document.querySelector('select[data-filter="quarterYear"]').value`), monat.slice(0, 4));
    assert.equal(await seite.werte(`document.querySelector('select[data-filter="quarter"]').value`), String(Math.ceil(Number(monat.slice(5, 7)) / 3)));

    await waehle(`select[data-filter="timeMode"]`, "range");
    await seite.warteAuf(`document.querySelector('input[data-filter="dateFrom"]')`, { text: "Von-Bis" });
    assert.deepEqual(await felder(), ["timeMode", "dateFrom", "dateTo"]);
  });

  test("Detail einer Buchung laesst sich ueber das Kreuz schliessen", async () => {
    await oeffne("#/transaktionen");
    await listeGeladen();
    await seite.klicke(`[data-action="select-transaction"]`);
    await seite.warteAuf(`document.querySelector(".detail-panel")`, { text: "Detail offen" });
    assert.equal(await seite.werte(`document.querySelector('[data-action="close-detail-rail"]').getAttribute("aria-label")`), "Details schließen");
    await seite.klicke(`[data-action="close-detail-rail"]`);
    await seite.warteAuf(`!document.querySelector(".detail-panel")`, { text: "Detail zu" });
  });

  test("Kopfzeile: Datenbestand, Sprache und Darstellung liegen in einem Einstellungsmenue", async () => {
    await oeffne("#/uebersicht");
    assert.equal(await seite.werte(`document.querySelectorAll(".topbar select").length`), 0, "keine eigenen Auswahlfelder in der Kopfzeile");
    assert.equal(await seite.werte(`Boolean(document.querySelector(".chip.demo"))`), true, "Demodaten sichtbar markiert");
    await seite.klicke(`[data-action="toggle-settings-menu"]`);
    await seite.warteAuf(`document.querySelector(".settings-menu")`);
    const gruppen = await seite.werte(`[...new Set([...document.querySelectorAll('.settings-menu [data-action="set-setting"]')].map((b) => b.dataset.setting))]`);
    assert.deepEqual(gruppen, ["data-mode", "lang", "theme"]);
    await seite.klicke(`[data-action="set-setting"][data-setting="lang"][data-value="en"]`);
    await seite.warteAuf(`document.documentElement.lang === "en" && document.querySelector("#app .page-title")?.textContent.includes("Overview")`, { text: "Englisch" });
    // Am Desktop: Seitenleiste statt Tab-Leiste.
    assert.deepEqual(await seite.werte(`({ tabbar: getComputedStyle(document.querySelector(".tabbar")).display, nav: getComputedStyle(document.querySelector(".sidebar .nav")).display !== "none" })`), { tabbar: "none", nav: true });
  });

  test("Mobil: feste Tab-Leiste mit Mehr-Menue in der Reihenfolge der Seitenleiste, kein waagrechtes Scrollen der Seite", async () => {
    await seite.viewport(375, 812, true);
    try {
      await oeffne("#/transaktionen");
      await listeGeladen();
      const lage = await seite.werte(`(() => { const t = document.querySelector(".tabbar"); const r = t.getBoundingClientRect(); return { position: getComputedStyle(t).position, unten: Math.round(r.bottom) === innerHeight, seitenleiste: getComputedStyle(document.querySelector(".sidebar .nav")).display }; })()`);
      assert.deepEqual(lage, { position: "fixed", unten: true, seitenleiste: "none" });
      assert.ok(await seite.werte(`document.documentElement.scrollWidth <= innerWidth`), "Seite scrollt nicht waagrecht");
      const tabelle = await seite.werte(`(() => { const w = document.querySelector(".table-wrap"); return { overflow: getComputedStyle(w).overflowX, breiter: w.scrollWidth > w.clientWidth }; })()`);
      assert.deepEqual(tabelle, { overflow: "auto", breiter: true }, "die Tabelle scrollt in ihrem Rahmen");

      await seite.klicke(`.tabbar [data-action="toggle-more-menu"]`);
      await seite.warteAuf(`document.querySelector(".tabbar-more-menu")`, { text: "Mehr-Menue" });
      const mobil = await seite.werte(`[...document.querySelectorAll(".tabbar-row [data-view]"), ...document.querySelectorAll(".tabbar-more-menu [data-view]")].map((b) => b.dataset.view)`);
      const seitenleiste = await seite.werte(`[...document.querySelectorAll(".sidebar [data-view]")].map((b) => b.dataset.view)`);
      assert.deepEqual(new Set(mobil), new Set(seitenleiste));
      const tabs = await seite.werte(`[...document.querySelectorAll(".tabbar-row [data-view]")].map((b) => b.dataset.view)`);
      assert.deepEqual(mobil, [...tabs, ...seitenleiste.filter((v) => !tabs.includes(v))], "Mehr-Menue in Seitenleisten-Reihenfolge");
      assert.deepEqual(seitenleiste, ["overview", "transactions", "liquiditaet", "vermoegen", "vorsorge", "planIst", "termine", "szenarien", "belege", "upload", "masterdata"]);
    } finally {
      await seite.viewport(1280, 900);
    }
  });

  test("Liquiditaetsprognose: Granularitaet umschalten, Zeilen aufklappen", async () => {
    await oeffne("#/liquiditaet");
    // Die Prognosetabelle ist eine zugeklappte Kachel; ihr Kopf traegt die Granularitaet.
    await seite.klicke(`[data-action="klapp-kachel"][data-kachel="liquiditaet.prognose"]`);
    await seite.warteAuf(`document.querySelector("[data-liquiditaet-gran]")`, { text: "Granularitaet" });
    assert.equal(await seite.werte(`document.querySelector("[data-liquiditaet-gran].success")?.dataset.liquiditaetGran`), "monat");
    await seite.klicke(`[data-liquiditaet-gran="quartal"]`);
    // Erst wenn die Perioden zur neuen Antwort passen (vorher stehen noch die Monate da).
    const quartale = `(() => { const k = [...document.querySelectorAll("[data-liquiditaet-toggle]")].map((b) => b.dataset.liquiditaetToggle); return k.length > 0 && k.every((p) => /^\\d{4}-Q[1-4]$/.test(p)); })()`;
    await seite.warteAuf(quartale, { text: "Quartale geladen" });
    assert.equal(await seite.werte(`document.querySelector("[data-liquiditaet-gran].success")?.dataset.liquiditaetGran`), "quartal");
    const zeilen = () => seite.werte(`document.querySelectorAll("#app tr").length`);
    const zu = await zeilen();
    await seite.klicke(`[data-liquiditaet-toggle]`);
    await seite.warteAuf(`document.querySelectorAll("#app tr").length > ${zu}`, { text: "aufgeklappt" });
  });

  test("keine Skriptfehler", () => {
    assert.deepEqual(seite.fehler, []);
  });
});
