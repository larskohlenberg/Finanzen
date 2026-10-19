// app/mcp/schreiben.mjs
// Schreibschutz um jeden schreibenden Vorgang: Masterdateien vorher kopieren,
// danach validieren, bei NEUEN Validatorfehlern oder einem Werkzeugfehler
// zurueckspielen (Vertrag: Werkzeugfehler = kein Commit). Das ist keine
// Transaktion: bricht der Prozess selbst ab, bleibt der Zwischenstand.
// Verschiebungen in data/inbox/ und Belege/ liegen ausserhalb des Datenroots
// und werden nicht zurueckgerollt.
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadMasterData, validateMasterData } from "../tools/validator.mjs";

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
  await cp(datenrootPfad, ziel, { recursive: true });
  return ziel;
}

async function spieleZurueck(kopie, datenrootPfad) {
  for (const name of await readdir(datenrootPfad)) {
    await rm(path.join(datenrootPfad, name), { recursive: true, force: true });
  }
  await cp(kopie, datenrootPfad, { recursive: true });
}

// fn liefert ein Tool-Ergebnis { text, isError? }. Zurueck kommt dasselbe,
// ergaenzt um Validator- und ggf. Rollback-Befund. rueckrollungBeiFehler:false
// nur fuer Laeufe, die Dateien ausserhalb des Datenroots verschieben (dann
// setzt nur ein neuer Validatorfehler zurueck). Ein schon vorher ungueltiger
// Bestand setzt ebenfalls nur bei neuen Validatorfehlern zurueck.
export async function mitRollback(datenrootPfad, fn, { rueckrollungBeiFehler = true } = {}) {
  const vorher = await validiere(datenrootPfad);
  const kopie = await kopiereDatenroot(datenrootPfad);
  let sicherungBehalten = false;
  try {
    let ergebnis;
    try {
      ergebnis = await fn();
    } catch (error) {
      ergebnis = { text: `Fehler: ${error.message}`, isError: true };
    }
    const nachher = await validiere(datenrootPfad);
    const bekannt = new Set(vorher.fehler);
    const neu = nachher.fehler.filter((f) => !bekannt.has(f));
    // War der Bestand schon vorher ungueltig, melden die CLIs auch alte
    // Validatorfehler mit Exitcode 1; dann setzt nur ein neuer Fehler zurueck.
    const werkzeugfehler = ergebnis.isError === true && rueckrollungBeiFehler && vorher.gueltig;
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
