// @ts-check
// app/mcp/vertrag.mjs
// Agentenvertrag aus einer Quelle (Review 3.11): die kurze Pflichtanleitung
// (MCP-instructions und Kopf von docs/agent-context.md) und die Ordnung der
// Werkzeuge nach Aufgaben. Themenwissen steht in agent-context.md und ist je
// Abschnitt als Ressource finanzen://docs/agent-context/<thema> lesbar.
//
// Aendert sich eine Pflichtregel: hier aendern, dann
//   node app/mcp/vertrag.mjs --schreiben
// schreibt den Abschnitt in agent-context.md neu (tests/agentenvertrag.test.mjs
// prueft, dass beide gleich sind).
import { readFile } from "node:fs/promises";
import { ersetzeDatei } from "../tools/lib/datei.mjs";
import { fileURLToPath } from "node:url";

export const KATEGORIE_REGEL = "Regeln nur mit Beleg (Belegleiter E1-E4). Einzelbuchungen ohne Beleg schaetzt der Agent: plausibelste Kategorie als Einzelvorschlag (agent_vorschlag); KAT-012 nur, wenn keine Kategorie plausibel ist.";

/** @type {readonly { id: string, text: string }[]} */
export const PFLICHT = Object.freeze([
  { id: "lesen", text: "Auswertungen und Statusfragen direkt per Tool beantworten (kennzahlen, status, transaktionen_abfragen, pruefbericht), ohne Vorlektuere; fuer „Wie stehen wir?“ zuerst kennzahlen." },
  { id: "datenarbeit", text: "Vor Datenarbeit (Import, Kategorisieren, Regeln, Freigabe, jedes Schreiben) die Ressource finanzen://docs/agent-context und den passenden Skill-Prompt lesen; Themen einzeln unter finanzen://docs/agent-context/<thema>." },
  { id: "vorschau", text: "Alle Tool-Laeufe sind ohne schreiben:true eine Vorschau; sie nennen einen Fingerabdruck des gelesenen Bestands. Beim Schreiben diesen als fingerabdruck mitgeben: hat sich der Bestand seither geaendert, wird abgewiesen." },
  { id: "validator", text: "Nach jedem Schreiben laeuft der Validator; bei neuen Fehlern oder einem Werkzeugfehler wird nichts uebernommen. Ergebnisse tragen structuredContent (ok, modus, fingerabdruck, fehler, Befunde mit Code, Objekt und Feld)." },
  { id: "fachwerkzeuge", text: "Buchungen, Transfers, Regeln und Agentenprotokoll nur ueber die Fachwerkzeuge aendern (datei_schreiben/datei_ersetzen weisen sie ab); bestaetigen nur nach ausdruecklicher Entscheidung des Nutzers." },
  { id: "kategorie", text: KATEGORIE_REGEL },
  { id: "echtdaten", text: "Echte Namen, Betraege, IBANs, Bank- und Haendlernamen gehoeren nie in Repo, Doku oder Commit-Texte; konkrete Werte ins Agentenprotokoll (protokoll_eintrag)." },
]);

// Werkzeuge nach Aufgaben: Reihenfolge von tools/list und Titel je Werkzeug.
/** @type {readonly { id: string, titel: string, werkzeuge: string[] }[]} */
export const AUFGABEN = Object.freeze([
  { id: "auswerten", titel: "Auswerten", werkzeuge: ["status", "kennzahlen", "plan_ist", "transaktionen_abfragen", "pruefbericht", "verlauf"] },
  { id: "lesen", titel: "Lesen", werkzeuge: ["datei_lesen", "dateien_suchen"] },
  { id: "import", titel: "Importieren", werkzeuge: ["inbox", "import", "transfers", "transfer_extern", "regelzahlungen_zuordnen", "personenbezug", "immobilienbezug", "inbox_verwerfen", "inbox_zurueckholen"] },
  { id: "kategorisieren", titel: "Kategorisieren", werkzeuge: ["regel_vorschlag", "regel_probelauf", "regel_schreiben", "nachkategorisieren", "agent_vorschlag", "freigabe", "bestaetigen", "lernen"] },
  { id: "stammdaten", titel: "Stammdaten", werkzeuge: ["stammdatum_setzen", "zeitwert_anhaengen", "logos"] },
  { id: "belege", titel: "Belege", werkzeuge: ["beleg_ablegen", "beleg_teilen", "beleg_ergaenzen", "beleg_verwerfen", "belege_umziehen", "belege_text"] },
  { id: "protokoll", titel: "Protokoll und Rueckgaengig", werkzeuge: ["protokoll_eintrag", "rueckgaengig"] },
  { id: "dateien", titel: "Dateien (Inbox, Importprofile, uebrige)", werkzeuge: ["datei_schreiben", "datei_ersetzen"] },
]);

/** @param {string} name */
export function aufgabeVon(name) {
  return AUFGABEN.find((a) => a.werkzeuge.includes(name)) ?? null;
}

/** @param {{ datenrootRel: string, recht: string }} ctx */
export function pflichtAnleitung(ctx) {
  return [`Finanzmodell, Datenroot ${ctx.datenrootRel}, Recht: ${ctx.recht}.`, ...PFLICHT.map((r) => r.text)].join(" ");
}

const START = "<!-- vertrag:pflicht:start (erzeugt aus app/mcp/vertrag.mjs) -->";
const ENDE = "<!-- vertrag:pflicht:ende -->";

export function pflichtMarkdown() {
  return [
    START,
    "## Pflicht in Kuerze",
    "",
    ...PFLICHT.map((r) => `- ${r.text}`),
    "",
    `Werkzeuge nach Aufgaben: ${AUFGABEN.map((a) => `**${a.titel}** (${a.werkzeuge.join(", ")})`).join("; ")}.`,
    ENDE,
  ].join("\n");
}

// Setzt den Pflichtabschnitt nach der Titelzeile ein bzw. ersetzt ihn.
/** @param {string} text */
export function setzePflichtAbschnitt(text) {
  const a = text.indexOf(START);
  const e = text.indexOf(ENDE);
  if (a >= 0 && e > a) return `${text.slice(0, a)}${pflichtMarkdown()}${text.slice(e + ENDE.length)}`;
  const titelEnde = text.indexOf("\n") + 1;
  return `${text.slice(0, titelEnde)}\n${pflichtMarkdown()}\n${text.slice(titelEnde)}`;
}

// Themen von agent-context.md: je "## "-Abschnitt (samt Unterabschnitten) eine
// Ressource; der Pflichtabschnitt selbst ist keines.
/** @param {string} text */
export function themenAus(text) {
  const ohnePflicht = text.replace(new RegExp(`${START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${ENDE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), "");
  const teile = ohnePflicht.split(/\n(?=## )/).slice(1);
  return teile.map((t) => {
    const titel = t.slice(3, t.indexOf("\n") >= 0 ? t.indexOf("\n") : undefined).trim();
    const slug = titel.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return { slug, titel, text: `${t.trimEnd()}\n` };
  });
}

async function main() {
  const datei = fileURLToPath(new URL("../docs/agent-context.md", import.meta.url));
  const alt = await readFile(datei, "utf8");
  const neu = setzePflichtAbschnitt(alt);
  if (neu === alt) {
    console.log("agent-context.md: Pflichtabschnitt aktuell.");
    return;
  }
  if (!process.argv.includes("--schreiben")) {
    console.log("agent-context.md: Pflichtabschnitt veraltet. Mit --schreiben neu schreiben.");
    process.exitCode = 1;
    return;
  }
  await ersetzeDatei(datei, neu);
  console.log("agent-context.md: Pflichtabschnitt neu geschrieben.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
