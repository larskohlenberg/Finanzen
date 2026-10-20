// @ts-check
// app/mcp/werkzeuge.mjs
// Die MCP-Tools. Drei Sorten:
// - Lese-Tools (status, kennzahlen, transaktionen_abfragen, datei_lesen, dateien_suchen),
// - 1:1-Wrapper um die CLIs in app/tools/ (Vorschau ist Default, schreiben:true
//   setzt das Schreib-Flag der CLI und braucht --recht=schreiben),
// - Datei-Schreiben (datei_schreiben, datei_ersetzen, beleg_ablegen, beleg_teilen,
//   beleg_ergaenzen, beleg_verwerfen, inbox_verwerfen, inbox_zurueckholen), nur mit
//   --recht=schreiben.
// Jeder schreibende Vorgang laeuft durch mitRollback (Entwurf, Validator, erst dann uebernommen).
import { execFile } from "node:child_process";
import { constants as fsKonstanten } from "node:fs";
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ersetzeVerweise } from "../tools/belege-umziehen.mjs";
import { ersetzeDatei } from "../tools/lib/datei.mjs";
import { GENERATIONEN, ZEIGER } from "../tools/lib/generationen.mjs";
import { mitLesestand } from "../tools/lib/lesestand.mjs";
import { UMGEBUNG as SPERRE_UMGEBUNG } from "../tools/lib/schreibsperre.mjs";
import { BESTAND_UMGEBUNG, ENTWURF_UMGEBUNG } from "../tools/lib/schreiblauf.mjs";
import { planeTeilung } from "../tools/lib/seiten.mjs";
import { loadMasterData, validateMasterData } from "../tools/validator.mjs";
import { localTodayIso } from "../liquiditaet.mjs";
import { abfragen } from "./abfrage.mjs";
import { pruefeArgumente } from "./argumente.mjs";
import { istKalenderdatum, kennzahlenText, planIstText } from "./kennzahlen.mjs";
import { LESE_WURZELN, PfadFehler, bestandWurzeln, loesePfad, logisch, physisch, physischeWurzeln, pruefeEndung, pruefeKeinAktiverTyp } from "./pfade.mjs";
import { erwarteterStand, mitRollback, werkzeugName } from "./schreiben.mjs";
import { rueckgaengigSchreiben, rueckgaengigVorschau } from "../tools/rueckgaengig.mjs";
import { verlaufBericht } from "../tools/verlauf.mjs";
import { OhneVerlauf } from "../tools/lib/generationen.mjs";
import { bestandFingerabdruck } from "../tools/lib/fingerabdruck.mjs";
import { importStandModell } from "../tools/lib/importstand.mjs";
import { AUFGABEN, KATEGORIE_REGEL, aufgabeVon } from "./vertrag.mjs";
import { createHash } from "node:crypto";
import { releaseStand } from "./version.mjs";

const MAX_TEXT = 2 * 1024 * 1024;
const MAX_SCHREIBEN = 10 * 1024 * 1024;
const MAX_BILD = 5 * 1024 * 1024;
const LAUF_TIMEOUT = 10 * 60 * 1000;

const ID = (praefix) => ({ type: "string", pattern: `^${praefix}-[A-Za-z0-9-]+$` });
const DATUM = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
const BETRAG = { type: "string", pattern: "^-?\\d+(\\.\\d{1,2})?$", description: "Decimal-String, z. B. \"-12.50\"" };
const SCHREIBEN = {
  type: "boolean",
  description: "Default false = Vorschau, es wird nichts geschrieben. true schreibt (nur mit --recht=schreiben) in einen Entwurf; danach laeuft der Validator, und nur ohne neue Fehler und ohne Werkzeugfehler wird uebernommen.",
};

const FINGERABDRUCK = {
  type: "string",
  pattern: "^([0-9a-f]{16}|G\\d{6,})$",
  description: "Empfohlen mit schreiben:true: der Fingerabdruck aus der Vorschau. Hat sich der Bestand seither geaendert, wird nichts geschrieben und abgewiesen. Ohne Fingerabdruck wird gegen den aktuellen Stand geschrieben.",
};

// Die Kategorisierungsregel (ADR 0029) an einer Stelle: Anleitung und
// Werkzeugbeschreibungen nennen sie wortgleich.
export { KATEGORIE_REGEL };

// struktur: maschinenlesbarer Teil des Ergebnisses (structuredContent), z. B.
// { fehler, ergebnis, validator }; rufeWerkzeug ergaenzt werkzeug, ok, modus, fingerabdruck.
const ergebnis = (text, isError = false, struktur = undefined) => ({ text, isError, ...(struktur ? { struktur } : {}) });

// Befunde fuer structuredContent: Code, Ort, hoechstens 50.
export function alsBefundListe(befunde = []) {
  return befunde.slice(0, 50).map(({ code, sammlung, objekt, feld }) => ({ code, sammlung, objekt, feld }));
}

// Der JSON-Bericht einer CLI aus ihrer Ausgabe (erstes "{" bis letztes "}"), sonst null.
function cliBericht(stdout) {
  const a = stdout.indexOf("{");
  const e = stdout.lastIndexOf("}");
  if (a < 0 || e < a) return null;
  try {
    return JSON.parse(stdout.slice(a, e + 1));
  } catch {
    return null;
  }
}

// Belege/ gehoert nur zu data/master; andere Bestaende haben keine Belegablage.
function belegeWurzel(ctx) {
  const { belege, datenroot } = bestandWurzeln(ctx);
  if (!belege) throw new PfadFehler(`Belege/ gehoert zum Bestand data/master; ${datenroot} hat keine Belegablage`);
  return belege;
}
const json = (wert) => JSON.stringify(wert, null, 2);

// Lesewerkzeuge sehen genau eine Generation des Bestands (Lease, ADR 0035);
// im einfachen Ordner lesen sie ihn direkt. stand ist die Generations-Id oder "ordner".
const ladeBestand = (ctx) => mitLesestand(ctx.datenroot, async (leser) => ({ stand: leser.id, daten: await loadMasterData(leser.url) }));

// ---------------------------------------------------------------- CLI-Laeufe

// s: der Schreibvorgang aus mitRollback. Die CLI schreibt in dessen Entwurf
// und erbt die Schreibsperre ueber die Umgebung (keine eigene Sperre, kein
// eigener Entwurf).
function umgebung(ctx, s) {
  if (!s) return process.env;
  return { ...process.env, [ENTWURF_UMGEBUNG]: s.ordner, [BESTAND_UMGEBUNG]: ctx.datenroot, ...(s.sperre ? { [SPERRE_UMGEBUNG]: s.sperre.kennung } : {}) };
}

function starte(ctx, skript, args, s = null) {
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(ctx.app, "tools", skript), ...args], {
      cwd: ctx.app,
      env: umgebung(ctx, s),
      timeout: LAUF_TIMEOUT,
      maxBuffer: 64 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      /** @type {number|"timeout"} */
      let exitCode = 0;
      if (error) exitCode = error.killed ? "timeout" : (typeof error.code === "number" ? error.code : 1);
      resolve({ exitCode, stdout, stderr });
    });
  });
}

// schreibFlag: Flag der CLI fuer den Schreiblauf; der Schreiblauf bekommt den
// Entwurf als Datenroot. rueckrollungBeiFehler: false fuer Laeufe, die Dateien ausserhalb des
// Bestands verschieben (Inbox-Archiv, Belege); dort wuerde ein Zuruecksetzen nur
// des Bestands Verweise ins Leere zeigen lassen. Sie setzen nur bei neuen
// Validatorfehlern zurueck. mitBelegen: der Lauf arbeitet auf Belege/.
/**
 * Vertrag eines CLI-Werkzeugs: eine CLI unter app/tools/ als MCP-Tool.
 * @typedef {object} CliVertrag
 * @property {string} name
 * @property {string} skript
 * @property {string} beschreibung
 * @property {Record<string, any>} [eigenschaften]  inputSchema.properties
 * @property {string[]} [pflicht]
 * @property {string} [schreibFlag]
 * @property {number[]} [okCodes]
 * @property {boolean} [rueckrollungBeiFehler]
 * @property {boolean} [mitBelegen]
 * @property {(ctx: any, args: Record<string, any>, root: string) => Promise<CliArgumente>} argv
 */

/** @typedef {string[] & { aufraeumen?: () => Promise<void> }} CliArgumente */

/**
 * Ein MCP-Werkzeug, wie WERKZEUGE es fuehrt.
 * @typedef {object} Werkzeug
 * @property {string} name
 * @property {string} description
 * @property {{ type: string, properties: Record<string, any>, required?: string[], additionalProperties?: boolean }} inputSchema
 * @property {{ readOnlyHint?: boolean, destructiveHint?: boolean }} [annotations]
 * @property {boolean} [nurSchreiben]
 * @property {(ctx: any, args: Record<string, any>) => Promise<any>} ausfuehren
 */

/** @param {CliVertrag} vertrag @returns {Werkzeug} */
function cli({ name, skript, beschreibung, eigenschaften = {}, pflicht = [], schreibFlag, okCodes = [0], rueckrollungBeiFehler = true, mitBelegen = false, argv }) {
  const properties = { ...eigenschaften };
  if (schreibFlag) properties.schreiben = SCHREIBEN;
  return {
    name,
    description: beschreibung,
    inputSchema: { type: "object", properties, required: pflicht, additionalProperties: false },
    annotations: { readOnlyHint: !schreibFlag },
    async ausfuehren(ctx, args) {
      const schreiben = Boolean(schreibFlag && args.schreiben);
      if (schreiben && ctx.recht !== "schreiben") {
        return ergebnis(`${name} mit schreiben:true braucht --recht=schreiben. Dieser Zugang darf nur Vorschau-Laeufe.`, true);
      }
      if (mitBelegen) belegeWurzel(ctx);
      const lauf = async (root, kopfzeile, s = null) => {
        const cliArgs = await argv(ctx, args, root);
        const flag = schreiben ? [schreibFlag] : [];
        let r;
        try {
          r = await starte(ctx, skript, [...cliArgs, ...flag], s);
        } finally {
          await cliArgs.aufraeumen?.();
        }
        const teile = [kopfzeile, `tools/${skript} — Exitcode: ${r.exitCode}`, r.stdout.trimEnd()];
        if (r.stderr.trim()) teile.push(`--- stderr ---\n${r.stderr.trimEnd()}`);
        const fehlgeschlagen = !okCodes.includes(r.exitCode);
        // Die CLIs melden neue Validatorfehler nach dem Schreiben mit "neue(r) Validatorfehler" (lib/validator-befund.mjs).
        const amValidator = /neue\(r\) Validatorfehler/.test(r.stderr);
        return ergebnis(teile.join("\n"), fehlgeschlagen, { exitcode: r.exitCode, ergebnis: cliBericht(r.stdout), ...(fehlgeschlagen ? { fehler: amValidator ? "validator" : "werkzeug" } : {}) });
      };
      if (schreiben) return mitRollback(ctx.datenroot, (s) => lauf(s.ordner, "Modus: schreiben", s), { rueckrollungBeiFehler });
      return lauf(ctx.datenrootRel, "Modus: Vorschau");
    },
  };
}

// Bilddateien fuer logos: Bestand samt Inbox, bei data/master auch Belege/.
function logoQuellen(ctx) {
  const w = bestandWurzeln(ctx);
  return [...w.schreiben, ...(w.belege ? [w.belege] : [])];
}

