// tests/app-server-regeln.test.mjs
// Reine Funktionen des App-Servers und der gemeinsamen Upload-Regeln:
// Dateinamen-Sanitizing (inkl. Angriffe), Endungen, Suffix-Namen, IP-Pruefung,
// CLI-Argumente. Kein Netz, kein Dateisystem.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ERLAUBTE_ENDUNGEN,
  MAX_UPLOAD_BYTES,
  vorpruefeDatei,
} from "../app/upload-regeln.mjs";
import {
  bereinigeDateiname,
  kandidatenName,
  normalisiereIp,
  pruefeZugang,
  parseArgs,
  erlaubteOrigins,
  erlaubteHosts,
} from "../app/server.mjs";

test("Upload-Regeln: Endungen und Grenze", () => {
  assert.deepEqual([...ERLAUBTE_ENDUNGEN].sort(), ["csv", "heic", "heif", "jpeg", "jpg", "pdf", "png", "txt", "xls", "xlsx"]);
  assert.equal(MAX_UPLOAD_BYTES, 25 * 1024 * 1024);
});

test("vorpruefeDatei: Endung case-insensitiv, Groesse begrenzt", () => {
  assert.deepEqual(vorpruefeDatei({ name: "Auszug.CSV", size: 10 }), { ok: true });
  assert.deepEqual(vorpruefeDatei({ name: "scan.pdf", size: MAX_UPLOAD_BYTES }), { ok: true });
  assert.deepEqual(vorpruefeDatei({ name: "Foto.PNG", size: 10 }), { ok: true });
  assert.deepEqual(vorpruefeDatei({ name: "IMG_0001.HEIC", size: 10 }), { ok: true });
  assert.deepEqual(vorpruefeDatei({ name: "tool.exe", size: 10 }), { ok: false, grund: "endung-nicht-erlaubt" });
  assert.deepEqual(vorpruefeDatei({ name: "ohne-endung", size: 10 }), { ok: false, grund: "endung-nicht-erlaubt" });
  assert.deepEqual(vorpruefeDatei({ name: "gross.pdf", size: MAX_UPLOAD_BYTES + 1 }), { ok: false, grund: "zu-gross" });
});

test("bereinigeDateiname: gueltige Namen bleiben erhalten (NFC, getrimmt)", () => {
  assert.deepEqual(bereinigeDateiname("Auszug%202026-01.csv"), { ok: true, name: "Auszug 2026-01.csv" });
  assert.deepEqual(bereinigeDateiname("Konto.Umsaetze.XLSX"), { ok: true, name: "Konto.Umsaetze.XLSX" });
  // "Ü" zerlegt (U + Trema) wird zu NFC zusammengezogen
  const zerlegt = encodeURIComponent("Übersicht.pdf");
  assert.deepEqual(bereinigeDateiname(zerlegt), { ok: true, name: "Übersicht.pdf" });
  assert.deepEqual(bereinigeDateiname("%20notiz.txt%20"), { ok: true, name: "notiz.txt" });
});

test("bereinigeDateiname: Pfad-Angriffe werden verworfen", () => {
  for (const roh of [
    "../x.csv",
    "..%2fx.csv",
    "%2e%2e%2fx.csv",
    "%2e%2e%2F%2e%2e%2Fetc.csv",
    "a%5cb.csv",
    "..\\x.csv",
    "a/b.csv",
    "a%00.csv",
    "a%0a.csv",
    "a%7f.csv",
    ".",
    "..",
    "%2e",
    "",
    "%20",
    ".versteckt.csv",
    "%2eversteckt.csv",
    "%E0%A4%A", // kaputte Kodierung
  ]) {
    const ergebnis = bereinigeDateiname(roh);
    assert.equal(ergebnis.ok, false, `"${roh}" muss abgelehnt werden`);
    assert.equal(ergebnis.status, 400, `"${roh}" -> 400`);
    assert.equal(ergebnis.grund, "dateiname-ungueltig");
  }
});

test("bereinigeDateiname: Laenge maximal 200 Zeichen", () => {
  const ok = `${"a".repeat(196)}.csv`;
  assert.equal(bereinigeDateiname(ok).ok, true);
  const zuLang = `${"a".repeat(197)}.csv`;
  assert.deepEqual(bereinigeDateiname(zuLang), { ok: false, status: 400, grund: "dateiname-ungueltig" });
});

test("bereinigeDateiname: falsche Endung -> 415", () => {
  for (const roh of ["programm.exe", "bild.gif", "ohne", "csv", "archiv.csv.zip", "foto.png.exe"]) {
    assert.deepEqual(bereinigeDateiname(roh), { ok: false, status: 415, grund: "endung-nicht-erlaubt" }, roh);
  }
});

