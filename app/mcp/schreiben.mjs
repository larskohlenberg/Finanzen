// app/mcp/schreiben.mjs
// Jeder schreibende Vorgang laeuft ueber einen Entwurf (ADR 0035,
// lib/generationen.mjs): Das Werkzeug schreibt in den Entwurf, danach prueft
// der Validator. Nur ohne NEUE Validatorfehler und ohne Werkzeugfehler wird der
// Entwurf veroeffentlicht (Vertrag: Werkzeugfehler = kein Commit); sonst bleibt
// der Bestand unveraendert. Bricht der Prozess ab, raeumt der naechste
// Schreiber den Entwurf weg.
// Verschiebungen in data/inbox/ und Belege/ liegen ausserhalb des Datenroots
// und werden nicht zurueckgenommen.
//
// Der ganze Zyklus laeuft unter der prozessuebergreifenden Schreibsperre des
// Bestands (im Basisordner). Bei einem einfachen Ordner (Rueckfallmodus) wird
// Datei fuer Datei per rename uebernommen, bei Generationen atomar.
import { realpathSync } from "node:fs";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { findeBasis, mitSchreiber } from "../tools/lib/generationen.mjs";
import { SperreBelegt } from "../tools/lib/schreibsperre.mjs";
import { bestandFingerabdruck, veraltetMeldung } from "../tools/lib/fingerabdruck.mjs";
import { validatorBefunde, validatorFehler } from "../tools/lib/schreiblauf.mjs";
import { neueBefunde } from "../tools/validate-core.mjs";

const ort = ({ code, sammlung, objekt, feld }) => ({ code, sammlung, objekt, feld });

// Fingerabdruck aus der Vorschau, gegen den ein Schreibaufruf laufen soll
// (rufeWerkzeug setzt ihn je Aufruf). mitRollback prueft ihn unter der Sperre.
export const erwarteterStand = new AsyncLocalStorage();
// Name des laufenden Tools, fuer Sperre und Verlauf ("MCP freigabe").
export const werkzeugName = new AsyncLocalStorage();

export async function validiere(datenrootPfad) {
  const fehler = await validatorFehler(datenrootPfad);
  return { gueltig: fehler.length === 0, fehler };
}

class Abbruch extends Error {
  constructor(ergebnis) {
    super("Abbruch");
    this.ergebnis = ergebnis;
  }
}

function echt(pfad) {
  try {
    return realpathSync(pfad);
  } catch {
    return path.resolve(pfad);
  }
}

// Bildet einen Pfad im Datenroot auf den Entwurf ab; Pfade ausserhalb (Inbox
// und Belege von data/master) bleiben, wie sie sind.
export function entwurfsAbbildung(datenrootPfad, entwurf) {
  const wurzeln = [...new Set([path.resolve(datenrootPfad), echt(datenrootPfad)])];
  return (pfad) => {
    for (const wurzel of wurzeln) {
      const rel = path.relative(wurzel, path.resolve(pfad));
      if (rel === "") return entwurf;
      if (!rel.startsWith("..") && !path.isAbsolute(rel)) return path.join(entwurf, rel);
    }
    return pfad;
  };
}

// fn(s) liefert ein Tool-Ergebnis { text, isError? }; s = { ordner (Entwurf),
// sperre ({ kennung } fuer Kindprozesse), pfad(absolut) (Abbildung in den
// Entwurf) }. Zurueck kommt dasselbe Ergebnis, ergaenzt um den
// Validatorbefund. rueckrollungBeiFehler:false nur fuer Laeufe, die Dateien
// ausserhalb des Datenroots verschieben (dann verhindert nur ein neuer
// Validatorfehler die Uebernahme). Alte Validatorfehler zaehlen nie.
export async function mitRollback(datenrootPfad, fn, { rueckrollungBeiFehler = true } = {}) {
  const erwartet = erwarteterStand.getStore();
  let vorher = [];
  let ergebnis;
  let nachher = [];
  let neu = [];
  let r;
  try {
    r = await mitSchreiber(await findeBasis(datenrootPfad), async (tx) => {
      if (erwartet) {
        const aktuell = await bestandFingerabdruck(datenrootPfad);
        if (aktuell !== erwartet) throw new Abbruch({ text: veraltetMeldung(datenrootPfad, erwartet, aktuell), isError: true, struktur: { fehler: "stand-veraltet", erwartet, aktuell } });
      }
      vorher = await validatorBefunde(tx.ordner);
      try {
        ergebnis = await fn({ ordner: tx.ordner, sperre: tx.sperre ? { kennung: tx.sperre } : null, pfad: entwurfsAbbildung(datenrootPfad, tx.ordner) });
      } catch (error) {
        ergebnis = { text: `Fehler: ${error.message}`, isError: true };
      }
      if (ergebnis.isError === true && rueckrollungBeiFehler) {
        // Scheiterte das Werkzeug an seinem eigenen Validatorlauf, den Befund mitgeben.
        const imEntwurf = neueBefunde(vorher, await validatorBefunde(tx.ordner));
        // Nur wenn das Werkzeug selbst am Validator scheiterte, sind das "neue" Fehler;
        // sonst ist der Entwurf halbfertig und die Befunde nur ein Hinweis.
        const amValidator = ergebnis.struktur?.fehler === "validator";
        const liste = imEntwurf.slice(0, 50).map(ort);
        const befund = { fehler: ergebnis.struktur?.fehler ?? "werkzeug", ...(imEntwurf.length ? { validator: amValidator ? { neu: liste } : { im_entwurf: liste } } : {}) };
        throw new Abbruch({ ...ergebnis, text: `${ergebnis.text}\n\nWerkzeugfehler — kein Commit, der Bestand ist unveraendert.`, struktur: { ...(ergebnis.struktur ?? {}), ...befund, uebernommen: false } });
      }
    }, {
      wer: werkzeugName.getStore() ? `MCP ${werkzeugName.getStore()}` : "MCP",
      pruefe: async (ordner) => {
        nachher = await validatorBefunde(ordner);
        neu = neueBefunde(vorher, nachher);
        return neu.map((b) => b.meldung);
      },
    });
  } catch (error) {
    if (error instanceof Abbruch) return error.ergebnis;
    if (error instanceof SperreBelegt) return { text: error.message, isError: true, struktur: { fehler: "gesperrt" } };
    throw error;
  }
  if (r.verworfen) {
    return {
      isError: true,
      text: `${ergebnis.text}\n\nValidator meldet ${r.fehler.length} neue(n) Fehler — nichts uebernommen, der Bestand ist unveraendert:\n${r.fehler.slice(0, 30).map((f) => `- ${f}`).join("\n")}\n\nHinweis: Verschiebungen und Loeschungen in data/inbox/ und Belege/ werden nicht zurueckgenommen.`,
      struktur: { ...(ergebnis.struktur ?? {}), fehler: "validator", uebernommen: false, validator: { neu: neu.slice(0, 50).map(ort) } },
    };
  }
  const befund = nachher.length === 0 ? "Validator nach dem Schreiben: gueltig." : `Validator nach dem Schreiben: ${nachher.length} Fehler, alle schon vorher vorhanden.`;
  const stand = r.id !== r.vorher ? `\nNeuer Stand: G${r.id}.` : "";
  return { ...ergebnis, text: `${ergebnis.text}\n\n${befund}${stand}${r.warnung ? `\n${r.warnung}` : ""}`, struktur: { ...(ergebnis.struktur ?? {}), uebernommen: true, stand: r.id !== r.vorher ? `G${r.id}` : null, validator: { neu: [], bestehend: nachher.length } } };
}
