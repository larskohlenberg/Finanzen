// app/mcp/schreiben.mjs
// Schreibschutz um jeden schreibenden Vorgang: Masterdateien vorher kopieren,
// danach validieren, bei NEUEN Validatorfehlern oder einem Werkzeugfehler
// zurueckspielen (Vertrag: Werkzeugfehler = kein Commit). Das ist keine
// Transaktion: bricht der Prozess selbst ab, bleibt der Zwischenstand.
// Verschiebungen in data/inbox/ und Belege/ liegen ausserhalb des Datenroots
// und werden nicht zurueckgerollt.
//
// Der ganze Zyklus (Vorher-Pruefung, Sicherung, Schreiben, Pruefen,
// Zurueckspielen) laeuft unter der prozessuebergreifenden Schreibsperre des
// Bestands. Zurueckgespielt wird Datei fuer Datei (atomar per rename), nie
// durch Leeren des Datenroots: Leser sehen jede Datei alt oder neu, nie fehlend.
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";
import { SPERRDATEI, SperreBelegt, mitSperre } from "../tools/lib/schreibsperre.mjs";
import { bestandFingerabdruck, veraltetMeldung } from "../tools/lib/fingerabdruck.mjs";
import { loadMasterData, validateMasterData } from "../tools/validator.mjs";

const istSperrdatei = (name) => name.startsWith(SPERRDATEI);

// Fingerabdruck aus der Vorschau, gegen den ein Schreibaufruf laufen soll
// (rufeWerkzeug setzt ihn je Aufruf). mitRollback prueft ihn unter der Sperre.
export const erwarteterStand = new AsyncLocalStorage();

export async function validiere(datenrootPfad) {
  try {
    const ergebnis = validateMasterData(await loadMasterData(pathToFileURL(`${datenrootPfad}${path.sep}`)));
    return { gueltig: ergebnis.valid, fehler: ergebnis.errors };
  } catch (error) {
    return { gueltig: false, fehler: [`Masterdaten nicht lesbar: ${error.message}`] };
  }
}

export async function kopiereDatenroot(datenrootPfad) {
  const ziel = await mkdtemp(path.join(tmpdir(), "finanzen-mcp-"));
  await cp(datenrootPfad, ziel, { recursive: true, filter: (quelle) => !istSperrdatei(path.basename(quelle)) });
  return ziel;
}

async function gleicherInhalt(a, b) {
  const [x, y] = await Promise.all([stat(a), stat(b).catch(() => null)]);
  if (!y?.isFile() || x.size !== y.size) return false;
  const [p, q] = await Promise.all([readFile(a), readFile(b)]);
  return p.equals(q);
}

// Ziel auf den Stand der Kopie bringen: Ueberzaehliges entfernen, Geaendertes
// per Temp-Datei + rename ersetzen, Unveraendertes nicht anfassen.
async function spieleZurueck(kopie, ziel) {
  const soll = new Map((await readdir(kopie, { withFileTypes: true })).map((e) => [e.name, e]));
  for (const e of await readdir(ziel, { withFileTypes: true })) {
    if (istSperrdatei(e.name)) continue;
    const k = soll.get(e.name);
    if (!k || k.isDirectory() !== e.isDirectory()) await rm(path.join(ziel, e.name), { recursive: true, force: true });
  }
  for (const [name, k] of soll) {
    const von = path.join(kopie, name);
    const nach = path.join(ziel, name);
    if (k.isDirectory()) {
      await mkdir(nach, { recursive: true });
      await spieleZurueck(von, nach);
    } else if (!(await gleicherInhalt(von, nach))) {
      const temp = path.join(ziel, `.${name}.rueck-${process.pid}`);
      await writeFile(temp, await readFile(von), { mode: (await stat(von)).mode & 0o7777 });
      await rename(temp, nach);
    }
  }
}

// fn liefert ein Tool-Ergebnis { text, isError? }. Zurueck kommt dasselbe,
// ergaenzt um Validator- und ggf. Rollback-Befund. rueckrollungBeiFehler:false
// nur fuer Laeufe, die Dateien ausserhalb des Datenroots verschieben (dann
// setzt nur ein neuer Validatorfehler zurueck). Alte Validatorfehler zaehlen
// nie: weder hier noch im Exitcode der CLIs (lib/validator-befund.mjs).
export async function mitRollback(datenrootPfad, fn, { rueckrollungBeiFehler = true } = {}) {
  try {
    return await mitSperre(datenrootPfad, (sperre) => zyklus(datenrootPfad, fn, sperre, rueckrollungBeiFehler), { wer: "MCP" });
  } catch (error) {
    if (error instanceof SperreBelegt) return { text: error.message, isError: true };
    throw error;
  }
}

// fn bekommt die Sperre (oder null, wenn sie geerbt ist); ihre kennung reicht
// der Aufrufer an Kindprozesse weiter.
async function zyklus(datenrootPfad, fn, sperre, rueckrollungBeiFehler) {
  const erwartet = erwarteterStand.getStore();
  if (erwartet) {
    const aktuell = await bestandFingerabdruck(datenrootPfad);
    if (aktuell !== erwartet) return { text: veraltetMeldung(datenrootPfad, erwartet, aktuell), isError: true };
  }
  const vorher = await validiere(datenrootPfad);
  const kopie = await kopiereDatenroot(datenrootPfad);
  let sicherungBehalten = false;
  try {
    let ergebnis;
    try {
      ergebnis = await fn(sperre);
    } catch (error) {
      ergebnis = { text: `Fehler: ${error.message}`, isError: true };
    }
    const nachher = await validiere(datenrootPfad);
    const bekannt = new Set(vorher.fehler);
    const neu = nachher.fehler.filter((f) => !bekannt.has(f));
    const werkzeugfehler = ergebnis.isError === true && rueckrollungBeiFehler;
    if (neu.length === 0 && !werkzeugfehler) {
      const befund = nachher.gueltig ? "Validator nach dem Schreiben: gueltig." : `Validator nach dem Schreiben: ${nachher.fehler.length} Fehler, alle schon vorher vorhanden.`;
      return { ...ergebnis, text: `${ergebnis.text}\n\n${befund}` };
    }
    try {
      await spieleZurueck(kopie, datenrootPfad);
    } catch (error) {
      // Der Master kann jetzt teilweise fehlen: die Sicherung ist die einzige
      // Quelle fuer die Wiederherstellung und bleibt liegen.
      sicherungBehalten = true;
      return {
        isError: true,
        text: `${ergebnis.text}\n\n${neu.length ? `Validator meldet ${neu.length} neue(n) Fehler` : "Werkzeugfehler"}, Zurueckspielen fehlgeschlagen (${error.message}). Masterstand von Hand aus der Sicherung wiederherstellen. Sicherung: ${kopie}`,
      };
    }
    const befund = neu.length
      ? `Validator meldet ${neu.length} neue(n) Fehler — Masterstand wurde zurueckgesetzt:\n${neu.slice(0, 30).map((f) => `- ${f}`).join("\n")}`
      : "Werkzeugfehler — kein Commit, Masterstand wurde zurueckgesetzt.";
    return {
      isError: true,
      text: `${ergebnis.text}\n\n${befund}\n\nHinweis: Verschiebungen und Loeschungen in data/inbox/ und Belege/ werden nicht zurueckgerollt.`,
    };
  } finally {
    if (!sicherungBehalten) await rm(kopie, { recursive: true, force: true });
  }
}
