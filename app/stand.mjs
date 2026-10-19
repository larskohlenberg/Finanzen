// app/stand.mjs
//
// Datenstand fuer den App-Server (nur Node, nie im Browser): eine Kennung des
// aktuellen Stands eines Bestands und der Snapshot dazu (alle Dateien aus
// BESTAND_TEILE plus Validator-Befund), aus dem die Lese-APIs rechnen. Der
// Browser bekommt davon nur die Grunddaten (ohne Buchungen und Transfers),
// fragt den Stand ab und laedt sie nur, wenn sich die Kennung geaendert hat
// (server.mjs: GET /api/v1/stand, GET /api/v1/grunddaten mit ETag).
//
// Quelle der Kennung: im Generationsbestand (ADR 0035) die Generations-Id, der
// Snapshot kommt dann aus einer Lease auf genau diese Generation. Im
// Rueckfallmodus (einfacher Ordner) ein Hash ueber Inode, Groesse und mtime
// der Bestandsdateien; gelesen wird so lange, bis der Stand vorher und
// nachher gleich ist.
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { BESTAND_TEILE, parseJsonl } from "./data-loader.mjs";
import { strukturSicher, validateMasterData } from "./tools/validate-core.mjs";
import { ORDNER, lesestandId, mitLesestand } from "./tools/lib/lesestand.mjs";
import { logoVerzeichnis } from "./logos.mjs";

// Erhoehen, wenn sich die Form des Snapshots aendert: dann gilt kein alter
// Stand mehr, und Browser mit altem Stand laden neu.
export const SNAPSHOT_FORMAT = 1;
const VERSUCHE = 5;

// Generationsbestand: "g<Id>-f<Format>"; einfacher Ordner: 24 Hex-Zeichen.
const generationsStand = (id) => `g${id}-f${SNAPSHOT_FORMAT}`;

export async function standKennung(datenDir) {
  const id = await lesestandId(datenDir);
  return id === ORDNER ? ordnerKennung(datenDir) : generationsStand(id);
}

async function ordnerKennung(datenDir) {
  const hash = createHash("sha256").update(`format:${SNAPSHOT_FORMAT}\n`);
  for (const { datei } of BESTAND_TEILE) {
    const info = await stat(join(datenDir, datei), { bigint: true }).catch((fehler) => {
      if (fehler.code === "ENOENT") return null;
      throw fehler;
    });
    hash.update(info ? `${datei}:${info.ino}:${info.size}:${info.mtimeNs}\n` : `${datei}:-\n`);
  }
  return hash.digest("hex").slice(0, 24);
}

// Reine Funktion: Dateitexte (fehlende Datei = undefined) -> Daten und Befund.
// Eine fehlende Pflichtdatei oder kaputtes JSON wirft (wie frueher im Browser);
// strukturelle Fehler und Regelverstoesse stehen im Befund, die Daten sind
// strukturell lesbar (strukturSicher), damit die Ansichten nicht abstuerzen.
export function snapshotAusTexten(texte) {
  const roh = {};
  for (const { datei, schluessel, ersatz } of BESTAND_TEILE) {
    const text = texte[datei];
    if (text === undefined) {
      if (ersatz === undefined) throw new Error(`${datei}: fehlt`);
      roh[schluessel] = structuredClone(ersatz);
      continue;
    }
    if (datei.endsWith(".jsonl")) {
      roh[schluessel] = parseJsonl(text, datei);
      continue;
    }
    try {
      roh[schluessel] = JSON.parse(text);
    } catch (fehler) {
      throw new Error(`${datei}: ${fehler.message}`);
    }
  }
  const { valid, errors } = validateMasterData(roh);
  return { validierung: { valid, errors }, daten: strukturSicher(roh) };
}

async function leseTexte(datenDir) {
  const texte = {};
  await Promise.all(BESTAND_TEILE.map(async ({ datei }) => {
    try {
      texte[datei] = await readFile(join(datenDir, datei), "utf8");
    } catch (fehler) {
      if (fehler.code !== "ENOENT") throw fehler;
    }
  }));
  return texte;
}

// Liest den Bestand so, dass Kennung und Inhalt zusammenpassen: aus einer
// Lease auf eine Generation, im einfachen Ordner mit Neulesen, wenn sich der
// Stand waehrend des Lesens aendert.
export async function leseSnapshot(datenDir) {
  const ausLease = await mitLesestand(datenDir, async (leser) => {
    if (leser.id === ORDNER) return null;
    return { format: SNAPSHOT_FORMAT, stand: generationsStand(leser.id), ...snapshotAusTexten(await leseTexte(leser.ordner)) };
  });
  if (ausLease) return ausLease;
  for (let versuch = 1; ; versuch += 1) {
    const vorher = await ordnerKennung(datenDir);
    const texte = await leseTexte(datenDir);
    const nachher = await ordnerKennung(datenDir);
    if (vorher === nachher) return { format: SNAPSHOT_FORMAT, stand: vorher, ...snapshotAusTexten(texte) };
    if (versuch >= VERSUCHE) throw new Error("Bestand aendert sich laufend, kein stabiler Stand");
  }
}

// Was der Browser vom Bestand bekommt: alles ausser Buchungen und Transfers
// (die rechnen die Lese-APIs, lese-api.mjs), dazu je Regelzahlung die Id des
// Logos, das sie von ihren gebuchten Gegenparteien erbt (logos.mjs).
// Importauftraege tragen abgewiesene Rohzeilen: nur ueber GET /api/v1/importe.
export const NUR_SERVER = Object.freeze(["transaktionen", "transfers", "importauftraege"]);

export function grunddatenAus(snapshot) {
  const daten = Object.fromEntries(Object.entries(snapshot.daten).filter(([schluessel]) => !NUR_SERVER.includes(schluessel)));
  const verzeichnis = logoVerzeichnis(snapshot.daten);
  daten.regelzahlung_logos = Object.fromEntries((snapshot.daten.regelzahlungen ?? []).map((rz) => [rz.regelzahlung_id, verzeichnis.fuerRegelzahlung(rz)?.logo_id ?? null]));
  return { format: snapshot.format, stand: snapshot.stand, validierung: snapshot.validierung, daten };
}

// Je Bestand der zuletzt gelesene Stand: die geparsten Daten (fuer die
// schmalen APIs, lese-api.mjs), die Grunddaten als JSON-Text erst bei Bedarf.
// Neu gelesen wird nur bei neuem Stand; gleichzeitige Anfragen teilen sich das
// Lesen. Abgeleitete Werte merkt sich merke() je Stand.
export function erstelleSnapshotQuelle(datenDir) {
  let letzter = null;
  let bau = null;
  async function bestand() {
    const stand = await standKennung(datenDir);
    if (letzter?.stand === stand) return letzter;
    bau ??= leseSnapshot(datenDir)
      .then((snapshot) => {
        const abgeleitet = new Map();
        letzter = {
          stand: snapshot.stand,
          snapshot,
          daten: snapshot.daten,
          validierung: snapshot.validierung,
          merke: (schluessel, rechne) => {
            if (!abgeleitet.has(schluessel)) abgeleitet.set(schluessel, rechne());
            return abgeleitet.get(schluessel);
          },
        };
        return letzter;
      })
      .finally(() => { bau = null; });
    return bau;
  }
  return {
    stand: () => standKennung(datenDir),
    bestand,
    async grunddaten() {
      const eintrag = await bestand();
      eintrag.body ??= JSON.stringify(grunddatenAus(eintrag.snapshot));
      return { stand: eintrag.stand, body: eintrag.body };
    },
  };
}
