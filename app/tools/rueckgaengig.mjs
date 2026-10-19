#!/usr/bin/env node
// app/tools/rueckgaengig.mjs
// Macht den letzten Schreibvorgang rueckgaengig (ADR 0035, E1 Schritt 6): Die
// vorherige Generation (oder --schritte=N zurueck, oder --ziel=G000041) wird
// als NEUE Generation wiederhergestellt. Keine Generation wird geloescht oder
// ueberschrieben; ein Undo laesst sich also selbst wieder rueckgaengig machen.
//
//   node app/tools/rueckgaengig.mjs data/master [--schritte=N | --ziel=G000041]
//        [--schreiben [--fingerabdruck=G000042]] [--json]
//
// Ohne --schreiben nur Vorschau: welche Dateien sich gegenueber dem aktuellen
// Stand aendern wuerden, je Datei die Zahl der Datensaetze (neu, geaendert,
// entfernt) und bei Datensaetzen mit Id (Buchungen u. a.) die IDs. Geschrieben
// wird unter der Schreibsperre; der Validator prueft den wiederhergestellten
// Stand, neue Fehler verhindern die Uebernahme. Im einfachen Ordner (vor der
// Umstellung auf Generationen) gibt es keinen Verlauf.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pflichtDatenroot } from "./data-root.mjs";
import { bestandFingerabdruck } from "./lib/fingerabdruck.mjs";
import { aktuelleId, findeBasis, generationsOrdner, OhneVerlauf, oeffneGeneration, oeffneLeser, rueckgaengig, rueckgaengigZiel, StandVeraltet } from "./lib/generationen.mjs";
import { SperreBelegt } from "./lib/schreibsperre.mjs";
import { neueMeldungen, validatorBefunde, VERALTET_EXITCODE, GESPERRT_EXITCODE } from "./lib/schreiblauf.mjs";
import { aenderungsText, vergleicheLeser } from "./lib/verlauf.mjs";

const zeitText = (iso) => (iso ? `${iso.replace("T", " ").slice(0, 19)} UTC` : "Zeit unbekannt");
const beschreibe = async (leser) => {
  const m = await leser.manifest();
  return `G${leser.id} (${zeitText(m.zeit)}, ${m.wer ?? "Werkzeug unbekannt"})`;
};

// Vorschau: Ziel und Diff aktuell -> Ziel. Liefert { text, ziel, aktuell, aenderungen }.
export async function rueckgaengigVorschau(datenroot, { schritte = 1, ziel } = {}) {
  const basis = await findeBasis(datenroot);
  const zielId = await rueckgaengigZiel(basis, { schritte, ziel });
  const aktuell = await oeffneLeser(basis);
  try {
    const wieder = await oeffneGeneration(basis, zielId);
    try {
      const aenderungen = await vergleicheLeser(aktuell, wieder);
      const zeilen = [
        `Vorschau (nichts geschrieben): rueckgaengig auf ${path.basename(datenroot)}`,
        `Aktueller Stand: ${await beschreibe(aktuell)}`,
        `Wiederhergestellt wuerde: ${await beschreibe(wieder)}, als neue Generation`,
        "Aenderungen gegenueber dem aktuellen Stand:",
        ...aenderungsText(aenderungen),
      ];
      if (!aenderungen.length) zeilen.push("Das Ziel gleicht dem aktuellen Stand; ein Schreiblauf legt keine neue Generation an.");
      zeilen.push(`Fingerabdruck: G${aktuell.id}`);
      return { text: zeilen.join("\n"), aktuell: aktuell.id, ziel: zielId, aenderungen };
    } finally {
      await wieder.schliessen();
    }
  } finally {
    await aktuell.schliessen();
  }
}

