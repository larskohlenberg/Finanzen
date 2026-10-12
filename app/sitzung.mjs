// app/sitzung.mjs
// Sitzungsschutz: Die App laedt alle Daten beim Start in den Browser. Laeuft
// die Anmeldung am Reverse-Proxy ab oder bleibt der Rechner unbeaufsichtigt,
// darf die offene Seite keine Finanzdaten mehr zeigen.
//
// - Inaktivitaetssperre: ohne Maus-, Tastatur-, Touch- oder Scroll-Ereignis
//   fuer sperre_minuten (Standard 5) wird gesperrt. Gemessen per Uhr-Differenz,
//   weil Timer im verborgenen Tab gedrosselt werden; die Rueckkehr in den Tab
//   zaehlt nicht als Aktivitaet.
// - Anmeldepruefung: version.json ohne Weiterleitung abrufen. Eine
//   Weiterleitung (zur Anmeldeseite) oder 401/403 heisst abgelaufen; 404
//   (lokal ohne version.json) und Netzwerkfehler heissen es nicht.
//
// Konfiguration kommt aus ./sitzung.json (schreibt ops/aktualisieren.sh aus
// /etc/finanzen/app.env, gitignored). Lokal fehlt sie: dann wird nur gesperrt
// und neu geladen, ohne Abmelden. Reine Logik, Uhr und fetch sind injiziert;
// die DOM-Verdrahtung steht in main.js.

export const SPERRE_MINUTEN_STANDARD = 5;
export const PRUEF_INTERVALL_MS = 60_000;
export const AKTIVITAETS_EREIGNISSE = Object.freeze([
  "pointerdown", "pointermove", "mousedown", "mousemove", "keydown", "touchstart", "wheel", "scroll",
]);

function gueltigeAbmeldenUrl(wert) {
  if (typeof wert !== "string" || !wert) return null;
  try {
    const url = new URL(wert);
    return url.protocol === "https:" || url.protocol === "http:" ? wert : null;
  } catch {
    return null;
  }
}

export function leseSitzungKonfig(roh) {
  const objekt = roh && typeof roh === "object" && !Array.isArray(roh) ? roh : {};
  const minuten = typeof objekt.sperre_minuten === "number" ? objekt.sperre_minuten : Number.NaN;
  return {
    abmeldenUrl: gueltigeAbmeldenUrl(objekt.abmelden_url),
    sperreMs: (Number.isFinite(minuten) && minuten > 0 ? minuten : SPERRE_MINUTEN_STANDARD) * 60_000,
  };
}

// Scheitert still mit der Standardkonfiguration — der Schutz laeuft trotzdem.
export async function ladeSitzungKonfig(fetchFn = globalThis.fetch) {
  try {
    const antwort = await fetchFn("./sitzung.json", { cache: "no-store", credentials: "same-origin" });
    return leseSitzungKonfig(antwort.ok ? await antwort.json() : null);
  } catch {
    return leseSitzungKonfig(null);
  }
}

export function bewerteSitzungsantwort(antwort) {
  if (antwort?.type === "opaqueredirect") return "abgelaufen";
  if (antwort?.status === 401 || antwort?.status === 403) return "abgelaufen";
  return "ok";
}

export async function pruefeSitzung(fetchFn = globalThis.fetch) {
  try {
    const antwort = await fetchFn("./version.json", { cache: "no-store", redirect: "manual", credentials: "same-origin" });
    return bewerteSitzungsantwort(antwort);
  } catch {
    return "offline";
  }
}

// Wohin nach dem Verwerfen der Daten: Bei abgelaufener Anmeldung genuegt ein
// Neuladen (der Proxy leitet zur Anmeldung). Bei Inaktivitaet und Abmelden
// muss die Proxy-Sitzung enden, sonst ist man nach dem Neuladen gleich wieder
// drin — das geht nur mit konfigurierter Logout-URL.
export function zielNachSperre(grund, konfig) {
  if ((grund === "inaktiv" || grund === "abmelden") && konfig?.abmeldenUrl) {
    return { art: "abmelden", url: konfig.abmeldenUrl };
  }
  return { art: "neu-laden" };
}

export function erstelleSitzungswaechter({ konfig, jetzt = Date.now, fetchFn = globalThis.fetch, beiSperre }) {
  let letzteAktivitaet = jetzt();
  let gesperrt = false;

  function sperre(grund) {
    if (gesperrt) return;
    gesperrt = true;
    beiSperre(grund);
  }

  function pruefeInaktivitaet() {
    if (gesperrt) return true;
    if (jetzt() - letzteAktivitaet >= konfig.sperreMs) {
      sperre("inaktiv");
      return true;
    }
    return false;
  }

  async function pruefeAnmeldung() {
    if (gesperrt) return;
    const ergebnis = await pruefeSitzung(fetchFn);
    if (ergebnis === "abgelaufen") sperre("abgelaufen");
  }

  return {
    get gesperrt() {
      return gesperrt;
    },
    aktivitaet() {
      if (!gesperrt) letzteAktivitaet = jetzt();
    },
    pruefeInaktivitaet,
    pruefeAnmeldung,
    // Tab wieder sichtbar bzw. Fenster fokussiert: erst die Uhr, dann der Proxy.
    async wiederSichtbar() {
      if (pruefeInaktivitaet()) return;
      await pruefeAnmeldung();
    },
    abmelden() {
      sperre("abmelden");
    },
  };
}
