// Kleiner Browser-Treiber fuer Ablauftests (ADR 0037): startet ein lokal
// installiertes Chrome/Chromium ohne Oberflaeche und spricht es ueber das
// Chrome DevTools Protocol an (WebSocket, in Node eingebaut). Keine
// Abhaengigkeit, kein Browser-Download. Ohne Chrome liefert findeChrome()
// null; die Tests werden dann uebersprungen, in der CI (CI=true) schlagen sie fehl.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

// Jede Anfrage an Chrome hat eine Frist; nichts darf den Testlauf endlos halten.
const FRIST_MS = 20000;

export async function starteBrowser(optionen = {}) {
  const profil = mkdtempSync(join(tmpdir(), "finanzen-browser-"));
  const prozesse = [];
  try {
    return await starte({ ...optionen, profil, prozesse });
  } catch (fehler) {
    // Start gescheitert: Chrome nicht verwaist zuruecklassen.
    for (const p of prozesse) p.kill("SIGKILL");
    rmSync(profil, { recursive: true, force: true, maxRetries: 5 });
    throw fehler;
  }
}

async function starte({ chrome = findeChrome(), breite = 1280, hoehe = 900, profil, prozesse }) {
  const prozess = spawn(chrome, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profil}`,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--no-sandbox",
    `--window-size=${breite},${hoehe}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  prozesse.push(prozess);
  const wsUrl = await new Promise((resolve, reject) => {
    let puffer = "";
    const zeit = setTimeout(() => reject(new Error(`Chrome meldet sich nicht: ${puffer.slice(-300)}`)), 15000);
    prozess.stderr.on("data", (stueck) => {
      puffer = (puffer + stueck).slice(-4000);
      const treffer = puffer.match(/DevTools listening on (ws:\/\/\S+)/);
      if (treffer) { clearTimeout(zeit); resolve(treffer[1]); }
    });
    prozess.on("exit", (code) => reject(new Error(`Chrome beendet (${code}): ${puffer.slice(-300)}`)));
  });

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let naechsteId = 0;
  const offen = new Map();
  const hoerer = new Set();
  ws.onmessage = (nachricht) => {
    const daten = JSON.parse(nachricht.data);
    if (daten.id !== undefined && offen.has(daten.id)) {
      const { resolve, reject } = offen.get(daten.id);
      offen.delete(daten.id);
      if (daten.error) reject(new Error(`${daten.error.message} ${daten.error.data ?? ""}`));
      else resolve(daten.result);
    } else for (const fn of hoerer) fn(daten);
  };
  // Bricht die Verbindung ab (Chrome beendet oder abgestuerzt), scheitern alle offenen Anfragen.
  ws.onclose = () => {
    for (const { reject } of offen.values()) reject(new Error("Verbindung zu Chrome beendet"));
    offen.clear();
  };
  const sende = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    naechsteId += 1;
    const id = naechsteId;
    const frist = setTimeout(() => {
      offen.delete(id);
      reject(new Error(`Chrome antwortet nicht: ${method}`));
    }, FRIST_MS);
    offen.set(id, {
      resolve: (wert) => { clearTimeout(frist); resolve(wert); },
      reject: (grund) => { clearTimeout(frist); reject(grund); },
    });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  const { targetId } = await sende("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await sende("Target.attachToTarget", { targetId, flatten: true });
  const s = (method, params) => sende(method, params, sessionId);
  await s("Page.enable");
  await s("Runtime.enable");
  // Neue Ziele starten mit 800x600; feste Groesse wie ein Laptop-Fenster.
  await s("Emulation.setDeviceMetricsOverride", { width: breite, height: hoehe, deviceScaleFactor: 1, mobile: false });

  // Antworten auf ausgewaehlte Pfade ersetzen (z. B. sitzung.json im Test).
  const ersetzungen = new Map();
  hoerer.add(async (ereignis) => {
    if (ereignis.sessionId !== sessionId || ereignis.method !== "Fetch.requestPaused") return;
    const { requestId, request } = ereignis.params;
    const pfad = new URL(request.url).pathname;
    const ersatz = ersetzungen.get(pfad);
    // Verlaesst die Seite den Ort, ist die Anfrage schon weg: kein Fehler.
    const antwort = ersatz
      ? s("Fetch.fulfillRequest", {
        requestId, responseCode: ersatz.status ?? 200,
        responseHeaders: [{ name: "Content-Type", value: "application/json" }],
        body: Buffer.from(ersatz.body ?? "").toString("base64"),
      })
      : s("Fetch.continueRequest", { requestId });
    await antwort.catch(() => {});
  });

  const fehler = [];
  hoerer.add((ereignis) => {
    if (ereignis.sessionId === sessionId && ereignis.method === "Runtime.exceptionThrown") {
      fehler.push(ereignis.params.exceptionDetails?.exception?.description ?? ereignis.params.exceptionDetails?.text);
    }
  });

  const seite = {
    fehler,
    async ersetze(pfad, ersatz) {
      ersetzungen.set(pfad, ersatz);
      await s("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    },
    async geheZu(url) {
      const geladen = new Promise((resolve) => {
        const fn = (e) => { if (e.sessionId === sessionId && e.method === "Page.loadEventFired") { hoerer.delete(fn); resolve(); } };
        hoerer.add(fn);
      });
      const { errorText } = await s("Page.navigate", { url });
      if (errorText) throw new Error(`Seite laedt nicht: ${url} (${errorText})`);
      let frist;
      await Promise.race([geladen, new Promise((_, reject) => { frist = setTimeout(() => reject(new Error(`Seite laedt nicht: ${url}`)), 15000); })]);
      clearTimeout(frist);
    },
    // Ausdruck im Seitenkontext auswerten (Promises werden abgewartet).
    async werte(ausdruck) {
      const { result, exceptionDetails } = await s("Runtime.evaluate", { expression: ausdruck, awaitPromise: true, returnByValue: true });
      if (exceptionDetails) throw new Error(`${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
      return result.value;
    },
    // Wartet, bis der Ausdruck truthy ist; liefert dessen Wert.
    async warteAuf(ausdruck, { ms = 8000, text = ausdruck } = {}) {
      const ende = Date.now() + ms;
      for (;;) {
        const wert = await seite.werte(ausdruck).catch(() => undefined);
        if (wert) return wert;
        if (Date.now() > ende) {
          const ort = await seite.werte("location.href").catch(() => "?");
          throw new Error(`Zeitueberschreitung: ${text} (Seite: ${ort})`);
        }
        await warte(50);
      }
    },
    // Echte Maus: Klick in die Mitte des ersten Elements zum Selektor.
    async klicke(selektor) {
      const box = await seite.warteAuf(`(() => { const el = document.querySelector(${JSON.stringify(selektor)}); if (!el) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); if (!r.width) return null; const x = r.x + r.width / 2; const y = r.y + r.height / 2; const oben = document.elementFromPoint(x, y); return { x, y, frei: Boolean(oben && (el === oben || el.contains(oben))), oben: oben ? oben.outerHTML.slice(0, 120) : String(oben) }; })()`, { text: `Element ${selektor}` });
      if (!box.frei) throw new Error(`Klick auf ${selektor} traefe ein anderes Element: ${box.oben}`);
      for (const type of ["mousePressed", "mouseReleased"]) {
        await s("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 });
      }
    },
    // Echte Tastatur: Text tippen (Zeichen fuer Zeichen) bzw. eine Taste.
    async tippe(text) {
      for (const zeichen of text) {
        await s("Input.dispatchKeyEvent", { type: "keyDown", text: zeichen, key: zeichen });
        await s("Input.dispatchKeyEvent", { type: "keyUp", key: zeichen });
      }
    },
    async taste(key, { code = key, keyCode, text } = {}) {
      await s("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key, code, windowsVirtualKeyCode: keyCode, ...(text ? { text } : {}) });
      await s("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode });
    },
    async viewport(breite, hoehe, mobil = false) {
      await s("Emulation.setDeviceMetricsOverride", { width: breite, height: hoehe, deviceScaleFactor: 1, mobile: mobil });
    },
  };

  return {
    seite,
    async beende() {
      try { await sende("Browser.close"); } catch { /* schon zu */ }
      ws.close();
      const beendet = new Promise((r) => (prozess.exitCode !== null ? r() : prozess.once("exit", r)));
      await Promise.race([beendet, warte(3000)]);
      if (prozess.exitCode === null) {
        prozess.kill("SIGKILL");
        await Promise.race([beendet, warte(3000)]);
      }
      rmSync(profil, { recursive: true, force: true, maxRetries: 5 });
    },
  };
}
