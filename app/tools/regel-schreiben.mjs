// app/tools/regel-schreiben.mjs
//
// Legt Kategorisierungsregeln an oder aendert sie, ausschliesslich ueber den
// Probelauf: erst rechnen (regel-probelauf.mjs), nur ohne Block schreiben. Die
// ID vergibt das Werkzeug (naechste REG-NNN), nicht der Agent. Damit haengt die
// Sicherheit des Gates nicht mehr daran, dass ein Agent den Probelauf vor einem
// Datei-Edit wirklich gemacht hat (Review 1B.3).
//
// Neue Regel: ohne regel_id; status (Default aktiv) und erstellt_am (Default
// heute) setzt das Werkzeug. Eine aktive neue Regel braucht eine Belegstufe
// (Regeln nur mit Beleg, AGENTS.md). Aenderung: mit regel_id einer bestehenden
// Regel; genannte Felder ersetzen, `null` entfernt ein Feld.
//
// Schreibt nur kategorisierungsregeln.json und eine Zeile ins agent_log.jsonl.
// Die Buchungen bewertet danach `recategorize.mjs` (MCP nachkategorisieren) neu.
import { fileURLToPath } from "node:url";
import { pflichtDatenroot } from "./data-root.mjs";
import { probelauf } from "./regel-probelauf.mjs";
import { beginneLauf } from "./lib/fingerabdruck.mjs";
import { meldeNachSchreiben, validatorBefunde } from "./lib/validator-befund.mjs";
import { argJson, argWert, liesJsonl, liesJsonListe, naechsteId, protokolliere, schreibeJsonListe } from "./lib/bestand-datei.mjs";
import { localTodayIso } from "../liquiditaet.mjs";

export function regelSchreiben({ transaktionen, bestandsRegeln, kategorieIds, regeln, heute }) {
  const fehler = [];
  const bekannt = new Map(bestandsRegeln.map((r) => [r.regel_id, r]));
  const kandidaten = [];
  const neu = [];
  const geaendert = [];
  let vergeben = [...bestandsRegeln];

  for (const [i, eingabe] of regeln.entries()) {
    if (!eingabe || typeof eingabe !== "object" || Array.isArray(eingabe)) {
      fehler.push(`regeln[${i}]: muss ein Objekt sein`);
      continue;
    }
    if (eingabe.regel_id !== undefined) {
      const alt = bekannt.get(eingabe.regel_id);
      if (!alt) {
        fehler.push(`${eingabe.regel_id}: keine bestehende Regel (neue Regeln ohne regel_id anlegen)`);
        continue;
      }
      const regel = { ...alt };
      for (const [feld, wert] of Object.entries(eingabe)) {
        if (wert === null) delete regel[feld];
        else regel[feld] = wert;
      }
      kandidaten.push(regel);
      geaendert.push(regel.regel_id);
      continue;
    }
    const regel_id = naechsteId(vergeben, "regel_id", "REG");
    const regel = { regel_id, status: "aktiv", erstellt_am: heute, ...eingabe };
    for (const [feld, wert] of Object.entries(regel)) if (wert === null) delete regel[feld];
    if (regel.status === "aktiv" && !regel.belegstufe) fehler.push(`${regel_id}: aktive neue Regel braucht belegstufe (E1-E4) — Regeln nur mit Beleg`);
    vergeben = [...vergeben, regel];
    kandidaten.push(regel);
    neu.push(regel_id);
  }

  const lauf = probelauf({ transaktionen, bestandsRegeln, kandidaten, kategorieIds, aenderung: true });
  const blockiert = fehler.length > 0 || lauf.blockiert;
  if (blockiert) return { regeln: bestandsRegeln, neu: [], geaendert: [], fehler, probelauf: lauf, blockiert };

  const ersetzt = new Map(kandidaten.map((r) => [r.regel_id, r]));
  const ergebnis = [...bestandsRegeln.map((r) => ersetzt.get(r.regel_id) ?? r), ...kandidaten.filter((r) => neu.includes(r.regel_id))];
  return { regeln: ergebnis, neu, geaendert, fehler, probelauf: lauf, blockiert };
}

// Bericht ohne Beispielbuchungen (die enthalten Gegenparteien und Betraege).
function kurzbericht(out) {
  const p = out.probelauf;
  return {
    blockiert: out.blockiert,
    neu: out.neu,
    geaendert: out.geaendert,
    fehler: [...out.fehler, ...p.struktur_fehler],
    treffer: p.treffer,
    treffer_bestaetigt: p.treffer_bestaetigt,
    pro_regel: Object.fromEntries(Object.entries(p.pro_regel).map(([id, e]) => [id, { kategorie_id: e.kategorie_id, treffer: e.treffer, treffer_bestaetigt: e.treffer_bestaetigt, verliert_bestaetigt: e.verliert_bestaetigt }])),
    neue_konflikte: p.neue_konflikte,
    wiedervorlagen: p.wiedervorlagen,
    widersprueche: p.widersprueche,
    verlorene_bestaetigte: p.verlorene_bestaetigte,
    unspezifisch: p.unspezifisch,
    ohne_treffer: p.ohne_treffer,
  };
}

const USAGE = `Aufruf: node app/tools/regel-schreiben.mjs DATENROOT --regeln='[{...}]' [--notiz=...] [--schreiben]

Neue Regel ohne regel_id (ID, status aktiv, erstellt_am heute setzt das Werkzeug;
belegstufe Pflicht), Aenderung mit regel_id (null entfernt ein Feld). Schreibt
nur, wenn der Probelauf nicht blockiert. Danach nachkategorisieren.`;

async function main() {
  const argv = process.argv.slice(2);
  const regeln = argJson(argv, "regeln");
  if (!Array.isArray(regeln)) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  const schreiben = argv.includes("--schreiben");
  const root = pflichtDatenroot(argv.find((a) => !a.startsWith("--")));
  await beginneLauf(fileURLToPath(root), schreiben);

  const out = regelSchreiben({
    transaktionen: await liesJsonl(new URL("transaktionen.jsonl", root)),
    bestandsRegeln: await liesJsonListe(new URL("kategorisierungsregeln.json", root), []),
    kategorieIds: (await liesJsonListe(new URL("kategorien.json", root))).map((k) => k.kategorie_id),
    regeln,
    heute: localTodayIso(),
  });
  console.log(JSON.stringify({ modus: schreiben && !out.blockiert ? "geschrieben" : "vorschau", ...kurzbericht(out) }, null, 2));
  if (out.blockiert) {
    console.error("Blockiert — nichts geschrieben.");
    process.exitCode = 2;
    return;
  }
  if (!schreiben) {
    console.log("\nVorschau — nichts geschrieben. Mit --schreiben anwenden, danach nachkategorisieren.");
    return;
  }
  const vorher = await validatorBefunde(root);
  await schreibeJsonListe(new URL("kategorisierungsregeln.json", root), out.regeln);
  await protokolliere(root, {
    zeitpunkt: new Date().toISOString(),
    anlass: "regel-schreiben",
    ids: [...out.neu, ...out.geaendert],
    neu: out.neu,
    geaendert: out.geaendert,
    treffer: out.probelauf.treffer,
    notiz: argWert(argv, "notiz") ?? `regel-schreiben: ${out.neu.length} neu, ${out.geaendert.length} geaendert`,
  });
  await meldeNachSchreiben(root, vorher, "Validierung nach regel-schreiben fehlgeschlagen");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
