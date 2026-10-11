// Upload-Abschluss: nie ueberschreiben, Teilschreibvorgaenge vollstaendig.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { legeAbOhneUeberschreiben, schreibeVoll } from "../app/server.mjs";

test("legeAbOhneUeberschreiben: freies Ziel wird belegt, vorhandenes nie ueberschrieben", async () => {
  const ordner = await mkdtemp(join(tmpdir(), "finanzen-ablage-test-"));
  try {
    const temp = join(ordner, ".upload.part");
    await writeFile(temp, "neu");
    await writeFile(join(ordner, "belegt.pdf"), "alt");

    assert.equal(await legeAbOhneUeberschreiben(temp, join(ordner, "belegt.pdf")), false);
    assert.equal(await readFile(join(ordner, "belegt.pdf"), "utf8"), "alt");

    assert.equal(await legeAbOhneUeberschreiben(temp, join(ordner, "frei.pdf")), true);
    assert.equal(await readFile(join(ordner, "frei.pdf"), "utf8"), "neu");
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
