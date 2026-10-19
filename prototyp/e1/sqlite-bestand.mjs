// prototyp/e1/sqlite-bestand.mjs
// Prototyp E1, Variante B: der Bestand als SQLite-Datei ueber node:sqlite
// (eingebaut, keine npm-Abhaengigkeit).
//
// Schema: je Sammlung eine Tabelle mit
//   pos  INTEGER PRIMARY KEY  -- Reihenfolge wie in der Datei
//   id   TEXT UNIQUE          -- fachliche ID (z. B. konto_id), wo vorhanden
//   doc  TEXT                 -- der Datensatz als JSON, Schluesselreihenfolge
//                                und optionale Felder unveraendert
// plus Spalten fuer Abfragen und Constraints (konto_id, buchungsdatum,
// betrag_cent ...). CHECKs binden jede Spalte an das Feld im doc, damit beide
// nie auseinanderlaufen; Fremdschluessel sind DEFERRABLE (geprueft beim COMMIT).
// Betraege: im doc der exakte Decimal-String, in betrag_cent Integer-Cent
// (toCents). Nie REAL.
//
// JSON/JSONL bleibt Import-, Export- und Demoformat (importiere/exportiere).
import { DatabaseSync } from "node:sqlite";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { toCents } from "../../app/tools/lib/text.mjs";
import { mitSperre } from "../../app/tools/lib/schreibsperre.mjs";
import { halt } from "./generationen.mjs";

export const DB_DATEI = "bestand.sqlite";
export const FORMATVERSION = "1";

const ref = (tabelle) => `REFERENCES ${tabelle}(id) DEFERRABLE INITIALLY DEFERRED`;

// spalten: name -> [SQL-Definition, Wert aus doc, CHECK gegen doc oder null]
const feld = (name) => (d) => d[name] ?? null;
const gleich = (name) => `${name} IS doc->>'$.${name}'`;

export const SAMMLUNGEN = [
  { name: "personen", datei: "personen.json", id: "person_id" },
  { name: "konten", datei: "konten.json", id: "konto_id" },
  { name: "kategorien", datei: "kategorien.json", id: "kategorie_id" },
  {
    name: "kategorisierungsregeln", datei: "kategorisierungsregeln.json", id: "regel_id",
    spalten: { kategorie_id: [`TEXT ${ref("kategorien")}`, feld("kategorie_id"), gleich("kategorie_id")] },
  },
  {
    name: "transaktionen", datei: "transaktionen.jsonl", id: "transaktion_id",
    spalten: {
      konto_id: [`TEXT NOT NULL ${ref("konten")}`, feld("konto_id"), gleich("konto_id")],
      buchungsdatum: ["TEXT NOT NULL", feld("buchungsdatum"), gleich("buchungsdatum")],
      betrag_cent: ["INTEGER NOT NULL CHECK (typeof(betrag_cent) = 'integer')", (d) => toCents(d.betrag), "json_type(doc, '$.betrag') = 'text'"],
      kategorie_id: [`TEXT ${ref("kategorien")}`, feld("kategorie_id"), gleich("kategorie_id")],
      kategorisierung_status: ["TEXT", feld("kategorisierung_status"), gleich("kategorisierung_status")],
    },
    indizes: ["buchungsdatum", "konto_id, buchungsdatum", "kategorie_id"],
  },
  {
    name: "transfers", datei: "transfers.json", id: "transfer_id",
    spalten: {
      abgang_transaktion_id: [`TEXT ${ref("transaktionen")}`, feld("abgang_transaktion_id"), gleich("abgang_transaktion_id")],
      zugang_transaktion_id: [`TEXT ${ref("transaktionen")}`, feld("zugang_transaktion_id"), gleich("zugang_transaktion_id")],
    },
  },
  {
    name: "regelzahlungen", datei: "regelzahlungen.json", id: "regelzahlung_id",
    spalten: {
      konto_id: [`TEXT ${ref("konten")}`, feld("konto_id"), gleich("konto_id")],
      kategorie_id: [`TEXT ${ref("kategorien")}`, feld("kategorie_id"), gleich("kategorie_id")],
    },
  },
  { name: "fristen", datei: "fristen.json", id: "frist_id" },
  { name: "szenarien", datei: "szenarien.json", id: "szenario_id" },
  { name: "immobilien", datei: "immobilien.json", id: "immobilie_id" },
  { name: "darlehen", datei: "darlehen.json", id: "darlehen_id" },
  { name: "vermoegenswerte", datei: "vermoegenswerte.json", id: "vermoegenswert_id" },
  { name: "vorsorge", datei: "vorsorge.json", id: "vorsorge_id" },
  {
    name: "zeitwerte", datei: "zeitwerte.jsonl", id: null,
    spalten: { entitaet_id: ["TEXT", feld("entitaet_id"), gleich("entitaet_id")] },
    indizes: ["entitaet_id"],
  },
  { name: "logos", datei: "logos.json", id: "logo_id" },
  { name: "agent_log", datei: "agent_log.jsonl", id: null },
];
const NACH_DATEI = new Map(SAMMLUNGEN.map((s) => [s.datei, s]));
const NACH_NAME = new Map(SAMMLUNGEN.map((s) => [s.name, s]));

