import { computeVermoegenChecks } from "./vermoegen.mjs";
import { localTodayIso } from "./liquiditaet.mjs";

export const forbiddenPromptPatterns = [
  /CONTEXT\.md/,
  /docs\/adr/,
  /docs\/superpowers/,
  /Repo-Root/i,
  /Projektroot/i,
];

const SKILLS = {
  validationErrors: "docs/skills/validierung-agent.md",
  importErrors: "docs/skills/import-agent.md",
  openCategories: "docs/skills/kategorisierungsregel-pflege.md",
  suggestedCategories: "docs/skills/import-durchlauf.md",
  suggestedRegularPayments: "docs/skills/regelzahlung-agent.md",
  wealthChecks: "docs/skills/stammdaten-erfassung-agent.md",
  regularPayments: "docs/skills/regelzahlung-agent.md",
  vorsorge: "docs/skills/vorsorge-erfassung-agent.md",
};

const VORSORGE_CHECK_ARTS = new Set(["vorsorge-ungeprueft", "vorsorge-wiedervorlage", "vorsorge-wechsel"]);

function countBy(items, predicate) {
  return Array.isArray(items) ? items.filter((item) => item != null && predicate(item)).length : 0;
}

function wealthChecksFor(data, options = {}) {
  if (Array.isArray(options.vermoegenChecks)) return options.vermoegenChecks;
  return computeVermoegenChecks(data, options.today || localTodayIso());
}

function validationErrorCount(data) {
  return data.validation?.valid === false ? (data.validation?.errors?.length ?? 0) : 0;
}

function validationSummary(data) {
  return {
    validationErrors: validationErrorCount(data),
    importErrors: Array.isArray(data.importfehler) ? data.importfehler.length : 0,
    openCategories: countBy(data.transaktionen, (tx) => tx.kategorisierung_status === "offen"),
    suggestedCategories: countBy(data.transaktionen, (tx) => tx.kategorisierung_status === "vorgeschlagen"),
    suggestedRegularPayments: countBy(data.regelzahlungen, (rz) => rz.status === "vorgeschlagen"),
    wealthChecks: 0,
  };
}

function promptDataContext(data) {
  const dataMode = data.metadata?.dataMode === "demo" ? "demo" : "live";
  return {
    dataMode,
    dataRoot: dataMode === "demo" ? "data/demo" : "data/master",
  };
}

export function buildStatusSummary(data, options = {}) {
  const checks = wealthChecksFor(data, options);
  return {
    validationErrors: validationErrorCount(data),
    importErrors: data.importfehler?.length ?? 0,
    openCategories: countBy(data.transaktionen, (tx) => tx.kategorisierung_status === "offen"),
    suggestedCategories: countBy(data.transaktionen, (tx) => tx.kategorisierung_status === "vorgeschlagen"),
    suggestedRegularPayments: countBy(data.regelzahlungen, (rz) => rz.status === "vorgeschlagen"),
    wealthChecks: checks.length,
  };
}

function summaryLines(summary) {
  return [
    `- Validierungsfehler: ${summary.validationErrors}`,
    `- Importfehler: ${summary.importErrors}`,
    `- Offene Kategorien: ${summary.openCategories}`,
    `- Vorgeschlagene Kategorien: ${summary.suggestedCategories}`,
    `- Vorgeschlagene Regelzahlungen: ${summary.suggestedRegularPayments}`,
    `- Vermoegens-/Liquiditaetschecks: ${summary.wealthChecks}`,
  ].join("\n");
}

