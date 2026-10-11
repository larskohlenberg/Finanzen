import assert from "node:assert/strict";
import { test } from "node:test";
import { versionAnzeige, ladeVersion } from "../app/version.mjs";

globalThis.window = globalThis;
await import("../app/i18n.js");

const VOLL = {
  commit: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
  kurz: "a1b2c3d",
  datum: "2026-10-11",
  branch: "main",
};

test("vollstaendige Version: Kurz-Hash, Datum, Link, kein Branch bei main", () => {
  const v = versionAnzeige(VOLL, { locale: "de-DE", lokal: "lokal" });
  assert.equal(v.lokal, false);
  assert.equal(v.text, "a1b2c3d · 11.10.2026");
  assert.equal(v.href, "https://github.com/larskohlenberg/Finanzen/commit/" + VOLL.commit);
  assert.equal(v.branch, "");
});

test("Branch ungleich main wird angehaengt, Datum folgt der Sprache", () => {
  const v = versionAnzeige({ ...VOLL, branch: "feat/beispiel" }, { locale: "en-US", lokal: "local" });
  assert.equal(v.text, "a1b2c3d · 10/11/2026 · feat/beispiel");
  assert.equal(v.branch, "feat/beispiel");
});

test("ohne oder mit kaputter version.json steht der Ersatztext", () => {
  assert.deepEqual(versionAnzeige(null), { lokal: true, text: "lokal" });
  assert.equal(versionAnzeige(null, { lokal: "local" }).text, "local");
  assert.equal(versionAnzeige({ ...VOLL, commit: "javascript:alert(1)" }).lokal, true);
  assert.equal(versionAnzeige({ ...VOLL, datum: "gestern" }).lokal, true);
  assert.equal(versionAnzeige("kaputt").lokal, true);
});

test("Ersatztext ist in de und en uebersetzt", () => {
  assert.equal(window.FINANCE_I18N.de.chrome.versionLocal, "lokal");
  assert.equal(window.FINANCE_I18N.en.chrome.versionLocal, "local");
});

test("ladeVersion liefert null statt eines Fehlers", async () => {
  assert.equal(await ladeVersion(async () => ({ ok: false })), null);
  assert.equal(await ladeVersion(async () => { throw new Error("offline"); }), null);
  assert.equal(await ladeVersion(async () => ({ ok: true, json: async () => { throw new SyntaxError("kaputt"); } })), null);
  assert.deepEqual(await ladeVersion(async () => ({ ok: true, json: async () => VOLL })), VOLL);
});