// Schreiblauf. erwartet: Fingerabdruck aus der Vorschau ("G000042"), Pflicht:
// ohne ihn nahme "schritte" zurueck, was gerade aktuell ist, nicht das, was die
// Vorschau gezeigt hat. Liefert { text, exitCode } (0 ok, 1 Fehler/verworfen,
// 3 gesperrt, 4 veraltet).
export async function rueckgaengigSchreiben(datenroot, { schritte = 1, ziel, erwartet, wer = "rueckgaengig" } = {}) {
  if (!erwartet) return { text: "rueckgaengig schreibt nur mit dem Fingerabdruck der Vorschau (CLI --fingerabdruck=G..., MCP fingerabdruck). Erst die Vorschau ansehen.", exitCode: 1 };
  const basis = await findeBasis(datenroot);
  let vorher = [];
  let nachher = [];
  let r;
  try {
    r = await rueckgaengig(basis, {
      schritte,
      ziel,
      wer,
      erwartet: String(erwartet).replace(/^G/, ""),
      // Unter der Sperre ist der bisher aktuelle Stand noch aktuell.
      pruefe: async (ordner) => {
        vorher = await validatorBefunde(generationsOrdner(basis, await aktuelleId(basis)));
        nachher = await validatorBefunde(ordner);
        return neueMeldungen(vorher, nachher);
      },
    });
  } catch (error) {
    if (error instanceof SperreBelegt) return { text: error.message, exitCode: GESPERRT_EXITCODE };
    if (error instanceof StandVeraltet) {
      return { text: `Bestand ${path.basename(datenroot)} hat sich seit der Vorschau geaendert (Fingerabdruck ${erwartet}, jetzt G${error.aktuell}). Nichts geschrieben; Vorschau neu ansehen und mit dem neuen Fingerabdruck schreiben.`, exitCode: VERALTET_EXITCODE };
    }
    throw error;
  }
  if (r.verworfen) {
    return {
      text: `Wiederherstellen von G${r.ziel} abgewiesen: Validator meldet ${r.fehler.length} neue(n) Fehler, nichts uebernommen, der Bestand ist unveraendert:\n${r.fehler.slice(0, 30).map((f) => `- ${f}`).join("\n")}`,
      exitCode: 1,
    };
  }
  if (r.id === r.vorher) return { text: `G${r.ziel} gleicht dem aktuellen Stand G${r.vorher}; keine neue Generation angelegt.`, exitCode: 0 };
  const befund = nachher.length === 0 ? "Validator: gueltig." : `Validator: ${nachher.length} Fehler, alle schon vorher vorhanden.`;
  const zeilen = [
    `Wiederhergestellt: Inhalt von G${r.ziel} ist jetzt der neue Stand G${r.id} (vorher G${r.vorher}; ${r.geaendert.length} Datei(en) geaendert: ${r.geaendert.join(", ")}).`,
    befund,
    `Rueckgaengig machen laesst sich das mit --ziel=G${r.vorher}.`,
  ];
  if (r.warnung) zeilen.push(r.warnung);
  return { text: zeilen.join("\n"), exitCode: 0, ergebnis: r };
}

function zahlArg(argv, name) {
  const roh = argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (roh === undefined) return undefined;
  if (!/^\d+$/.test(roh)) throw new Error(`--${name} braucht eine ganze Zahl: ${roh}`);
  return Number(roh);
}

async function main(argv) {
  const datenroot = path.resolve(fileURLToPath(pflichtDatenroot(argv.find((a) => !a.startsWith("--")))));
  const schritte = zahlArg(argv, "schritte") ?? 1;
  const ziel = argv.find((a) => a.startsWith("--ziel="))?.slice("--ziel=".length);
  if (ziel !== undefined && zahlArg(argv, "schritte") !== undefined) throw new Error("Entweder --schritte oder --ziel angeben, nicht beides.");
  const erwartet = argv.find((a) => a.startsWith("--fingerabdruck="))?.slice("--fingerabdruck=".length);
  try {
    if (!argv.includes("--schreiben")) {
      const v = await rueckgaengigVorschau(datenroot, { schritte, ziel });
      if (argv.includes("--json")) console.log(JSON.stringify({ aktuell: v.aktuell, ziel: v.ziel, aenderungen: v.aenderungen, fingerabdruck: await bestandFingerabdruck(datenroot) }, null, 2));
      else console.log(`${v.text} (zum Schreiben mit --schreiben --fingerabdruck=G${v.aktuell})`);
      return;
    }
    const r = await rueckgaengigSchreiben(datenroot, { schritte, ziel, erwartet, wer: "rueckgaengig.mjs" });
    (r.exitCode ? console.error : console.log)(r.text);
    process.exitCode = r.exitCode;
  } catch (error) {
    if (!(error instanceof OhneVerlauf)) throw error;
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