const CLI_WERKZEUGE = [
  cli({
    name: "pruefbericht",
    skript: "pruefbericht.mjs",
    beschreibung: "Pruefbericht nach einem Durchlauf (tools/pruefbericht.mjs): groesste Auto-Freigaben, Merchants ohne menschliche Bestaetigung, auto-freigegebene KAT-012, menschliche Entscheidungen im Widerspruch zum Regelwerk, am Gate gescheiterte Regeln, Konten ohne Anker, nicht reconciliierte Kontostaende. Rein lesend. Dem Nutzer ungekuerzt zeigen.",
    argv: async (ctx, a, root) => [root],
  }),
  cli({
    name: "inbox",
    skript: "inbox.mjs",
    beschreibung: "Inbox-Lauf (tools/inbox.mjs) ueber die Dateien direkt in der Inbox des Bestands (data/master: data/inbox/, andere Bestaende: <bestand>/inbox/): Profil zuordnen, CSV normalisieren, importieren, PDFs und Bilder als Textvorlauf nach standardized/ (ohne Textlayer per OCR; Bilder bleiben im Inbox-Root liegen). CSV-Dateien werden erst nach Schreiben und Validieren des Bestands verschoben: vollstaendig gelesen nach processed/, abgebrochen oder mit Zeilenfehlern samt Fehlernotiz <name>.fehler.txt nach error/ (die guten Zeilen sind dann importiert); gleichnamige Dateien bekommen ein Suffix (-2, -3 ...). Bringt der Lauf neue Validatorfehler, wird nichts geschrieben und nichts verschoben. Der Bericht nennt alle Lese- und Importfehler. Vorschau ist Default.",
    schreibFlag: "--schreiben",
    rueckrollungBeiFehler: false,
    argv: async (ctx, a, root) => [root],
  }),
  cli({
    name: "import",
    skript: "import.mjs",
    beschreibung: "Eine standardisierte JSONL-Datei (Importformat, liegt in der Inbox des Bestands, meist standardized/) importieren (tools/import.mjs): Dedupe gegen den Bestand, Kategorisierung per Regeln, Transfer-Match. Bringt der Import neue Validatorfehler, wird nichts geschrieben. Vorschau ist Default.",
    eigenschaften: { datei: { type: "string", description: "Pfad relativ zum App-Raum, z. B. data/inbox/standardized/lauf.jsonl" } },
    pflicht: ["datei"],
    schreibFlag: "--schreiben",
    argv: async (ctx, a, root) => [(await loesePfad(ctx.app, a.datei, [bestandWurzeln(ctx).inbox])).absolut, root],
  }),
  cli({
    name: "regel_vorschlag",
    skript: "regel-vorschlag.mjs",
    beschreibung: `Offen-Stapel nach Gegenpartei buendeln (tools/regel-vorschlag.mjs), sortiert nach Hebel, mit [Regelkonflikt]-Markern. Schlaegt bewusst keine Kategorie vor. ${KATEGORIE_REGEL} Rein lesend.`,
    eigenschaften: {
      min: { type: "integer", minimum: 1, description: "Mindestgroesse eines Clusters (Default 2)" },
      limit: { type: "integer", minimum: 1, maximum: 1000, description: "Anzahl Cluster im Bericht (Default 20)" },
      json: { type: "boolean", description: "Rohstruktur als JSON" },
    },
    argv: async (ctx, a, root) => [root, ...(a.min ? [`--min=${a.min}`] : []), ...(a.limit ? [`--limit=${a.limit}`] : []), ...(a.json ? ["--json"] : [])],
  }),
  cli({
    name: "regel_probelauf",
    skript: "regel-probelauf.mjs",
    beschreibung: "Regelkandidaten gegen den Gesamtbestand rechnen, bevor etwas geschrieben wird (tools/regel-probelauf.mjs). Kandidaten in Endfassung inkl. belegstufe (E1-E4) und kommentar. Exitcode 2 = blockiert (Strukturfehler, unspezifisch, neue Konflikte, Wiedervorlagen, Widersprueche zu menschlichen Entscheidungen, verlorene bestaetigte Treffer) — dann nicht schreiben. Rein lesend.",
    eigenschaften: {
      kandidaten: { type: "array", items: { type: "object" }, minItems: 1, description: "Regelkandidaten als Objekte im Schema von kategorisierungsregeln.json" },
      kandidaten_datei: { type: "string", description: "Alternativ: JSON-Datei mit Kandidaten im Bestand oder seiner Inbox" },
      aenderung: { type: "boolean", description: "Bestandsregel bewusst aendern (bekannte regel_id erlaubt)" },
      json: { type: "boolean", description: "Bericht als JSON" },
    },
    okCodes: [0, 2],
    argv: async (ctx, a, root) => {
      let datei;
      if (a.kandidaten) {
        const ordner = await mkdtemp(path.join(tmpdir(), "finanzen-mcp-kandidaten-"));
        datei = path.join(ordner, "kandidaten.json");
        await ersetzeDatei(datei, JSON.stringify(a.kandidaten));
      } else if (a.kandidaten_datei) {
        // Den geprueften absoluten Pfad reichen: die CLI soll nichts mehr deuten.
        datei = (await loesePfad(ctx.app, a.kandidaten_datei, bestandWurzeln(ctx).schreiben)).absolut;
      } else {
        throw new PfadFehler("kandidaten oder kandidaten_datei angeben");
      }
      /** @type {CliArgumente} */
      const out = [root, datei, ...(a.aenderung ? ["--aenderung"] : []), ...(a.json ? ["--json"] : [])];
      if (a.kandidaten) out.aufraeumen = () => rm(path.dirname(datei), { recursive: true, force: true });
      return out;
    },
  }),
  cli({
    name: "nachkategorisieren",
    skript: "recategorize.mjs",
    beschreibung: "Bestand nach Regelaenderungen neu bewerten (tools/recategorize.mjs): offene, regelbasierte und auto-freigegebene Buchungen gegen das aktuelle Regelwerk; menschlich bestaetigte, abgelehnte und manuelle bleiben samt Regelbezug unangetastet, Widersprueche zaehlt widerspruch (Liste im Pruefbericht). Vorschau ist Default.",
    schreibFlag: "--schreiben",
    argv: async (ctx, a, root) => [root],
  }),
  cli({
    name: "agent_vorschlag",
    skript: "agent-vorschlag.mjs",
    beschreibung: `Agenten-Einzelvorschlaege setzen (tools/agent-vorschlag.mjs): Buchungen auf vorgeschlagen mit kategorie_herkunft=agent. Fuer E5/E6. ${KATEGORIE_REGEL} Nie Grundlage einer Regel. Vorschau ist Default.`,
    eigenschaften: {
      ids: { type: "array", items: ID("TXN"), minItems: 1 },
      kategorie: ID("KAT"),
    },
    pflicht: ["ids", "kategorie"],
    schreibFlag: "--schreiben",
    argv: async (ctx, a, root) => [`--ids=${a.ids.join(",")}`, `--kategorie=${a.kategorie}`, root],
  }),
  // Schmale Schreibwerkzeuge (Review 1B.3): statt Datei-Edits an Kerndateien.
  cli({
    name: "regel_schreiben",
    skript: "regel-schreiben.mjs",
    beschreibung: "Kategorisierungsregeln anlegen oder aendern (tools/regel-schreiben.mjs). Rechnet intern den Probelauf und schreibt nur ohne Block; die regel_id vergibt das Werkzeug. Neue Regel: ohne regel_id, mit gegenpartei_pattern/verwendungszweck_pattern, kategorie_id, kommentar und belegstufe (E1-E4, Regeln nur mit Beleg); status und erstellt_am setzt das Werkzeug. Aenderung: regel_id einer bestehenden Regel plus die zu aendernden Felder, null entfernt ein Feld. Danach nachkategorisieren. Vorschau ist Default.",
    eigenschaften: {
      regeln: { type: "array", items: { type: "object" }, minItems: 1, description: "Regelkandidaten bzw. Aenderungen" },
      notiz: { type: "string", maxLength: 500, description: "kurze Notiz fuers Agentenprotokoll (Beleg, Grund)" },
    },
    pflicht: ["regeln"],
    schreibFlag: "--schreiben",
    argv: async (ctx, a, root) => [root, `--regeln=${JSON.stringify(a.regeln)}`, ...(a.notiz ? [`--notiz=${a.notiz}`] : [])],
  }),
  cli({
    name: "stammdatum_setzen",
    skript: "stammdatum-setzen.mjs",
    beschreibung: "Ein Stammdatum aendern oder anlegen (tools/stammdatum-setzen.mjs): Person, Konto, Kategorie, Regelzahlung, Frist, Immobilie, Darlehen, Vermoegenswert, Vorsorge, Szenario. Mit id: genannte Felder setzen, null entfernt ein Feld. Ohne id: neuer Datensatz mit der naechsten freien ID (neue Kategorien vor KAT-012). Das ID-Feld ist nicht aenderbar. Der Validator prueft danach den ganzen Bestand. Vorschau ist Default.",
    eigenschaften: {
      typ: { type: "string", enum: ["person", "konto", "kategorie", "regelzahlung", "frist", "immobilie", "darlehen", "vermoegenswert", "vorsorge", "szenario"] },
      id: { type: "string", pattern: "^[A-Z]+-\\d{3,}$" },
      felder: { type: "object", description: "Feldwerte; null entfernt ein Feld" },
      notiz: { type: "string", maxLength: 500 },
    },
    pflicht: ["typ", "felder"],
    schreibFlag: "--schreiben",
    argv: async (ctx, a, root) => [root, `--typ=${a.typ}`, ...(a.id ? [`--id=${a.id}`] : []), `--felder=${JSON.stringify(a.felder)}`, ...(a.notiz ? [`--notiz=${a.notiz}`] : [])],
  }),
  cli({
    name: "zeitwert_anhaengen",
    skript: "zeitwert-anhaengen.mjs",
    beschreibung: "Zeitwerte anhaengen (tools/zeitwert-anhaengen.mjs): Kontostand, Depotwert, Marktwert, Restschuld, Vorsorgewerte, je { entitaet, entitaet_id, feld, wert, standdatum, qualitaet, quelle_hinweis }. Gleicher Wert am selben Standdatum: unveraendert. Anderer Wert am selben Standdatum: Warnung, nichts geschrieben; nur mit korrigieren: true wird der vorhandene ersetzt (Korrekturpfad). Vorschau ist Default.",
    eigenschaften: {
      eintraege: { type: "array", items: { type: "object" }, minItems: 1 },
      korrigieren: { type: "boolean", description: "vorhandenen abweichenden Wert am selben Standdatum ersetzen" },
      notiz: { type: "string", maxLength: 500 },
    },
    pflicht: ["eintraege"],
    schreibFlag: "--schreiben",
    argv: async (ctx, a, root) => [root, `--eintraege=${JSON.stringify(a.eintraege)}`, ...(a.korrigieren ? ["--korrigieren"] : []), ...(a.notiz ? [`--notiz=${a.notiz}`] : [])],
  }),
  cli({
    name: "protokoll_eintrag",
    skript: "protokoll-eintrag.mjs",
    beschreibung: "Eine Zeile ins Agentenprotokoll (tools/protokoll-eintrag.mjs) fuer Schritte, die kein Werkzeug selbst protokolliert: anlass (kurzes Wort, nicht die Werkzeug-Anlaesse wie freigabe oder korrektur), notiz, optional ids, zaehler, dubletten_geprueft. Vorschau ist Default.",
    eigenschaften: {
      anlass: { type: "string", pattern: "^[a-z][a-z0-9-]*$" },
      notiz: { type: "string", maxLength: 2000 },
      ids: { type: "array", items: { type: "string" } },
      zaehler: { type: "object" },
      normalisierung: { type: "object", description: "Abstimmung beim Import: quelle, reconciliation_differenz { konto_id, ... }, reconciliation_erledigt { konto_id, bezug, grund }" },
      dubletten_geprueft: { type: "boolean" },
    },
    pflicht: ["anlass", "notiz"],
    schreibFlag: "--schreiben",
    argv: async (ctx, a, root) => [root, `--anlass=${a.anlass}`, `--notiz=${a.notiz}`, ...(a.ids ? [`--ids=${JSON.stringify(a.ids)}`] : []), ...(a.zaehler ? [`--zaehler=${JSON.stringify(a.zaehler)}`] : []), ...(a.normalisierung ? [`--normalisierung=${JSON.stringify(a.normalisierung)}`] : []), ...(a.dubletten_geprueft ? ["--dubletten-geprueft"] : [])],
  }),
  cli({
    name: "transfer_extern",
    skript: "transfer-extern.mjs",
    beschreibung: "Externen Transfer anlegen oder entfernen (tools/transfer-extern.mjs): eine Buchung, deren Gegenseite ausserhalb des Modells liegt (gegenseite bar, extern_familie, extern_sonstiges), mit Pflicht-Begruendung. Interne Transfers paart das Tool transfers. Vorschau ist Default.",
    eigenschaften: {
      transaktion: ID("TXN"),
      gegenseite: { type: "string", enum: ["bar", "extern_familie", "extern_sonstiges"] },
      begruendung: { type: "string", maxLength: 500 },
      entfernen: { type: "boolean" },
      notiz: { type: "string", maxLength: 500 },
    },
    pflicht: ["transaktion"],
    schreibFlag: "--schreiben",
    argv: async (ctx, a, root) => [root, `--transaktion=${a.transaktion}`, ...(a.gegenseite ? [`--gegenseite=${a.gegenseite}`] : []), ...(a.begruendung ? [`--begruendung=${a.begruendung}`] : []), ...(a.entfernen ? ["--entfernen"] : []), ...(a.notiz ? [`--notiz=${a.notiz}`] : [])],
  }),
  cli({
    name: "bestaetigen",
    skript: "confirm.mjs",
    beschreibung: "Menschliche Kategorie-Entscheidung auf einen gefilterten Schnitt anwenden (tools/confirm.mjs): bestaetigen, ablehnen oder Kategorie setzen. Nur nach ausdruecklicher Entscheidung des Nutzers. Mindestens ein Filter. Vorschau ist Default.",
    eigenschaften: {
      aktion: { type: "string", enum: ["bestaetigen", "ablehnen", "kategorie"] },
      kategorie: { ...ID("KAT"), description: "Ziel-Kategorie bei aktion=kategorie" },
      ids: { type: "array", items: ID("TXN"), minItems: 1 },
      konto_id: ID("KTO"),
      status: { type: "array", items: { type: "string", enum: ["offen", "vorgeschlagen", "bestaetigt", "abgelehnt"] }, minItems: 1 },
      herkunft: { type: "array", items: { type: "string", enum: ["regel", "agent", "manuell"] }, minItems: 1 },
      gegenpartei: { type: "string", maxLength: 300 },
      verwendungszweck: { type: "string", maxLength: 300 },
      kategorie_id: ID("KAT"),
      regel_id: ID("REG"),
      von: DATUM,
      bis: DATUM,
      auch_entschiedene: { type: "boolean", description: "Auch bereits entschiedene Buchungen korrigieren" },
    },
    pflicht: ["aktion"],
    schreibFlag: "--schreiben",
    argv: async (ctx, a, root) => {
      const out = [`--aktion=${a.aktion}`];
      if (a.kategorie) out.push(`--kategorie=${a.kategorie}`);
      for (const k of ["ids", "status", "herkunft"]) if (a[k]) out.push(`--${k}=${a[k].join(",")}`);
      for (const k of ["konto_id", "gegenpartei", "verwendungszweck", "kategorie_id", "regel_id", "von", "bis"]) if (a[k] !== undefined) out.push(`--${k}=${a[k]}`);
      if (a.auch_entschiedene) out.push("--auch-entschiedene");
      return [...out, root];
    },
  }),
  cli({
    name: "immobilienbezug",
    skript: "transaktion-immobilie.mjs",
    beschreibung: "Immobilienbezug fuer explizite Transaktions-IDs setzen, ersetzen oder entfernen (tools/transaktion-immobilie.mjs). Nur aus eindeutigem Beleg oder Nutzerentscheidung. bemerkung setzt zusaetzlich oder allein einen kurzen Freitext an den Buchungen (leerer Text entfernt ihn). Exitcode 2 = blockiert. Vorschau ist Default.",
    eigenschaften: {
      ids: { type: "array", items: ID("TXN"), minItems: 1 },
      immobilie: ID("IMM"),
      person: ID("PER"),
      entfernen: { type: "boolean" },
      ersetzen: { type: "boolean" },
      bemerkung: { type: "string", maxLength: 300 },
    },
    pflicht: ["ids"],
    schreibFlag: "--schreiben",
    okCodes: [0, 2],
    argv: async (ctx, a, root) => [`--ids=${a.ids.join(",")}`, ...(a.immobilie ? [`--immobilie=${a.immobilie}`] : []), ...(a.entfernen ? ["--entfernen"] : []), ...(a.ersetzen ? ["--ersetzen"] : []), ...(a.bemerkung !== undefined ? [`--bemerkung=${a.bemerkung}`] : []), root],
  }),
  cli({
    name: "personenbezug",
    skript: "personenbezug.mjs",
    beschreibung: "Fuer wen ist eine Buchung (tools/personenbezug.mjs; setzt fuer_person_id, ADR 0039). Ohne ids: Ableitung ueber den ganzen Bestand aus der Regelzahlung der Buchung oder aus aktiven Regeln mit fuer_person_id (Vorrang manuell vor Regelzahlung vor Regel); nach Import, Regel- oder Regelzahlungsaenderung und regelzahlungen_zuordnen nachziehen. Mit ids genau eine Aktion: person setzt von Hand, entfernen heisst bewusst keine Person, automatisch gibt die Buchungen an die Ableitung zurueck. Wer bezahlt hat, folgt weiter dem Konto. Exitcode 2 = blockiert. Vorschau ist Default.",
    eigenschaften: {
      ids: { type: "array", items: ID("TXN"), minItems: 1 },
      person: ID("PER"),
      entfernen: { type: "boolean" },
      automatisch: { type: "boolean" },
    },
    schreibFlag: "--schreiben",
    okCodes: [0, 2],
    argv: async (ctx, a, root) => [...(a.ids ? [`--ids=${a.ids.join(",")}`] : []), ...(a.person ? [`--person=${a.person}`] : []), ...(a.entfernen ? ["--entfernen"] : []), ...(a.automatisch ? ["--automatisch"] : []), root],
  }),
  cli({
    name: "transfers",
    skript: "transfer-matcher.mjs",
    beschreibung: "Interne Transfers im Bestand paaren (tools/transfer-matcher.mjs). Nach neu angelegten Konten nachziehen. Vorschau ist Default.",
    schreibFlag: "--schreiben",
    argv: async (ctx, a, root) => [root],
  }),
  cli({
    name: "regelzahlungen_zuordnen",
    skript: "regelzahlung-matcher.mjs",
    beschreibung: "Gebuchte Transaktionen bestaetigten Regelzahlungen mit konto_id zuordnen (tools/regelzahlung-matcher.mjs; setzt regelzahlung_id). Ankerbuchung am anker_datum, dann Mandatsreferenz bzw. Gegenpartei je Termin. details:true listet jede Zuordnung. Vorschau ist Default.",
    eigenschaften: { details: { type: "boolean" } },
    schreibFlag: "--schreiben",
    argv: async (ctx, a, root) => [...(a.details ? ["--details"] : []), root],
  }),
  cli({
    name: "logos",
    skript: "logos.mjs",
    beschreibung: "Logo-Verzeichnis (tools/logos.mjs; DATENROOT/logos.json + logos/<domain>.png). Ohne eintraege ein Bericht: Eintraege, fehlende Dateien, haeufigste Gegenparteien sowie Regelzahlungen, Vorsorgevertraege und Konten ohne Logo (Konten ueber ihren Namen). Mit eintraege [{ name, domain, muster }] ruft es je Domain das Logo beim Logodienst ab (Google-Favicon-Dienst), verkleinert auf hoechstens 128 px und traegt es ein; gleiche Domain = Eintrag aktualisieren. Kennt der Dienst die Domain nicht oder liefert das falsche Logo, gibt der Agent bild (PNG/JPEG als Base64, z. B. das Website-Symbol, SVG vorher lokal gerastert) und quelle (https-URL der Herkunft) mit; dann wird nichts abgerufen. Liegt eine bessere Bilddatei vor (z. B. aus einem Briefkopf, in die Inbox gelegt), nennt datei ihren Pfad unter data/ oder Belege/ (PNG oder Baseline-JPEG); quelle ist dann optional, sonst datei:<name>. muster wie gegenpartei_pattern der Kategorisierungsregeln (Teiltext, | trennt Alternativen). Die Domain bestimmt der Agent. Vorschau ist Default (Abruf laeuft, geschrieben wird nichts).",
    eigenschaften: {
      eintraege: {
        type: "array",
        minItems: 1,
        maxItems: 50,
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Anzeigename, z. B. Beispielmarkt" },
            domain: { type: "string", description: "z. B. beispielmarkt.de" },
            muster: { type: "string", description: "Gegenpartei-Muster, z. B. BEISPIELMARKT|BSP MARKT" },
            bild: { type: "string", maxLength: 1500000, description: "Optional: Logo als PNG oder JPEG, Base64; statt Abruf beim Dienst" },
            datei: { type: "string", description: "Optional statt bild: lokale Bilddatei, relativ zum App-Raum im Bestand, seiner Inbox oder unter Belege/, z. B. data/inbox/beispielmarkt-logo.png" },
            quelle: { type: "string", description: "Pflicht mit bild, optional mit datei: https-URL, woher das Bild stammt" },
          },
          required: ["name", "domain", "muster"],
          additionalProperties: false,
        },
      },
      top: { type: "integer", minimum: 1, maximum: 200, description: "Bericht: so viele Gegenparteien ohne Logo (Default 20)" },
    },
    // Teilerfolg (einzelne Abrufe gescheitert) bleibt; der Validator wacht.
    rueckrollungBeiFehler: false,
    schreibFlag: "--schreiben",
    argv: async (ctx, a, root) => {
      /** @type {CliArgumente} */
      const out = [root];
      if (a.top) out.push("--top", String(a.top));
      if (!a.eintraege) return out;
      const eintraege = [];
      for (const e of a.eintraege) {
        eintraege.push(e.datei ? { ...e, datei: (await loesePfad(ctx.app, e.datei, logoQuellen(ctx))).absolut } : e);
      }
      const ordner = await mkdtemp(path.join(tmpdir(), "finanzen-mcp-logos-"));
      const datei = path.join(ordner, "plan.json");
      await ersetzeDatei(datei, JSON.stringify(eintraege));
      out.push("--plan", datei);
      out.aufraeumen = () => rm(ordner, { recursive: true, force: true });
      return out;
    },
  }),
  cli({
    name: "freigabe",
    skript: "freigabe.mjs",
    beschreibung: "Vorgeschlagene Buchungen automatisch bestaetigen, soweit ihre Regel das Gate besteht (tools/freigabe.mjs; bestaetigt_durch=auto). Gate-Grund 'anker' = Regel reicht in ein Konto ohne menschlichen Anker; 'abweichung' = der gespeicherte Vorschlag entspricht nicht mehr dem aktuellen Regelstand, erst nachkategorisieren. Vorschau ist Default.",
    schreibFlag: "--schreiben",
    argv: async (ctx, a, root) => [root],
  }),
  cli({
    name: "lernen",
    skript: "lernen.mjs",
    beschreibung: "Lernmetriken aus agent_log.jsonl (tools/lernen.mjs): Korrekturquote je Regel und Belegstufe, Gate-Durchfall. schreiben:true (= --anwenden) legt Regeln ueber der Korrekturquote still; danach nachkategorisieren. Vorschau ist Default.",
    schreibFlag: "--anwenden",
    argv: async (ctx, a, root) => [root],
  }),
  cli({
    name: "belege_text",
    skript: "belege-text.mjs",
    beschreibung: "Textzwillinge (.txt) fuer PDFs und Bilder unter Belege/ erzeugen (ohne Textlayer per OCR, alte Kein-Textlayer-Marker werden nachgeholt) und data/inbox/standardized/ sowie processed/ per Inhalts-Hash aufraeumen (tools/belege-text.mjs). error/ bleibt unangetastet. Vorschau ist Default; geloeschte Eingangsdateien werden bei einem Rollback nicht wiederhergestellt.",
    schreibFlag: "--schreiben",
    rueckrollungBeiFehler: false,
    mitBelegen: true,
    argv: async (ctx, a, root) => [root],
  }),
  cli({
    name: "belege_umziehen",
    skript: "belege-umziehen.mjs",
    beschreibung: "Belege innerhalb von Belege/ umziehen (tools/belege-umziehen.mjs): Datei samt .txt-Zwilling verschieben und jeden Pfad in Stamm- und Bewegungsdaten (rohquelle, quelle_hinweis, Freitext) ersetzen; agent_log.jsonl bleibt unveraendert. Plan als Liste umzuege [{ von, nach, kopie? }] oder als JSON-Datei unter data/ (plan_datei). Ein fehlerhafter Plan aendert nichts; ein schon erledigter Umzug zaehlt als erledigt. Meldet verwaiste Verweise. Vorschau ist Default; Verschiebungen werden bei einem Rollback nicht zurueckgenommen.",
    eigenschaften: {
      umzuege: {
        type: "array",
        items: {
          type: "object",
          properties: {
            von: { type: "string", description: "z. B. Belege/2025/Kredite/DAR-001_Bank_Jahresauszug_2025.pdf" },
            nach: { type: "string", description: "z. B. Belege/Darlehen/DAR-001_Bank-Baufinanzierung/2025/DAR-001_Bank_Jahresauszug_2025.pdf" },
            kopie: { type: "boolean", description: "true = kopieren statt verschieben (Beleg zu mehreren Objekten); Quelle und Verweise bleiben, Kopien laufen vor den Verschiebungen" },
          },
          required: ["von", "nach"],
          additionalProperties: false,
        },
      },
      plan_datei: { type: "string", description: "Alternativ: JSON-Datei im Bestand oder seiner Inbox mit derselben Liste" },
    },
    schreibFlag: "--schreiben",
    rueckrollungBeiFehler: false,
    mitBelegen: true,
    argv: async (ctx, a, root) => {
      let datei;
      if (a.umzuege) {
        const ordner = await mkdtemp(path.join(tmpdir(), "finanzen-mcp-umzug-"));
        datei = path.join(ordner, "plan.json");
        await ersetzeDatei(datei, JSON.stringify(a.umzuege));
      } else if (a.plan_datei) {
        datei = (await loesePfad(ctx.app, a.plan_datei, bestandWurzeln(ctx).schreiben)).absolut;
      } else {
        throw new PfadFehler("umzuege oder plan_datei angeben");
      }
      /** @type {CliArgumente} */
      const out = [root, datei];
      if (a.umzuege) out.aufraeumen = () => rm(path.dirname(datei), { recursive: true, force: true });
      return out;
    },
  }),
];

