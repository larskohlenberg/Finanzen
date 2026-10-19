// prototyp/e1/lese-api.mjs
// Schmale Lese-API je Ansicht, fuer beide Varianten gleich: Der Browser holt
// nicht mehr beim Start den ganzen Rohbestand, sondern je Klick genau das, was
// die Ansicht zeigt, immer aus dem aktuellen Stand.
//
//   GET /api/v1/stand                      -> { stand }
//   GET /api/v1/transaktionen?konto=&kategorie=&von=&bis=&status=&text=&seite=&groesse=
//                                          -> { stand, anzahl, summe, seite, groesse, zeilen }
//   GET /api/v1/kennzahlen?stichtag=JJJJ-MM-TT
//                                          -> { stand, verfuegbares_geld, ... }
//
// Jede Antwort kommt aus EINEM Stand (Generation bzw. SQLite-Lesetransaktion)
// und traegt dessen Kennung als ETag: unveraenderter Stand -> 304 ohne Daten.
// Gerechnet wird mit den bestehenden reinen Modulen (uebersicht-rechnung.mjs,
// abfrage.mjs), nicht mit SQL-Eigenbau.
import path from "node:path";
import { passt } from "../../app/mcp/abfrage.mjs";
import { centsToDecimal, toCents } from "../../app/tools/lib/text.mjs";
import { kontenGruppen, monatsMittel, saldoGeladenerKonten } from "../../app/uebersicht-rechnung.mjs";
import { parseJsonl } from "../../app/data-loader.mjs";
import { mitLeser } from "./generationen.mjs";
import { DB_DATEI, ladeSammlungen, oeffneDb, revision } from "./sqlite-bestand.mjs";

// Nur diese Felder einer Buchung gehen an den Browser (kein dedupe_hash, keine
// rohquelle, keine Regeltreffer).
export const ZEILEN_FELDER = ["transaktion_id", "konto_id", "buchungsdatum", "betrag", "gegenpartei", "verwendungszweck", "kategorie_id", "kategorisierung_status", "ist_transfer", "bemerkung"];
const zeile = (t) => Object.fromEntries(ZEILEN_FELDER.filter((f) => t[f] !== undefined).map((f) => [f, t[f]]));
const absteigend = (a, b) => (a.buchungsdatum < b.buchungsdatum ? 1 : a.buchungsdatum > b.buchungsdatum ? -1 : 0);

// Sammlungen der Kennzahl: genau die, die kontenGruppen und monatsMittel lesen.
export const KENNZAHL_SAMMLUNGEN = ["konten", "transaktionen", "zeitwerte", "kategorien", "vermoegenswerte"];

export function kennzahl(data, stichtag) {
  const gruppen = kontenGruppen(data, stichtag);
  const mittel = monatsMittel(data, stichtag, { vollstaendigBis: gruppen.konten.aeltester });
  return {
    verfuegbares_geld: centsToDecimal(gruppen.konten.summe_cents),
    konten_belegt: `${gruppen.konten.belegt}/${gruppen.konten.gesamt}`,
    summe_geladener_bewegungen: centsToDecimal(saldoGeladenerKonten(data)),
    einnahmen_monatsmittel: centsToDecimal(mittel.einnahmen.mittel_cents),
    ausgaben_monatsmittel: centsToDecimal(mittel.ausgaben.mittel_cents),
  };
}

function seiteAusListe(liste, f, seite, groesse) {
  const treffer = liste.filter((t) => passt(t, f)).sort(absteigend);
  return {
    anzahl: treffer.length,
    summe: centsToDecimal(treffer.reduce((s, t) => s + toCents(t.betrag), 0)),
    zeilen: treffer.slice((seite - 1) * groesse, seite * groesse).map(zeile),
  };
}

// ---------------------------------------------------------------- Variante A

const DATEI = { transaktionen: "transaktionen.jsonl", zeitwerte: "zeitwerte.jsonl" };
const dateiName = (name) => DATEI[name] ?? `${name}.json`;

// Generationen sind unveraenderlich: ein Cache je (Generation, Datei) ist ohne
// Invalidierung korrekt. Er haelt nur die letzten zwei Generationen.
export function backendGenerationen(basis) {
  const cache = new Map();
  return {
    variante: "a",
    lies: (fn) => mitLeser(basis, async (leser) => {
      if (!cache.has(leser.id)) {
        cache.set(leser.id, new Map());
        for (const alt of [...cache.keys()].slice(0, -2)) cache.delete(alt);
      }
      const gen = cache.get(leser.id);
      const sammlung = async (name) => {
        if (!gen.has(name)) {
          const text = await leser.lies(dateiName(name)).catch((e) => (e.code === "ENOENT" ? null : Promise.reject(e)));
          gen.set(name, text === null ? [] : dateiName(name).endsWith(".jsonl") ? parseJsonl(text) : JSON.parse(text));
        }
        return gen.get(name);
      };
      return fn({
        stand: leser.id,
        async sammlungen(namen) {
          return Object.fromEntries(await Promise.all(namen.map(async (n) => [n, await sammlung(n)])));
        },
        async seite(f, seite, groesse) {
          return seiteAusListe(await sammlung("transaktionen"), f, seite, groesse);
        },
      });
    }),
  };
}