function schemaSql() {
  const teile = [
    "CREATE TABLE IF NOT EXISTS meta (schluessel TEXT PRIMARY KEY, wert TEXT NOT NULL) STRICT",
    // Jede Datei des Bestands in Reihenfolge; art sagt, wo der Inhalt liegt.
    // json/roh: Inhalt hier (z. B. farben.json als Objekt, README.md).
    "CREATE TABLE IF NOT EXISTS dateien (name TEXT PRIMARY KEY, art TEXT NOT NULL CHECK (art IN ('liste', 'jsonl', 'json', 'roh')), inhalt BLOB) STRICT",
  ];
  for (const s of SAMMLUNGEN) {
    const spalten = Object.entries(s.spalten ?? {});
    const defs = [
      "pos INTEGER PRIMARY KEY",
      ...(s.id ? ["id TEXT NOT NULL UNIQUE"] : []),
      "doc TEXT NOT NULL CHECK (json_valid(doc))",
      ...spalten.map(([n, [def]]) => `${n} ${def}`),
      ...(s.id ? [`CHECK (id IS doc->>'$.${s.id}')`] : []),
      ...spalten.filter(([, [, , check]]) => check).map(([, [, , check]]) => `CHECK (${check})`),
    ];
    teile.push(`CREATE TABLE IF NOT EXISTS ${s.name} (\n  ${defs.join(",\n  ")}\n)`);
    for (const ix of s.indizes ?? []) teile.push(`CREATE INDEX IF NOT EXISTS ix_${s.name}_${ix.replace(/\W+/g, "_")} ON ${s.name} (${ix})`);
  }
  return `${teile.join(";\n")};`;
}

export function oeffneDb(datei) {
  const db = new DatabaseSync(datei);
  // WAL: Leser sehen einen festen Stand, waehrend ein Schreiber arbeitet.
  // synchronous=FULL: ein bestaetigter COMMIT ueberlebt Stromausfall.
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 10000;");
  db.exec(schemaSql());
  return db;
}

function einfuegen(db, s, docs) {
  const spalten = Object.entries(s.spalten ?? {});
  const namen = ["pos", ...(s.id ? ["id"] : []), "doc", ...spalten.map(([n]) => n)];
  const stmt = db.prepare(`INSERT INTO ${s.name} (${namen.join(", ")}) VALUES (${namen.map(() => "?").join(", ")})`);
  const haelfte = Math.floor(docs.length / 2);
  docs.forEach((d, i) => {
    if (i === haelfte) halt("halb");
    stmt.run(i + 1, ...(s.id ? [d[s.id] ?? null] : []), JSON.stringify(d), ...spalten.map(([, [, wert]]) => wert(d)));
  });
}

