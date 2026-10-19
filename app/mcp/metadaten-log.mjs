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
import { appendFileSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { physisch } from "../tools/lib/datenort.mjs";

export function metadatenLog(app, { stderr = (z) => process.stderr.write(z), jetzt = () => new Date() } = {}) {
  const sitzung = randomBytes(4).toString("hex");
  let kaputt = false;
  return function log(text) {
    stderr(`[finanzen-mcp] ${text}\n`);
    if (kaputt) return;
    const zeit = jetzt();
    try {
      // Erst hier aufloesen: ein ungueltiger Datenort meldet sich ueber die
      // Startpruefung, nicht als Absturz beim Laden.
      const ordner = physisch(app, "data/logs");
      const datei = path.join(ordner, `mcp-${zeit.toISOString().slice(0, 7)}.log`);
      // Nur logs/ selbst anlegen, nie den Datenort (nicht eingehaengt, Tippfehler).
      if (!statSync(path.dirname(ordner), { throwIfNoEntry: false })?.isDirectory()) throw Object.assign(new Error("Datenort fehlt"), { code: "ENOENT" });
      try {
        mkdirSync(ordner, { mode: 0o750 });
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
      appendFileSync(datei, `${zeit.toISOString()} s=${sitzung} pid=${process.pid} ${text}\n`, { mode: 0o640 });
    } catch (error) {
      kaputt = true;
      stderr(`[finanzen-mcp] Metadaten-Log nicht schreibbar (${error.code ?? error.name}), weiter nur auf stderr\n`);
    }
  };
}
