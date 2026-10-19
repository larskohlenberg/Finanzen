// tests/app-server.test.mjs
// Integration: App-Server auf Port 0 gegen ein Temp-Verzeichnis (keine Echtdaten).
import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import http from "node:http";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer } from "../app/server.mjs";

let wurzel, appDir, inboxDir, server, port, logs;

async function starte(optionen = {}) {
  const s = createAppServer({ appDir, inboxDir, log: (zeile) => logs.push(zeile), ...optionen });
  await new Promise((resolve) => s.listen(0, "127.0.0.1", resolve));
  return s;
}

function anfrage({ method = "GET", path = "/", headers = {}, body, p = port }) {
  if (body !== undefined && !headers["Transfer-Encoding"]) {
    headers = { ...headers, "Content-Length": String(Buffer.byteLength(body)) };
  }
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: p, method, path, headers }, (res) => {
      const teile = [];
      res.on("data", (c) => teile.push(c));
      res.on("end", () => {
        const text = Buffer.concat(teile).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { /* keine JSON-Antwort */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function upload(name, inhalt, extra = {}) {
  return anfrage({
    method: "PUT",
    path: `/api/inbox/${name}`,
    headers: { "X-Finanzen-Upload": "1", Origin: `http://127.0.0.1:${port}`, ...extra },
    body: inhalt,
  });
}

async function inboxInhalt() {
  return (await readdir(inboxDir)).sort();
}

before(async () => {
  wurzel = await mkdtemp(join(tmpdir(), "app-server-"));
  appDir = join(wurzel, "app");
  inboxDir = join(appDir, "data", "inbox");
  await mkdir(join(appDir, "views"), { recursive: true });
  await mkdir(inboxDir, { recursive: true });
  await writeFile(join(appDir, "index.html"), '<!doctype html><title>t</title><script src="./main.js" type="module"></script>');
  await writeFile(join(appDir, "main.js"), 'import "./views/a.mjs";');
  await writeFile(join(appDir, "views", "a.mjs"), "export const a = 1;");
  await mkdir(join(appDir, "data", "master"), { recursive: true });
  await writeFile(join(appDir, "data", "master", "personen.json"), "[]");
  await writeFile(join(appDir, "version.json"), "{}");
  await writeFile(join(wurzel, "geheim.txt"), "GEHEIM");
  await symlink(join(wurzel, "geheim.txt"), join(appDir, "link.txt"));
  await symlink(wurzel, join(appDir, "linkdir"));
  logs = [];
  server = await starte();
  port = server.address().port;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(wurzel, { recursive: true, force: true });
});

// --- Statik ----------------------------------------------------------------

test("Statik: / liefert index.html mit No-Cache- und Sicherheits-Kopfzeilen", async () => {
  const r = await anfrage({ path: "/" });
  assert.equal(r.status, 200);
  assert.match(r.headers["content-type"], /^text\/html/);
  assert.match(r.headers["cache-control"], /no-store/);
  assert.equal(r.headers["x-content-type-options"], "nosniff");
  assert.equal(r.headers["referrer-policy"], "no-referrer");
  assert.match(r.headers["content-security-policy"], /default-src 'self'/);
});

test("Statik: MIME-Typen fuer Module und JSON, HEAD ohne Body", async () => {
  assert.match((await anfrage({ path: "/views/a.mjs" })).headers["content-type"], /^text\/javascript/);
  assert.match((await anfrage({ path: "/main.js?v=1" })).headers["content-type"], /^text\/javascript/);
  assert.match((await anfrage({ path: "/version.json" })).headers["content-type"], /^application\/json/);
  const head = await anfrage({ method: "HEAD", path: "/main.js" });
  assert.equal(head.status, 200);
  assert.equal(head.text, "");
});

test("Statik: kein Pfad-Ausbruch, keine Symlinks nach draussen, kein Listing", async () => {
  for (const path of [
    "/../geheim.txt",
    "/%2e%2e/geheim.txt",
    "/..%2fgeheim.txt",
    "/views/..%2f..%2fgeheim.txt",
    "/views/%2e%2e%2f%2e%2e%2fgeheim.txt",
    "/..%5cgeheim.txt",
    "/main.js%00",
    "/link.txt",
    "/linkdir/geheim.txt",
    "/views/",
    "/fehlt.js",
  ]) {
    const r = await anfrage({ path });
    assert.ok([400, 403, 404].includes(r.status), `${path} -> ${r.status}`);
    assert.doesNotMatch(r.text, /GEHEIM|a\.mjs/, path);
  }
});

test("Statik: nur GET/HEAD", async () => {
  const r = await anfrage({ method: "POST", path: "/main.js", body: "x" });
  assert.equal(r.status, 405);
});

// --- Upload ----------------------------------------------------------------

test("Upload: neu -> 201, gleicher Inhalt -> 200 vorhanden, anderer Inhalt -> Suffix", async () => {
  const a = await upload("auszug.csv", "a;b\n1;2\n");
  assert.equal(a.status, 201);
  assert.deepEqual(a.json, { status: "hochgeladen", name: "auszug.csv" });
  assert.equal(await readFile(join(inboxDir, "auszug.csv"), "utf8"), "a;b\n1;2\n");

  const b = await upload("auszug.csv", "a;b\n1;2\n");
  assert.equal(b.status, 200);
  assert.deepEqual(b.json, { status: "vorhanden", name: "auszug.csv" });

  const c = await upload("auszug.csv", "anders\n");
  assert.equal(c.status, 201);
  assert.deepEqual(c.json, { status: "hochgeladen", name: "auszug-2.csv" });

  const d = await upload("auszug.csv", "noch anders\n");
  assert.deepEqual(d.json, { status: "hochgeladen", name: "auszug-3.csv" });

  // Schon als Suffix-Datei vorhanden -> kein weiteres Duplikat
  const e = await upload("auszug.csv", "anders\n");
  assert.deepEqual(e.json, { status: "vorhanden", name: "auszug-2.csv" });

  assert.deepEqual(await inboxInhalt(), ["auszug-2.csv", "auszug-3.csv", "auszug.csv"]);
  assert.ok(logs.some((z) => z.includes("auszug.csv") && z.includes("hochgeladen")));
  assert.ok(logs.every((z) => !z.includes("a;b")), "Log enthaelt keinen Inhalt");
});

test("Upload: Endung case-insensitiv, falsche Endung 415", async () => {
  assert.equal((await upload("GROSS.PDF", "%PDF")).status, 201);
  const r = await upload("tool.exe", "x");
  assert.equal(r.status, 415);
  assert.deepEqual(r.json, { status: "abgelehnt", grund: "endung-nicht-erlaubt" });
});

test("Upload: Angriffe im Dateinamen schreiben nie ausserhalb der Inbox", async () => {
  const vorher = await inboxInhalt();
  for (const name of ["..%2fboese.csv", "%2e%2e%2fboese.csv", "a%5cboese.csv", "a%00.csv", ".", "%2e", ".versteckt.csv", "../boese.csv", "x/boese.csv"]) {
    const r = await upload(name, "x");
    assert.equal(r.status, 400, name);
    assert.equal(r.json?.status, "abgelehnt", name);
  }
  assert.deepEqual(await inboxInhalt(), vorher);
  assert.deepEqual((await readdir(join(appDir, "data"))).sort(), ["inbox", "master"]);
});

test("Upload: Kopfzeile und Origin sind Pflicht", async () => {
  const ohneKopf = await anfrage({ method: "PUT", path: "/api/inbox/k.csv", headers: { Origin: `http://127.0.0.1:${port}` }, body: "x" });
  assert.equal(ohneKopf.status, 403);
  assert.equal((await upload("k.csv", "x", { Origin: "http://192.0.2.99" })).status, 403);
  const ohneOrigin = await anfrage({ method: "PUT", path: "/api/inbox/k.csv", headers: { "X-Finanzen-Upload": "1" }, body: "x" });
  assert.equal(ohneOrigin.status, 403);
  assert.equal((await upload("k.csv", "x", { Origin: `http://localhost:${port}` })).status, 201);
});

test("Upload: Groessengrenze mit und ohne Content-Length, keine Temp-Reste", async () => {
  const klein = await starte({ maxBytes: 10 });
  const p = klein.address().port;
  try {
    const kopf = { "X-Finanzen-Upload": "1", Origin: `http://127.0.0.1:${p}` };
    const mitLaenge = await anfrage({ method: "PUT", path: "/api/inbox/gross.csv", headers: kopf, body: "x".repeat(11), p });
    assert.equal(mitLaenge.status, 413);
    assert.deepEqual(mitLaenge.json, { status: "abgelehnt", grund: "zu-gross" });

    const gestreamt = await anfrage({ method: "PUT", path: "/api/inbox/gross.csv", headers: { ...kopf, "Transfer-Encoding": "chunked" }, body: "x".repeat(50), p });
    assert.equal(gestreamt.status, 413);
    assert.equal((await anfrage({ method: "PUT", path: "/api/inbox/genau.csv", headers: kopf, body: "x".repeat(10), p })).status, 201);
  } finally {
    await new Promise((resolve) => klein.close(resolve));
  }
  assert.ok(!(await inboxInhalt()).includes("gross.csv"));
  assert.deepEqual((await inboxInhalt()).filter((n) => n.startsWith(".")), []);
});

test("Upload: Content-Length ueber 25 MB wird vorab abgelehnt", async () => {
  const r = await new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1", port, method: "PUT", path: "/api/inbox/riesig.pdf",
      headers: { "X-Finanzen-Upload": "1", Origin: `http://127.0.0.1:${port}`, "Content-Length": String(25 * 1024 * 1024 + 1) },
    }, (res) => { res.resume(); resolve(res.statusCode); req.destroy(); });
    req.on("error", (e) => (e.code === "ECONNRESET" || e.code === "EPIPE" ? null : reject(e)));
    req.flushHeaders();
  });
  assert.equal(r, 413);
});