function liesSammlung(db, s) {
  return db.prepare(`SELECT doc FROM ${s.name} ORDER BY pos`).all().map((z) => JSON.parse(z.doc));
}

const parseJsonl = (text) => text.split(/\r?\n/).filter((z) => z.trim()).map((z) => JSON.parse(z));

export function revision(db) {
  return Number(db.prepare("SELECT wert FROM meta WHERE schluessel = 'revision'").get()?.wert ?? 0);
}

function erhoeheRevision(db) {
  db.prepare("INSERT INTO meta (schluessel, wert) VALUES ('revision', ?) ON CONFLICT (schluessel) DO UPDATE SET wert = excluded.wert").run(String(revision(db) + 1));
}

// Lesetransaktion: alles in fn sieht denselben Stand (WAL-Snapshot).
export function schnappschuss(db, fn) {
  db.exec("BEGIN");
  try {
    db.prepare("SELECT 1 FROM meta LIMIT 1").get(); // Snapshot jetzt festhalten
    return fn();
  } finally {
    db.exec("COMMIT");
  }
}

// Laedt Sammlungen in derselben Form wie loadMasterData; ohne namen alle.
// Innerhalb von schnappschuss/mitSchreiber aufrufen, sonst je Tabelle ein Stand.
export function ladeSammlungen(db, namen = SAMMLUNGEN.map((s) => s.name)) {
  const daten = {};
  for (const name of namen) {
    const s = NACH_NAME.get(name);
    if (s) daten[name] = liesSammlung(db, s);
    else {
      const zeile = db.prepare("SELECT inhalt FROM dateien WHERE name = ? AND art = 'json'").get(`${name}.json`);
      if (zeile) daten[name] = JSON.parse(Buffer.from(zeile.inhalt).toString("utf8"));
    }
  }
  return daten;
}

// ---------------------------------------------------------------- Import/Export

