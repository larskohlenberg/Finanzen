// app/stand.mjs
//
// Datenstand fuer den App-Server (nur Node, nie im Browser): eine Kennung des
// aktuellen Stands eines Bestands und der Snapshot dazu (alle Dateien aus
// BESTAND_TEILE plus Validator-Befund). Der Browser fragt den Stand ab und
// laedt den Snapshot nur, wenn sich die Kennung geaendert hat (server.mjs:
// GET /api/v1/stand, GET /api/v1/snapshot mit ETag).
//
// Quelle der Kennung ist heute ein Hash ueber Inode, Groesse und mtime der
// Bestandsdateien. Mit Dateigenerationen (E1, Schritt 4) wird sie die
// Generations-ID; dafuer tauscht man nur standKennung aus.
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { BESTAND_TEILE, parseJsonl } from "./data-loader.mjs";
import { strukturSicher, validateMasterData } from "./tools/validate-core.mjs";

// Erhoehen, wenn sich die Form des Snapshots aendert: dann gilt kein alter
// Stand mehr, und Browser mit altem Stand laden neu.
export const SNAPSHOT_FORMAT = 1;
const VERSUCHE = 5;

export async function standKennung(datenDir) {
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

// Liest den Bestand so, dass Kennung und Inhalt zusammenpassen: aendert sich
// der Stand waehrend des Lesens, wird neu gelesen.
export async function leseSnapshot(datenDir) {
  for (let versuch = 1; ; versuch += 1) {
    const vorher = await standKennung(datenDir);
    const texte = await leseTexte(datenDir);
    const nachher = await standKennung(datenDir);
    if (vorher === nachher) return { format: SNAPSHOT_FORMAT, stand: vorher, ...snapshotAusTexten(texte) };
    if (versuch >= VERSUCHE) throw new Error("Bestand aendert sich laufend, kein stabiler Stand");
  }
}

// Je Bestand der zuletzt gebaute Snapshot als fertiger JSON-Text; neu gebaut
// wird nur bei neuem Stand, gleichzeitige Anfragen teilen sich einen Bau.
export function erstelleSnapshotQuelle(datenDir) {
  let letzter = null;
  let bau = null;
  return {
    stand: () => standKennung(datenDir),
    async snapshot() {
      const stand = await standKennung(datenDir);
      if (letzter?.stand === stand) return letzter;
      bau ??= leseSnapshot(datenDir)
        .then((snapshot) => {
          letzter = { stand: snapshot.stand, body: JSON.stringify(snapshot) };
          return letzter;
        })
        .finally(() => { bau = null; });
      return bau;
    },
  };
}
