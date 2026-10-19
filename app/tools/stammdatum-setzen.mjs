// app/tools/stammdatum-setzen.mjs
//
// Setzt Felder eines Stammdatums oder legt eines an — statt eines rohen
// Datei-Edits (Review 1B.3). Ein Datensatz je Aufruf: typ, id, felder.
// Ohne id entsteht ein neuer Datensatz mit der naechsten freien ID der Klasse.
// `null` entfernt ein Feld. Das ID-Feld ist nicht aenderbar. Ob der Datensatz
// danach gueltig ist, entscheidet der Validator (nach jedem Schreiben).
//
// Nicht hier: Buchungen (Fachwerkzeuge bestaetigen, agent_vorschlag, ...),
// Regeln (regel_schreiben), Zeitwerte (zeitwert_anhaengen), Transfers.
import { fileURLToPath } from "node:url";
import { pflichtDatenroot } from "./data-root.mjs";
import { beginneLauf } from "./lib/fingerabdruck.mjs";
import { meldeNachSchreiben, validatorBefunde } from "./lib/validator-befund.mjs";
import { argJson, argWert, liesJsonListe, naechsteId, protokolliere, schreibeJsonListe } from "./lib/bestand-datei.mjs";

// typ -> Datei, ID-Feld, ID-Praefix.
export const STAMMDATEN = Object.freeze({
  person: { datei: "personen.json", idFeld: "person_id", praefix: "PER" },
  konto: { datei: "konten.json", idFeld: "konto_id", praefix: "KTO" },
  kategorie: { datei: "kategorien.json", idFeld: "kategorie_id", praefix: "KAT" },
  regelzahlung: { datei: "regelzahlungen.json", idFeld: "regelzahlung_id", praefix: "RZ" },
  frist: { datei: "fristen.json", idFeld: "frist_id", praefix: "FR" },
  immobilie: { datei: "immobilien.json", idFeld: "immobilie_id", praefix: "IMM" },
  darlehen: { datei: "darlehen.json", idFeld: "darlehen_id", praefix: "DAR" },
  vermoegenswert: { datei: "vermoegenswerte.json", idFeld: "vermoegenswert_id", praefix: "VMW" },
  vorsorge: { datei: "vorsorge.json", idFeld: "vorsorge_id", praefix: "VS" },
  szenario: { datei: "szenarien.json", idFeld: "szenario_id", praefix: "SZN" },
});

// "Noch zu klaeren" bleibt das letzte Element der Kategorienliste.
const NOCH_ZU_KLAEREN = "KAT-012";

export function stammdatumSetzen({ liste, typ, id, felder }) {
  const art = Object.hasOwn(STAMMDATEN, typ) ? STAMMDATEN[typ] : null;
  if (!art) throw new Error(`Typ ${typ} unbekannt (erlaubt: ${Object.keys(STAMMDATEN).join(", ")})`);
  if (!felder || typeof felder !== "object" || Array.isArray(felder)) throw new Error("felder muss ein Objekt sein");
  if (Object.hasOwn(felder, art.idFeld)) throw new Error(`${art.idFeld} ist nicht aenderbar (neuer Datensatz: ohne id aufrufen)`);

  const aenderung = { typ, id, neu: !id, felder: {} };
  if (id) {
    const index = liste.findIndex((e) => e[art.idFeld] === id);
    if (index < 0) throw new Error(`${id} existiert nicht in ${art.datei}`);
    const alt = liste[index];
    const neu = { ...alt };
    for (const [feld, wert] of Object.entries(felder)) {
      if (wert === null) delete neu[feld];
      else neu[feld] = wert;
      if (JSON.stringify(alt[feld]) !== JSON.stringify(neu[feld])) aenderung.felder[feld] = { vorher: alt[feld] ?? null, nachher: neu[feld] ?? null };
    }
    return { liste: liste.map((e, i) => (i === index ? neu : e)), aenderung };
  }

  const neueId = naechsteId(liste, art.idFeld, art.praefix);
  const datensatz = { [art.idFeld]: neueId };
  for (const [feld, wert] of Object.entries(felder)) {
    if (wert === null) continue;
    datensatz[feld] = wert;
    aenderung.felder[feld] = { vorher: null, nachher: wert };
  }
  aenderung.id = neueId;
  const ende = typ === "kategorie" && liste.at(-1)?.kategorie_id === NOCH_ZU_KLAEREN ? liste.length - 1 : liste.length;
  return { liste: [...liste.slice(0, ende), datensatz, ...liste.slice(ende)], aenderung };
}

const USAGE = `Aufruf: node app/tools/stammdatum-setzen.mjs DATENROOT --typ=<${Object.keys(STAMMDATEN).join("|")}> [--id=ID] --felder='{...}' [--notiz=...] [--schreiben]

Ohne --id: neuer Datensatz mit naechster ID. null entfernt ein Feld.`;

async function main() {
  const argv = process.argv.slice(2);
  const typ = argWert(argv, "typ");
  const felder = argJson(argv, "felder");
  if (!typ || felder === undefined) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  const schreiben = argv.includes("--schreiben");
  const root = pflichtDatenroot(argv.find((a) => !a.startsWith("--")));
  await beginneLauf(fileURLToPath(root), schreiben);

  const art = STAMMDATEN[typ];
  const url = art ? new URL(art.datei, root) : null;
  const out = stammdatumSetzen({ liste: url ? await liesJsonListe(url, []) : [], typ, id: argWert(argv, "id"), felder });
  console.log(JSON.stringify({ modus: schreiben ? "geschrieben" : "vorschau", ...out.aenderung }, null, 2));
  if (!schreiben) {
    console.log("\nVorschau — nichts geschrieben. Mit --schreiben anwenden.");
    return;
  }
  const vorher = await validatorBefunde(root);
  await schreibeJsonListe(url, out.liste);
  await protokolliere(root, {
    zeitpunkt: new Date().toISOString(),
    anlass: "stammdatum",
    ids: [out.aenderung.id],
    typ,
    neu: out.aenderung.neu,
    felder: Object.keys(out.aenderung.felder),
    notiz: argWert(argv, "notiz") ?? `stammdatum-setzen: ${typ} ${out.aenderung.id}`,
  });
  await meldeNachSchreiben(root, vorher, "Validierung nach stammdatum-setzen fehlgeschlagen");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