// JSON-Ordner -> DB in einer Transaktion (ersetzt den ganzen Inhalt).
export async function importiere(db, ordner) {
  const eintraege = (await readdir(ordner, { withFileTypes: true })).filter((e) => e.isFile() && !e.name.startsWith(".")).map((e) => e.name).sort();
  const inhalte = await Promise.all(eintraege.map((n) => readFile(path.join(ordner, n))));
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("DELETE FROM dateien");
    for (const s of SAMMLUNGEN) db.exec(`DELETE FROM ${s.name}`);
    const dateiStmt = db.prepare("INSERT INTO dateien (name, art, inhalt) VALUES (?, ?, ?)");
    eintraege.forEach((name, i) => {
      const s = NACH_DATEI.get(name);
      const text = inhalte[i].toString("utf8");
      if (s && name.endsWith(".jsonl")) {
        dateiStmt.run(name, "jsonl", null);
        einfuegen(db, s, parseJsonl(text));
      } else if (s && Array.isArray(JSON.parse(text))) {
        dateiStmt.run(name, "liste", null);
        einfuegen(db, s, JSON.parse(text));
      } else if (name.endsWith(".json")) {
        dateiStmt.run(name, "json", inhalte[i]);
      } else {
        dateiStmt.run(name, "roh", inhalte[i]);
      }
    });
    db.prepare("INSERT OR REPLACE INTO meta (schluessel, wert) VALUES ('formatversion', ?)").run(FORMATVERSION);
    erhoeheRevision(db);
    halt("import-vor-commit");
    db.exec("COMMIT");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

// Kanonische Schreibweise der heutigen Werkzeuge: Listen mit 2 Leerzeichen,
// JSONL eine Zeile je Datensatz, jeweils mit abschliessendem Zeilenumbruch.
export function dateiText(art, docs) {
  if (art === "jsonl") return docs.length ? `${docs.map((d) => JSON.stringify(d)).join("\n")}\n` : "";
  return `${JSON.stringify(docs, null, 2)}\n`;
}

// DB -> Dateiinhalte aus EINEM Stand. Liefert Map name -> Buffer.
export function exportiereInhalte(db) {
  return schnappschuss(db, () => {
    const dateien = new Map();
    for (const { name, art, inhalt } of db.prepare("SELECT name, art, inhalt FROM dateien ORDER BY name").all()) {
      if (art === "json" || art === "roh") dateien.set(name, Buffer.from(inhalt));
      else dateien.set(name, Buffer.from(dateiText(art, liesSammlung(db, NACH_DATEI.get(name))), "utf8"));
    }
    return { revision: revision(db), dateien };
  });
}

export async function exportiere(db, ziel) {
  const { revision: rev, dateien } = exportiereInhalte(db);
  await mkdir(ziel, { recursive: true });
  for (const [name, inhalt] of dateien) await writeFile(path.join(ziel, name), inhalt);
  return rev;
}

// ---------------------------------------------------------------- Schreiber

// Ein Schreibvorgang: Schreibsperre des Bestands (wie heute) + BEGIN
// IMMEDIATE. fn(tx) liest und ersetzt Sammlungen; pruefe(daten) bekommt den
// neuen Stand noch in der Transaktion und kann mit einer Fehlerliste
// abbrechen. Werkzeugfehler, Pruefungsfehler, verletzte Constraints oder ein
// Absturz: ROLLBACK, nichts sichtbar.
export async function mitSchreiber(ordner, fn, { pruefe, wer = "e1-sqlite", wartenMs } = {}) {
  return mitSperre(ordner, async () => {
    const db = oeffneDb(path.join(ordner, DB_DATEI));
    try {
      db.exec("BEGIN IMMEDIATE");
      halt("begonnen");
      const vorher = revision(db);
      const tx = {
        db,
        lies: (name) => ladeSammlungen(db, [name])[name],
        ersetze(name, docs) {
          const s = NACH_NAME.get(name);
          db.exec(`DELETE FROM ${s.name}`);
          einfuegen(db, s, docs);
        },
        fuegeHinzu(name, doc) {
          const s = NACH_NAME.get(name);
          const pos = Number(db.prepare(`SELECT coalesce(max(pos), 0) + 1 AS p FROM ${s.name}`).get().p);
          const spalten = Object.entries(s.spalten ?? {});
          const namen = ["pos", ...(s.id ? ["id"] : []), "doc", ...spalten.map(([n]) => n)];
          db.prepare(`INSERT INTO ${s.name} (${namen.join(", ")}) VALUES (${namen.map(() => "?").join(", ")})`)
            .run(pos, ...(s.id ? [doc[s.id] ?? null] : []), JSON.stringify(doc), ...spalten.map(([, [, wert]]) => wert(doc)));
        },
      };
      try {
        await fn(tx);
        halt("vor-pruefung");
        if (pruefe) {
          const fehler = await pruefe(ladeSammlungen(db, [...SAMMLUNGEN.map((s) => s.name), "farben"]));
          if (fehler?.length) {
            db.exec("ROLLBACK");
            return { revision: vorher, vorher, verworfen: true, fehler };
          }
        }
        erhoeheRevision(db);
        halt("vor-commit");
        db.exec("COMMIT");
      } catch (error) {
        if (db.isTransaction) db.exec("ROLLBACK");
        throw error;
      }
      halt("nach-commit");
      return { revision: vorher + 1, vorher };
    } finally {
      db.close();
    }
  }, { wer, ...(wartenMs ? { wartenMs } : {}) });
}

// Sicherung als eine konsistente Datei (VACUUM INTO liest aus einem Stand).
export function sichere(db, ziel) {
  db.prepare("VACUUM INTO ?").run(ziel);
}

export function integritaet(db) {
  return {
    integrity: db.prepare("PRAGMA integrity_check").all().map((z) => z.integrity_check),
    fremdschluessel: db.prepare("PRAGMA foreign_key_check").all(),
  };
}

export { schemaSql };
