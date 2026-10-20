// Verschiebbarer Trenner der Dokumentenansicht: Grenzen der Baumbreite und
// Einbau in View und CSS.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { begrenzeBaumBreite } from "../app/belege-trenner.mjs";

test("Baumbreite: nie unter 160 px, nie ueber 720 px, Dateiliste behaelt 320 px", () => {
  assert.equal(begrenzeBaumBreite(50, 1400), 160);
  assert.equal(begrenzeBaumBreite(400.4, 1400), 400);
  assert.equal(begrenzeBaumBreite(2000, 1400), 720);
  assert.equal(begrenzeBaumBreite(600, 800), 480);
  assert.equal(begrenzeBaumBreite(600, 300), 160);
});

test("Trenner sitzt zwischen Baum und Liste, Breite als CSS-Variable", () => {
  const view = readFileSync(new URL("../app/views/belege.mjs", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/styles.css", import.meta.url), "utf8");
  assert.match(view, /<\/nav>\s*<div class="belege-trenner" data-belege-trenner role="separator"/);
  assert.match(view, /class="belege-ordner-name"\$\{[^}]*\} title=/);
  assert.match(css, /\.belege-browser\s*{[^}]*var\(--belege-baum-breite/s);
});
