// Sitzungsschutz: Inaktivitaetssperre, Pruefung der Proxy-Anmeldung,
// Konfiguration aus sitzung.json und i18n. Uhr und fetch sind injiziert.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  SPERRE_MINUTEN_STANDARD,
  leseSitzungKonfig,
  ladeSitzungKonfig,
  bewerteSitzungsantwort,
  pruefeSitzung,
  zielNachSperre,
  erstelleSitzungswaechter,
} from "../app/sitzung.mjs";
import { inboxDateiUrl } from "../app/upload-regeln.mjs";

globalThis.window = globalThis;
await import("../app/i18n.js");

const MINUTE = 60_000;
const ABMELDEN = "https://auth.example.org/logout?rd=https%3A%2F%2Ffinanzen.example.org%2F";

function uhr(start = 1_000_000) {
  let jetzt = start;
  return { jetzt: () => jetzt, vor: (ms) => { jetzt += ms; } };
}

function antwort({ status = 200, type = "basic" } = {}) {
  return { status, type, ok: status >= 200 && status < 300 };
}

function waechter({ konfig = leseSitzungKonfig(null), fetchFn = async () => antwort() } = {}) {
  const u = uhr();
  const sperren = [];
  const w = erstelleSitzungswaechter({ konfig, jetzt: u.jetzt, fetchFn, beiSperre: (grund) => sperren.push(grund) });
  return { w, u, sperren };
}

test("Konfiguration fehlt: Standardsperre 5 Minuten, kein Abmelden", () => {
  assert.equal(SPERRE_MINUTEN_STANDARD, 5);
  for (const roh of [null, undefined, {}, "kaputt", []]) {
    assert.deepEqual(leseSitzungKonfig(roh), { abmeldenUrl: null, sperreMs: 5 * MINUTE });
  }
});

test("Konfiguration vorhanden: Logout-URL und Sperrzeit werden uebernommen", () => {
  assert.deepEqual(
    leseSitzungKonfig({ abmelden_url: ABMELDEN, sperre_minuten: 0.2 }),
    { abmeldenUrl: ABMELDEN, sperreMs: 12_000 },
  );
});

test("Konfiguration: nur http(s)-URLs, nur positive Sperrzeiten", () => {
  assert.equal(leseSitzungKonfig({ abmelden_url: "javascript:alert(1)" }).abmeldenUrl, null);
  assert.equal(leseSitzungKonfig({ abmelden_url: "/logout" }).abmeldenUrl, null);
  assert.equal(leseSitzungKonfig({ abmelden_url: "" }).abmeldenUrl, null);
  assert.equal(leseSitzungKonfig({ abmelden_url: 42 }).abmeldenUrl, null);
  for (const m of [0, -1, "abc", null, Infinity]) {
    assert.equal(leseSitzungKonfig({ sperre_minuten: m }).sperreMs, 5 * MINUTE, String(m));
  }
});

test("ladeSitzungKonfig: liest sitzung.json, sonst Standard", async () => {
  const aufrufe = [];
  const konfig = await ladeSitzungKonfig(async (url, opt) => {
    aufrufe.push([url, opt]);
    return { ...antwort(), json: async () => ({ abmelden_url: ABMELDEN, sperre_minuten: 5 }) };
  });
  assert.equal(konfig.abmeldenUrl, ABMELDEN);
  assert.equal(aufrufe[0][0], "./sitzung.json");
  assert.equal(aufrufe[0][1].cache, "no-store");

  const fehlt = await ladeSitzungKonfig(async () => ({ ...antwort({ status: 404 }), json: async () => ({}) }));
  assert.deepEqual(fehlt, { abmeldenUrl: null, sperreMs: 5 * MINUTE });
  const offline = await ladeSitzungKonfig(async () => { throw new TypeError("offline"); });
  assert.deepEqual(offline, { abmeldenUrl: null, sperreMs: 5 * MINUTE });
});

test("Antwort: opaqueredirect, 401 und 403 heissen abgelaufen", () => {
  assert.equal(bewerteSitzungsantwort(antwort({ status: 0, type: "opaqueredirect" })), "abgelaufen");
  assert.equal(bewerteSitzungsantwort(antwort({ status: 401 })), "abgelaufen");
  assert.equal(bewerteSitzungsantwort(antwort({ status: 403 })), "abgelaufen");
});

test("Antwort: 200 und 404 (lokal ohne version.json) sind kein Ablauf", () => {
  assert.equal(bewerteSitzungsantwort(antwort({ status: 200 })), "ok");
  assert.equal(bewerteSitzungsantwort(antwort({ status: 404 })), "ok");
  assert.equal(bewerteSitzungsantwort(antwort({ status: 500 })), "ok");
});

test("pruefeSitzung fragt version.json ohne Cache und ohne Weiterleitung ab", async () => {
  const aufrufe = [];
  const ergebnis = await pruefeSitzung(async (url, opt) => {
    aufrufe.push([url, opt]);
    return antwort({ status: 0, type: "opaqueredirect" });
  });
  assert.equal(ergebnis, "abgelaufen");
  assert.deepEqual(aufrufe, [["./version.json", { cache: "no-store", redirect: "manual", credentials: "same-origin" }]]);
});

test("pruefeSitzung: Netzwerkfehler ist kein Ablauf", async () => {
  assert.equal(await pruefeSitzung(async () => { throw new TypeError("Failed to fetch"); }), "offline");
});

test("Inaktivitaet: nach 5 Minuten ohne Ereignis wird gesperrt", () => {
  const { w, u, sperren } = waechter();
  u.vor(5 * MINUTE - 1);
  assert.equal(w.pruefeInaktivitaet(), false);
  assert.deepEqual(sperren, []);
  u.vor(1);
  assert.equal(w.pruefeInaktivitaet(), true);
  assert.deepEqual(sperren, ["inaktiv"]);
  assert.equal(w.gesperrt, true);
});

