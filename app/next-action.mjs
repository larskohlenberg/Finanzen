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
  suggestedCategories: "docs/skills/kategorisierung-review.md",
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

function basePrompt({ title, count, summary, skillPath, extraSkillPaths = [], instructions, dataContext }) {
  const skillLines = [skillPath, ...extraSkillPaths]
    .filter(Boolean)
    .map((path) => `- ${path}`)
    .join("\n");
  const skillBlock = skillLines ? `\n\nBetriebsanweisung(en):\n${skillLines}` : "";
  return [
    "Bitte bearbeite die naechste Aktion aus der Finanzmodell-App.",
    "",
    "Alle Pfade in diesem Prompt sind app-relativ.",
    "",
    "Verbindlicher Datenmodus:",
    `- DATENMODUS: ${dataContext.dataMode}`,
    `- DATENROOT: ${dataContext.dataRoot}`,
    "",
    "Lies zuerst `docs/agent-context.md`.",
    skillBlock.trim(),
    "",
    "Statuszusammenfassung:",
    summaryLines(summary),
    "",
    `Oberster Auftrag: ${title} (${count}).`,
    "",
    instructions,
    "",
    `Arbeite im App-Raum. Analysiere zuerst read-only, pruefe vor jedem Schreibzugriff, dass der Zielpfad unter DATENROOT liegt, fuehre nach Schreiblaeufen \`node tools/validator.mjs ${dataContext.dataRoot}\` aus, frage vor fachlichen Schreibentscheidungen nach meiner Bestaetigung, nutze die vorgesehenen Tools und Validatoren, und fasse das Ergebnis am Ende mit Zaehlern zusammen.`,
  ].filter(Boolean).join("\n");
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

  if (validationErrorCount(data) > 0) {
    const summary = validationSummary(data);
    return [action(
      "validation-errors",
      summary.validationErrors,
      "Validierungsfehler klaeren",
      SKILLS.validationErrors,
      summary,
      `Pruefe \`${dataPath()}\` mit \`node tools/validator.mjs ${dataContext.dataRoot}\`, lies die betroffenen \`schemas/*\`, erklaere die Fehlerursache und schlage die kleinste valide Korrektur vor.`,
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
      `Sichte die Fehler unter \`data/inbox/error/\`, klaere Ursache und Konto-/Formatfragen, und fuehre den Importprozess nach Bestaetigung erneut gemaess Skill gegen \`${dataPath()}\` aus.`,
      [],
      dataContext,
    ));
  }

  if (summary.suggestedCategories > 0) {
    actions.push(action(
      "suggested-categories",
      summary.suggestedCategories,
      "Vorgeschlagene Kategorien reviewen",
      SKILLS.suggestedCategories,
      summary,
      `Bilde Buckets in \`${dataPath("transaktionen.jsonl")}\` fuer \`kategorisierung_status = vorgeschlagen\`, zeige Stichproben und fuehre Bestaetigung, Korrektur oder Ablehnung erst nach meiner Entscheidung aus.`,
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
      `Pruefe \`${dataPath("regelzahlungen.json")}\` auf \`status = vorgeschlagen\`, stelle die Vorschlaege zur Entscheidung vor und schreibe nur bestaetigte Entscheidungen.`,
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
      `Analysiere ${summary.openCategories} offene Kategorien in \`${dataPath("transaktionen.jsonl")}\` fuer \`kategorisierung_status = offen\`, bilde Buckets nach Hebel, schlage Regeln vor, schreibe keine Regel ohne Bestaetigung und starte danach die Nach-Kategorisierung gegen \`${dataPath()}\`.`,
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
      `Pruefe die sichtbaren Vermoegens- und Liquiditaetschecks in \`${dataPath()}\`, erfasse fehlende belegte Werte oder klaere Reconciliation-Abweichungen mit Belegen und Validatorlauf.`,
      extra,
      dataContext,
    ));
  }

  return actions;
}

export function buildNextAgentAction(data, options = {}) {
  return buildNextAgentActions(data, options)[0] ?? doneAction();
}
