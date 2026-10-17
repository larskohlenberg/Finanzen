// app/mcp/werkzeuge.mjs
// Die MCP-Tools. Drei Sorten:
// - Lese-Tools (status, kennzahlen, transaktionen_abfragen, datei_lesen, dateien_suchen),
// - 1:1-Wrapper um die CLIs in app/tools/ (Vorschau ist Default, schreiben:true
//   setzt das Schreib-Flag der CLI und braucht --recht=schreiben),
// - Datei-Schreiben (datei_schreiben, datei_ersetzen, beleg_ablegen, beleg_teilen,
//   beleg_ergaenzen, inbox_verwerfen, inbox_zurueckholen), nur mit --recht=schreiben.
// Jeder schreibende Vorgang laeuft durch mitRollback (Validator + Rueckspielen).
import { execFile } from "node:child_process";
import { constants as fsKonstanten } from "node:fs";
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { planeTeilung } from "../tools/lib/seiten.mjs";
import { loadMasterData, validateMasterData } from "../tools/validator.mjs";
import { localTodayIso } from "../liquiditaet.mjs";
import { abfragen } from "./abfrage.mjs";
import { pruefeArgumente } from "./argumente.mjs";
import { istKalenderdatum, kennzahlenText } from "./kennzahlen.mjs";
import { LESE_WURZELN, PfadFehler, SCHREIB_WURZELN, loesePfad } from "./pfade.mjs";
import { kopiereDatenroot, mitRollback } from "./schreiben.mjs";

const MAX_TEXT = 2 * 1024 * 1024;
const MAX_SCHREIBEN = 10 * 1024 * 1024;
const MAX_BILD = 5 * 1024 * 1024;
const LAUF_TIMEOUT = 10 * 60 * 1000;

const ID = (praefix) => ({ type: "string", pattern: `^${praefix}-[A-Za-z0-9-]+$` });
const DATUM = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
const BETRAG = { type: "string", pattern: "^-?\\d+(\\.\\d{1,2})?$", description: "Decimal-String, z. B. \"-12.50\"" };
const SCHREIBEN = {
  type: "boolean",
  description: "Default false = Vorschau, es wird nichts geschrieben. true schreibt (nur mit --recht=schreiben); danach laeuft der Validator, bei neuen Fehlern wird der Masterstand zurueckgesetzt.",
};

const ergebnis = (text, isError = false) => ({ text, isError });
const json = (wert) => JSON.stringify(wert, null, 2);

// ---------------------------------------------------------------- CLI-Laeufe

function starte(ctx, skript, args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(ctx.app, "tools", skript), ...args], {
      cwd: ctx.app,
      timeout: LAUF_TIMEOUT,
      maxBuffer: 64 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      let exitCode = 0;
      if (error) exitCode = error.killed ? "timeout" : (typeof error.code === "number" ? error.code : 1);
      resolve({ exitCode, stdout, stderr });
    });
  });
}

// schreibFlag: Flag der CLI fuer den Schreiblauf. ohneVorschau: die CLI
// schreibt immer (import.mjs, recategorize.mjs) — dann laeuft die Vorschau gegen
// eine Wegwerfkopie des Datenroots, und beim Schreiben wird kein Flag gereicht.
function cli({ name, skript, beschreibung, eigenschaften = {}, pflicht = [], schreibFlag, ohneVorschau = false, okCodes = [0], argv }) {
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
      const lauf = async (root, kopfzeile) => {
        const cliArgs = await argv(ctx, args, root);
        const flag = schreiben && !ohneVorschau ? [schreibFlag] : [];
        let r;
        try {
          r = await starte(ctx, skript, [...cliArgs, ...flag]);
        } finally {
          await cliArgs.aufraeumen?.();
        }
        const teile = [kopfzeile, `tools/${skript} — Exitcode: ${r.exitCode}`, r.stdout.trimEnd()];
        if (r.stderr.trim()) teile.push(`--- stderr ---\n${r.stderr.trimEnd()}`);
        return ergebnis(teile.join("\n"), !okCodes.includes(r.exitCode));
      };
      if (schreiben) return mitRollback(ctx.datenroot, () => lauf(ctx.datenrootRel, "Modus: schreiben"));
      if (!ohneVorschau) return lauf(ctx.datenrootRel, "Modus: Vorschau");
      // Die CLI kennt keine Vorschau: gegen eine Wegwerfkopie des Datenroots laufen.
      const kopie = await kopiereDatenroot(ctx.datenroot);
      try {
        return await lauf(kopie, "Modus: Vorschau (Lauf gegen eine temporaere Kopie des Datenroots — am Bestand wurde nichts geschrieben)");
      } finally {
        await rm(kopie, { recursive: true, force: true });
      }
    },
  };
}