test("kandidatenName: Suffix vor der Endung", () => {
  assert.equal(kandidatenName("auszug.csv", 1), "auszug.csv");
  assert.equal(kandidatenName("auszug.csv", 2), "auszug-2.csv");
  assert.equal(kandidatenName("Konto.Umsaetze.pdf", 3), "Konto.Umsaetze-3.pdf");
});

test("normalisiereIp: IPv4-mapped IPv6 wird zu IPv4", () => {
  assert.equal(normalisiereIp("::ffff:192.0.2.10"), "192.0.2.10");
  assert.equal(normalisiereIp("192.0.2.10"), "192.0.2.10");
  assert.equal(normalisiereIp("::1"), "::1");
  assert.equal(normalisiereIp(undefined), "");
});

test("pruefeZugang: ohne Proxy-IP immer offen, sonst IP und Remote-User noetig", () => {
  assert.equal(pruefeZugang({ proxyIp: null, remoteAddress: "127.0.0.1", remoteUser: undefined }), true);
  assert.equal(pruefeZugang({ proxyIp: "192.0.2.10", remoteAddress: "::ffff:192.0.2.10", remoteUser: "nutzer" }), true);
  assert.equal(pruefeZugang({ proxyIp: "192.0.2.10", remoteAddress: "192.0.2.10", remoteUser: "nutzer" }), true);
  assert.equal(pruefeZugang({ proxyIp: "192.0.2.10", remoteAddress: "192.0.2.11", remoteUser: "nutzer" }), false);
  assert.equal(pruefeZugang({ proxyIp: "192.0.2.10", remoteAddress: "192.0.2.10", remoteUser: "" }), false);
  assert.equal(pruefeZugang({ proxyIp: "192.0.2.10", remoteAddress: "192.0.2.10", remoteUser: "   " }), false);
  assert.equal(pruefeZugang({ proxyIp: "192.0.2.10", remoteAddress: "192.0.2.10", remoteUser: undefined }), false);
});

test("parseArgs: Defaults", () => {
  const opt = parseArgs([], { appDir: "/srv/app" });
  assert.equal(opt.host, "127.0.0.1");
  assert.equal(opt.port, 8000);
  assert.equal(opt.proxyIp, null);
  assert.equal(opt.origins, null);
  assert.equal(opt.inbox, "/srv/app/data/inbox");
});

test("parseArgs: alle Optionen, auch in =-Schreibweise", () => {
  const opt = parseArgs(
    ["--host", "0.0.0.0", "--port=8080", "--proxy-ip", "192.0.2.10", "--origin", "https://finanzen.example.org/", "--inbox=/tmp/eingang"],
    { appDir: "/srv/app" },
  );
  assert.equal(opt.host, "0.0.0.0");
  assert.equal(opt.port, 8080);
  assert.equal(opt.proxyIp, "192.0.2.10");
  assert.deepEqual(opt.origins, ["https://finanzen.example.org"]);
  assert.equal(opt.inbox, "/tmp/eingang");
});

test("parseArgs: ungueltige Werte werfen", () => {
  assert.throws(() => parseArgs(["--port", "abc"], { appDir: "/a" }), /--port/);
  assert.throws(() => parseArgs(["--port", "70000"], { appDir: "/a" }), /--port/);
  assert.throws(() => parseArgs(["--proxy-ip", "kein-host"], { appDir: "/a" }), /--proxy-ip/);
  assert.throws(() => parseArgs(["--origin", "nicht-url"], { appDir: "/a" }), /--origin/);
  assert.throws(() => parseArgs(["--unbekannt"], { appDir: "/a" }), /--unbekannt/);
  assert.throws(() => parseArgs(["--host"], { appDir: "/a" }), /--host/);
});

test("erlaubteOrigins: explizit oder lokale Defaults zum Port", () => {
  assert.deepEqual(erlaubteOrigins({ origins: null, port: 8771 }), ["http://127.0.0.1:8771", "http://localhost:8771"]);
  assert.deepEqual(erlaubteOrigins({ origins: ["https://finanzen.example.org"], port: 8771 }), ["https://finanzen.example.org"]);
});

test("erlaubteHosts: lokal Loopback mit Port, sonst Host aus der Origin (mit/ohne Default-Port)", () => {
  assert.deepEqual(erlaubteHosts({ origins: null, port: 8771 }), ["127.0.0.1:8771", "localhost:8771"]);
  assert.deepEqual(erlaubteHosts({ origins: ["https://finanzen.example.org"], port: 8080 }), ["finanzen.example.org", "finanzen.example.org:443"]);
  assert.deepEqual(erlaubteHosts({ origins: ["http://192.0.2.10:8080"], port: 8080 }), ["192.0.2.10:8080"]);
});
