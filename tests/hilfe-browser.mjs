// Browser fuer Ablauftests (ADR 0038): Playwright (playwright-core) steuert ein
// lokal installiertes Chrome/Chromium ohne Oberflaeche; kein Browser-Download.
// Ohne Chrome oder ohne installiertes Playwright werden die Tests
// uebersprungen (browserFehlt), in der CI (CI=true) schlagen sie fehl.
//
// `seite` buendelt, was die Tests oft brauchen (Ausdruck auswerten, darauf
// warten, klicken, tippen); `seite.page` ist die Playwright-Seite fuer alles
// andere (Tastenkuerzel, Locator, Screenshots).
import { existsSync } from "node:fs";

const KANDIDATEN = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

export function findeChrome() {
  return KANDIDATEN.find((pfad) => pfad && existsSync(pfad)) ?? null;
}

// Grund zum Ueberspringen oder null: kein Chrome oder Playwright nicht
// installiert (npm install). In der CI (CI=true) ist beides ein Fehler.
export async function browserFehlt() {
  let grund = null;
  if (!findeChrome()) grund = "kein Chrome/Chromium gefunden (CHROME_PATH)";
  else {
    try { await import("playwright-core"); } catch { grund = "Playwright fehlt (npm install)"; }
  }
  if (grund && process.env.CI) throw new Error(`CI: Browsertests koennen nicht laufen: ${grund}`);
  return grund;
}

// Jede Aktion hat eine Frist; nichts darf den Testlauf endlos halten.
const FRIST_MS = 20000;

export async function starteBrowser({ chrome = findeChrome(), breite = 1280, hoehe = 900 } = {}) {
  // Erst hier laden: ohne npm install laufen die uebrigen Tests trotzdem.
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ executablePath: chrome, args: ["--no-sandbox", "--disable-gpu"] });
  const fehler = [];
  const ersetzungen = new Map();
  let context;
  let page;

  const seite = {
    fehler,
    page: null,
    // Antworten auf ausgewaehlte Pfade ersetzen (z. B. sitzung.json im Test).
    async ersetze(pfad, ersatz) {
      ersetzungen.set(pfad, ersatz);
    },
    async geheZu(url) {
      await page.goto(url, { waitUntil: "load", timeout: 15000 });
    },
    // Ausdruck im Seitenkontext auswerten (Promises werden abgewartet).
    async werte(ausdruck) {
      return page.evaluate(ausdruck);
    },
    // Wartet, bis der Ausdruck truthy ist; liefert dessen Wert. Selbst
    // abgefragt statt page.waitForFunction: das wertet Text per eval in der
    // Seite aus und scheitert an der CSP der App, die der Test nicht abschaltet.
    async warteAuf(ausdruck, { ms = 8000, text = ausdruck } = {}) {
      const ende = Date.now() + ms;
      for (;;) {
        const wert = await page.evaluate(ausdruck).catch(() => undefined);
        if (wert) return wert;
        if (Date.now() > ende) throw new Error(`Zeitueberschreitung: ${text} (Seite: ${page.url()})`);
        await page.waitForTimeout(50);
      }
    },
    // Echte Maus auf das erste passende Element. Playwright wartet, bis es
    // sichtbar, stabil und nicht verdeckt ist, und scrollt es ins Bild.
    async klicke(selektor) {
      await page.locator(selektor).first().click();
    },
    // Echte Tastatur, Zeichen fuer Zeichen.
    async tippe(text) {
      await page.keyboard.type(text);
    },
    // Neue Groesse; mobil (Touch, mobiler Viewport) braucht einen neuen Kontext.
    async viewport(width, height, mobil = false) {
      await neueSeite({ width, height, mobil });
    },
  };

  // Ein Kontext je Geraeteart: isMobile laesst sich nur beim Anlegen setzen.
  async function neueSeite({ width, height, mobil }) {
    await context?.close();
    context = await browser.newContext({ viewport: { width, height }, isMobile: mobil, hasTouch: mobil, deviceScaleFactor: 1 });
    context.setDefaultTimeout(FRIST_MS);
    await context.route("**/*", (route) => {
      const ersatz = ersetzungen.get(new URL(route.request().url()).pathname);
      return ersatz
        ? route.fulfill({ status: ersatz.status ?? 200, contentType: "application/json", body: ersatz.body ?? "" })
        : route.continue();
    });
    page = await context.newPage();
    page.on("pageerror", (e) => fehler.push(e.stack ?? e.message));
    seite.page = page;
  }

  try {
    await neueSeite({ width: breite, height: hoehe, mobil: false });
  } catch (grund) {
    await browser.close();
    throw grund;
  }

  return {
    seite,
    async beende() {
      await browser.close();
    },
  };
}
