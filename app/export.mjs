// app/export.mjs
//
// Backup-Export fuer den App-Server: Dokumente (Belege/), Daten (Datenroot
// plus Buchungsliste als CSV) oder die vollstaendige Sicherung als ZIP.
// "komplett" (Review D.1) enthaelt zusaetzlich Inbox (samt Originalquellen in
// processed/), Importprofile und SICHERUNG.json: aus welcher Generation, mit
// welchem Code und Pruefergebnis, welche Dateien. Gepruefte Wiederherstellung:
// tools/sicherung-pruefen.mjs, Ablauf in docs/betrieb.md. Die ZIP entsteht beim
// Herunterladen: Eintraege werden vorab gesammelt (Groessen per lstat), damit
// Content-Length feststeht, und dann Datei fuer Datei gestreamt. Auf der
// Platte entsteht nichts.
//
// ZIP ohne Kompression (Methode 0, "stored"): PDFs und Fotos werden ohnehin
// kaum kleiner, und so bleibt die Laenge vorab berechenbar. Kein ZIP64 —
// ueber 4 GB oder 65535 Dateien wird abgelehnt statt kaputt geschrieben.
//
// Nur node:-Module; getestet in tests/export.test.mjs.
import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { crc32 } from "node:zlib";
import { MANIFEST } from "./tools/lib/generationen.mjs";
import { toCents } from "./tools/lib/text.mjs";

export const EXPORT_ARTEN = ["dokumente", "daten", "komplett"];

const ZIP_MAX_BYTES = 0xffffffff;
const ZIP_MAX_EINTRAEGE = 0xffff;
const LOKAL_KOPF = 30;
const ZENTRAL_KOPF = 46;
const ENDE = 22;
const UTF8_FLAG = 0x0800;
const UNIX_DATEI = 0o100644;

// --- ZIP ----------------------------------------------------------------------