test("Aktivitaet setzt den Zaehler zurueck", () => {
  const { w, u, sperren } = waechter();
  u.vor(4 * MINUTE);
  w.aktivitaet();
  u.vor(4 * MINUTE);
  assert.equal(w.pruefeInaktivitaet(), false);
  u.vor(MINUTE);
  assert.equal(w.pruefeInaktivitaet(), true);
  assert.deepEqual(sperren, ["inaktiv"]);
});

test("Sperrzeit aus der Konfiguration gilt", () => {
  const { w, u, sperren } = waechter({ konfig: leseSitzungKonfig({ sperre_minuten: 0.2 }) });
  u.vor(12_000);
  w.pruefeInaktivitaet();
  assert.deepEqual(sperren, ["inaktiv"]);
});

test("verborgener Tab: Zeit laeuft weiter, Rueckkehr zaehlt nicht als Aktivitaet", async () => {
  let gefragt = 0;
  const { w, u, sperren } = waechter({ fetchFn: async () => { gefragt += 1; return antwort(); } });
  u.vor(MINUTE);
  w.aktivitaet();
  // Tab verborgen: keine Ereignisse, Timer gedrosselt, Uhr laeuft.
  u.vor(6 * MINUTE);
  await w.wiederSichtbar();
  assert.deepEqual(sperren, ["inaktiv"]);
  assert.equal(gefragt, 0, "nach der Sperre keine Anmeldepruefung mehr");
});

test("verborgener Tab kurz: Rueckkehr prueft die Anmeldung", async () => {
  let gefragt = 0;
  const { w, u, sperren } = waechter({ fetchFn: async () => { gefragt += 1; return antwort({ status: 401 }); } });
  u.vor(2 * MINUTE);
  await w.wiederSichtbar();
  assert.equal(gefragt, 1);
  assert.deepEqual(sperren, ["abgelaufen"]);
});

test("Anmeldepruefung sperrt bei Ablauf, nicht bei 404 oder offline", async () => {
  for (const [fetchFn, erwartet] of [
    [async () => antwort({ status: 0, type: "opaqueredirect" }), ["abgelaufen"]],
    [async () => antwort({ status: 403 }), ["abgelaufen"]],
    [async () => antwort({ status: 404 }), []],
    [async () => { throw new TypeError("offline"); }, []],
  ]) {
    const { w, sperren } = waechter({ fetchFn });
    await w.pruefeAnmeldung();
    assert.deepEqual(sperren, erwartet);
  }
});

test("Sperre feuert genau einmal, danach ist alles still", async () => {
  const { w, u, sperren } = waechter({ fetchFn: async () => antwort({ status: 401 }) });
  u.vor(10 * MINUTE);
  w.pruefeInaktivitaet();
  w.pruefeInaktivitaet();
  await w.pruefeAnmeldung();
  w.abmelden();
  w.aktivitaet();
  assert.deepEqual(sperren, ["inaktiv"]);
});

test("Abmelden-Knopf sperrt sofort mit Grund abmelden", () => {
  const { w, sperren } = waechter({ konfig: leseSitzungKonfig({ abmelden_url: ABMELDEN }) });
  w.abmelden();
  assert.deepEqual(sperren, ["abmelden"]);
});

test("Ziel nach der Sperre: Logout nur bei Inaktivitaet/Abmelden und mit Konfiguration", () => {
  const mit = leseSitzungKonfig({ abmelden_url: ABMELDEN });
  const ohne = leseSitzungKonfig(null);
  assert.deepEqual(zielNachSperre("inaktiv", mit), { art: "abmelden", url: ABMELDEN });
  assert.deepEqual(zielNachSperre("abmelden", mit), { art: "abmelden", url: ABMELDEN });
  assert.deepEqual(zielNachSperre("abgelaufen", mit), { art: "neu-laden" });
  assert.deepEqual(zielNachSperre("inaktiv", ohne), { art: "neu-laden" });
  assert.deepEqual(zielNachSperre("abmelden", ohne), { art: "neu-laden" });
});

test("i18n: Abmelden und Sperrhinweis in de und en", () => {
  const t = (lang, pfad) => pfad.split(".").reduce((o, k) => o?.[k], window.FINANCE_I18N[lang]);
  assert.equal(t("de", "chrome.signOut"), "Abmelden");
  assert.equal(t("en", "chrome.signOut"), "Sign out");
  for (const lang of ["de", "en"]) {
    assert.ok(t(lang, "chrome.locked"), `chrome.locked fehlt in ${lang}`);
    assert.ok(t(lang, "uploadPage.oeffnen"), `uploadPage.oeffnen fehlt in ${lang}`);
    assert.ok(t(lang, "uploadPage.herunterladen"), `uploadPage.herunterladen fehlt in ${lang}`);
  }
});

test("main.js verdrahtet den Waechter und den Abmelden-Knopf", async () => {
  const main = await readFile(new URL("../app/main.js", import.meta.url), "utf8");
  assert.match(main, /erstelleSitzungswaechter\(/);
  assert.match(main, /data-action="abmelden"/);
  assert.match(main, /visibilitychange/);
});

test("Inbox-Datei-Link: relativ, je Segment kodiert", () => {
  assert.equal(inboxDateiUrl("auszug.pdf"), "data/inbox/auszug.pdf");
  assert.equal(inboxDateiUrl("Konto März #1 ?.pdf"), "data/inbox/Konto%20M%C3%A4rz%20%231%20%3F.pdf");
  assert.equal(inboxDateiUrl("a/b c.csv"), "data/inbox/a/b%20c.csv");
});