// ---------------------------------------------------------------- Lese-Tools

async function zaehleDateien(ordner) {
  let n = 0;
  for (const e of await readdir(ordner, { withFileTypes: true }).catch(() => [])) {
    if (e.name.startsWith(".")) continue;
    if (e.isDirectory()) n += await zaehleDateien(path.join(ordner, e.name));
    else if (e.isFile()) n += 1;
  }
  return n;
}

async function inboxStand(ctx) {
  const ordner = physisch(ctx.app, bestandWurzeln(ctx).inbox);
  const dateien = [];
  const unterordner = {};
  for (const e of await readdir(ordner, { withFileTypes: true }).catch(() => [])) {
    if (e.name.startsWith(".")) continue;
    if (e.isFile()) {
      const s = await stat(path.join(ordner, e.name));
      // Pruefsumme fuer CSV: verbindet eine wartende Datei mit ihrem Importauftrag.
      const sha256 = /\.csv$/i.test(e.name) && s.size <= MAX_SCHREIBEN ? createHash("sha256").update(await readFile(path.join(ordner, e.name))).digest("hex") : undefined;
      dateien.push({ name: e.name, bytes: s.size, geaendert: s.mtime.toISOString().slice(0, 16), ...(sha256 ? { sha256 } : {}) });
    } else if (e.isDirectory()) {
      unterordner[e.name] = await zaehleDateien(path.join(ordner, e.name));
    }
  }
  return { dateien, unterordner };
}

const status = {
  name: "status",
  description: "Ueberblick: Datenroot, Zugriffsrecht, Stand (Generations-Id, im einfachen Ordner \"ordner\"), Anzahl Transaktionen/Regeln/Konten, Verteilung kategorisierung_status, Validator-Ergebnis (mit Fehlern) und Inbox (wartende Dateien im Root, Dateizahl je Unterordner error/standardized/processed). Rein lesend — guter erster Aufruf.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true },
  async ausfuehren(ctx) {
    // Einmal laden, fuer Zaehler und Validator.
    /** @type {Record<string, any>} */
    const bericht = { datenroot: ctx.datenrootRel, recht: ctx.recht, ...(ctx.release ? { version: releaseStand(ctx) } : {}) };
    let validator;
    let importauftraege = null;
    try {
      const { stand, daten } = await ladeBestand(ctx);
      importauftraege = daten.importauftraege ?? [];
      bericht.stand = stand;
      const verteilung = {};
      for (const t of daten.transaktionen) verteilung[t.kategorisierung_status] = (verteilung[t.kategorisierung_status] ?? 0) + 1;
      Object.assign(bericht, {
        transaktionen: daten.transaktionen.length,
        kategorisierung_status: verteilung,
        regeln: { gesamt: daten.kategorisierungsregeln.length, aktiv: daten.kategorisierungsregeln.filter((r) => r.status === "aktiv").length },
        konten: daten.konten.length,
      });
      const pruefung = validateMasterData(daten);
      validator = { gueltig: pruefung.valid, fehler: pruefung.errors, befunde: pruefung.befunde };
    } catch (error) {
      bericht.masterdaten = `nicht lesbar: ${error.message}`;
      validator = { gueltig: false, fehler: [`Masterdaten nicht lesbar: ${error.message}`], befunde: [{ code: "nicht-lesbar", sammlung: "Bestand", objekt: null, feld: null }] };
    }
    bericht.validator = { gueltig: validator.gueltig, fehler_anzahl: validator.fehler.length, fehler: validator.fehler.slice(0, 50) };
    bericht.inbox = await inboxStand(ctx);
    // Importbericht (1B.5): letzte Auftraege und Stand der wartenden Dateien.
    if (importauftraege) {
      const modell = importStandModell({ auftraege: importauftraege, wartend: bericht.inbox.dateien.map((d) => ({ datei: d.name, sha256: d.sha256 })), anzahl: 5 });
      bericht.importe = { summe: modell.summe, letzte: modell.auftraege.map(({ abgewiesen, ...a }) => ({ ...a, abgewiesen_zeilen: abgewiesen.map((z) => z.zeile) })), wartend: modell.wartend };
    }
    for (const d of bericht.inbox.dateien) delete d.sha256;
    return ergebnis(json(bericht), false, {
      stand: bericht.stand ?? null,
      transaktionen: bericht.transaktionen ?? null,
      validator: { gueltig: validator.gueltig, fehler_anzahl: validator.fehler.length, befunde: alsBefundListe(validator.befunde) },
      ...(bericht.importe ? { importe: bericht.importe.summe } : {}),
    });
  },
};

