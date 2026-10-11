// mitRollback: scheitert das Zurueckspielen, bleibt die Sicherung erhalten.
import assert from "node:assert/strict";
import { chmodSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { mitRollback } from "../app/mcp/schreiben.mjs";

const demo = fileURLToPath(new URL("../app/data/demo/", import.meta.url));

test("Zurueckspielen scheitert: Sicherung bleibt und ihr Pfad steht im Ergebnis", { skip: process.getuid?.() === 0 && "als root greift chmod nicht" }, async () => {
  const wurzel = mkdtempSync(join(tmpdir(), "finanzen-rollback-test-"));
  const master = join(wurzel, "master");
  cpSync(demo, master, { recursive: true });
  const kontenVorher = readFileSync(join(master, "konten.json"), "utf8");
  let sicherung;
  try {
    const r = await mitRollback(master, async () => {
      writeFileSync(join(master, "konten.json"), "{ kaputt");
      chmodSync(master, 0o555); // Zurueckspielen kann hier nichts loeschen
      return { text: "geschrieben" };
    });
    chmodSync(master, 0o755);
    assert.equal(r.isError, true);
    assert.match(r.text, /Zurueckspielen fehlgeschlagen/);
    sicherung = r.text.match(/Sicherung: (\S+)/)?.[1];
    assert.ok(sicherung, r.text);
    assert.ok(existsSync(sicherung), `Sicherung ${sicherung} fehlt`);
    assert.equal(readFileSync(join(sicherung, "konten.json"), "utf8"), kontenVorher);
  } finally {
    chmodSync(master, 0o755);
    rmSync(wurzel, { recursive: true, force: true });
    if (sicherung) rmSync(sicherung, { recursive: true, force: true });
  }
});