test("Upload: Abbruch mitten im Body hinterlaesst keine Temp-Datei", async () => {
  await new Promise((resolve) => {
    const req = http.request({
      host: "127.0.0.1", port, method: "PUT", path: "/api/inbox/abbruch.csv",
      headers: { "X-Finanzen-Upload": "1", Origin: `http://127.0.0.1:${port}`, "Content-Length": "1000" },
    });
    req.on("error", () => resolve());
    req.write("x".repeat(100));
    setTimeout(() => { req.destroy(); resolve(); }, 50);
  });
  for (let i = 0; i < 40; i += 1) {
    if ((await inboxInhalt()).every((n) => !n.startsWith("."))) break;
    await new Promise((r) => setTimeout(r, 25));
  }
  const rest = await inboxInhalt();
  assert.deepEqual(rest.filter((n) => n.startsWith(".")), []);
  assert.ok(!rest.includes("abbruch.csv"));
});

// --- Inbox-Liste -----------------------------------------------------------

test("GET /api/inbox: nur Dateien direkt in der Inbox, neueste zuerst", async () => {
  const eigen = await mkdtemp(join(tmpdir(), "app-server-liste-"));
  await writeFile(join(eigen, "alt.csv"), "1");
  await writeFile(join(eigen, "neu.pdf"), "12");
  await writeFile(join(eigen, ".gitkeep"), "");
  await mkdir(join(eigen, "processed"));
  await writeFile(join(eigen, "processed", "x.csv"), "1");
  await utimes(join(eigen, "alt.csv"), new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z"));
  await utimes(join(eigen, "neu.pdf"), new Date("2026-02-01T00:00:00Z"), new Date("2026-02-01T00:00:00Z"));
  const s = await starte({ inboxDir: eigen });
  try {
    const r = await anfrage({ path: "/api/inbox", p: s.address().port });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, {
      dateien: [
        { name: "neu.pdf", groesse: 2, geaendert: "2026-02-01T00:00:00.000Z" },
        { name: "alt.csv", groesse: 1, geaendert: "2026-01-01T00:00:00.000Z" },
      ],
    });
  } finally {
    await new Promise((resolve) => s.close(resolve));
    await rm(eigen, { recursive: true, force: true });
  }
});