const kennzahlen = {
  name: "kennzahlen",
  description: "Erste Wahl fuer Fragen wie \u201eWie stehen wir?\u201c, liefert dieselben Kennzahlen wie die Uebersicht: Nettovermoegen mit Aktiva/Passiva und Positionen, Summe geladener Bewegungen, Kontentabelle, naechste Aktion, Checks, anstehende Fristen (12 Monate, mit ueberfaelligen) und die Absicherung je versicherter Person (Leistungen bei BU und Tod). Bei jedem Aufruf frisch gerechnet, nur Aggregate, keine Einzelbuchungen. Rein lesend.",
  inputSchema: {
    type: "object",
    properties: { stichtag: { ...DATUM, description: "Stichtag fuer Nettovermoegen, Checks, naechste Aktion und Fristen (Default heute)" } },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
  async ausfuehren(ctx, args) {
    const stichtag = args.stichtag ?? localTodayIso();
    if (!istKalenderdatum(stichtag)) return ergebnis(`Ungueltiger Stichtag: ${stichtag} (YYYY-MM-DD, gueltiges Kalenderdatum)`, true);
    const { daten } = await ladeBestand(ctx);
    // Wie runtime.mjs im Browser: Validator-Ergebnis, keine vorab geladenen Checks.
    Object.assign(daten, { validation: validateMasterData(daten), checks: [], importfehler: [] });
    return ergebnis(kennzahlenText(daten, stichtag));
  },
};

const planIstWerkzeug = {
  name: "plan_ist",
  description: "Plan gegen Ist wie die Seite Plan & Ist: Einnahmen, Ausgaben und Sparquote aus den Buchungen gegen die Termine der Regelzahlungen, je Kategorie mit Regelzahlungen (Plan/gebucht), Einzelposten ab 400 EUR ohne Regelzahlung und Terminen ohne zugeordnete Buchung. Zeitraum: gesamt (Default, ganzer Bestand der vollen Monate), 12m, Jahr (2026), Quartal (2026-Q2) oder Monat (2026-05). Optional der Verlauf je jahr/quartal/monat. Frisch gerechnet, rein lesend.",
  inputSchema: {
    type: "object",
    properties: {
      zeitraum: { type: "string", pattern: "^(gesamt|12m|\\d{4}|\\d{4}-Q[1-4]|\\d{4}-\\d{2})$", description: "gesamt, 12m, 2026, 2026-Q2 oder 2026-05 (Default gesamt)" },
      darstellung: { type: "string", enum: ["je_monat", "summe"], description: "Ø je Monat (Default) oder Summe ueber den Zeitraum" },
      verlauf: { type: "string", enum: ["jahr", "quartal", "monat"], description: "Zusaetzlich den Verlauf je Zeitraum dieser Granularitaet" },
      stichtag: { ...DATUM, description: "Heute fuer die Grenze der vollen Monate (Default heute)" },
    },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
  async ausfuehren(ctx, args) {
    const stichtag = args.stichtag ?? localTodayIso();
    if (!istKalenderdatum(stichtag)) return ergebnis(`Ungueltiger Stichtag: ${stichtag} (YYYY-MM-DD, gueltiges Kalenderdatum)`, true);
    const { daten } = await ladeBestand(ctx);
    return ergebnis(planIstText(daten, stichtag, { zeitraum: args.zeitraum ?? "gesamt", darstellung: args.darstellung, verlauf: args.verlauf }));
  },
};

const transaktionenAbfragen = {
  name: "transaktionen_abfragen",
  description: "Transaktionen filtern und optional gruppieren. Alle Filter sind UND-verknuepft; text sucht case-insensitiv als Teilstring in Gegenpartei, Verwendungszweck und Bemerkung; immobilie filtert auf den Immobilienbezug, person auf fuer_person_id (fuer wen die Buchung ist). Ohne gruppieren_nach: Zeilen (limit Default 100, max 1000) plus Anzahl und Gesamtsumme. Mit gruppieren_nach: Summen je Gruppe; Zeilen nur mit mit_zeilen:true. Summen sind Decimal-Strings, cent-genau gerechnet. Hinweis: Startzustandsbuchungen (transaktionstyp Startzustand) stehen unter der neutralen Kategorie Startzustand; in reinen Summen ueber alle Buchungen sind sie enthalten.",
  inputSchema: {
    type: "object",
    properties: {
      von: { ...DATUM, description: "Buchungsdatum ab (inklusive)" },
      bis: { ...DATUM, description: "Buchungsdatum bis (inklusive)" },
      konto: ID("KTO"),
      kategorie: ID("KAT"),
      immobilie: ID("IMM"),
      status: { type: "string", enum: ["offen", "vorgeschlagen", "bestaetigt", "abgelehnt"] },
      text: { type: "string", maxLength: 200 },
      betrag_min: BETRAG,
      betrag_max: BETRAG,
      ist_transfer: { type: "boolean" },
      gruppieren_nach: { type: "string", enum: ["monat", "kategorie", "konto", "gegenpartei", "person"] },
      mit_zeilen: { type: "boolean" },
      limit: { type: "integer", minimum: 1, maximum: 1000 },
    },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
  async ausfuehren(ctx, args) {
    const { daten } = await ladeBestand(ctx);
    const namen = {
      kategorien: Object.fromEntries(daten.kategorien.map((k) => [k.kategorie_id, k.name])),
      konten: Object.fromEntries(daten.konten.map((k) => [k.konto_id, k.name])),
      personen: Object.fromEntries((daten.personen ?? []).map((p) => [p.person_id, p.name])),
    };
    return ergebnis(json(abfragen(daten.transaktionen, args, namen)));
  },
};

const BILDER = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };

function programm(befehl, args) {
  return new Promise((resolve, reject) => {
    execFile(befehl, args, { maxBuffer: 64 * 1024 * 1024, timeout: 120000, encoding: "buffer" }, (error, stdout) => {
      if (error) reject(error); else resolve(stdout);
    });
  });
}

function zeilenbereich(text, von, bis, relativ) {
  const zeilen = text.split("\n");
  if (zeilen.at(-1) === "") zeilen.pop();
  if (!von && !bis) return text;
  const a = Math.max(1, von ?? 1);
  const b = Math.min(zeilen.length, bis ?? zeilen.length);
  return `# ${relativ}: Zeilen ${a}-${b} von ${zeilen.length}\n${zeilen.slice(a - 1, b).join("\n")}`;
}

const dateiLesen = {
  name: "datei_lesen",
  description: "Datei lesen, Pfad relativ zum App-Raum. Erlaubt: data/, Belege/, docs/, schemas/ sowie die Repo-Doku ../docs/ und ../CONTEXT.md. Textdateien bis 2 MB (groessere nur mit Zeilenbereich); ein Ordner liefert seine Eintraege. PDFs: liefert den .txt-Zwilling bzw. pdftotext-Text; mit seite:N die gerenderte Seite als Bild (fuer Bildscans). Bilder (png/jpg) bis 5 MB: liefert den .txt-Zwilling (meist OCR), sonst das Bild; mit seite:1 immer das Bild.",
  inputSchema: {
    type: "object",
    properties: {
      pfad: { type: "string" },
      von_zeile: { type: "integer", minimum: 1 },
      bis_zeile: { type: "integer", minimum: 1 },
      seite: { type: "integer", minimum: 1, description: "PDF: Seite als Bild rendern. Bild: seite:1 liefert das Bild statt des Textzwillings" },
    },
    required: ["pfad"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
  async ausfuehren(ctx, args) {
    const { absolut, relativ } = await loesePfad(ctx.app, args.pfad, LESE_WURZELN);
    const info = await stat(absolut).catch(() => null);
    if (!info) return ergebnis(`${relativ} existiert nicht`, true);
    if (info.isDirectory()) {
      const eintraege = (await readdir(absolut, { withFileTypes: true }))
        .filter((e) => !e.name.startsWith("."))
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name)).sort();
      return ergebnis(`# ${relativ}/\n${eintraege.join("\n")}`);
    }
    const endung = path.extname(absolut).toLowerCase();
    if (endung === ".pdf") {
      if (args.seite) {
        const ordner = await mkdtemp(path.join(tmpdir(), "finanzen-mcp-seite-"));
        try {
          await programm("pdftoppm", ["-f", String(args.seite), "-l", String(args.seite), "-r", "110", "-png", "-singlefile", absolut, path.join(ordner, "seite")]);
          const bild = await readFile(path.join(ordner, "seite.png"));
          return { content: [{ type: "image", data: bild.toString("base64"), mimeType: "image/png" }] };
        } catch (error) {
          return ergebnis(`Seite ${args.seite} von ${relativ} nicht renderbar (pdftoppm): ${error.message}`, true);
        } finally {
          await rm(ordner, { recursive: true, force: true });
        }
      }
      // Der Zwilling ist ein eigener Pfad und muss selbst durch den Pfadschutz
      // (sonst liest ein Symlink daneben Dateien ausserhalb der Wurzeln).
      let zwilling;
      try {
        zwilling = await loesePfad(ctx.app, relativ.replace(/\.pdf$/i, ".txt"), LESE_WURZELN);
      } catch (error) {
        if (error instanceof PfadFehler) return ergebnis(`Textzwilling zu ${relativ}: ${error.message}`, true);
        throw error;
      }
      const zwillingText = await readFile(zwilling.absolut, "utf8").catch(() => null);
      if (zwillingText !== null) {
        return ergebnis(`# Textzwilling ${zwilling.relativ}\n${zeilenbereich(zwillingText, args.von_zeile, args.bis_zeile, relativ)}`);
      }
      try {
        const text = (await programm("pdftotext", ["-layout", absolut, "-"])).toString("utf8");
        if (!text.trim()) return ergebnis(`${relativ} hat keine Textebene (Bildscan). Seiten mit seite:N als Bild lesen.`);
        return ergebnis(`# pdftotext -layout ${relativ} (kein Textzwilling vorhanden)\n${zeilenbereich(text, args.von_zeile, args.bis_zeile, relativ)}`);
      } catch (error) {
        return ergebnis(`${relativ}: kein Textzwilling und pdftotext nicht verfuegbar (${error.message}). Seiten mit seite:N als Bild lesen.`, true);
      }
    }
    if (BILDER[endung]) {
      // Wie beim PDF: der Textzwilling (meist OCR) ist billiger als das Bild.
      // Auch er muss durch den Pfadschutz.
      if (!args.seite) {
        let zwilling;
        try {
          zwilling = await loesePfad(ctx.app, relativ.slice(0, -endung.length) + ".txt", LESE_WURZELN);
        } catch (error) {
          if (!(error instanceof PfadFehler)) throw error;
        }
        const zwillingText = zwilling ? await readFile(zwilling.absolut, "utf8").catch(() => null) : null;
        if (zwillingText !== null) {
          return ergebnis(`# Textzwilling ${zwilling.relativ} (das Bild selbst: datei_lesen mit seite:1)\n${zeilenbereich(zwillingText, args.von_zeile, args.bis_zeile, relativ)}`);
        }
      }
      if (info.size > MAX_BILD) return ergebnis(`${relativ} ist groesser als 5 MB`, true);
      return { content: [{ type: "image", data: (await readFile(absolut)).toString("base64"), mimeType: BILDER[endung] }] };
    }
    if (info.size > MAX_TEXT && !args.von_zeile && !args.bis_zeile) {
      return ergebnis(`${relativ} hat ${(info.size / 1048576).toFixed(1)} MB — von_zeile/bis_zeile angeben oder transaktionen_abfragen bzw. dateien_suchen nutzen.`, true);
    }
    if (info.size > 64 * 1024 * 1024) return ergebnis(`${relativ} ist zu gross`, true);
    const puffer = await readFile(absolut);
    if (puffer.subarray(0, 8000).includes(0)) return ergebnis(`${relativ} ist eine Binaerdatei (${endung || "ohne Endung"}) und nicht als Text lesbar.`, true);
    const text = zeilenbereich(puffer.toString("utf8"), args.von_zeile, args.bis_zeile, relativ);
    if (Buffer.byteLength(text) > MAX_TEXT) return ergebnis("Ausschnitt groesser als 2 MB — Zeilenbereich verkleinern.", true);
    return ergebnis(text);
  },
};

function globZuRegex(muster) {
  let re = "";
  for (let i = 0; i < muster.length; i += 1) {
    const c = muster[i];
    if (c === "*" && muster[i + 1] === "*") {
      if (muster[i + 2] === "/") { re += "(?:.*/)?"; i += 2; } else { re += ".*"; i += 1; }
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i");
}

// Ein Ordner ist die Basis eines Generationsbestands, wenn er den Zeiger und
// den Generationsordner enthaelt (ADR 0035).
async function istGenerationsBasis(ordner) {
  const zeiger = await lstat(path.join(ordner, ZEIGER)).catch(() => null);
  return Boolean(zeiger?.isSymbolicLink()) && Boolean((await stat(path.join(ordner, GENERATIONEN)).catch(() => null))?.isDirectory());
}

// Liefert { echt, relativ }: echt ist die gelesene Datei, relativ der Pfad, den
// das Werkzeug zeigt. Ein Generationsbestand wird nur mit seiner aktuellen
// Generation durchsucht, unter dem Namen des Datenroots (data/master ist nach
// der Migration ein Symlink auf <basis>/aktuell, die Basis liegt daneben);
// alte Generationen und eine schon besuchte Generation werden uebersprungen.
// Generationen sind unveraenderlich, darum reicht hier der Zeiger statt einer Lease.
async function* dateienUnter(ctx, absolut, anzeige = absolut, besucht = new Set()) {
  const relativ = () => logisch(ctx.app, anzeige);
  const info = await lstat(absolut).catch(() => null);
  if (!info) return;
  if (info.isSymbolicLink()) {
    // Nur ein Datenroot, der auf die Generation eines Bestands direkt daneben
    // zeigt, wird verfolgt; jeder andere Symlink bleibt aussen vor.
    const ziel = await realpath(absolut).catch(() => null);
    const basis = ziel && path.dirname(path.dirname(ziel));
    if (!ziel || path.dirname(basis) !== (await realpath(path.dirname(absolut))) || !(await istGenerationsBasis(basis))) return;
    if (besucht.has(ziel)) return;
    besucht.add(ziel);
    yield* dateienUnter(ctx, ziel, anzeige, besucht);
    return;
  }
  if (info.isFile()) { yield { echt: absolut, relativ: relativ() }; return; }
  if (!info.isDirectory()) return;
  if (await istGenerationsBasis(absolut)) {
    const aktuell = await realpath(path.join(absolut, ZEIGER));
    if (besucht.has(aktuell)) return;
    besucht.add(aktuell);
    yield* dateienUnter(ctx, aktuell, anzeige, besucht);
    return;
  }
  for (const e of (await readdir(absolut, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith(".")) continue;
    yield* dateienUnter(ctx, path.join(absolut, e.name), path.join(anzeige, e.name), besucht);
  }
}

const dateienSuchen = {
  name: "dateien_suchen",
  description: "Dateien in data/, Belege/, docs/, schemas/ und der Repo-Doku (../docs/, ../CONTEXT.md) finden. muster ist ein Glob relativ zum App-Raum (*, **, ?; ohne / wird nur der Dateiname verglichen), text eine case-insensitive Teilstring-Suche in Textdateien (PDFs ueber ihren .txt-Zwilling). Liefert Pfade bzw. pfad:zeile: inhalt.",
  inputSchema: {
    type: "object",
    properties: {
      muster: { type: "string", maxLength: 300 },
      text: { type: "string", minLength: 1, maxLength: 300 },
      limit: { type: "integer", minimum: 1, maximum: 500, description: "Max. Treffer (Default 50)" },
    },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
  async ausfuehren(ctx, args) {
    if (!args.muster && !args.text) return ergebnis("muster und/oder text angeben", true);
    const limit = args.limit ?? 50;
    const regex = args.muster ? globZuRegex(args.muster) : null;
    const nadel = args.text?.toLowerCase();
    const treffer = [];
    const besucht = new Set();
    // Ein Ort kann unter zwei Wurzeln liegen (externer Datenort: Belege/ auch
    // unter data/); jede Datei zaehlt einmal.
    const gesehen = new Set();
    for (const start of LESE_WURZELN.flatMap((w) => physischeWurzeln(ctx.app, w))) {
      for await (const { echt: datei, relativ } of dateienUnter(ctx, start, start, besucht)) {
        if (gesehen.has(relativ)) continue;
        gesehen.add(relativ);
        if (regex && !regex.test(args.muster.includes("/") ? relativ : path.basename(relativ))) continue;
        if (!nadel) {
          treffer.push(relativ);
        } else {
          const info = await stat(datei);
          if (info.size > MAX_TEXT || /\.(pdf|xlsx?|png|jpe?g|gif|webp)$/i.test(datei)) continue;
          const puffer = await readFile(datei);
          if (puffer.subarray(0, 8000).includes(0)) continue;
          const zeilen = puffer.toString("utf8").split("\n");
          for (let i = 0; i < zeilen.length && treffer.length < limit; i += 1) {
            if (zeilen[i].toLowerCase().includes(nadel)) treffer.push(`${relativ}:${i + 1}: ${zeilen[i].trim().slice(0, 240)}`);
          }
        }
        if (treffer.length >= limit) {
          return ergebnis(`${treffer.join("\n")}\n(Limit ${limit} erreicht — Suche einschraenken)`);
        }
      }
    }
    return ergebnis(treffer.length ? treffer.join("\n") : "Keine Treffer.");
  },
};

// ---------------------------------------------------------------- Schreiben

// Ziel eines Dateiwerkzeugs: nur im Bestand der Sitzung (samt Inbox,
// Importprofilen, Papierkorb) und nur mit erlaubter Endung.
// Kerndateien des Bestands aendern nur die Fachwerkzeuge (Review 1B.3): so
// setzt kein Datei-Edit `bestaetigt_durch: mensch`, keine Regel umgeht den
// Probelauf, kein Protokolleintrag faelscht einen Werkzeug-Anlass.
export const KERNDATEIEN = Object.freeze({
  "transaktionen.jsonl": "Buchungen nur ueber die Fachwerkzeuge: bestaetigen (menschliche Entscheidung), agent_vorschlag, nachkategorisieren, freigabe, transfers, transfer_extern, immobilienbezug, personenbezug, regelzahlungen_zuordnen; neue Buchungen ueber eine standardisierte JSONL in der Inbox und import",
  "transfers.json": "Transfers ueber transfers (interne Paare) oder transfer_extern",
  "agent_log.jsonl": "Protokollzeilen ueber protokoll_eintrag; die Werkzeuge protokollieren ihre Laeufe selbst",
  "kategorisierungsregeln.json": "Regeln ueber regel_schreiben (mit Probelauf), danach nachkategorisieren",
});

async function schreibZiel(ctx, pfad) {
  const ziel = await loesePfad(ctx.app, pfad, bestandWurzeln(ctx).schreiben);
  pruefeEndung(ziel.relativ);
  const bestand = await realpath(ctx.datenroot).catch(() => path.resolve(ctx.datenroot));
  // Klein geschrieben verglichen: auf macOS (APFS) ist AGENT_LOG.jsonl dieselbe Datei.
  const imBestand = [path.resolve(ctx.datenroot), bestand].map((w) => path.relative(w, ziel.absolut).normalize("NFC").toLowerCase());
  let name = imBestand.find((rel) => Object.hasOwn(KERNDATEIEN, rel));
  // Dieselbe Datei unter anderem Namen (Hardlink, Alias): ueber Geraet und Inode.
  const info = name ? null : await stat(ziel.absolut).catch(() => null);
  if (info) {
    for (const kern of Object.keys(KERNDATEIEN)) {
      const k = await stat(path.join(bestand, kern)).catch(() => null);
      if (k && k.dev === info.dev && k.ino === info.ino) name = kern;
    }
  }
  if (name) throw new PfadFehler(`${ziel.relativ} ist fuer Datei-Edits gesperrt. ${KERNDATEIEN[name]}.`);
  return ziel;
}

const dateiSchreiben = {
  name: "datei_schreiben",
  description: "Ganze Textdatei im Bestand der Sitzung oder in dessen Inbox/Importprofilen schreiben oder anlegen (max. 10 MB), z. B. eine standardisierte JSONL unter <inbox>/standardized/ (data/master: data/inbox/), ein Importprofil (data/master: data/import-profile/) oder eine Masterdatei. Nicht die Kerndateien transaktionen.jsonl, transfers.json, agent_log.jsonl, kategorisierungsregeln.json (dafuer die Fachwerkzeuge, u. a. protokoll_eintrag und regel_schreiben). Nur Endungen json, jsonl, csv, txt, md, pdf, png, jpg. Mit anhaengen:true wird der Inhalt als Zeile(n) ans Dateiende gehaengt. Nicht Belege/, nicht andere Bestaende. Vorschau ist Default; erst schreiben:true schreibt. Danach laeuft der Validator; bei neuen Fehlern oder einem Werkzeugfehler wird nichts uebernommen. Kategorien nie per Datei-Edit an Transaktionen setzen — dafuer gibt es bestaetigen/agent_vorschlag.",
  inputSchema: {
    type: "object",
    properties: { pfad: { type: "string" }, inhalt: { type: "string" }, anhaengen: { type: "boolean" }, schreiben: SCHREIBEN },
    required: ["pfad", "inhalt"],
    additionalProperties: false,
  },
  nurSchreiben: true,
  async ausfuehren(ctx, args) {
    const { absolut, relativ } = await schreibZiel(ctx, args.pfad);
    const bytes = Buffer.byteLength(args.inhalt);
    if (bytes > MAX_SCHREIBEN) return ergebnis("Inhalt groesser als 10 MB", true);
    const info = await stat(absolut).catch(() => null);
    if (info?.isDirectory()) return ergebnis(`${relativ} ist ein Ordner`, true);
    if (!args.schreiben) {
      const was = args.anhaengen ? `${bytes} Bytes an ${relativ} anhaengen` : `${relativ} ${info ? "ueberschreiben" : "anlegen"} (${bytes} Bytes)`;
      return ergebnis(`Vorschau (nichts geschrieben): wuerde ${was}. Mit schreiben:true ausfuehren.`);
    }
    return mitRollback(ctx.datenroot, async (s) => {
      const ziel = s.pfad(absolut);
      if (args.anhaengen) {
        // Nur eine fehlende Datei gilt als leer; jeder andere Lesefehler bricht ab,
        // sonst ersetzte das Anhaengen den unlesbaren Inhalt.
        const bisher = await readFile(ziel, "utf8").catch((error) => {
          if (error.code === "ENOENT") return "";
          throw error;
        });
        await ersetzeDatei(ziel, `${bisher.replace(/\n*$/, bisher ? "\n" : "")}${args.inhalt.replace(/\n*$/, "\n")}`);
        return ergebnis(`${relativ}: ${bytes} Bytes angehaengt.`);
      }
      await ersetzeDatei(ziel, args.inhalt);
      return ergebnis(`${relativ} geschrieben (${bytes} Bytes).`);
    });
  },
};

const dateiErsetzen = {
  name: "datei_ersetzen",
  description: "Exakten Textabschnitt in einer Datei im Bestand der Sitzung oder in dessen Inbox/Importprofilen ersetzen. alt muss genau einmal vorkommen (sonst Fehler, nichts geaendert). Vorschau ist Default; erst schreiben:true schreibt. Danach laeuft der Validator; bei neuen Fehlern oder einem Werkzeugfehler wird nichts uebernommen.",
  inputSchema: {
    type: "object",
    properties: { pfad: { type: "string" }, alt: { type: "string", minLength: 1 }, neu: { type: "string" }, schreiben: SCHREIBEN },
    required: ["pfad", "alt", "neu"],
    additionalProperties: false,
  },
  nurSchreiben: true,
  async ausfuehren(ctx, args) {
    const { absolut, relativ } = await schreibZiel(ctx, args.pfad);
    const pruefen = async (datei = absolut) => {
      const info = await stat(datei).catch(() => null);
      if (!info?.isFile()) return { fehler: `${relativ} existiert nicht` };
      if (info.size > MAX_SCHREIBEN) return { fehler: `${relativ} ist groesser als 10 MB` };
      const text = await readFile(datei, "utf8");
      const erste = text.indexOf(args.alt);
      if (erste < 0) return { fehler: `alt kommt in ${relativ} nicht vor — nichts geaendert` };
      if (text.indexOf(args.alt, erste + 1) >= 0) return { fehler: `alt kommt in ${relativ} mehrfach vor — mehr Kontext angeben, nichts geaendert` };
      return { text, erste };
    };
    const vorab = await pruefen();
    if (vorab.fehler) return ergebnis(vorab.fehler, true);
    if (!args.schreiben) {
      const zeile = vorab.text.slice(0, vorab.erste).split("\n").length;
      return ergebnis(`Vorschau (nichts geschrieben): wuerde in ${relativ} 1 Stelle ab Zeile ${zeile} ersetzen. Mit schreiben:true ausfuehren.`);
    }
    return mitRollback(ctx.datenroot, async (s) => {
      // Unter der Sperre im Entwurf neu lesen: dazwischen kann ein anderer
      // Aufruf die Datei geaendert haben.
      const jetzt = await pruefen(s.pfad(absolut));
      if (jetzt.fehler) return ergebnis(jetzt.fehler, true);
      await ersetzeDatei(s.pfad(absolut), jetzt.text.slice(0, jetzt.erste) + args.neu + jetzt.text.slice(jetzt.erste + args.alt.length));
      return ergebnis(`${relativ}: 1 Stelle ersetzt.`);
    });
  },
};

// Werkzeuge, die Dateien verschieben (Inbox, Papierkorb, Belege/): die
// Verschiebung nimmt ein Zuruecksetzen nicht zurueck, also setzt nur ein neuer
// Validatorfehler den Bestand zurueck, nicht schon ein Werkzeugfehler (sonst
// zeigten umgeschriebene Verweise ins Leere).
const mitVerschieben = (ctx, fn) => mitRollback(ctx.datenroot, fn, { rueckrollungBeiFehler: false });

// Ablage nach Objekt (agent-context, "Ablage nach Objekt"): Belege/<Klasse>/...
// Klassen mit Stammsatz verlangen <ID>_<Kurzname> oder Allgemein als Ordner.
// Immobilien haben kein Allgemein, sondern feste Bereiche; Jahresordner nur dort,
// wo jedes Jahr Belege dazukommen (true = Jahr Pflicht, "frei" = Jahr erlaubt).
const BELEG_KLASSEN = {
  Konten: "KTO", Immobilien: "IMM", Darlehen: "DAR", Vorsorge: "VS", Vermoegenswerte: "VMW",
  Versicherungen: null, Steuern: null, Sonstiges: null,
};
const IMMOBILIEN_BEREICHE = { Erwerb: false, Bau: false, Technik: false, "Laufende-Kosten": true, Vermietung: "frei" };

function pruefeImmobilienZiel(teile) {
  if (!/^IMM-\d+_/.test(teile[2])) return `Ordner unter Belege/Immobilien/ muss IMM-<Nr>_<Kurzname> heissen, nicht ${teile[2]} (Belege zu mehreren Immobilien liegen als Kopie bei jeder)`;
  const bereich = teile[3];
  const bereiche = Object.keys(IMMOBILIEN_BEREICHE).join(", ");
  if (teile.length < 5 || !Object.hasOwn(IMMOBILIEN_BEREICHE, bereich)) return `Unter ${teile[2]}/ muss ein Bereich folgen: ${bereiche}`;
  const jahr = IMMOBILIEN_BEREICHE[bereich];
  const mitJahr = teile.length === 6 && /^\d{4}$/.test(teile[4]);
  if (jahr === true && !mitJahr) return `${bereich}/ verlangt einen Jahresordner (Abrechnungsjahr): ${teile.slice(0, 4).join("/")}/<Jahr>/<Datei>`;
  if (jahr === "frei" && teile.length !== 5 && !mitJahr) return `Unter ${bereich}/ liegt eine Datei direkt oder in einem Jahresordner (Abrechnungsjahr)`;
  if (jahr === false && teile.length !== 5) return `${bereich}/ hat keine Unterordner; das Datum steht im Dateinamen`;
  return null;
}

export function pruefeBelegZiel(relativ) {
  const teile = relativ.split("/");
  const klasse = teile[1];
  if (teile[0] !== "Belege" || !Object.hasOwn(BELEG_KLASSEN, klasse) || teile.length < 4) {
    return `Ziel muss unter Belege/<Klasse>/.../<Datei> liegen, Klasse eine von ${Object.keys(BELEG_KLASSEN).join(", ")} (agent-context: Ablage nach Objekt)`;
  }
  if (klasse === "Immobilien") return pruefeImmobilienZiel(teile);
  const praefix = BELEG_KLASSEN[klasse];
  if (praefix && teile[2] !== "Allgemein" && !new RegExp(`^${praefix}-\\d+_`).test(teile[2])) {
    return `Ordner unter Belege/${klasse}/ muss ${praefix}-<Nr>_<Kurzname> oder Allgemein heissen, nicht ${teile[2]}`;
  }
  return null;
}

const belegAblegen = {
  name: "beleg_ablegen",
  description: "Rohbeleg aus der Inbox (data/inbox/, auch processed/, error/; nur Bestand data/master) sprechend benannt unter Belege/ ablegen, nach Objekt und Jahr, z. B. Belege/Konten/<KTO-ID>_<Kurzname>/<Jahr>/... (Regel: agent-context, Ablage nach Objekt) Verschiebt, legt fehlende Ordner an, ueberschreibt nie, Endung bleibt gleich. Ein .txt-Zwilling gleichen Namens neben der Quelle wird mitgenommen (so kommt ein von Hand geschriebener Bildscan-Zwilling an den Beleg: erst per datei_schreiben neben die Quelle legen). Vorschau ist Default; erst schreiben:true verschiebt. Wird bei einem Rollback nicht zurueckgenommen.",
  inputSchema: {
    type: "object",
    properties: {
      quelle: { type: "string", description: "z. B. data/inbox/processed/scan0001.pdf" },
      ziel: { type: "string", description: "z. B. Belege/Versicherungen/KFZ_MusterversicherungB_12345/2026/KFZ_MusterversicherungB_Beitragsrechnung_2026.pdf" },
      schreiben: SCHREIBEN,
    },
    required: ["quelle", "ziel"],
    additionalProperties: false,
  },
  nurSchreiben: true,
  async ausfuehren(ctx, args) {
    const belege = belegeWurzel(ctx);
    const quelle = await loesePfad(ctx.app, args.quelle, [bestandWurzeln(ctx).inbox]);
    const ziel = await loesePfad(ctx.app, args.ziel, [belege]);
    pruefeKeinAktiverTyp(ziel.relativ);
    const falschesZiel = pruefeBelegZiel(ziel.relativ);
    if (falschesZiel) return ergebnis(falschesZiel, true);
    if (!(await lstat(quelle.absolut).catch(() => null))?.isFile()) return ergebnis(`${quelle.relativ} ist keine Datei`, true);
    const endung = path.extname(quelle.absolut).toLowerCase();
    if (path.extname(ziel.absolut).toLowerCase() !== endung) return ergebnis(`Ziel muss dieselbe Endung haben (${endung || "keine"})`, true);
    const paare = [[quelle, ziel]];
    if (endung !== ".txt") {
      const zwilling = quelle.absolut.slice(0, -endung.length || undefined) + ".txt";
      if ((await lstat(zwilling).catch(() => null))?.isFile()) {
        const zielZwilling = ziel.absolut.slice(0, -endung.length || undefined) + ".txt";
        paare.push([{ absolut: zwilling, relativ: logisch(ctx.app, zwilling) }, { absolut: zielZwilling, relativ: logisch(ctx.app, zielZwilling) }]);
      }
    }
    for (const [, z] of paare) {
      if (await lstat(z.absolut).catch(() => null)) return ergebnis(`${z.relativ} existiert bereits — nichts verschoben`, true);
    }
    const bericht = paare.map(([q, z]) => `${q.relativ} -> ${z.relativ}`).join("\n");
    if (!args.schreiben) return ergebnis(`Vorschau (nichts verschoben):\n${bericht}`);
    return mitVerschieben(ctx, async (s) => {
      await mkdir(path.dirname(s.pfad(ziel.absolut)), { recursive: true });
      for (const [q, z] of paare) await rename(s.pfad(q.absolut), s.pfad(z.absolut));
      return ergebnis(paare.map(([q, z]) => `${q.relativ} -> ${z.relativ}`).join("\n"));
    });
  },
};

// Eine Protokollzeile im Format der CLIs (inbox.mjs) ans agent_log.jsonl des Entwurfs.
async function protokolliere(s, eintrag) {
  const absolut = path.join(s.ordner, "agent_log.jsonl");
  const bisher = await readFile(absolut, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  const zeile = { zeitpunkt: new Date().toISOString(), ...eintrag, anzahl_importiert: 0, anzahl_offen: 0, anzahl_fehler: 0 };
  await ersetzeDatei(absolut, `${bisher.replace(/\n*$/, bisher ? "\n" : "")}${JSON.stringify(zeile)}\n`);
}

const istDatei = async (absolut) => Boolean((await lstat(absolut).catch(() => null))?.isFile());
const TEXTVORLAUF = /\.(pdf|png|jpe?g|gif|webp|heic)$/i;

// Eine Inbox-Datei samt Mitlaeufern (Zwilling daneben, Textvorlauf in
// standardized/, Fehlernotiz in error/) fuer den Papierkorb planen: Paare
// [quelle, ziel], ein gemeinsames Suffix bei Namenskollision.
async function planePapierkorb(ctx, quelle) {
  const w = bestandWurzeln(ctx);
  const inbox = physisch(ctx.app, w.inbox);
  const unter = path.relative(inbox, quelle.absolut);
  const ordner = path.dirname(unter);
  const name = path.basename(unter);
  const endung = path.extname(name);
  const stamm = name.slice(0, name.length - endung.length);
  // Jedes Mitglied der Gruppe: Quelle (relativ zu data/inbox) und Name als
  // Stamm + Rest, damit ein Suffix alle Mitglieder gleich trifft.
  const gruppe = [{ unter, ordner, rest: endung }];
  const kandidaten = [];
  if (endung.toLowerCase() !== ".txt") kandidaten.push({ unter: path.join(ordner, `${stamm}.txt`), ordner, rest: ".txt" });
  if (TEXTVORLAUF.test(name) && ordner !== "standardized") kandidaten.push({ unter: path.join("standardized", `${stamm}.txt`), ordner: "standardized", rest: ".txt" });
  if (ordner === "error") kandidaten.push({ unter: path.join(ordner, `${name}.fehler.txt`), ordner, rest: `${endung}.fehler.txt` });
  for (const k of kandidaten) {
    // Auch die Mitlaeufer muessen durch den Pfadschutz (Symlink daneben).
    const geprueft = await loesePfad(ctx.app, path.join(w.inbox, k.unter), [w.inbox]).catch(() => null);
    if (geprueft && (await istDatei(geprueft.absolut))) gruppe.push(k);
  }
  const korb = path.join(w.papierkorb, localTodayIso());
  const zielFuer = (g, n) => path.join(korb, g.ordner, `${stamm}${n > 1 ? `-${n}` : ""}${g.rest}`);
  let n = 1;
  for (;;) {
    const belegt = await Promise.all(gruppe.map((g) => lstat(physisch(ctx.app, zielFuer(g, n))).then(() => true, () => false)));
    if (!belegt.some(Boolean)) break;
    n += 1;
  }
  const paare = [];
  for (const g of gruppe) {
    paare.push([
      { absolut: path.join(inbox, g.unter), relativ: path.join(w.inbox, g.unter).split(path.sep).join("/") },
      await loesePfad(ctx.app, zielFuer(g, n), [w.papierkorb]),
    ]);
  }
  return paare;
}

// Ein Beleg unter Belege/ samt .txt-Zwilling fuer den Papierkorb planen:
// data/papierkorb/<Datum>/Belege/..., ein gemeinsames Suffix bei Namenskollision.
async function planeBelegKorb(ctx, beleg) {
  const endung = path.extname(beleg.absolut);
  const stamm = beleg.absolut.slice(0, beleg.absolut.length - endung.length);
  const gruppe = [{ absolut: beleg.absolut, rest: endung }];
  if (endung.toLowerCase() !== ".txt") {
    // Auch der Zwilling muss durch den Pfadschutz (Symlink daneben).
    const zwilling = await loesePfad(ctx.app, logisch(ctx.app, `${stamm}.txt`), [belegeWurzel(ctx)]).catch(() => null);
    if (zwilling && (await istDatei(zwilling.absolut))) gruppe.push({ absolut: zwilling.absolut, rest: ".txt" });
  }
  const { papierkorb } = bestandWurzeln(ctx);
  const korbStamm = path.join(papierkorb, localTodayIso(), logisch(ctx.app, stamm));
  const zielFuer = (g, n) => `${korbStamm}${n > 1 ? `-${n}` : ""}${g.rest}`;
  let n = 1;
  while ((await Promise.all(gruppe.map((g) => lstat(physisch(ctx.app, zielFuer(g, n))).then(() => true, () => false)))).some(Boolean)) n += 1;
  const paare = [];
  for (const g of gruppe) {
    paare.push([
      { absolut: g.absolut, relativ: logisch(ctx.app, g.absolut) },
      await loesePfad(ctx.app, zielFuer(g, n), [papierkorb]),
    ]);
  }
  return paare;
}

// Stamm- und Bewegungsdaten, die einen Belegpfad als ganzen Pfad nennen
// (agent_log.jsonl ausgenommen: das Protokoll haelt fest, was damals war).
async function datenMitVerweis(ctx, pfade) {
  const namen = (await readdir(ctx.datenroot)).filter((n) => /\.(json|jsonl)$/.test(n) && n !== "agent_log.jsonl").sort();
  const treffer = [];
  for (const name of namen) {
    const text = await readFile(path.join(ctx.datenroot, name), "utf8");
    const { anzahl } = ersetzeVerweise(text, pfade.map((p) => [p, p]));
    if (anzahl) treffer.push({ name, text, anzahl });
  }
  return treffer;
}

async function inDenPapierkorb(paare, s) {
  for (const [q, z] of paare) {
    // Wie data/ selbst: nicht fuer alle lesbar (die umask allein liesse 775 zu).
    await mkdir(path.dirname(s.pfad(z.absolut)), { recursive: true, mode: 0o750 });
    await rename(s.pfad(q.absolut), s.pfad(z.absolut));
  }
}

const inboxVerwerfen = {
  name: "inbox_verwerfen",
  description: "Datei aus der Inbox des Bestands (data/master: data/inbox/, auch error/, standardized/, processed/) in dessen Papierkorb (data/master: data/papierkorb/<JJJJ-MM-TT>/) verschieben, z. B. ein erkanntes Duplikat. Nichts wird geloescht: die Unterstruktur unterhalb von data/inbox/ bleibt erhalten, bei Namenskollision bekommt die Datei ein Suffix (-2, -3 ...), ueberschrieben wird nie. Mit wandern: der gleichnamige .txt-Zwilling daneben, der Textvorlauf in standardized/ und eine Fehlernotiz <name>.fehler.txt in error/. grund wird als notiz in agent_log.jsonl protokolliert. Den Papierkorb leert nur der Nutzer. Vorschau ist Default; erst schreiben:true verschiebt. Wird bei einem Rollback nicht zurueckgenommen.",
  inputSchema: {
    type: "object",
    properties: {
      pfad: { type: "string", description: "z. B. data/inbox/auszug-2.pdf oder data/inbox/error/auszug.csv" },
      grund: { type: "string", maxLength: 300, description: "Kurz, z. B. \"Duplikat von data/inbox/processed/auszug.pdf\"" },
      schreiben: SCHREIBEN,
    },
    required: ["pfad"],
    additionalProperties: false,
  },
  nurSchreiben: true,
  async ausfuehren(ctx, args) {
    const quelle = await loesePfad(ctx.app, args.pfad, [bestandWurzeln(ctx).inbox]);
    if (!(await istDatei(quelle.absolut))) return ergebnis(`${quelle.relativ} ist keine Datei`, true);
    const paare = await planePapierkorb(ctx, quelle);
    if (!args.schreiben) return ergebnis(`Vorschau (nichts verschoben):\n${paare.map(([q, z]) => `${q.relativ} -> ${z.relativ}`).join("\n")}`);
    return mitVerschieben(ctx, async (s) => {
      await inDenPapierkorb(paare, s);
      await protokolliere(s, {
        anlass: "inbox-verwerfen",
        inputs: paare.map(([q]) => q.relativ),
        papierkorb: paare.map(([, z]) => z.relativ),
        notiz: args.grund?.trim() || "Datei aus der Inbox verworfen",
      });
      return ergebnis(`Verworfen (Papierkorb):\n${paare.map(([q, z]) => `${q.relativ} -> ${z.relativ}`).join("\n")}`);
    });
  },
};

const belegTeilen = {
  name: "beleg_teilen",
  description: "Sammelscan aus der Inbox des Bestands (data/master: data/inbox/, auch processed/, error/) in einzelne PDFs zerlegen, z. B. mehrere zusammengescannte Briefe. Jeder Teil nennt seine Seiten (\"1-4\", \"5\", \"1-2,7\") und einen sprechenden Dateinamen; jede Seite gehoert genau einem Teil. Die Teile landen in der Inbox-Wurzel data/inbox/ und gehen von dort den normalen Weg (inbox-Lauf, beleg_ablegen); das Original wandert samt Zwilling und Textvorlauf in den Papierkorb wie bei inbox_verwerfen. Ueberschreibt nie. Vorschau ist Default; wird bei einem Rollback nicht zurueckgenommen.",
  inputSchema: {
    type: "object",
    properties: {
      quelle: { type: "string", description: "z. B. data/inbox/scan0001.pdf" },
      teile: {
        type: "array",
        minItems: 2,
        maxItems: 50,
        items: {
          type: "object",
          properties: {
            seiten: { type: "string", maxLength: 100, description: "z. B. 1-4" },
            name: { type: "string", maxLength: 200, pattern: "^[^/\\\\]+\\.pdf$", description: "Dateiname ohne Pfad, z. B. 2025_Versicherer_Statusreport-2024_123.pdf" },
          },
          required: ["seiten", "name"],
          additionalProperties: false,
        },
      },
      schreiben: SCHREIBEN,
    },
    required: ["quelle", "teile"],
    additionalProperties: false,
  },
  nurSchreiben: true,
  async ausfuehren(ctx, args) {
    const { inbox } = bestandWurzeln(ctx);
    const quelle = await loesePfad(ctx.app, args.quelle, [inbox]);
    if (!(await istDatei(quelle.absolut))) return ergebnis(`${quelle.relativ} ist keine Datei`, true);
    if (path.extname(quelle.absolut).toLowerCase() !== ".pdf") return ergebnis(`${quelle.relativ} ist kein PDF`, true);
    const namen = args.teile.map((t) => t.name.toLowerCase());
    if (new Set(namen).size !== namen.length) return ergebnis("Jeder Teil braucht einen eigenen Dateinamen", true);
    const info = (await programm("pdfinfo", [quelle.absolut])).toString("utf8");
    const seitenzahl = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1]);
    if (!seitenzahl) return ergebnis(`Seitenzahl von ${quelle.relativ} nicht lesbar`, true);
    let plan;
    try {
      plan = planeTeilung(seitenzahl, args.teile);
    } catch (error) {
      return ergebnis(`Seitenplan abgewiesen (${seitenzahl} Seiten):\n${error.message}`, true);
    }
    const teile = [];
    for (const teil of plan) {
      const ziel = await loesePfad(ctx.app, path.join(inbox, teil.name), [inbox]);
      if (await lstat(ziel.absolut).catch(() => null)) return ergebnis(`${ziel.relativ} existiert bereits — nichts geteilt`, true);
      teile.push({ ...teil, ziel });
    }
    const korb = await planePapierkorb(ctx, quelle);
    const bericht = [
      ...teile.map((t) => `${t.ziel.relativ}: Seiten ${t.seiten.join(", ")}`),
      ...korb.map(([q, z]) => `${q.relativ} -> ${z.relativ}`),
    ].join("\n");
    if (!args.schreiben) return ergebnis(`Vorschau (${seitenzahl} Seiten, nichts geschrieben):\n${bericht}`);
    return mitVerschieben(ctx, async (s) => {
      const ordner = await mkdtemp(path.join(tmpdir(), "finanzen-mcp-teilen-"));
      try {
        await programm("pdfseparate", [quelle.absolut, path.join(ordner, "seite-%d.pdf")]);
        for (const [i, teil] of teile.entries()) {
          const einzeln = teil.seiten.map((nr) => path.join(ordner, `seite-${nr}.pdf`));
          const fertig = path.join(ordner, `teil-${i + 1}.pdf`);
          if (einzeln.length === 1) await rename(einzeln[0], fertig);
          else await programm("pdfunite", [...einzeln, fertig]);
          await copyFile(fertig, s.pfad(teil.ziel.absolut), fsKonstanten.COPYFILE_EXCL);
        }
      } finally {
        await rm(ordner, { recursive: true, force: true });
      }
      await inDenPapierkorb(korb, s);
      await protokolliere(s, {
        anlass: "beleg-teilen",
        inputs: [quelle.relativ],
        teile: teile.map((t) => ({ datei: t.ziel.relativ, seiten: t.seiten })),
        papierkorb: korb.map(([, z]) => z.relativ),
        notiz: `Sammelscan mit ${seitenzahl} Seiten in ${teile.length} Teile zerlegt`,
      });
      return ergebnis(`Geteilt:\n${bericht}\nNaechster Schritt: inbox-Lauf fuer den Textvorlauf der Teile, dann beleg_ablegen.`);
    });
  },
};

const belegErgaenzen = {
  name: "beleg_ergaenzen",
  description: "Nachgereichte Seiten (PDF) in einen schon abgelegten PDF-Beleg unter Belege/ einfuegen, z. B. eine beim Scannen vergessene Rueckseite. Die Quelle liegt in data/inbox/ (auch processed/, error/) oder ist selbst schon unter Belege/ abgelegt, etwa eine versehentlich als eigener Beleg abgelegte Seite; Verweise auf sie in Stamm- und Bewegungsdaten zeigen danach auf den Beleg. nach_seite: hinter welcher Seite des Belegs (0 = vorn, ohne Angabe = ans Ende). Der Beleg behaelt Pfad und Namen; die alte Fassung samt .txt-Zwilling und die Quelle samt Mitlaeufern wandern in den Papierkorb data/papierkorb/<JJJJ-MM-TT>/. Danach belege_text mit schreiben:true fuer den neuen Zwilling. Vorschau ist Default; wird bei einem Rollback nicht zurueckgenommen.",
  inputSchema: {
    type: "object",
    properties: {
      quelle: { type: "string", description: "z. B. data/inbox/scan0002.pdf oder Belege/Vorsorge/VS-001_Muster/2026/2026_Muster_Jahresinformation_Seite-2.pdf" },
      ziel: { type: "string", description: "z. B. Belege/Vorsorge/VS-001_Muster/2026/2026_Muster_Jahresinformation.pdf" },
      nach_seite: { type: "integer", minimum: 0, description: "Einfuegen hinter dieser Seite des Belegs; 0 = vorn, ohne Angabe = ans Ende" },
      schreiben: SCHREIBEN,
    },
    required: ["quelle", "ziel"],
    additionalProperties: false,
  },
  nurSchreiben: true,
  async ausfuehren(ctx, args) {
    const belege = belegeWurzel(ctx);
    const quelle = await loesePfad(ctx.app, args.quelle, [bestandWurzeln(ctx).inbox, belege]);
    const ziel = await loesePfad(ctx.app, args.ziel, [belege]);
    const ausBelege = quelle.relativ.startsWith("Belege/");
    if (quelle.absolut === ziel.absolut) return ergebnis("Quelle und Ziel sind derselbe Beleg", true);
    for (const p of [quelle, ziel]) {
      if (!(await istDatei(p.absolut))) return ergebnis(`${p.relativ} ist keine Datei`, true);
      if (path.extname(p.absolut).toLowerCase() !== ".pdf") return ergebnis(`${p.relativ} ist kein PDF`, true);
    }
    const seitenVon = async (p) => Number(/^Pages:\s+(\d+)/m.exec((await programm("pdfinfo", [p.absolut])).toString("utf8"))?.[1]);
    const alt = await seitenVon(ziel);
    const neu = await seitenVon(quelle);
    if (!alt || !neu) return ergebnis(`Seitenzahl von ${!alt ? ziel.relativ : quelle.relativ} nicht lesbar`, true);
    const nach = args.nach_seite ?? alt;
    if (nach > alt) return ergebnis(`Seite ${nach} gibt es nicht (${ziel.relativ} hat ${alt})`, true);

    const quelleKorb = ausBelege ? await planeBelegKorb(ctx, quelle) : await planePapierkorb(ctx, quelle);
    const korb = [...(await planeBelegKorb(ctx, ziel)), ...quelleKorb];
    // Eine abgelegte Quelle verschwindet aus Belege/: ihre Verweise zeigen danach auf den Beleg.
    const zielZwilling = ziel.relativ.replace(/\.pdf$/i, ".txt");
    const ersetzungen = ausBelege ? quelleKorb.map(([q]) => [q.relativ, q.relativ.endsWith(".txt") ? zielZwilling : ziel.relativ]) : [];
    const verweise = ersetzungen.length ? await datenMitVerweis(ctx, ersetzungen.map(([von]) => von)) : [];
    const reihenfolge = nach === 0 ? "vorn" : nach === alt ? "am Ende" : `hinter Seite ${nach}`;
    const bericht = [
      `${ziel.relativ}: ${alt} + ${neu} = ${alt + neu} Seiten, ${quelle.relativ} ${reihenfolge}`,
      ...korb.map(([q, z]) => `${q.relativ} -> ${z.relativ}`),
      ...verweise.map((v) => `Verweise umgestellt in ${v.name}: ${v.anzahl}`),
    ].join("\n");
    if (!args.schreiben) return ergebnis(`Vorschau (nichts geschrieben):\n${bericht}`);
    return mitVerschieben(ctx, async (s) => {
      const ordner = await mkdtemp(path.join(tmpdir(), "finanzen-mcp-ergaenzen-"));
      try {
        await programm("pdfseparate", [s.pfad(ziel.absolut), path.join(ordner, "alt-%d.pdf")]);
        await programm("pdfseparate", [s.pfad(quelle.absolut), path.join(ordner, "neu-%d.pdf")]);
        const seite = (art, nr) => path.join(ordner, `${art}-${nr}.pdf`);
        const folge = [];
        for (let nr = 1; nr <= nach; nr += 1) folge.push(seite("alt", nr));
        for (let nr = 1; nr <= neu; nr += 1) folge.push(seite("neu", nr));
        for (let nr = nach + 1; nr <= alt; nr += 1) folge.push(seite("alt", nr));
        const fertig = path.join(ordner, "fertig.pdf");
        await programm("pdfunite", [...folge, fertig]);
        // Erst neben dem Beleg bereitlegen, dann tauschen: der Beleg fehlt nie.
        const bereit = `${s.pfad(ziel.absolut)}.ergaenzt`;
        await copyFile(fertig, bereit, fsKonstanten.COPYFILE_EXCL);
        await inDenPapierkorb(korb, s);
        await rename(bereit, s.pfad(ziel.absolut));
      } finally {
        await rm(ordner, { recursive: true, force: true });
      }
      for (const v of verweise) await ersetzeDatei(path.join(s.ordner, v.name), ersetzeVerweise(v.text, ersetzungen).text);
      await protokolliere(s, {
        anlass: "beleg-ergaenzen",
        inputs: [quelle.relativ],
        beleg: ziel.relativ,
        nach_seite: nach,
        seiten: alt + neu,
        papierkorb: korb.map(([, z]) => z.relativ),
        notiz: `${neu} Seite(n) in ${ziel.relativ} eingefuegt, ${reihenfolge}`,
      });
      return ergebnis(`Ergaenzt:\n${bericht}\nNaechster Schritt: belege_text mit schreiben:true fuer den neuen Textzwilling.`);
    });
  },
};

const belegVerwerfen = {
  name: "beleg_verwerfen",
  description: "Abgelegten Beleg unter Belege/ samt .txt-Zwilling in den Papierkorb data/papierkorb/<JJJJ-MM-TT>/Belege/... verschieben, z. B. eine Doublette. Nichts wird geloescht; bei Namenskollision bekommt die Datei ein Suffix (-2, -3 ...). Nennen Stamm- oder Bewegungsdaten den Beleg noch, wird abgewiesen — ausser mit ersetzt_durch: dann zeigen alle Verweise danach auf diesen behaltenen Beleg (z. B. das Original einer Doublette). grund wird als notiz in agent_log.jsonl protokolliert. Den Papierkorb leert nur der Nutzer. Vorschau ist Default; wird bei einem Rollback nicht zurueckgenommen.",
  inputSchema: {
    type: "object",
    properties: {
      pfad: { type: "string", description: "z. B. Belege/Vorsorge/VS-001_Muster/2026/2026_Muster_Jahresinformation_Seite-2.pdf" },
      grund: { type: "string", maxLength: 300, description: "Kurz, z. B. \"Doublette, Seite steckt in ..._Jahresinformation.pdf\"" },
      ersetzt_durch: { type: "string", description: "Behaltener Beleg unter Belege/, auf den die Verweise umgestellt werden" },
      schreiben: SCHREIBEN,
    },
    required: ["pfad"],
    additionalProperties: false,
  },
  nurSchreiben: true,
  async ausfuehren(ctx, args) {
    const beleg = await loesePfad(ctx.app, args.pfad, [belegeWurzel(ctx)]);
    if (!(await istDatei(beleg.absolut))) return ergebnis(`${beleg.relativ} ist keine Datei`, true);
    const paare = await planeBelegKorb(ctx, beleg);
    let ersatz = null;
    if (args.ersetzt_durch !== undefined) {
      ersatz = await loesePfad(ctx.app, args.ersetzt_durch, [belegeWurzel(ctx)]);
      if (!(await istDatei(ersatz.absolut))) return ergebnis(`${ersatz.relativ} ist keine Datei`, true);
      // Der Pfad wird als Text in JSON-Dateien eingesetzt: nur Zeichen, die in
      // einem JSON-String nichts bedeuten (kein Anfuehrungszeichen, kein Backslash, keine Steuerzeichen).
      if (!/^[\p{L}\p{N}\p{M} ._,()&+\-/]+$/u.test(ersatz.relativ)) return ergebnis(`ersetzt_durch: ${ersatz.relativ} enthaelt Zeichen, die als Verweis nicht erlaubt sind`, true);
      // Ueber Geraet und Inode: Schreibweise, Unicode-Form und Symlinks spielen keine Rolle.
      const e = await stat(ersatz.absolut);
      const gleich = async (p) => { const q = await stat(p).catch(() => null); return Boolean(q && q.dev === e.dev && q.ino === e.ino); };
      if ((await Promise.all(paare.map(([q]) => gleich(q.absolut)))).some(Boolean)) return ergebnis("ersetzt_durch muss ein anderer Beleg sein (nicht der verworfene oder sein Zwilling)", true);
    }
    const verweise = await datenMitVerweis(ctx, paare.map(([q]) => q.relativ));
    // Umgestellt wird nur der Beleg selbst; verweist etwas auf seinen Zwilling, bleibt es bei der Abweisung.
    const umstellen = ersatz ? verweise.map((v) => ({ ...v, ...ersetzeVerweise(v.text, [[beleg.relativ, ersatz.relativ]]) })) : [];
    const rest = ersatz ? await datenMitVerweis(ctx, paare.slice(1).map(([q]) => q.relativ)) : verweise;
    if (rest.length) {
      return ergebnis(`${beleg.relativ} wird noch verwiesen — nichts verschoben:\n${rest.map((v) => `${v.name}: ${v.anzahl}`).join("\n")}${ersatz ? "" : "\nMit ersetzt_durch auf einen behaltenen Beleg umstellen."}`, true);
    }
    const bericht = [
      ...paare.map(([q, z]) => `${q.relativ} -> ${z.relativ}`),
      ...umstellen.map((v) => `${v.name}: ${v.anzahl} Verweis(e) -> ${ersatz.relativ}`),
    ].join("\n");
    if (!args.schreiben) return ergebnis(`Vorschau (nichts verschoben):\n${bericht}`);
    return mitVerschieben(ctx, async (s) => {
      for (const v of umstellen) await ersetzeDatei(s.pfad(path.join(ctx.datenroot, v.name)), v.text);
      await inDenPapierkorb(paare, s);
      await protokolliere(s, {
        anlass: "beleg-verwerfen",
        inputs: paare.map(([q]) => q.relativ),
        papierkorb: paare.map(([, z]) => z.relativ),
        ...(ersatz ? { ersetzt_durch: ersatz.relativ, umgestellt: Object.fromEntries(umstellen.map((v) => [v.name, v.anzahl])) } : {}),
        notiz: args.grund?.trim() || "Beleg verworfen",
      });
      return ergebnis(`Verworfen (Papierkorb):\n${bericht}`);
    });
  },
};

const inboxZurueckholen = {
  name: "inbox_zurueckholen",
  description: "Datei aus <inbox>/error/ zurueck in die Inbox-Wurzel des Bestands (data/master: data/inbox/) verschieben, damit der naechste inbox-Lauf sie wieder aufnimmt. Existiert dort schon eine Datei gleichen Namens, bricht das Tool ab (nichts ueberschrieben). Eine Fehlernotiz <name>.fehler.txt bleibt in error/ liegen. Vorschau ist Default; erst schreiben:true verschiebt.",
  inputSchema: {
    type: "object",
    properties: { pfad: { type: "string", description: "z. B. data/inbox/error/auszug.csv" }, schreiben: SCHREIBEN },
    required: ["pfad"],
    additionalProperties: false,
  },
  nurSchreiben: true,
  async ausfuehren(ctx, args) {
    const { inbox } = bestandWurzeln(ctx);
    const quelle = await loesePfad(ctx.app, args.pfad, [`${inbox}/error`]);
    if (!(await istDatei(quelle.absolut))) return ergebnis(`${quelle.relativ} ist keine Datei`, true);
    const name = path.basename(quelle.absolut);
    if (name.endsWith(".fehler.txt")) return ergebnis(`${quelle.relativ} ist eine Fehlernotiz, keine Eingangsdatei`, true);
    const ziel = await loesePfad(ctx.app, path.join(inbox, name), [inbox]);
    if (await lstat(ziel.absolut).catch(() => null)) return ergebnis(`${ziel.relativ} existiert bereits — nichts verschoben`, true);
    if (!args.schreiben) return ergebnis(`Vorschau (nichts verschoben):\n${quelle.relativ} -> ${ziel.relativ}`);
    return mitVerschieben(ctx, async (s) => {
      await rename(s.pfad(quelle.absolut), s.pfad(ziel.absolut));
      await protokolliere(s, { anlass: "inbox-zurueckholen", inputs: [quelle.relativ], notiz: `Aus error/ zurueck nach ${ziel.relativ}` });
      return ergebnis(`${quelle.relativ} -> ${ziel.relativ}`);
    });
  },
};

// ---------------------------------------------------------------- Verlauf

// Im einfachen Ordner gibt es keinen Verlauf: klare Meldung statt Fehlerstapel.
const ohneVerlauf = (fn) => async (ctx, args) => {
  try {
    return await fn(ctx, args);
  } catch (error) {
    if (error instanceof OhneVerlauf) return ergebnis(error.message, true);
    throw error;
  }
};

const verlauf = {
  name: "verlauf",
  description: "Verlauf des Bestands: die letzten Generationen (neueste zuerst) mit Zeit, ausloesendem Werkzeug und Kurzfassung der Aenderungen gegenueber der vorherigen (je Datei +neu ~geaendert -entfernt Datensaetze; Wiederherstellungen sind markiert). Nennt auch, wie viele fruehere Generationen aufbewahrt werden (behalten). Rein lesend; rueckgaengig machen mit rueckgaengig. Nur bei einem Bestand mit Generationen.",
  inputSchema: {
    type: "object",
    properties: {
      anzahl: { type: "integer", minimum: 1, maximum: 50, description: "Wie viele Generationen (Default 10)" },
      json: { type: "boolean", description: "true = strukturiertes Ergebnis mit allen IDs statt Text" },
    },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
  ausfuehren: ohneVerlauf(async (ctx, args) => {
    const { verlauf: v, text } = await verlaufBericht(ctx.datenroot, { anzahl: args.anzahl ?? 10 });
    return ergebnis(args.json ? json(v) : text);
  }),
};

const rueckgaengigWerkzeug = {
  name: "rueckgaengig",
  description: "Letzten Schreibvorgang rueckgaengig machen: stellt die vorherige Generation (oder `schritte` zurueck, oder `ziel` wie \"G000041\" aus verlauf) als NEUE Generation wieder her; nichts wird geloescht, ein Undo laesst sich selbst rueckgaengig machen. Vorschau ist Default und zeigt den Diff gegenueber dem aktuellen Stand: Dateien, Zahl der Datensaetze neu/geaendert/entfernt, bei Buchungen und anderen Datensaetzen mit Id die IDs. Erst schreiben:true mit dem Fingerabdruck der Vorschau (Pflicht) stellt wieder her; der Validator prueft, neue Fehler verhindern die Uebernahme. Inbox und Belege/ liegen ausserhalb des Bestands und bleiben, wie sie sind. Nur bei einem Bestand mit Generationen.",
  inputSchema: {
    type: "object",
    properties: {
      schritte: { type: "integer", minimum: 1, maximum: 1000, description: "Wie viele Generationen zurueck (Default 1)" },
      ziel: { type: "string", pattern: "^G?\\d{6,}$", description: "Statt schritte: diese Generation wiederherstellen, z. B. \"G000041\"" },
      schreiben: SCHREIBEN,
    },
    additionalProperties: false,
  },
  nurSchreiben: true,
  ausfuehren: ohneVerlauf(async (ctx, args) => {
    if (args.schritte !== undefined && args.ziel !== undefined) return ergebnis("Entweder schritte oder ziel angeben, nicht beides.", true);
    const auswahl = { schritte: args.schritte ?? 1, ziel: args.ziel };
    if (!args.schreiben) return ergebnis((await rueckgaengigVorschau(ctx.datenroot, auswahl)).text);
    const r = await rueckgaengigSchreiben(ctx.datenroot, { ...auswahl, erwartet: erwarteterStand.getStore(), wer: "MCP rueckgaengig" });
    return ergebnis(r.text, r.exitCode !== 0);
  }),
};

/** @type {Werkzeug[]} */
export const WERKZEUGE = [status, kennzahlen, planIstWerkzeug, transaktionenAbfragen, dateiLesen, dateienSuchen, ...CLI_WERKZEUGE, dateiSchreiben, dateiErsetzen, belegAblegen, belegTeilen, belegErgaenzen, belegVerwerfen, inboxVerwerfen, inboxZurueckholen, verlauf, rueckgaengigWerkzeug];

// Jedes Werkzeug mit Vorschau nimmt den Fingerabdruck der Vorschau an.
for (const w of WERKZEUGE) {
  if (w.inputSchema.properties?.schreiben) w.inputSchema.properties.fingerabdruck = FINGERABDRUCK;
}

// Nach Aufgaben geordnet (vertrag.mjs), mit Titel "Aufgabe: name".
export function sichtbareWerkzeuge(ctx) {
  const reihenfolge = AUFGABEN.flatMap((a) => a.werkzeuge);
  const rang = (name) => (reihenfolge.includes(name) ? reihenfolge.indexOf(name) : reihenfolge.length);
  return WERKZEUGE
    .filter((w) => !w.nurSchreiben || ctx.recht === "schreiben")
    .sort((a, b) => rang(a.name) - rang(b.name))
    .map(({ name, description, inputSchema, annotations }) => ({ name, title: `${aufgabeVon(name)?.titel ?? "Sonstiges"}: ${name}`, description, inputSchema, ...(annotations ? { annotations } : {}) }));
}

// Schreibende Aufrufe einer Sitzung laufen nacheinander: Clients schicken
// Tool-Aufrufe parallel, und Lesen-Aendern-Schreiben (anhaengen, ersetzen)
// vertragen keine Ueberlappung, und mitRollback haelt je Bestand nur einen Entwurf.
// Zwischen zwei Sitzungen (Prozessen) schuetzt die Schreibsperre des Bestands
// (mitRollback): die zweite Sitzung bekommt eine Abweisung.
let schreibKette = Promise.resolve();
function nacheinander(fn) {
  const lauf = schreibKette.then(fn);
  schreibKette = lauf.catch(() => {});
  return lauf;
}

// Liefert ein MCP-CallToolResult oder null (unbekanntes Tool).
export async function rufeWerkzeug(ctx, name, args = {}) {
  const werkzeug = WERKZEUGE.find((w) => w.name === name);
  if (!werkzeug) return null;
  const schreibt = Boolean(werkzeug.nurSchreiben || (args.schreiben === true && werkzeug.inputSchema.properties?.schreiben));
  const vorschau = Boolean(werkzeug.inputSchema.properties?.schreiben) && args.schreiben !== true;
  const modus = vorschau ? "vorschau" : (schreibt ? "schreiben" : "lesen");
  // Text fuer Menschen, structuredContent fuer Agenten: werkzeug, ok, modus,
  // fingerabdruck (Vorschau), fehler (Code), dazu was das Werkzeug liefert.
  // Der Text kommt auch in structuredContent mit: Claude Code zeigt dem Agenten
  // nur diesen Teil, sobald es ihn gibt.
  const alsErgebnis = (r, fingerabdruck) => {
    if (r.content) return r;
    const strukturiert = { werkzeug: name, ok: !r.isError, modus, ...(fingerabdruck ? { fingerabdruck } : {}), ...(r.isError && !r.struktur?.fehler ? { fehler: "werkzeug" } : {}), ...(r.struktur ?? {}), text: r.text };
    return { content: [{ type: "text", text: r.text }], structuredContent: strukturiert, ...(r.isError ? { isError: true } : {}) };
  };
  if (werkzeug.nurSchreiben && ctx.recht !== "schreiben") {
    return alsErgebnis(ergebnis(`${name} braucht --recht=schreiben. Dieser Zugang ist nur lesend.`, true, { fehler: "recht" }));
  }
  const fehler = pruefeArgumente(werkzeug.inputSchema, args);
  if (fehler.length) return alsErgebnis(ergebnis(`Ungueltige Argumente:\n${fehler.map((f) => `- ${f}`).join("\n")}`, true, { fehler: "argumente", details: fehler }));
  try {
    if (vorschau) {
      // Fingerabdruck VOR dem Lesen: aendert sich der Bestand waehrend der
      // Vorschau, wird ein Schreiben damit abgewiesen (sichere Seite).
      const fingerabdruck = await bestandFingerabdruck(ctx.datenroot);
      const r = await werkzeug.ausfuehren(ctx, args);
      const zeile = `Fingerabdruck: ${fingerabdruck}`;
      return alsErgebnis(typeof r.text !== "string" || r.text.includes(zeile) ? r : { ...r, text: `${r.text}\n\n${zeile} (mit schreiben:true als fingerabdruck mitgeben, dann wird nur gegen diesen Stand geschrieben)` }, fingerabdruck);
    }
    const lauf = () => werkzeugName.run(name, () => erwarteterStand.run(args.fingerabdruck, () => werkzeug.ausfuehren(ctx, args)));
    return alsErgebnis(await (schreibt ? nacheinander(lauf) : lauf()));
  } catch (error) {
    return alsErgebnis(error instanceof PfadFehler ? ergebnis(`Pfad abgewiesen: ${error.message}`, true, { fehler: "pfad" }) : ergebnis(`Fehler: ${error.message}`, true, { fehler: "werkzeug" }));
  }
}
