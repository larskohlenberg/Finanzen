// tests/upload-view.test.mjs
// Upload-Ansicht: Route, i18n-Schluessel in beiden Sprachen, Verdrahtung.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { routeFromState, parseRoute } from "../app/routing.mjs";

globalThis.window = globalThis;
await import("../app/i18n.js");

function t(lang, path) {
  let current = window.FINANCE_I18N[lang];
  for (const part of path.split(".")) current = current?.[part];
  return typeof current === "string" ? current : undefined;
}

test("Route #/hochladen <-> View upload", () => {
  assert.equal(routeFromState({ view: "upload" }), "#/hochladen");
  assert.deepEqual(parseRoute("#/hochladen"), { view: "upload" });
});

test("Upload-Texte existieren in de und en", () => {
  const schluessel = [
    "nav.upload",
    "uploadPage.title", "uploadPage.lead", "uploadPage.hinweis",
    "uploadPage.dropTitle", "uploadPage.dropHint", "uploadPage.choose",
    "uploadPage.queueTitle", "uploadPage.inboxTitle", "uploadPage.inboxEmpty",
    "uploadPage.inboxLoading", "uploadPage.refresh", "uploadPage.apiUnavailable",
    "uploadPage.neuerName",
    "uploadPage.status.wartet", "uploadPage.status.laedt", "uploadPage.status.hochgeladen",
    "uploadPage.status.vorhanden", "uploadPage.status.abgelehnt",
    "uploadPage.grund.dateiname-ungueltig", "uploadPage.grund.endung-nicht-erlaubt",
    "uploadPage.grund.zu-gross", "uploadPage.grund.kopfzeile-fehlt",
    "uploadPage.grund.origin-abgelehnt", "uploadPage.grund.api-fehlt",
    "uploadPage.grund.netzwerk", "uploadPage.grund.serverfehler",
  ];
  for (const lang of ["de", "en"]) {
    for (const key of schluessel) assert.ok(t(lang, key), `${key} fehlt in ${lang}`);
  }
  assert.equal(t("de", "nav.upload"), "Hochladen");
  assert.equal(t("en", "nav.upload"), "Upload");
});

test("Upload-Ansicht ist im Menue und in main.js verdrahtet", async () => {
  const runtime = await readFile(new URL("../app/runtime.mjs", import.meta.url), "utf8");
  const main = await readFile(new URL("../app/main.js", import.meta.url), "utf8");
  const view = await readFile(new URL("../app/views/upload.mjs", import.meta.url), "utf8");
  assert.match(runtime, /\["upload", "nav\.upload", "upload"\]/);
  assert.match(main, /renderUpload\(\)/);
  assert.match(view, /"X-Finanzen-Upload": "1"/);
  assert.match(view, /type="file" multiple/);
  assert.match(view, /vorpruefeDatei/);
});
