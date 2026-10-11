// tests/app-server-bilder.test.mjs
// Bild-Upload: PNG/JPEG landen unveraendert in der Inbox, HEIC/HEIF werden
// beim Upload in JPEG umgewandelt. Der Konverter ist injiziert, damit der Test
// ohne heif-convert laeuft. Temp-Verzeichnisse, keine Echtdaten.
import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import http from "node:http";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createAppServer, jpegNameFuer } from "../app/server.mjs";

let wurzel;

before(async () => {
  wurzel = await mkdtemp(join(tmpdir(), "app-server-bilder-"));
  await mkdir(join(wurzel, "app"), { recursive: true });
  await writeFile(join(wurzel, "app", "index.html"), "<!doctype html><title>t</title>");
});

after(async () => {
  await rm(wurzel, { recursive: true, force: true });
});

async function mitServer(optionen, lauf) {
  const inboxDir = await mkdtemp(join(wurzel, "inbox-"));
  const logs = [];
  const server = createAppServer({ appDir: join(wurzel, "app"), inboxDir, log: (z) => logs.push(z), ...optionen });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const upload = (name, inhalt) => new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1", port, method: "PUT", path: `/api/inbox/${name}`,
      headers: { "X-Finanzen-Upload": "1", Origin: `http://127.0.0.1:${port}`, "Content-Length": String(Buffer.byteLength(inhalt)) },
    }, (res) => {
      const teile = [];
      res.on("data", (c) => teile.push(c));
      res.on("end", () => resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(teile).toString("utf8")) }));
    });
    req.on("error", reject);
    req.end(inhalt);
  });
  const statik = (pfad) => new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: pfad }, (res) => { res.resume(); res.on("end", () => resolve(res)); }).on("error", reject);
  });
  try {
    await lauf({ upload, statik, inboxDir, logs, inhalt: async () => (await readdir(inboxDir)).sort() });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// Fake-Konverter: schreibt "JPEG aus <Inhalt>" in die Ausgabedatei.
const fakeKonverter = (aufrufe = []) => async (ein, aus) => {
  aufrufe.push({ ein, aus });
  await writeFile(aus, `JPEG aus ${await readFile(ein, "utf8")}`);
};

test("jpegNameFuer: Endung wird .jpg, der Stamm bleibt", () => {
  assert.equal(jpegNameFuer("IMG_0001.HEIC"), "IMG_0001.jpg");
  assert.equal(jpegNameFuer("Quittung.Tankstelle.heif"), "Quittung.Tankstelle.jpg");
});

test("PNG und JPEG werden unveraendert abgelegt", async () => {
  await mitServer({ heicKonverter: () => { throw new Error("darf nicht laufen"); } }, async ({ upload, inboxDir, inhalt }) => {
    const png = await upload("Quittung.png", "\x89PNG-Probe");
    assert.equal(png.status, 201);
    assert.deepEqual(png.json, { status: "hochgeladen", name: "Quittung.png" });
    assert.equal((await upload("Foto.JPEG", "jpeg")).status, 201);
    assert.equal(await readFile(join(inboxDir, "Quittung.png"), "utf8"), "\x89PNG-Probe");
    assert.deepEqual(await inhalt(), ["Foto.JPEG", "Quittung.png"]);
  });
});

test("HEIC wird in JPEG umgewandelt: neuer Name, keine HEIC- und Temp-Reste", async () => {
  const aufrufe = [];
  await mitServer({ heicKonverter: fakeKonverter(aufrufe) }, async ({ upload, inboxDir, inhalt, logs }) => {
    const r = await upload("IMG_0001.HEIC", "heic-a");
    assert.equal(r.status, 201);
    assert.deepEqual(r.json, { status: "hochgeladen", name: "IMG_0001.jpg", umgewandelt_aus: "IMG_0001.HEIC" });
    assert.equal(await readFile(join(inboxDir, "IMG_0001.jpg"), "utf8"), "JPEG aus heic-a");
    assert.deepEqual(await inhalt(), ["IMG_0001.jpg"]);
    assert.equal(aufrufe.length, 1);
    assert.match(aufrufe[0].aus, /\.jpg$/, "heif-convert bestimmt das Format ueber die Endung");
    assert.ok(aufrufe[0].ein.startsWith(inboxDir) && aufrufe[0].aus.startsWith(inboxDir), "Temp-Dateien liegen in der Inbox");
    assert.notEqual(dirname(aufrufe[0].aus), inboxDir, "Ausgabe in einem eigenen Temp-Verzeichnis");

    // gleicher Inhalt -> vorhanden (Vergleich gegen die JPEG-Datei)
    const nochmal = await upload("IMG_0001.HEIC", "heic-a");
    assert.equal(nochmal.status, 200);
    assert.deepEqual(nochmal.json, { status: "vorhanden", name: "IMG_0001.jpg", umgewandelt_aus: "IMG_0001.HEIC" });

    // anderer Inhalt -> Suffix am JPEG-Namen
    const anders = await upload("IMG_0001.heic", "heic-b");
    assert.deepEqual(anders.json, { status: "hochgeladen", name: "IMG_0001-2.jpg", umgewandelt_aus: "IMG_0001.heic" });
    assert.deepEqual(await inhalt(), ["IMG_0001-2.jpg", "IMG_0001.jpg"]);
    assert.ok(logs.some((z) => z.includes("IMG_0001.jpg") && z.includes("umgewandelt")));
  });
});

test("HEIC ohne Konverter -> 415 mit Grund, nichts abgelegt", async () => {
  const fehlt = async () => { throw Object.assign(new Error("spawn heif-convert ENOENT"), { code: "ENOENT" }); };
  await mitServer({ heicKonverter: fehlt }, async ({ upload, inhalt }) => {
    const r = await upload("IMG_0002.heic", "heic");
    assert.equal(r.status, 415);
    assert.deepEqual(r.json, { status: "abgelehnt", grund: "heic-konverter-fehlt" });
    assert.deepEqual(await inhalt(), []);
  });
});

test("kaputte HEIC -> 422 mit Grund, nichts halb abgelegt", async () => {
  const kaputt = async (ein, aus) => {
    await writeFile(aus, "halb");
    throw Object.assign(new Error("Could not read HEIF/AVIF file"), { code: 1 });
  };
  await mitServer({ heicKonverter: kaputt }, async ({ upload, inhalt }) => {
    const r = await upload("kaputt.heic", "kein heic");
    assert.equal(r.status, 422);
    assert.deepEqual(r.json, { status: "abgelehnt", grund: "heic-unlesbar" });
    assert.deepEqual(await inhalt(), []);
  });
  // Konverter "erfolgreich", aber ohne Ausgabe -> ebenfalls 422
  await mitServer({ heicKonverter: async () => {} }, async ({ upload, inhalt }) => {
    const r = await upload("leer.heif", "x");
    assert.equal(r.status, 422);
    assert.deepEqual(await inhalt(), []);
  });
});

test("Statik: Bild-MIME-Typen fuer png, jpg und heic", async () => {
  for (const name of ["a.png", "b.jpg", "c.jpeg", "d.heic", "e.heif"]) await writeFile(join(wurzel, "app", name), "x");
  await mitServer({}, async ({ statik }) => {
    assert.equal((await statik("/a.png")).headers["content-type"], "image/png");
    assert.equal((await statik("/b.jpg")).headers["content-type"], "image/jpeg");
    assert.equal((await statik("/c.jpeg")).headers["content-type"], "image/jpeg");
    assert.equal((await statik("/d.heic")).headers["content-type"], "image/heic");
    assert.equal((await statik("/e.heif")).headers["content-type"], "image/heif");
  });
});

// Alles, auch Dotfiles und Verzeichnisse: nach jedem Ausgang muss die Inbox
// bis auf abgelegte Ergebnisse leer sein.
async function allesIn(ordner) {
  return (await readdir(ordner, { recursive: true })).sort();
}

test("Konverter mit Nebendateien, der danach wirft: keine Reste in Inbox und Temp", async () => {
  const ordner = [];
  const nebendateien = async (ein, aus) => {
    ordner.push(dirname(aus));
    const stamm = aus.replace(/\.jpg$/, "");
    for (const neben of ["-depth.jpg", "-aux.jpg", "-urn:com:apple:photo:2020:aux:hdrgainmap.jpg", "-1.jpg", "-2.jpg"]) await writeFile(stamm + neben, "neben");
    await writeFile(aus, "halb");
    throw Object.assign(new Error("timeout"), { killed: true, signal: "SIGKILL" });
  };
  await mitServer({ heicKonverter: nebendateien }, async ({ upload, inboxDir }) => {
    const r = await upload("IMG_0003.heic", "heic");
    assert.equal(r.status, 422);
    assert.deepEqual(await allesIn(inboxDir), []);
  });
  await assert.rejects(readdir(ordner[0]), { code: "ENOENT" }, "Temp-Verzeichnis des Konverters ist entfernt");
});

test("Erfolg mit Nebendateien: nur das Hauptbild wird abgelegt, Temp-Verzeichnis weg", async () => {
  const mitNeben = async (ein, aus) => {
    await writeFile(aus.replace(/\.jpg$/, "-depth.jpg"), "tiefe");
    await writeFile(aus, "haupt");
  };
  await mitServer({ heicKonverter: mitNeben }, async ({ upload, inboxDir }) => {
    assert.equal((await upload("IMG_0004.heic", "heic")).status, 201);
    assert.deepEqual(await allesIn(inboxDir), ["IMG_0004.jpg"]);
    assert.equal(await readFile(join(inboxDir, "IMG_0004.jpg"), "utf8"), "haupt");
  });
  // Mehrbildrig ohne verlangten Namen: das erste nummerierte Bild
  const nummeriert = async (ein, aus) => {
    await writeFile(aus.replace(/\.jpg$/, "-2.jpg"), "zwei");
    await writeFile(aus.replace(/\.jpg$/, "-1.jpg"), "eins");
  };
  await mitServer({ heicKonverter: nummeriert }, async ({ upload, inboxDir }) => {
    assert.equal((await upload("serie.heic", "heic")).status, 201);
    assert.equal(await readFile(join(inboxDir, "serie.jpg"), "utf8"), "eins");
    assert.deepEqual(await allesIn(inboxDir), ["serie.jpg"]);
  });
});

test("JPEG groesser als die Upload-Grenze -> 413, alles aufgeraeumt", async () => {
  const riesig = async (ein, aus) => { await writeFile(aus, Buffer.alloc(2048, 1)); };
  await mitServer({ heicKonverter: riesig, maxBytes: 1024 }, async ({ upload, inboxDir }) => {
    const r = await upload("gross.heic", "klein");
    assert.equal(r.status, 413);
    assert.deepEqual(r.json, { status: "abgelehnt", grund: "zu-gross" });
    assert.deepEqual(await allesIn(inboxDir), []);
  });
});

test("Parallele HEIC-Uploads ueberschreiben sich keine Temp-Namen", async () => {
  const ausgaben = new Set();
  const langsam = async (ein, aus) => {
    ausgaben.add(aus);
    const inhalt = await readFile(ein, "utf8");
    await new Promise((r) => setTimeout(r, 30));
    await writeFile(aus, `JPEG ${inhalt}`);
  };
  await mitServer({ heicKonverter: langsam }, async ({ upload, inboxDir }) => {
    const antworten = await Promise.all(["a", "b", "c", "d"].map((x) => upload(`${x}.heic`, x)));
    assert.deepEqual(antworten.map((a) => a.status), [201, 201, 201, 201]);
    assert.equal(ausgaben.size, 4);
    for (const x of ["a", "b", "c", "d"]) assert.equal(await readFile(join(inboxDir, `${x}.jpg`), "utf8"), `JPEG ${x}`);
    assert.deepEqual(await allesIn(inboxDir), ["a.jpg", "b.jpg", "c.jpg", "d.jpg"]);
  });
});

test("Belegter Zielname (Verzeichnis): Suffix-Weg legt ab und raeumt Temp-Reste weg", async () => {
  await mitServer({ heicKonverter: fakeKonverter() }, async ({ upload, inboxDir }) => {
    await mkdir(join(inboxDir, "x.jpg"));
    const r = await upload("x.heic", "heic");
    assert.equal(r.status, 201);
    assert.equal(r.json.name, "x-2.jpg");
    assert.deepEqual((await allesIn(inboxDir)).filter((n) => n.startsWith(".")), []);
  });
});
