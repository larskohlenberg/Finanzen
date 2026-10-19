// app/mcp/metadaten-log.mjs
// Betriebsprotokoll des MCP-Servers (Review D.1). Per SSH-Forced-Command
// landet stderr beim Client; damit der Server selbst nachvollziehbar bleibt,
// geht jede Zeile zusaetzlich nach <Datenort>/logs/mcp-<JJJJ-MM>.log (ohne
// FINANZEN_DATEN: app/data/logs, von Git ausgeschlossen). Nur Metadaten:
// Zeit, Sitzungskennung, Methode, Werkzeugname, Dauer, Fehlerklasse; die
// Aufrufer reichen nie Argumente oder Inhalte herein.
//
// Kein Bestand, darum kein atomares Schreiben (lib/datei.mjs): Zeilen werden
// angehaengt, ein Abbruch kostet hoechstens eine halbe Zeile. Scheitert das
// Schreiben (Platte voll, keine Rechte), laeuft der Server weiter; gemeldet
// wird das einmal auf stderr.
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { physisch } from "../tools/lib/datenort.mjs";

export function metadatenLog(app, { stderr = (z) => process.stderr.write(z), jetzt = () => new Date() } = {}) {
  const sitzung = randomBytes(4).toString("hex");
  const ordner = physisch(app, "data/logs");
  let kaputt = false;
  return function log(text) {
    stderr(`[finanzen-mcp] ${text}\n`);
    if (kaputt) return;
    const zeit = jetzt();
    const datei = path.join(ordner, `mcp-${zeit.toISOString().slice(0, 7)}.log`);
    try {
      mkdirSync(ordner, { recursive: true, mode: 0o750 });
      appendFileSync(datei, `${zeit.toISOString()} s=${sitzung} pid=${process.pid} ${text}\n`, { mode: 0o640 });
    } catch (error) {
      kaputt = true;
      stderr(`[finanzen-mcp] Metadaten-Log nicht schreibbar (${error.code ?? error.name}), weiter nur auf stderr\n`);
    }
  };
}