// --- Host-Pruefung (DNS-Rebinding) ---------------------------------------

test("Fremder Host -> 403 fuer alle Anfragen, erlaubter Host -> 200", async () => {
  assert.equal((await anfrage({ path: "/", headers: { Host: "boese.example" } })).status, 403);
  assert.equal((await anfrage({ path: "/api/inbox", headers: { Host: `boese.example:${port}` } })).status, 403);
  assert.equal((await anfrage({ path: "/", headers: { Host: `localhost:${port}` } })).status, 200);
  assert.equal((await anfrage({ path: "/" })).status, 200);
});

// --- Betriebsmodus hinter dem Proxy ---------------------------------------

test("Proxy-Modus: nur Proxy-IP mit Remote-User, sonst 403 (auch Statik)", async () => {
  const fremd = await starte({ proxyIp: "192.0.2.10" });
  const eigen = await starte({ proxyIp: "127.0.0.1" });
  try {
    const pf = fremd.address().port;
    const pe = eigen.address().port;
    assert.equal((await anfrage({ path: "/", headers: { "Remote-User": "nutzer" }, p: pf })).status, 403);
    assert.equal((await anfrage({ path: "/", p: pe })).status, 403);
    assert.equal((await anfrage({ path: "/", headers: { "Remote-User": " " }, p: pe })).status, 403);
    assert.equal((await anfrage({ path: "/api/inbox", p: pe })).status, 403);
    assert.equal((await anfrage({ path: "/", headers: { "Remote-User": "nutzer" }, p: pe })).status, 200);
  } finally {
    await new Promise((resolve) => fremd.close(resolve));
    await new Promise((resolve) => eigen.close(resolve));
  }
});

test("Explizite Origin ersetzt die lokalen Defaults", async () => {
  const s = await starte({ origins: ["https://finanzen.example.org"] });
  const p = s.address().port;
  try {
    const put = (origin) => anfrage({ method: "PUT", path: "/api/inbox/o.txt", headers: { Host: "finanzen.example.org", "X-Finanzen-Upload": "1", Origin: origin }, body: "o", p });
    assert.equal((await put(`http://127.0.0.1:${p}`)).status, 403);
    assert.equal((await put("https://finanzen.example.org")).status, 201);
    assert.equal((await anfrage({ path: "/", headers: { Host: "finanzen.example.org:443" }, p })).status, 200);
    assert.equal((await anfrage({ path: "/", p })).status, 403, "Loopback-Host gilt mit --origin nicht mehr");
  } finally {
    await new Promise((resolve) => s.close(resolve));
  }
});