// ---------------------------------------------------------------- Variante B

// Eine Verbindung je Prozess; Anfragen laufen nacheinander (node:sqlite ist
// synchron), jede in eigener Lesetransaktion.
export function backendSqlite(ordner) {
  const db = oeffneDb(path.join(ordner, DB_DATEI));
  let kette = Promise.resolve();
  const seiteSql = db.prepare(`SELECT doc FROM transaktionen
    WHERE (:konto IS NULL OR konto_id = :konto) AND (:kategorie IS NULL OR kategorie_id = :kategorie)
      AND (:von IS NULL OR buchungsdatum >= :von) AND (:bis IS NULL OR buchungsdatum <= :bis)
      AND (:status IS NULL OR kategorisierung_status = :status)
    ORDER BY buchungsdatum DESC, pos LIMIT :limit OFFSET :offset`);
  const summeSql = db.prepare(`SELECT count(*) AS anzahl, coalesce(sum(betrag_cent), 0) AS cents FROM transaktionen
    WHERE (:konto IS NULL OR konto_id = :konto) AND (:kategorie IS NULL OR kategorie_id = :kategorie)
      AND (:von IS NULL OR buchungsdatum >= :von) AND (:bis IS NULL OR buchungsdatum <= :bis)
      AND (:status IS NULL OR kategorisierung_status = :status)`);
  const parameter = (f) => ({ konto: f.konto ?? null, kategorie: f.kategorie ?? null, von: f.von ?? null, bis: f.bis ?? null, status: f.status ?? null });
  return {
    variante: "b",
    db,
    schliessen: () => db.close(),
    lies(fn) {
      const lauf = kette.then(async () => {
        db.exec("BEGIN");
        try {
          const stand = String(revision(db));
          return await fn({
            stand,
            sammlungen: (namen) => ladeSammlungen(db, namen),
            seite(f, seite, groesse) {
              const p = parameter(f);
              // Freitext laeuft wie heute ueber normalizeLoose (passt), nicht
              // ueber SQL LIKE: dieselben Treffer wie das MCP-Tool.
              if (f.text || f.betrag_min !== undefined || f.betrag_max !== undefined || f.immobilie || f.ist_transfer !== undefined) {
                const liste = seiteSql.all({ ...p, limit: -1, offset: 0 }).map((z) => JSON.parse(z.doc));
                return seiteAusListe(liste, f, seite, groesse);
              }
              const { anzahl, cents } = summeSql.get(p);
              const zeilen = seiteSql.all({ ...p, limit: groesse, offset: (seite - 1) * groesse }).map((z) => zeile(JSON.parse(z.doc)));
              return { anzahl: Number(anzahl), summe: centsToDecimal(Number(cents)), zeilen };
            },
          });
        } finally {
          db.exec("COMMIT");
        }
      });
      kette = lauf.catch(() => {});
      return lauf;
    },
  };
}

// ---------------------------------------------------------------- HTTP

function filterAus(q) {
  const f = {};
  for (const k of ["konto", "kategorie", "von", "bis", "status", "text"]) if (q.get(k)) f[k] = q.get(k);
  return f;
}

export function leseHandler(backend) {
  return async (req, res) => {
    const url = new URL(req.url, "http://lokal");
    const senden = (status, body, stand) => {
      const kopf = { "content-type": "application/json; charset=utf-8", "cache-control": "no-cache" };
      if (stand !== undefined) kopf.etag = `"${backend.variante}-${stand}"`;
      res.writeHead(status, kopf);
      res.end(body === undefined ? undefined : JSON.stringify(body));
    };
    try {
      if (req.method !== "GET") return senden(405, { fehler: "nur GET" });
      const antwort = await backend.lies(async (snap) => {
        const etag = `"${backend.variante}-${snap.stand}"`;
        if (req.headers["if-none-match"] === etag) return { status: 304, stand: snap.stand };
        if (url.pathname === "/api/v1/stand") return { status: 200, stand: snap.stand, body: { stand: snap.stand } };
        if (url.pathname === "/api/v1/transaktionen") {
          const seite = Math.max(1, Number(url.searchParams.get("seite") ?? 1) || 1);
          const groesse = Math.min(500, Math.max(1, Number(url.searchParams.get("groesse") ?? 50) || 50));
          const teil = await snap.seite(filterAus(url.searchParams), seite, groesse);
          return { status: 200, stand: snap.stand, body: { stand: snap.stand, seite, groesse, ...teil } };
        }
        if (url.pathname === "/api/v1/kennzahlen") {
          const stichtag = url.searchParams.get("stichtag") ?? new Date().toISOString().slice(0, 10);
          const data = await snap.sammlungen(KENNZAHL_SAMMLUNGEN);
          return { status: 200, stand: snap.stand, body: { stand: snap.stand, stichtag, ...kennzahl(data, stichtag) } };
        }
        return { status: 404, body: { fehler: "unbekannt" } };
      });
      senden(antwort.status, antwort.status === 304 ? undefined : antwort.body, antwort.stand);
    } catch (error) {
      senden(500, { fehler: error.message });
    }
  };
}