const CLI_WERKZEUGE = [
  cli({
    name: "pruefbericht",
    skript: "pruefbericht.mjs",
    beschreibung: "Pruefbericht nach einem Durchlauf (tools/pruefbericht.mjs): groesste Auto-Freigaben, Merchants ohne menschliche Bestaetigung, auto-freigegebene KAT-012, am Gate gescheiterte Regeln, Konten ohne Anker, nicht reconciliierte Kontostaende. Rein lesend. Dem Nutzer ungekuerzt zeigen.",
    argv: async (ctx, a, root) => [root],
  }),
  cli({
    name: "inbox",
    skript: "inbox.mjs",
    beschreibung: "Inbox-Lauf (tools/inbox.mjs) ueber die Dateien direkt in data/inbox/: Profil zuordnen, CSV normalisieren, importieren, Datei nach processed/ bzw. error/ verschieben, PDFs und Bilder als Textvorlauf nach standardized/ (ohne Textlayer per OCR; Bilder bleiben im Inbox-Root liegen). Vorschau ist Default. Verschiebungen werden bei einem Rollback nicht zurueckgenommen.",
    schreibFlag: "--schreiben",
    argv: async (ctx, a, root) => [root],
  }),
  cli({
    name: "import",
    skript: "import.mjs",
    beschreibung: "Eine standardisierte JSONL-Datei (Importformat, liegt unter data/inbox/, meist standardized/) importieren (tools/import.mjs): Dedupe gegen den Bestand, Kategorisierung per Regeln, Transfer-Match. Vorschau ist Default (laeuft gegen eine Kopie des Datenroots).",
    eigenschaften: { datei: { type: "string", description: "Pfad relativ zum App-Raum, z. B. data/inbox/standardized/lauf.jsonl" } },
    pflicht: ["datei"],
    schreibFlag: true,
    ohneVorschau: true,
    argv: async (ctx, a, root) => [(await loesePfad(ctx.app, a.datei, ["data/inbox"])).absolut, root],
  }),
  cli({
    name: "regel_vorschlag",
    skript: "regel-vorschlag.mjs",
    beschreibung: "Offen-Stapel nach Gegenpartei buendeln (tools/regel-vorschlag.mjs), sortiert nach Hebel, mit [Regelkonflikt]-Markern. Schlaegt bewusst keine Kategorie vor — die Kategorie braucht einen Beleg (Belegleiter E1-E4), sonst KAT-012. Rein lesend.",
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
    beschreibung: "Regelkandidaten gegen den Gesamtbestand rechnen, bevor etwas geschrieben wird (tools/regel-probelauf.mjs). Kandidaten in Endfassung inkl. belegstufe (E1-E4) und kommentar. Exitcode 2 = blockiert (Strukturfehler, unspezifisch, neue Konflikte, Wiedervorlagen, verlorene bestaetigte Treffer) — dann nicht schreiben. Rein lesend.",
    eigenschaften: {
      kandidaten: { type: "array", items: { type: "object" }, minItems: 1, description: "Regelkandidaten als Objekte im Schema von kategorisierungsregeln.json" },
      kandidaten_datei: { type: "string", description: "Alternativ: JSON-Datei mit Kandidaten unter data/" },
      aenderung: { type: "boolean", description: "Bestandsregel bewusst aendern (bekannte regel_id erlaubt)" },
      json: { type: "boolean", description: "Bericht als JSON" },
    },
    okCodes: [0, 2],
    argv: async (ctx, a, root) => {
      let datei;
      if (a.kandidaten) {
        const ordner = await mkdtemp(path.join(tmpdir(), "finanzen-mcp-kandidaten-"));
        datei = path.join(ordner, "kandidaten.json");
        await writeFile(datei, JSON.stringify(a.kandidaten));
      } else if (a.kandidaten_datei) {
        // Den geprueften absoluten Pfad reichen: die CLI soll nichts mehr deuten.
        datei = (await loesePfad(ctx.app, a.kandidaten_datei, SCHREIB_WURZELN)).absolut;
      } else {
        throw new PfadFehler("kandidaten oder kandidaten_datei angeben");
      }
      const out = [root, datei, ...(a.aenderung ? ["--aenderung"] : []), ...(a.json ? ["--json"] : [])];
      if (a.kandidaten) out.aufraeumen = () => rm(path.dirname(datei), { recursive: true, force: true });
      return out;
    },
  }),
  cli({
    name: "nachkategorisieren",
    skript: "recategorize.mjs",
    beschreibung: "Bestand nach Regelaenderungen neu bewerten (tools/recategorize.mjs): offene und regelbasierte Buchungen gegen das aktuelle Regelwerk; bestaetigt/abgelehnt/manuell bleiben unangetastet. Vorschau ist Default (laeuft gegen eine Kopie des Datenroots).",
    schreibFlag: true,
    ohneVorschau: true,
    argv: async (ctx, a, root) => [root],
  }),
  cli({
    name: "agent_vorschlag",
    skript: "agent-vorschlag.mjs",
    beschreibung: "Agenten-Einzelvorschlaege setzen (tools/agent-vorschlag.mjs): Buchungen auf vorgeschlagen mit kategorie_herkunft=agent. Fuer E5/E6: die plausibelste Kategorie, ohne Beleg als Schaetzung; KAT-012 nur, wenn keine Kategorie plausibel ist. Nie Grundlage einer Regel. Vorschau ist Default.",
    eigenschaften: {
      ids: { type: "array", items: ID("TXN"), minItems: 1 },
      kategorie: ID("KAT"),
    },
    pflicht: ["ids", "kategorie"],
    schreibFlag: "--schreiben",
    argv: async (ctx, a, root) => [`--ids=${a.ids.join(",")}`, `--kategorie=${a.kategorie}`, root],
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
    beschreibung: "Immobilienbezug fuer explizite Transaktions-IDs setzen, ersetzen oder entfernen (tools/transaktion-immobilie.mjs). Nur aus eindeutigem Beleg oder Nutzerentscheidung. Exitcode 2 = blockiert. Vorschau ist Default.",
    eigenschaften: {
      ids: { type: "array", items: ID("TXN"), minItems: 1 },
      immobilie: ID("IMM"),
      entfernen: { type: "boolean" },
      ersetzen: { type: "boolean" },
    },
    pflicht: ["ids"],
    schreibFlag: "--schreiben",
    okCodes: [0, 2],
    argv: async (ctx, a, root) => [`--ids=${a.ids.join(",")}`, ...(a.immobilie ? [`--immobilie=${a.immobilie}`] : []), ...(a.entfernen ? ["--entfernen"] : []), ...(a.ersetzen ? ["--ersetzen"] : []), root],
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
            datei: { type: "string", description: "Optional statt bild: lokale Bilddatei, relativ zum App-Raum unter data/ oder Belege/, z. B. data/inbox/beispielmarkt-logo.png" },
            quelle: { type: "string", description: "Pflicht mit bild, optional mit datei: https-URL, woher das Bild stammt" },
          },
          required: ["name", "domain", "muster"],
          additionalProperties: false,
        },
      },
      top: { type: "integer", minimum: 1, maximum: 200, description: "Bericht: so viele Gegenparteien ohne Logo (Default 20)" },
    },
    schreibFlag: "--schreiben",
    argv: async (ctx, a, root) => {
      const out = [root];
      if (a.top) out.push("--top", String(a.top));
      if (!a.eintraege) return out;
      const eintraege = [];
      for (const e of a.eintraege) {
        eintraege.push(e.datei ? { ...e, datei: (await loesePfad(ctx.app, e.datei, ["data", "Belege"])).absolut } : e);
      }
      const ordner = await mkdtemp(path.join(tmpdir(), "finanzen-mcp-logos-"));
      const datei = path.join(ordner, "plan.json");
      await writeFile(datei, JSON.stringify(eintraege));
      out.push("--plan", datei);
      out.aufraeumen = () => rm(ordner, { recursive: true, force: true });
      return out;
    },
  }),
  cli({
    name: "freigabe",
    skript: "freigabe.mjs",
    beschreibung: "Vorgeschlagene Buchungen automatisch bestaetigen, soweit ihre Regel das Gate besteht (tools/freigabe.mjs; bestaetigt_durch=auto). Gate-Grund 'anker' = Regel reicht in ein Konto ohne menschlichen Anker. Vorschau ist Default.",
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
    argv: async () => [],
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
      plan_datei: { type: "string", description: "Alternativ: JSON-Datei unter data/ mit derselben Liste" },
    },
    schreibFlag: "--schreiben",
    argv: async (ctx, a, root) => {
      let datei;
      if (a.umzuege) {
        const ordner = await mkdtemp(path.join(tmpdir(), "finanzen-mcp-umzug-"));
        datei = path.join(ordner, "plan.json");
        await writeFile(datei, JSON.stringify(a.umzuege));
      } else if (a.plan_datei) {
        datei = (await loesePfad(ctx.app, a.plan_datei, SCHREIB_WURZELN)).absolut;
      } else {
        throw new PfadFehler("umzuege oder plan_datei angeben");
      }
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
  const ordner = path.join(ctx.app, "data", "inbox");
  const dateien = [];
  const unterordner = {};
  for (const e of await readdir(ordner, { withFileTypes: true }).catch(() => [])) {
    if (e.name.startsWith(".")) continue;
    if (e.isFile()) {
      const s = await stat(path.join(ordner, e.name));
      dateien.push({ name: e.name, bytes: s.size, geaendert: s.mtime.toISOString().slice(0, 16) });
    } else if (e.isDirectory()) {
      unterordner[e.name] = await zaehleDateien(path.join(ordner, e.name));
    }
  }
  return { dateien, unterordner };
}

const status = {
  name: "status",
  description: "Ueberblick: Datenroot, Zugriffsrecht, Anzahl Transaktionen/Regeln/Konten, Verteilung kategorisierung_status, Validator-Ergebnis (mit Fehlern) und Inbox (wartende Dateien im Root, Dateizahl je Unterordner error/standardized/processed). Rein lesend — guter erster Aufruf.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true },
  async ausfuehren(ctx) {
    // Einmal laden, fuer Zaehler und Validator.
    const bericht = { datenroot: ctx.datenrootRel, recht: ctx.recht };
    let validator;
    try {
      const daten = await loadMasterData(pathToFileURL(`${ctx.datenroot}${path.sep}`));
      const verteilung = {};
      for (const t of daten.transaktionen) verteilung[t.kategorisierung_status] = (verteilung[t.kategorisierung_status] ?? 0) + 1;
      Object.assign(bericht, {
        transaktionen: daten.transaktionen.length,
        kategorisierung_status: verteilung,
        regeln: { gesamt: daten.kategorisierungsregeln.length, aktiv: daten.kategorisierungsregeln.filter((r) => r.status === "aktiv").length },
        konten: daten.konten.length,
      });
      const pruefung = validateMasterData(daten);
      validator = { gueltig: pruefung.valid, fehler: pruefung.errors };
    } catch (error) {
      bericht.masterdaten = `nicht lesbar: ${error.message}`;
      validator = { gueltig: false, fehler: [`Masterdaten nicht lesbar: ${error.message}`] };
    }
    bericht.validator = { gueltig: validator.gueltig, fehler_anzahl: validator.fehler.length, fehler: validator.fehler.slice(0, 50) };
    bericht.inbox = await inboxStand(ctx);
    return ergebnis(json(bericht));
  },
};

const kennzahlen = {
  name: "kennzahlen",
  description: "Erste Wahl fuer Fragen wie \u201eWie stehen wir?\u201c, liefert dieselben Kennzahlen wie die Uebersicht: Nettovermoegen mit Aktiva/Passiva und Positionen, Summe geladener Bewegungen, Kontentabelle, naechste Aktion und Checks. Bei jedem Aufruf frisch gerechnet, nur Aggregate, keine Einzelbuchungen. Rein lesend.",
  inputSchema: {
    type: "object",
    properties: { stichtag: { ...DATUM, description: "Stichtag fuer Nettovermoegen, Checks und naechste Aktion (Default heute)" } },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
  async ausfuehren(ctx, args) {
    const stichtag = args.stichtag ?? localTodayIso();
    if (!istKalenderdatum(stichtag)) return ergebnis(`Ungueltiger Stichtag: ${stichtag} (YYYY-MM-DD, gueltiges Kalenderdatum)`, true);
    const daten = await loadMasterData(pathToFileURL(`${ctx.datenroot}${path.sep}`));
    // Wie runtime.mjs im Browser: Validator-Ergebnis, keine vorab geladenen Checks.
    Object.assign(daten, { validation: validateMasterData(daten), checks: [], importfehler: [] });
    return ergebnis(kennzahlenText(daten, stichtag));
  },
};

const transaktionenAbfragen = {
  name: "transaktionen_abfragen",
  description: "Transaktionen filtern und optional gruppieren. Alle Filter sind UND-verknuepft; text sucht case-insensitiv als Teilstring in Gegenpartei und Verwendungszweck. Ohne gruppieren_nach: Zeilen (limit Default 100, max 1000) plus Anzahl und Gesamtsumme. Mit gruppieren_nach: Summen je Gruppe; Zeilen nur mit mit_zeilen:true. Summen sind Decimal-Strings, cent-genau gerechnet. Hinweis: Startzustandsbuchungen (transaktionstyp Startzustand) stehen unter KAT-012 und verzerren Ausgabensummen.",
  inputSchema: {
    type: "object",
    properties: {
      von: { ...DATUM, description: "Buchungsdatum ab (inklusive)" },
      bis: { ...DATUM, description: "Buchungsdatum bis (inklusive)" },
      konto: ID("KTO"),
      kategorie: ID("KAT"),
      status: { type: "string", enum: ["offen", "vorgeschlagen", "bestaetigt", "abgelehnt"] },
      text: { type: "string", maxLength: 200 },
      betrag_min: BETRAG,
      betrag_max: BETRAG,
      ist_transfer: { type: "boolean" },
      gruppieren_nach: { type: "string", enum: ["monat", "kategorie", "konto", "gegenpartei"] },
      mit_zeilen: { type: "boolean" },
      limit: { type: "integer", minimum: 1, maximum: 1000 },
    },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
  async ausfuehren(ctx, args) {
    const daten = await loadMasterData(pathToFileURL(`${ctx.datenroot}${path.sep}`));
    const namen = {
      kategorien: Object.fromEntries(daten.kategorien.map((k) => [k.kategorie_id, k.name])),
      konten: Object.fromEntries(daten.konten.map((k) => [k.konto_id, k.name])),
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

async function* dateienUnter(ctx, absolut) {
  const info = await lstat(absolut).catch(() => null);
  if (!info || info.isSymbolicLink()) return;
  if (info.isFile()) { yield absolut; return; }
  if (!info.isDirectory()) return;
  for (const e of (await readdir(absolut, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith(".")) continue;
    yield* dateienUnter(ctx, path.join(absolut, e.name));
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
    for (const wurzel of LESE_WURZELN) {
      for await (const datei of dateienUnter(ctx, path.resolve(ctx.app, wurzel))) {
        const relativ = path.relative(ctx.app, datei).split(path.sep).join("/");
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

// Bestehende Dateien behalten ihren Modus, neue bekommen 0640 (unabhaengig von
// der umask; die Daten sollen nicht fuer alle lesbar werden).
async function schreibeAtomar(absolut, inhalt) {
  await mkdir(path.dirname(absolut), { recursive: true });
  const modus = ((await stat(absolut).catch(() => null))?.mode ?? 0o640) & 0o7777;
  const temp = path.join(path.dirname(absolut), `.${path.basename(absolut)}.mcp-${process.pid}`);
  try {
    await writeFile(temp, inhalt, { mode: modus });
    await chmod(temp, modus);
    await rename(temp, absolut);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

const dateiSchreiben = {
  name: "datei_schreiben",
  description: "Ganze Textdatei unter data/ schreiben oder anlegen (max. 10 MB), z. B. eine standardisierte JSONL unter data/inbox/standardized/, ein Importprofil oder eine Masterdatei. Mit anhaengen:true wird der Inhalt als Zeile(n) ans Dateiende gehaengt (z. B. ein Eintrag in agent_log.jsonl). Nicht Belege/. Danach laeuft der Validator; bei neuen Fehlern wird der Masterstand zurueckgesetzt. Kategorien nie per Datei-Edit an Transaktionen setzen — dafuer gibt es bestaetigen/agent_vorschlag.",
  inputSchema: {
    type: "object",
    properties: { pfad: { type: "string" }, inhalt: { type: "string" }, anhaengen: { type: "boolean" } },
    required: ["pfad", "inhalt"],
    additionalProperties: false,
  },
  nurSchreiben: true,
  async ausfuehren(ctx, args) {
    const { absolut, relativ } = await loesePfad(ctx.app, args.pfad, SCHREIB_WURZELN);
    if (Buffer.byteLength(args.inhalt) > MAX_SCHREIBEN) return ergebnis("Inhalt groesser als 10 MB", true);
    if ((await stat(absolut).catch(() => null))?.isDirectory()) return ergebnis(`${relativ} ist ein Ordner`, true);
    return mitRollback(ctx.datenroot, async () => {
      if (args.anhaengen) {
        // Nur eine fehlende Datei gilt als leer; jeder andere Lesefehler bricht ab,
        // sonst ersetzte das Anhaengen den unlesbaren Inhalt.
        const bisher = await readFile(absolut, "utf8").catch((error) => {
          if (error.code === "ENOENT") return "";
          throw error;
        });
        await schreibeAtomar(absolut, `${bisher.replace(/\n*$/, bisher ? "\n" : "")}${args.inhalt.replace(/\n*$/, "\n")}`);
        return ergebnis(`${relativ}: ${Buffer.byteLength(args.inhalt)} Bytes angehaengt.`);
      }
      await schreibeAtomar(absolut, args.inhalt);
      return ergebnis(`${relativ} geschrieben (${Buffer.byteLength(args.inhalt)} Bytes).`);
    });
  },
};

const dateiErsetzen = {
  name: "datei_ersetzen",
  description: "Exakten Textabschnitt in einer Datei unter data/ ersetzen. alt muss genau einmal vorkommen (sonst Fehler, nichts geaendert). Danach laeuft der Validator; bei neuen Fehlern wird der Masterstand zurueckgesetzt.",
  inputSchema: {
    type: "object",
    properties: { pfad: { type: "string" }, alt: { type: "string", minLength: 1 }, neu: { type: "string" } },
    required: ["pfad", "alt", "neu"],
    additionalProperties: false,
  },
  nurSchreiben: true,
  async ausfuehren(ctx, args) {
    const { absolut, relativ } = await loesePfad(ctx.app, args.pfad, SCHREIB_WURZELN);
    const info = await stat(absolut).catch(() => null);
    if (!info?.isFile()) return ergebnis(`${relativ} existiert nicht`, true);
    if (info.size > MAX_SCHREIBEN) return ergebnis(`${relativ} ist groesser als 10 MB`, true);
    const text = await readFile(absolut, "utf8");
    const erste = text.indexOf(args.alt);
    if (erste < 0) return ergebnis(`alt kommt in ${relativ} nicht vor — nichts geaendert`, true);
    if (text.indexOf(args.alt, erste + 1) >= 0) return ergebnis(`alt kommt in ${relativ} mehrfach vor — mehr Kontext angeben, nichts geaendert`, true);
    return mitRollback(ctx.datenroot, async () => {
      await schreibeAtomar(absolut, text.slice(0, erste) + args.neu + text.slice(erste + args.alt.length));
      return ergebnis(`${relativ}: 1 Stelle ersetzt.`);
    });
  },
};

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
  description: "Rohbeleg aus data/inbox/ (auch processed/, error/) sprechend benannt unter Belege/ ablegen, nach Objekt und Jahr, z. B. Belege/Konten/<KTO-ID>_<Kurzname>/<Jahr>/... (Regel: agent-context, Ablage nach Objekt) Verschiebt, legt fehlende Ordner an, ueberschreibt nie, Endung bleibt gleich. Ein .txt-Zwilling gleichen Namens neben der Quelle wird mitgenommen (so kommt ein von Hand geschriebener Bildscan-Zwilling an den Beleg: erst per datei_schreiben neben die Quelle legen). Wird bei einem Rollback nicht zurueckgenommen.",
  inputSchema: {
    type: "object",
    properties: {
      quelle: { type: "string", description: "z. B. data/inbox/processed/scan0001.pdf" },
      ziel: { type: "string", description: "z. B. Belege/Versicherungen/KFZ_MusterversicherungB_12345/2026/KFZ_MusterversicherungB_Beitragsrechnung_2026.pdf" },
    },
    required: ["quelle", "ziel"],
    additionalProperties: false,
  },
  nurSchreiben: true,
  async ausfuehren(ctx, args) {
    const quelle = await loesePfad(ctx.app, args.quelle, ["data/inbox"]);
    const ziel = await loesePfad(ctx.app, args.ziel, ["Belege"]);
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
        paare.push([{ absolut: zwilling, relativ: path.relative(ctx.app, zwilling) }, { absolut: zielZwilling, relativ: path.relative(ctx.app, zielZwilling) }]);
      }
    }
    for (const [, z] of paare) {
      if (await lstat(z.absolut).catch(() => null)) return ergebnis(`${z.relativ} existiert bereits — nichts verschoben`, true);
    }
    return mitRollback(ctx.datenroot, async () => {
      await mkdir(path.dirname(ziel.absolut), { recursive: true });
      for (const [q, z] of paare) await rename(q.absolut, z.absolut);
      return ergebnis(paare.map(([q, z]) => `${q.relativ} -> ${z.relativ}`).join("\n"));
    });
  },
};

// Eine Protokollzeile im Format der CLIs (inbox.mjs) ans agent_log.jsonl.
async function protokolliere(ctx, eintrag) {
  const absolut = path.join(ctx.datenroot, "agent_log.jsonl");
  const bisher = await readFile(absolut, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  const zeile = { zeitpunkt: new Date().toISOString(), ...eintrag, anzahl_importiert: 0, anzahl_offen: 0, anzahl_fehler: 0 };
  await schreibeAtomar(absolut, `${bisher.replace(/\n*$/, bisher ? "\n" : "")}${JSON.stringify(zeile)}\n`);
}

const istDatei = async (absolut) => Boolean((await lstat(absolut).catch(() => null))?.isFile());
const TEXTVORLAUF = /\.(pdf|png|jpe?g|gif|webp|heic)$/i;

// Eine Inbox-Datei samt Mitlaeufern (Zwilling daneben, Textvorlauf in
// standardized/, Fehlernotiz in error/) fuer den Papierkorb planen: Paare
// [quelle, ziel], ein gemeinsames Suffix bei Namenskollision.
async function planePapierkorb(ctx, quelle) {
  const inbox = path.join(ctx.app, "data", "inbox");
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
    const geprueft = await loesePfad(ctx.app, path.join("data", "inbox", k.unter), ["data/inbox"]).catch(() => null);
    if (geprueft && (await istDatei(geprueft.absolut))) gruppe.push(k);
  }
  const korb = path.join("data", "papierkorb", localTodayIso());
  const zielFuer = (g, n) => path.join(korb, g.ordner, `${stamm}${n > 1 ? `-${n}` : ""}${g.rest}`);
  let n = 1;
  for (;;) {
    const belegt = await Promise.all(gruppe.map((g) => lstat(path.join(ctx.app, zielFuer(g, n))).then(() => true, () => false)));
    if (!belegt.some(Boolean)) break;
    n += 1;
  }
  const paare = [];
  for (const g of gruppe) {
    paare.push([
      { absolut: path.join(inbox, g.unter), relativ: path.join("data", "inbox", g.unter).split(path.sep).join("/") },
      await loesePfad(ctx.app, zielFuer(g, n), ["data/papierkorb"]),
    ]);
  }
  return paare;
}

async function inDenPapierkorb(paare) {
  for (const [q, z] of paare) {
    // Wie data/ selbst: nicht fuer alle lesbar (die umask allein liesse 775 zu).
    await mkdir(path.dirname(z.absolut), { recursive: true, mode: 0o750 });
    await rename(q.absolut, z.absolut);
  }
}

const inboxVerwerfen = {
  name: "inbox_verwerfen",
  description: "Datei aus data/inbox/ (auch error/, standardized/, processed/) in den Papierkorb data/papierkorb/<JJJJ-MM-TT>/ verschieben, z. B. ein erkanntes Duplikat. Nichts wird geloescht: die Unterstruktur unterhalb von data/inbox/ bleibt erhalten, bei Namenskollision bekommt die Datei ein Suffix (-2, -3 ...), ueberschrieben wird nie. Mit wandern: der gleichnamige .txt-Zwilling daneben, der Textvorlauf in standardized/ und eine Fehlernotiz <name>.fehler.txt in error/. grund wird als notiz in agent_log.jsonl protokolliert. Den Papierkorb leert nur der Nutzer. Wird bei einem Rollback nicht zurueckgenommen.",
  inputSchema: {
    type: "object",
    properties: {
      pfad: { type: "string", description: "z. B. data/inbox/auszug-2.pdf oder data/inbox/error/auszug.csv" },
      grund: { type: "string", maxLength: 300, description: "Kurz, z. B. \"Duplikat von data/inbox/processed/auszug.pdf\"" },
    },
    required: ["pfad"],
    additionalProperties: false,
  },
  nurSchreiben: true,
  async ausfuehren(ctx, args) {
    const quelle = await loesePfad(ctx.app, args.pfad, ["data/inbox"]);
    if (!(await istDatei(quelle.absolut))) return ergebnis(`${quelle.relativ} ist keine Datei`, true);
    const paare = await planePapierkorb(ctx, quelle);
    return mitRollback(ctx.datenroot, async () => {
      await inDenPapierkorb(paare);
      await protokolliere(ctx, {
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
  description: "Sammelscan aus data/inbox/ (auch processed/, error/) in einzelne PDFs zerlegen, z. B. mehrere zusammengescannte Briefe. Jeder Teil nennt seine Seiten (\"1-4\", \"5\", \"1-2,7\") und einen sprechenden Dateinamen; jede Seite gehoert genau einem Teil. Die Teile landen in der Inbox-Wurzel data/inbox/ und gehen von dort den normalen Weg (inbox-Lauf, beleg_ablegen); das Original wandert samt Zwilling und Textvorlauf in den Papierkorb wie bei inbox_verwerfen. Ueberschreibt nie. Vorschau ist Default; wird bei einem Rollback nicht zurueckgenommen.",
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
    const quelle = await loesePfad(ctx.app, args.quelle, ["data/inbox"]);
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
      const ziel = await loesePfad(ctx.app, path.join("data", "inbox", teil.name), ["data/inbox"]);
      if (await lstat(ziel.absolut).catch(() => null)) return ergebnis(`${ziel.relativ} existiert bereits — nichts geteilt`, true);
      teile.push({ ...teil, ziel });
    }
    const korb = await planePapierkorb(ctx, quelle);
    const bericht = [
      ...teile.map((t) => `${t.ziel.relativ}: Seiten ${t.seiten.join(", ")}`),
      ...korb.map(([q, z]) => `${q.relativ} -> ${z.relativ}`),
    ].join("\n");
    if (!args.schreiben) return ergebnis(`Vorschau (${seitenzahl} Seiten, nichts geschrieben):\n${bericht}`);
    return mitRollback(ctx.datenroot, async () => {
      const ordner = await mkdtemp(path.join(tmpdir(), "finanzen-mcp-teilen-"));
      try {
        await programm("pdfseparate", [quelle.absolut, path.join(ordner, "seite-%d.pdf")]);
        for (const [i, teil] of teile.entries()) {
          const einzeln = teil.seiten.map((nr) => path.join(ordner, `seite-${nr}.pdf`));
          const fertig = path.join(ordner, `teil-${i + 1}.pdf`);
          if (einzeln.length === 1) await rename(einzeln[0], fertig);
          else await programm("pdfunite", [...einzeln, fertig]);
          await copyFile(fertig, teil.ziel.absolut, fsKonstanten.COPYFILE_EXCL);
        }
      } finally {
        await rm(ordner, { recursive: true, force: true });
      }
      await inDenPapierkorb(korb);
      await protokolliere(ctx, {
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
  description: "Nachgereichte Seiten (PDF aus data/inbox/, auch processed/, error/) in einen schon abgelegten PDF-Beleg unter Belege/ einfuegen, z. B. eine beim Scannen vergessene Rueckseite. nach_seite: hinter welcher Seite des Belegs (0 = vorn, ohne Angabe = ans Ende). Der Beleg behaelt Pfad und Namen; die alte Fassung samt .txt-Zwilling und die Inbox-Datei samt Mitlaeufern wandern in den Papierkorb data/papierkorb/<JJJJ-MM-TT>/. Danach belege_text mit schreiben:true fuer den neuen Zwilling. Vorschau ist Default; wird bei einem Rollback nicht zurueckgenommen.",
  inputSchema: {
    type: "object",
    properties: {
      quelle: { type: "string", description: "z. B. data/inbox/scan0002.pdf" },
      ziel: { type: "string", description: "z. B. Belege/Vorsorge/VS-001_Muster/2026/2026_Muster_Jahresinformation.pdf" },
      nach_seite: { type: "integer", minimum: 0, description: "Einfuegen hinter dieser Seite des Belegs; 0 = vorn, ohne Angabe = ans Ende" },
      schreiben: SCHREIBEN,
    },
    required: ["quelle", "ziel"],
    additionalProperties: false,
  },
  nurSchreiben: true,
  async ausfuehren(ctx, args) {
    const quelle = await loesePfad(ctx.app, args.quelle, ["data/inbox"]);
    const ziel = await loesePfad(ctx.app, args.ziel, ["Belege"]);
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

    // Alte Fassung und ihr Zwilling: gemeinsames Suffix bei Namenskollision.
    const stamm = ziel.absolut.slice(0, -".pdf".length);
    const mitZwilling = [{ absolut: ziel.absolut, rest: ".pdf" }];
    if (await istDatei(`${stamm}.txt`)) mitZwilling.push({ absolut: `${stamm}.txt`, rest: ".txt" });
    const korbStamm = path.join("data", "papierkorb", localTodayIso(), path.relative(ctx.app, stamm));
    let n = 1;
    while ((await Promise.all(mitZwilling.map((g) => lstat(path.join(ctx.app, `${korbStamm}${n > 1 ? `-${n}` : ""}${g.rest}`)).then(() => true, () => false)))).some(Boolean)) n += 1;
    const altInDenKorb = [];
    for (const g of mitZwilling) {
      altInDenKorb.push([
        { absolut: g.absolut, relativ: path.relative(ctx.app, g.absolut).split(path.sep).join("/") },
        await loesePfad(ctx.app, `${korbStamm}${n > 1 ? `-${n}` : ""}${g.rest}`, ["data/papierkorb"]),
      ]);
    }
    const korb = [...altInDenKorb, ...(await planePapierkorb(ctx, quelle))];
    const reihenfolge = nach === 0 ? "vorn" : nach === alt ? "am Ende" : `hinter Seite ${nach}`;
    const bericht = [
      `${ziel.relativ}: ${alt} + ${neu} = ${alt + neu} Seiten, ${quelle.relativ} ${reihenfolge}`,
      ...korb.map(([q, z]) => `${q.relativ} -> ${z.relativ}`),
    ].join("\n");
    if (!args.schreiben) return ergebnis(`Vorschau (nichts geschrieben):\n${bericht}`);
    return mitRollback(ctx.datenroot, async () => {
      const ordner = await mkdtemp(path.join(tmpdir(), "finanzen-mcp-ergaenzen-"));
      try {
        await programm("pdfseparate", [ziel.absolut, path.join(ordner, "alt-%d.pdf")]);
        await programm("pdfseparate", [quelle.absolut, path.join(ordner, "neu-%d.pdf")]);
        const seite = (art, nr) => path.join(ordner, `${art}-${nr}.pdf`);
        const folge = [];
        for (let nr = 1; nr <= nach; nr += 1) folge.push(seite("alt", nr));
        for (let nr = 1; nr <= neu; nr += 1) folge.push(seite("neu", nr));
        for (let nr = nach + 1; nr <= alt; nr += 1) folge.push(seite("alt", nr));
        const fertig = path.join(ordner, "fertig.pdf");
        await programm("pdfunite", [...folge, fertig]);
        // Erst neben dem Beleg bereitlegen, dann tauschen: der Beleg fehlt nie.
        const bereit = `${ziel.absolut}.ergaenzt`;
        await copyFile(fertig, bereit, fsKonstanten.COPYFILE_EXCL);
        await inDenPapierkorb(korb);
        await rename(bereit, ziel.absolut);
      } finally {
        await rm(ordner, { recursive: true, force: true });
      }
      await protokolliere(ctx, {
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

const inboxZurueckholen = {
  name: "inbox_zurueckholen",
  description: "Datei aus data/inbox/error/ zurueck in die Inbox-Wurzel data/inbox/ verschieben, damit der naechste inbox-Lauf sie wieder aufnimmt. Existiert dort schon eine Datei gleichen Namens, bricht das Tool ab (nichts ueberschrieben). Eine Fehlernotiz <name>.fehler.txt bleibt in error/ liegen.",
  inputSchema: {
    type: "object",
    properties: { pfad: { type: "string", description: "z. B. data/inbox/error/auszug.csv" } },
    required: ["pfad"],
    additionalProperties: false,
  },
  nurSchreiben: true,
  async ausfuehren(ctx, args) {
    const quelle = await loesePfad(ctx.app, args.pfad, ["data/inbox/error"]);
    if (!(await istDatei(quelle.absolut))) return ergebnis(`${quelle.relativ} ist keine Datei`, true);
    const name = path.basename(quelle.absolut);
    if (name.endsWith(".fehler.txt")) return ergebnis(`${quelle.relativ} ist eine Fehlernotiz, keine Eingangsdatei`, true);
    const ziel = await loesePfad(ctx.app, path.join("data", "inbox", name), ["data/inbox"]);
    if (await lstat(ziel.absolut).catch(() => null)) return ergebnis(`${ziel.relativ} existiert bereits — nichts verschoben`, true);
    return mitRollback(ctx.datenroot, async () => {
      await rename(quelle.absolut, ziel.absolut);
      await protokolliere(ctx, { anlass: "inbox-zurueckholen", inputs: [quelle.relativ], notiz: `Aus error/ zurueck nach ${ziel.relativ}` });
      return ergebnis(`${quelle.relativ} -> ${ziel.relativ}`);
    });
  },
};

export const WERKZEUGE = [status, kennzahlen, transaktionenAbfragen, dateiLesen, dateienSuchen, ...CLI_WERKZEUGE, dateiSchreiben, dateiErsetzen, belegAblegen, belegTeilen, belegErgaenzen, inboxVerwerfen, inboxZurueckholen];

export function sichtbareWerkzeuge(ctx) {
  return WERKZEUGE
    .filter((w) => !w.nurSchreiben || ctx.recht === "schreiben")
    .map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, ...(annotations ? { annotations } : {}) }));
}

// Schreibende Aufrufe einer Sitzung laufen nacheinander: Clients schicken
// Tool-Aufrufe parallel, und Lesen-Aendern-Schreiben (anhaengen, ersetzen)
// sowie Kopie und Rueckspielen in mitRollback vertragen keine Ueberlappung.
// Zwischen zwei Sitzungen (Prozessen) gibt es bewusst keine Sperre.
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
  const alsErgebnis = (r) => (r.content ? r : { content: [{ type: "text", text: r.text }], ...(r.isError ? { isError: true } : {}) });
  if (werkzeug.nurSchreiben && ctx.recht !== "schreiben") {
    return alsErgebnis(ergebnis(`${name} braucht --recht=schreiben. Dieser Zugang ist nur lesend.`, true));
  }
  const fehler = pruefeArgumente(werkzeug.inputSchema, args);
  if (fehler.length) return alsErgebnis(ergebnis(`Ungueltige Argumente:\n${fehler.map((f) => `- ${f}`).join("\n")}`, true));
  const schreibt = Boolean(werkzeug.nurSchreiben || (args.schreiben === true && werkzeug.inputSchema.properties?.schreiben));
  try {
    const lauf = () => werkzeug.ausfuehren(ctx, args);
    return alsErgebnis(await (schreibt ? nacheinander(lauf) : lauf()));
  } catch (error) {
    return alsErgebnis(ergebnis(error instanceof PfadFehler ? `Pfad abgewiesen: ${error.message}` : `Fehler: ${error.message}`, true));
  }
}
