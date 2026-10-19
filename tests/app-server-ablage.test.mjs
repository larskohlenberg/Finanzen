// Upload-Abschluss: nie ueberschreiben, Teilschreibvorgaenge vollstaendig.
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { legeAbOhneUeberschreiben, schreibeVoll } from "../app/server.mjs";

test("legeAbOhneUeberschreiben: freies Ziel wird belegt (0640, keine Temp-Reste), vorhandenes nie ueberschrieben", async () => {
  const ordner = await mkdtemp(join(tmpdir(), "finanzen-ablage-test-"));
  try {
    await writeFile(join(ordner, "belegt.pdf"), "alt");

    assert.equal(await legeAbOhneUeberschreiben(Buffer.from("neu"), join(ordner, "belegt.pdf")), false);
    assert.equal(await readFile(join(ordner, "belegt.pdf"), "utf8"), "alt");

    assert.equal(await legeAbOhneUeberschreiben(Buffer.from("neu"), join(ordner, "frei.pdf")), true);
    assert.equal(await readFile(join(ordner, "frei.pdf"), "utf8"), "neu");
    assert.equal((await stat(join(ordner, "frei.pdf"))).mode & 0o777, 0o640);
    assert.deepEqual((await readdir(ordner)).sort(), ["belegt.pdf", "frei.pdf"]);
  } finally {
    await rm(ordner, { recursive: true, force: true });
  }
});

test("schreibeVoll: wiederholt, bis alle Bytes geschrieben sind", async () => {
  const geschrieben = [];
  const datei = {
    // schreibt hoechstens zwei Bytes je Aufruf, wie bei knappem Speicher
    async write(puffer, offset, laenge) {
      const n = Math.min(2, laenge);
      geschrieben.push(...puffer.subarray(offset, offset + n));
      return { bytesWritten: n, buffer: puffer };
    },
  };
  await schreibeVoll(datei, Buffer.from("abcdefg"));
  assert.equal(Buffer.from(geschrieben).toString(), "abcdefg");
});

test("schreibeVoll: bricht ab, wenn nichts mehr geschrieben wird", async () => {
  const datei = { async write() { return { bytesWritten: 0 }; } };
  await assert.rejects(schreibeVoll(datei, Buffer.from("abc")));
});
