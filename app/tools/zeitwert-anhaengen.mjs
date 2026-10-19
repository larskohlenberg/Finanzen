// app/tools/zeitwert-anhaengen.mjs
//
// Haengt Zeitwerte (Kontostand, Marktwert, Rueckkaufswert, ...) an
// zeitwerte.jsonl an — statt eines rohen Datei-Edits (Review 1B.3).
// Je (Entitaet, ID, Feld, Standdatum) gilt ein Wert:
// - gleicher Wert schon da: unveraendert, nichts geschrieben;
// - anderer Wert schon da: Warnung, nichts geschrieben — erst mit
//   `korrigieren` wird der vorhandene Eintrag ersetzt (Korrekturpfad, z. B.
//   ein Auszug wurde falsch abgelesen). Ein zweiter, anderer Wert am selben Tag
//   waere ohnehin ein Validatorfehler.
import { fileURLToPath } from "node:url";
import { pflichtDatenroot } from "./data-root.mjs";
import { beginneLauf } from "./lib/fingerabdruck.mjs";
import { meldeNachSchreiben, validatorBefunde } from "./lib/validator-befund.mjs";
import { argJson, argWert, liesJsonl, protokolliere, schreibeJsonl } from "./lib/bestand-datei.mjs";

const schluessel = (zw) => [zw.entitaet, zw.entitaet_id, zw.feld, zw.standdatum].join("|");

export function zeitwertAnhaengen({ zeitwerte, eintraege, korrigieren = false }) {
  const liste = [...zeitwerte];
  const bericht = { neu: 0, unveraendert: 0, korrigiert: 0, abweichend: [] };
  for (const eintrag of eintraege) {
    if (!eintrag || typeof eintrag !== "object" || Array.isArray(eintrag)) throw new Error("jeder Eintrag muss ein Objekt sein");
    const k = schluessel(eintrag);
    const index = liste.findIndex((zw) => schluessel(zw) === k);
    if (index < 0) {
      liste.push(eintrag);
      bericht.neu += 1;
      continue;
    }
    const alt = liste[index];
    if (alt.wert === eintrag.wert) {
      // Gleicher Wert: hoechstens Qualitaet/Quelle nachbessern, nur mit korrigieren.
      if (korrigieren && JSON.stringify(alt) !== JSON.stringify(eintrag)) {
        liste[index] = eintrag;
        bericht.korrigiert += 1;
      } else {
        bericht.unveraendert += 1;
      }
      continue;
    }
    bericht.abweichend.push({ entitaet: eintrag.entitaet, entitaet_id: eintrag.entitaet_id, feld: eintrag.feld, standdatum: eintrag.standdatum, vorhanden: alt.wert, neu: eintrag.wert });
    if (korrigieren) {
      liste[index] = eintrag;
      bericht.korrigiert += 1;
    }
  }
  const blockiert = bericht.abweichend.length > 0 && !korrigieren;
  return { zeitwerte: blockiert ? zeitwerte : liste, bericht, blockiert };
}

const USAGE = `Aufruf: node app/tools/zeitwert-anhaengen.mjs DATENROOT --eintraege='[{...}]' [--korrigieren] [--notiz=...] [--schreiben]

Abweichender Wert am selben Standdatum: Warnung, geschrieben wird erst mit --korrigieren.`;

async function main() {
  const argv = process.argv.slice(2);
  const eintraege = argJson(argv, "eintraege");
  if (!Array.isArray(eintraege)) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  const schreiben = argv.includes("--schreiben");
  const korrigieren = argv.includes("--korrigieren");
  const root = pflichtDatenroot(argv.find((a) => !a.startsWith("--")));
  await beginneLauf(fileURLToPath(root), schreiben);

  const url = new URL("zeitwerte.jsonl", root);
  const out = zeitwertAnhaengen({ zeitwerte: await liesJsonl(url), eintraege, korrigieren });
  console.log(JSON.stringify({ modus: schreiben && !out.blockiert ? "geschrieben" : "vorschau", ...out.bericht }, null, 2));
  if (out.blockiert) {
    console.error(`Warnung: ${out.bericht.abweichend.length} Zeitwert(e) haben am selben Standdatum schon einen anderen Wert — nichts geschrieben. Ist der neue Wert richtig, mit korrigieren ersetzen.`);
    process.exitCode = 2;
    return;
  }
  if (!schreiben) {
    console.log("\nVorschau — nichts geschrieben. Mit --schreiben anwenden.");
    return;
  }
  if (out.bericht.neu === 0 && out.bericht.korrigiert === 0) return;
  const vorher = await validatorBefunde(root);
  await schreibeJsonl(url, out.zeitwerte);
  await protokolliere(root, {
    zeitpunkt: new Date().toISOString(),
    anlass: "zeitwert",
    ids: [...new Set(eintraege.map((e) => e.entitaet_id))],
    neu: out.bericht.neu,
    korrigiert: out.bericht.korrigiert,
    notiz: argWert(argv, "notiz") ?? `zeitwert-anhaengen: ${out.bericht.neu} neu, ${out.bericht.korrigiert} korrigiert`,
  });
  await meldeNachSchreiben(root, vorher, "Validierung nach zeitwert-anhaengen fehlgeschlagen");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