// MS-DOS-Zeitstempel (Ortszeit, 2-Sekunden-Raster, ab 1980).
export function dosZeit(datum) {
  const d = datum instanceof Date && !Number.isNaN(datum.getTime()) ? datum : new Date(0);
  if (d.getFullYear() < 1980) return { zeit: 0, tag: (1 << 5) | 1 };
  return {
    zeit: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    tag: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// Gesamtlaenge der ZIP aus Namen und Groessen — fuer Content-Length.
export function zipGroesse(eintraege) {
  let summe = ENDE;
  for (const e of eintraege) {
    const name = Buffer.byteLength(e.name);
    summe += LOKAL_KOPF + name + e.groesse + ZENTRAL_KOPF + name;
  }
  return summe;
}

export function pruefeZipGrenzen(eintraege) {
  if (eintraege.length > ZIP_MAX_EINTRAEGE) throw new Error(`zu viele Dateien fuer ZIP (${eintraege.length})`);
  const groesse = zipGroesse(eintraege);
  if (groesse > ZIP_MAX_BYTES) throw new Error(`ZIP waere groesser als 4 GB (${groesse} Bytes)`);
  return groesse;
}

// eintraege: [{ name, groesse, geaendert: Date, lies: async () => Buffer }].
// Liefert die ZIP als Folge von Buffern. Hat sich eine Datei seit dem
// Sammeln geaendert (andere Laenge), bricht der Strom ab, statt eine ZIP mit
// falscher Laenge zu liefern.
export async function* zipTeile(eintraege) {
  pruefeZipGrenzen(eintraege);
  const zentral = [];
  let offset = 0;
  for (const e of eintraege) {
    const name = Buffer.from(e.name, "utf8");
    const inhalt = await e.lies();
    if (inhalt.length !== e.groesse) throw new Error(`${e.name}: Groesse hat sich beim Export geaendert`);
    const pruefsumme = crc32(inhalt);
    const { zeit, tag } = dosZeit(e.geaendert);

    const lokal = Buffer.alloc(LOKAL_KOPF);
    lokal.writeUInt32LE(0x04034b50, 0);
    lokal.writeUInt16LE(20, 4);
    lokal.writeUInt16LE(UTF8_FLAG, 6);
    lokal.writeUInt16LE(0, 8);
    lokal.writeUInt16LE(zeit, 10);
    lokal.writeUInt16LE(tag, 12);
    lokal.writeUInt32LE(pruefsumme, 14);
    lokal.writeUInt32LE(inhalt.length, 18);
    lokal.writeUInt32LE(inhalt.length, 22);
    lokal.writeUInt16LE(name.length, 26);
    lokal.writeUInt16LE(0, 28);
    yield Buffer.concat([lokal, name]);
    yield inhalt;

    const kopf = Buffer.alloc(ZENTRAL_KOPF);
    kopf.writeUInt32LE(0x02014b50, 0);
    kopf.writeUInt16LE((3 << 8) | 20, 4);
    kopf.writeUInt16LE(20, 6);
    kopf.writeUInt16LE(UTF8_FLAG, 8);
    kopf.writeUInt16LE(0, 10);
    kopf.writeUInt16LE(zeit, 12);
    kopf.writeUInt16LE(tag, 14);
    kopf.writeUInt32LE(pruefsumme, 16);
    kopf.writeUInt32LE(inhalt.length, 20);
    kopf.writeUInt32LE(inhalt.length, 24);
    kopf.writeUInt16LE(name.length, 28);
    kopf.writeUInt32LE(UNIX_DATEI * 0x10000, 38);
    kopf.writeUInt32LE(offset, 42);
    zentral.push(kopf, name);
    offset += LOKAL_KOPF + name.length + inhalt.length;
  }
  const verzeichnis = Buffer.concat(zentral);
  const ende = Buffer.alloc(ENDE);
  ende.writeUInt32LE(0x06054b50, 0);
  ende.writeUInt16LE(eintraege.length, 8);
  ende.writeUInt16LE(eintraege.length, 10);
  ende.writeUInt32LE(verzeichnis.length, 12);
  ende.writeUInt32LE(offset, 16);
  yield verzeichnis;
  yield ende;
}

// --- Eintraege sammeln -----------------------------------------------------------

// Alle Dateien unter wurzel rekursiv als ZIP-Eintraege mit praefix. Wie
// listeBelege: Dotfiles und Dot-Ordner fehlen, Symlinks werden nicht verfolgt,
// fehlende Wurzel ergibt eine leere Liste. Namen in NFC (macOS liefert NFD).
export async function sammleOrdner(wurzel, praefix) {
  const ergebnis = [];
  async function lauf(ordner, rel) {
    let eintraege;
    try {
      eintraege = await readdir(ordner, { withFileTypes: true });
    } catch (fehler) {
      if (fehler.code === "ENOENT" && ordner === wurzel) return;
      throw fehler;
    }
    for (const e of eintraege) {
      if (e.name.startsWith(".")) continue;
      const voll = join(ordner, e.name);
      const name = `${rel}/${e.name.normalize("NFC")}`;
      if (e.isDirectory()) await lauf(voll, name);
      else if (e.isFile()) {
        const info = await lstat(voll);
        ergebnis.push({ name, groesse: info.size, geaendert: info.mtime, lies: () => readFile(voll) });
      }
    }
  }
  await lauf(wurzel, praefix);
  return ergebnis.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function pufferEintrag(name, text, geaendert = new Date()) {
  const inhalt = Buffer.from(text, "utf8");
  return { name, groesse: inhalt.length, geaendert, lies: async () => inhalt };
}

async function liesJsonOptional(pfad, ersatz) {
  try {
    return JSON.parse(await readFile(pfad, "utf8"));
  } catch (fehler) {
    if (fehler.code === "ENOENT") return ersatz;
    throw fehler;
  }
}

async function liesJsonlOptional(pfad) {
  let text;
  try {
    text = await readFile(pfad, "utf8");
  } catch (fehler) {
    if (fehler.code === "ENOENT") return [];
    throw fehler;
  }
  return text.split(/\r?\n/).filter((z) => z.trim()).map((z) => JSON.parse(z));
}

// --- Buchungsliste als CSV --------------------------------------------------------

// Excel (de): Semikolon, Dezimalkomma, Datum TT.MM.JJJJ, UTF-8 mit BOM, CRLF.
// Textfelder, die mit = + - @ beginnen, bekommen ein ' davor, damit Excel sie
// nicht als Formel ausfuehrt.
function csvFeld(wert) {
  let text = String(wert ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function betragDe(betrag) {
  const cents = toCents(betrag);
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

function datumDe(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso ?? "");
}

export function buchungenCsv(transaktionen, { kategorien = [], konten = [] } = {}) {
  const kategorieName = new Map(kategorien.map((k) => [k.kategorie_id, k.name]));
  const kontoName = new Map(konten.map((k) => [k.konto_id, k.name]));
  const kopf = ["Datum", "Konto", "Betrag", "Gegenpartei", "Verwendungszweck", "Kategorie", "Transfer", "Status", "Bemerkung", "Transaktion"];
  const zeilen = [...transaktionen]
    .sort((a, b) => (a.buchungsdatum === b.buchungsdatum
      ? String(a.transaktion_id).localeCompare(String(b.transaktion_id))
      : a.buchungsdatum < b.buchungsdatum ? -1 : 1))
    .map((tx) => [
      datumDe(tx.buchungsdatum),
      csvFeld(kontoName.get(tx.konto_id) ?? tx.konto_id),
      betragDe(tx.betrag),
      csvFeld(tx.gegenpartei),
      csvFeld(tx.verwendungszweck),
      csvFeld(kategorieName.get(tx.kategorie_id) ?? tx.kategorie_id ?? ""),
      tx.ist_transfer ? "ja" : "nein",
      tx.kategorisierung_status ?? "",
      csvFeld(tx.bemerkung),
      tx.transaktion_id,
    ].join(";"));
  return `\uFEFF${[kopf.join(";"), ...zeilen].join("\r\n")}\r\n`;
}

// --- Plan je Exportart --------------------------------------------------------------

function heute(datum) {
  const d = datum ?? new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function exportDateiname(art, datum) {
  return `finanzen-${art === "komplett" ? "backup" : art}-${heute(datum)}.zip`;
}

export const SICHERUNG_MANIFEST = "SICHERUNG.json";
export const ABGELEITET = ["Daten/buchungen.csv"];
// Bereich in der ZIP -> Ort im Datenort (ADR 0036) beim Wiederherstellen.
export const SICHERUNG_BEREICHE = { Daten: "master", Belege: "Belege", Inbox: "inbox", Importprofile: "import-profile" };

// Sammelt die Eintraege einer Exportart. In der ZIP: Dokumente unter
// "Belege/", Daten unter "Daten/" plus "Daten/buchungen.csv"; bei "komplett"
// ausserdem "Inbox/", "Importprofile/" und SICHERUNG.json. stand, code und
// pruefung beschreiben die Generation, aus der datenDir stammt.
export async function exportEintraege(art, { datenDir, belegeDir, inboxDir, profileDir, stand, code, pruefung, erstellt = new Date() }) {
  if (!EXPORT_ARTEN.includes(art)) throw new Error(`unbekannte Exportart "${art}"`);
  const eintraege = [];
  if (art !== "daten") eintraege.push(...(await sammleOrdner(belegeDir, "Belege")));
  if (art !== "dokumente") {
    // Das Manifest der Generation ist Verwaltung, kein Bestand.
    eintraege.push(...(await sammleOrdner(datenDir, "Daten")).filter((e) => e.name !== `Daten/${MANIFEST}`));
    const transaktionen = await liesJsonlOptional(join(datenDir, "transaktionen.jsonl"));
    const kategorien = await liesJsonOptional(join(datenDir, "kategorien.json"), []);
    const konten = await liesJsonOptional(join(datenDir, "konten.json"), []);
    eintraege.push(pufferEintrag("Daten/buchungen.csv", buchungenCsv(transaktionen, { kategorien, konten })));
  }
  if (art === "komplett") {
    if (inboxDir) eintraege.push(...(await sammleOrdner(inboxDir, "Inbox")));
    if (profileDir) eintraege.push(...(await sammleOrdner(profileDir, "Importprofile")));
    eintraege.push(pufferEintrag(SICHERUNG_MANIFEST, `${JSON.stringify(sicherungsManifest(eintraege, { stand, code, pruefung, erstellt }), null, 2)}\n`, erstellt));
  }
  return eintraege;
}

function sicherungsManifest(eintraege, { stand, code, pruefung, erstellt }) {
  const bereiche = {};
  for (const [bereich, ziel] of Object.entries(SICHERUNG_BEREICHE)) {
    const drin = eintraege.filter((e) => e.name.startsWith(`${bereich}/`) && !ABGELEITET.includes(e.name));
    bereiche[bereich] = { ziel, dateien: drin.length, bytes: drin.reduce((s, e) => s + e.groesse, 0) };
  }
  return {
    art: "komplett",
    erstellt: erstellt.toISOString(),
    stand: stand ?? null,
    code: code ?? null,
    pruefung: pruefung ?? null,
    bereiche,
    abgeleitet: ABGELEITET,
    dateien: eintraege.map((e) => ({ name: e.name, groesse: e.groesse })),
  };
}
