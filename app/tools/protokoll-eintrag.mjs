// app/tools/protokoll-eintrag.mjs
//
// Eine Zeile ins Agentenprotokoll (agent_log.jsonl) — fuer Arbeitsschritte, die
// kein Werkzeug selbst protokolliert (Zusammenfassung eines Durchlaufs, eine
// Korrektur von Hand, "Dubletten angesehen"). Statt eines rohen Datei-Edits
// (Review 1B.3): der Eintrag bekommt Zeitpunkt und Herkunft, und die Anlaesse,
// die Werkzeuge maschinell auswerten (z. B. `korrektur` fuer die Lernschleife,
// `freigabe` fuer das Gate), sind reserviert und nicht von Hand faelschbar.
import { fileURLToPath } from "node:url";
import { pflichtDatenroot } from "./data-root.mjs";
import { beginneLauf } from "./lib/fingerabdruck.mjs";
import { argJson, argWert, protokolliere } from "./lib/bestand-datei.mjs";

// Anlaesse, die Werkzeuge schreiben und teils wieder lesen.
export const RESERVIERTE_ANLAESSE = Object.freeze([
  "freigabe", "korrektur", "import", "inbox-lauf", "inbox-verwerfen", "logos", "transaktion-immobilie",
  "regel-schreiben", "stammdatum", "zeitwert", "transfer-extern", "lernen",
]);

// normalisierung: Abstimmung beim Import (reconciliation_differenz,
// reconciliation_erledigt, quelle), die der Pruefbericht auswertet.
const NORMALISIERUNG_FELDER = new Set(["quelle", "reconciliation_differenz", "reconciliation_erledigt"]);

const KONTO = /^KTO-\d{3,}$/;
const text = (w) => typeof w === "string" && w.trim().length > 0;

// Der Pruefbericht hakt offene Abstimmungsdifferenzen je Konto ab; ein
// Abhaken von Hand braucht darum Konto, Bezug und Grund (nachvollziehbar),
// eine Differenz mindestens das Konto.
function pruefeNormalisierung(n) {
  if (n.quelle !== undefined && !text(n.quelle)) throw new Error("normalisierung.quelle muss Text sein");
  if (n.reconciliation_differenz !== undefined) {
    const d = n.reconciliation_differenz;
    if (!d || typeof d !== "object" || Array.isArray(d) || !KONTO.test(d.konto_id ?? "")) throw new Error("normalisierung.reconciliation_differenz braucht ein Objekt mit konto_id");
  }
  if (n.reconciliation_erledigt !== undefined) {
    const liste = Array.isArray(n.reconciliation_erledigt) ? n.reconciliation_erledigt : [n.reconciliation_erledigt];
    if (liste.length === 0) throw new Error("normalisierung.reconciliation_erledigt ist leer");
    for (const e of liste) {
      if (!e || typeof e !== "object" || !KONTO.test(e.konto_id ?? "") || !text(e.bezug) || !text(e.grund)) {
        throw new Error("normalisierung.reconciliation_erledigt braucht je Eintrag konto_id, bezug und grund");
      }
    }
  }
}

export function protokollEintrag({ anlass, notiz, ids, zaehler, normalisierung, dubletten_geprueft, zeitpunkt = new Date().toISOString() }) {
  if (typeof anlass !== "string" || !/^[a-z][a-z0-9-]*$/.test(anlass)) throw new Error("anlass: kurzes Wort in Kleinbuchstaben, z. B. stammdaten");
  if (RESERVIERTE_ANLAESSE.includes(anlass)) throw new Error(`anlass ${anlass} ist reserviert (schreibt das Werkzeug selbst)`);
  if (typeof notiz !== "string" || !notiz.trim()) throw new Error("notiz ist Pflicht");
  const eintrag = { zeitpunkt, anlass, quelle: "protokoll_eintrag", notiz: notiz.trim() };
  if (ids !== undefined) {
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) throw new Error("ids muss eine Liste von IDs sein");
    eintrag.ids = ids;
  }
  if (zaehler !== undefined) {
    if (!zaehler || typeof zaehler !== "object" || Array.isArray(zaehler) || Object.values(zaehler).some((n) => !Number.isInteger(n))) {
      throw new Error("zaehler muss ein Objekt mit ganzen Zahlen sein");
    }
    eintrag.zaehler = zaehler;
  }
  if (normalisierung !== undefined) {
    if (!normalisierung || typeof normalisierung !== "object" || Array.isArray(normalisierung)) throw new Error("normalisierung muss ein Objekt sein");
    const fremd = Object.keys(normalisierung).filter((k) => !NORMALISIERUNG_FELDER.has(k));
    if (fremd.length) throw new Error(`normalisierung: unbekannte Felder ${fremd.join(", ")} (erlaubt: ${[...NORMALISIERUNG_FELDER].join(", ")})`);
    pruefeNormalisierung(normalisierung);
    eintrag.normalisierung = normalisierung;
  }
  if (dubletten_geprueft === true) eintrag.dubletten_geprueft = true;
  return eintrag;
}

const USAGE = `Aufruf: node app/tools/protokoll-eintrag.mjs DATENROOT --anlass=<wort> --notiz=<text> [--ids='["KTO-001"]'] [--zaehler='{"n":1}'] [--dubletten-geprueft] [--schreiben]`;

async function main() {
  const argv = process.argv.slice(2);
  if (!argWert(argv, "anlass")) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  const schreiben = argv.includes("--schreiben");
  const root = pflichtDatenroot(argv.find((a) => !a.startsWith("--")));
  await beginneLauf(fileURLToPath(root), schreiben);
  const eintrag = protokollEintrag({
    anlass: argWert(argv, "anlass"),
    notiz: argWert(argv, "notiz"),
    ids: argJson(argv, "ids"),
    zaehler: argJson(argv, "zaehler"),
    normalisierung: argJson(argv, "normalisierung"),
    dubletten_geprueft: argv.includes("--dubletten-geprueft"),
  });
  console.log(JSON.stringify({ modus: schreiben ? "geschrieben" : "vorschau", eintrag }, null, 2));
  if (!schreiben) {
    console.log("\nVorschau — nichts geschrieben. Mit --schreiben anwenden.");
    return;
  }
  await protokolliere(root, eintrag);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
