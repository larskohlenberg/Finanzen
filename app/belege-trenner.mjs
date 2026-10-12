// app/belege-trenner.mjs
// Verschiebbarer Trenner zwischen Ordnerbaum und Dateiliste (#/dokumente).
// Die Breite lebt als CSS-Variable am .belege-browser; gesetzt per CSSOM, weil
// die CSP style-Attribute im HTML verbietet. render() ersetzt den DOM, deshalb
// traegt anwendenBaumBreite() den Wert nach jedem Render wieder ein.
const SCHLUESSEL = "belegeBaumBreite";
const MIN = 160;
const MAX = 720;

let breite = lesen();

function lesen() {
  try {
    const wert = Number(localStorage.getItem(SCHLUESSEL));
    return Number.isFinite(wert) && wert >= MIN ? wert : null;
  } catch {
    return null;
  }
}

function speichern() {
  try {
    if (breite) localStorage.setItem(SCHLUESSEL, String(Math.round(breite)));
  } catch {
    // ohne Speicher gilt die Breite nur bis zum Neuladen
  }
}

export function begrenzeBaumBreite(wunsch, browserBreite) {
  const obergrenze = Math.max(MIN, Math.min(MAX, browserBreite - 320));
  return Math.min(obergrenze, Math.max(MIN, Math.round(wunsch)));
}

export function anwendenBaumBreite(root = document) {
  const browser = root.querySelector?.(".belege-browser");
  if (browser && breite) browser.style.setProperty("--belege-baum-breite", `${breite}px`);
}

function setzen(browser, wunsch) {
  breite = begrenzeBaumBreite(wunsch, browser.getBoundingClientRect().width);
  browser.style.setProperty("--belege-baum-breite", `${breite}px`);
}

export function bindBelegeTrenner(root) {
  root.addEventListener("pointerdown", (event) => {
    const trenner = event.target.closest?.("[data-belege-trenner]");
    if (!trenner) return;
    const browser = trenner.closest(".belege-browser");
    if (!browser) return;
    event.preventDefault();
    const links = browser.getBoundingClientRect().left;
    trenner.setPointerCapture?.(event.pointerId);
    browser.classList.add("trenner-aktiv");
    const bewegen = (e) => setzen(browser, e.clientX - links);
    const ende = () => {
      trenner.removeEventListener("pointermove", bewegen);
      trenner.removeEventListener("pointerup", ende);
      trenner.removeEventListener("pointercancel", ende);
      browser.classList.remove("trenner-aktiv");
      speichern();
    };
    trenner.addEventListener("pointermove", bewegen);
    trenner.addEventListener("pointerup", ende);
    trenner.addEventListener("pointercancel", ende);
  });

  // Tastatur: Pfeile verschieben in 20-px-Schritten, Doppelklick setzt zurueck.
  root.addEventListener("keydown", (event) => {
    const trenner = event.target.closest?.("[data-belege-trenner]");
    if (!trenner || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    const browser = trenner.closest(".belege-browser");
    const aktuell = browser.querySelector(".belege-baum").getBoundingClientRect().width;
    event.preventDefault();
    setzen(browser, aktuell + (event.key === "ArrowRight" ? 20 : -20));
    speichern();
  });

  root.addEventListener("dblclick", (event) => {
    const trenner = event.target.closest?.("[data-belege-trenner]");
    if (!trenner) return;
    breite = null;
    try { localStorage.removeItem(SCHLUESSEL); } catch { /* egal */ }
    trenner.closest(".belege-browser")?.style.removeProperty("--belege-baum-breite");
  });
}