// Live-Daten liegen auf dem Server und sind nur ueber den MCP-Server `finanzen`
// erreichbar; dort heissen die Skills wie ihre Datei ohne `.md`. Die CLI-Fassung
// gilt fuer die lokalen Demodaten.
function skillName(skillPath) {
  return skillPath.replace(/^.*\//, "").replace(/\.md$/, "");
}

function basePrompt({ title, count, summary, skillPath, extraSkillPaths = [], instructions, dataContext }) {
  const mcp = dataContext.dataMode === "live";
  const skillLines = [skillPath, ...extraSkillPaths]
    .filter(Boolean)
    .map((path) => `- ${mcp ? skillName(path) : path}`)
    .join("\n");
  const skillBlock = skillLines
    ? `\n\n${mcp ? "Betriebsanweisung(en) als MCP-Prompt des Servers `finanzen`" : "Betriebsanweisung(en)"}:\n${skillLines}`
    : "";
  const kanal = mcp
    ? [
      "Die Daten liegen auf dem Server. Arbeite ausschliesslich ueber den MCP-Server `finanzen` (Tools `mcp__finanzen__*`), nicht per Shell und nicht auf lokalen Dateien. Ist der MCP-Server nicht verbunden, brich ab und melde das.",
      "",
    ]
    : [];
  const datenroot = mcp
    ? `- DATENROOT: ${dataContext.dataRoot} (legt der Server fest; das Tool \`status\` nennt ihn)`
    : `- DATENROOT: ${dataContext.dataRoot}`;
  const abschluss = mcp
    ? "Analysiere zuerst read-only (Tool-Laeufe ohne `schreiben: true` sind eine Vorschau), schreibe erst danach mit `schreiben: true`, pruefe nach Schreiblaeufen mit dem Tool `status`, dass der Validator sauber ist, frage nur dort nach meiner Entscheidung, wo die Betriebsanweisung es verlangt, und fasse das Ergebnis am Ende mit Zaehlern zusammen."
    : `Arbeite im App-Raum. Analysiere zuerst read-only, pruefe vor jedem Schreibzugriff, dass der Zielpfad unter DATENROOT liegt, fuehre nach Schreiblaeufen \`node tools/validator.mjs ${dataContext.dataRoot}\` aus, frage nur dort nach meiner Entscheidung, wo die Betriebsanweisung es verlangt, nutze die vorgesehenen Tools und Validatoren, und fasse das Ergebnis am Ende mit Zaehlern zusammen.`;
  return [
    "Bitte bearbeite die naechste Aktion aus der Finanzmodell-App.",
    "",
    ...kanal,
    "Alle Pfade in diesem Prompt sind app-relativ.",
    "",
    "Verbindlicher Datenmodus:",
    `- DATENMODUS: ${dataContext.dataMode}`,
    datenroot,
    "",
    mcp ? "Lies zuerst die Resource `finanzen://docs/agent-context`." : "Lies zuerst `docs/agent-context.md`.",
    skillBlock.trim() || null,
    "",
    "Statuszusammenfassung:",
    summaryLines(summary),
    "",
    `Oberster Auftrag: ${title} (${count}).`,
    "",
    instructions,
    "",
    abschluss,
  ].filter((line) => line !== null).join("\n");
}

function action(type, count, label, skillPath, summary, instructions, extraSkillPaths = [], dataContext = promptDataContext({})) {
  const prompt = basePrompt({ title: label, count, summary, skillPath, extraSkillPaths, instructions, dataContext });
  return { type, count, label, skillPath, extraSkillPaths, prompt };
}

function doneAction() {
  return {
    type: "none",
    count: 0,
    label: "Keine offene Agentenaktion",
    skillPath: "",
    extraSkillPaths: [],
    prompt: "",
  };
}

// Szenario-Entwuerfe (data.szenarien, status="entwurf") erzeugen bewusst KEINE
// Next-Action: Szenarien sind Pull (Nutzer oeffnet die Ansicht aktiv), keine
// Push-Benachrichtigung wie Validierungsfehler oder offene Kategorien.
export function buildNextAgentActions(data, options = {}) {
  const dataContext = promptDataContext(data);
  const dataPath = (relativePath = "") => relativePath ? `${dataContext.dataRoot}/${relativePath}` : `${dataContext.dataRoot}/`;
  const mcp = dataContext.dataMode === "live";

  if (validationErrorCount(data) > 0) {
    const summary = validationSummary(data);
    return [action(
      "validation-errors",
      summary.validationErrors,
      "Validierungsfehler klaeren",
      SKILLS.validationErrors,
      summary,
      mcp
        ? "Hole die Validatorfehler mit dem Tool `status`, lies die betroffenen `schemas/*` und Datendateien mit `datei_lesen`, erklaere die Fehlerursache und schlage die kleinste valide Korrektur vor."
        : `Pruefe \`${dataPath()}\` mit \`node tools/validator.mjs ${dataContext.dataRoot}\`, lies die betroffenen \`schemas/*\`, erklaere die Fehlerursache und schlage die kleinste valide Korrektur vor.`,
      [],
      dataContext,
    )];
  }

  const summary = buildStatusSummary(data, options);
  const checks = wealthChecksFor(data, options);
  const actions = [];

  if (summary.importErrors > 0) {
    actions.push(action(
      "import-errors",
      summary.importErrors,
      "Importfehler klaeren",
      SKILLS.importErrors,
      summary,
      mcp
        ? "Sichte die Fehler unter `data/inbox/error/` (Tool `status` fuer die Zaehler, `dateien_suchen` und `datei_lesen` fuer Datei und Fehlernotiz), klaere Ursache und Konto-/Formatfragen, hole die Datei nach Bestaetigung mit `inbox_zurueckholen` zurueck und fuehre den Import gemaess Skill erneut ueber `inbox` bzw. `import` aus."
        : `Sichte die Fehler unter \`data/inbox/error/\`, klaere Ursache und Konto-/Formatfragen, und fuehre den Importprozess nach Bestaetigung erneut gemaess Skill gegen \`${dataPath()}\` aus.`,
      [],
      dataContext,
    ));
  }

  if (summary.suggestedCategories > 0) {
    actions.push(action(
      "suggested-categories",
      summary.suggestedCategories,
      "Vorgeschlagene Kategorien freigeben",
      SKILLS.suggestedCategories,
      summary,
      mcp
        ? "Fuehre fuer die vorgeschlagenen Buchungen die Freigabe aus (Tool `freigabe` mit `schreiben: true`) und zeige danach den Pruefbericht (Tool `pruefbericht`) ungekuerzt. Was das Gate zurueckhaelt, ist Regelarbeit — keine Rueckfrage je Bucket."
        : `Fuehre fuer die vorgeschlagenen Buchungen in \`${dataPath("transaktionen.jsonl")}\` die Freigabe aus (\`node tools/freigabe.mjs ${dataContext.dataRoot} --schreiben\`) und zeige danach den Pruefbericht ungekuerzt. Was das Gate zurueckhaelt, ist Regelarbeit — keine Rueckfrage je Bucket.`,
      [],
      dataContext,
    ));
  }

  if (summary.suggestedRegularPayments > 0) {
    actions.push(action(
      "suggested-regular-payments",
      summary.suggestedRegularPayments,
      "Regelzahlungsvorschlaege reviewen",
      SKILLS.suggestedRegularPayments,
      summary,
      mcp
        ? `Lies \`${dataPath("regelzahlungen.json")}\` mit \`datei_lesen\` auf \`status = vorgeschlagen\`, stelle die Vorschlaege zur Entscheidung vor und schreibe nur bestaetigte Entscheidungen mit \`datei_ersetzen\`.`
        : `Pruefe \`${dataPath("regelzahlungen.json")}\` auf \`status = vorgeschlagen\`, stelle die Vorschlaege zur Entscheidung vor und schreibe nur bestaetigte Entscheidungen.`,
      [],
      dataContext,
    ));
  }

  if (summary.openCategories > 0) {
    actions.push(action(
      "open-categories",
      summary.openCategories,
      "Offene Kategorien verregeln",
      SKILLS.openCategories,
      summary,
      mcp
        ? `Analysiere ${summary.openCategories} offene Kategorien (\`transaktionen_abfragen\` mit \`status: "offen"\`), bilde Buckets nach Hebel, lege Regeln nur mit Beleg an (\`regel_vorschlag\`, \`regel_probelauf\`), schaetze den Rest als Agenten-Einzelvorschlag (\`agent_vorschlag\`) und starte danach die Nach-Kategorisierung (\`nachkategorisieren\`).`
        : `Analysiere ${summary.openCategories} offene Kategorien in \`${dataPath("transaktionen.jsonl")}\` fuer \`kategorisierung_status = offen\`, bilde Buckets nach Hebel, lege Regeln nur mit Beleg an, schaetze den Rest als Agenten-Einzelvorschlag und starte danach die Nach-Kategorisierung gegen \`${dataPath()}\`.`,
      [],
      dataContext,
    ));
  }

  if (summary.wealthChecks > 0) {
    const extra = [
      ...(checks.some((check) => check.art === "darlehen-ohne-regelzahlung") ? [SKILLS.regularPayments] : []),
      ...(checks.some((check) => VORSORGE_CHECK_ARTS.has(check.art)) ? [SKILLS.vorsorge] : []),
    ];
    actions.push(action(
      "wealth-checks",
      summary.wealthChecks,
      "Vermoegens-/Liquiditaetschecks klaeren",
      SKILLS.wealthChecks,
      summary,
      mcp
        ? "Pruefe die sichtbaren Vermoegens- und Liquiditaetschecks (Tool `kennzahlen`), erfasse fehlende belegte Werte mit `datei_ersetzen` oder klaere Reconciliation-Abweichungen mit Belegen (`belege_text`, `dateien_suchen`)."
        : `Pruefe die sichtbaren Vermoegens- und Liquiditaetschecks in \`${dataPath()}\`, erfasse fehlende belegte Werte oder klaere Reconciliation-Abweichungen mit Belegen und Validatorlauf.`,
      extra,
      dataContext,
    ));
  }

  return actions;
}

export function buildNextAgentAction(data, options = {}) {
  return buildNextAgentActions(data, options)[0] ?? doneAction();
}
