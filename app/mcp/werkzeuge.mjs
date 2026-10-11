// app/mcp/werkzeuge.mjs
// Die MCP-Tools. Drei Sorten:
// - Lese-Tools (status, transaktionen_abfragen, datei_lesen, dateien_suchen),
// - 1:1-Wrapper um die CLIs in app/tools/ (Vorschau ist Default, schreiben:true
//   setzt das Schreib-Flag der CLI und braucht --recht=schreiben),
// - Datei-Schreiben (datei_schreiben, datei_ersetzen, beleg_ablegen), nur mit
//   --recht=schreiben.
// Jeder schreibende Vorgang laeuft durch mitRollback (Validator + Rueckspielen).
import { execFile } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadMasterData } from "../tools/validator.mjs";
import { abfragen } from "./abfrage.mjs";
import { pruefeArgumente } from "./argumente.mjs";
import { LESE_WURZELN, PfadFehler, SCHREIB_WURZELN, loesePfad } from "./pfade.mjs";
import { kopiereDatenroot, mitRollback, validiere } from "./schreiben.mjs";

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
    beschreibung: "Inbox-Lauf (tools/inbox.mjs) ueber die Dateien direkt in data/inbox/: Profil zuordnen, CSV normalisieren, importieren, Datei nach processed/ bzw. error/ verschieben, PDFs als Textvorlauf nach standardized/. Vorschau ist Default. Verschiebungen werden bei einem Rollback nicht zurueckgenommen.",
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
    beschreibung: "Agenten-Einzelvorschlaege setzen (tools/agent-vorschlag.mjs): Buchungen auf vorgeschlagen mit kategorie_herkunft=agent. Fuer E5-Faelle und fuer E6 immer KAT-012 (ohne Beleg keine Sachkategorie). Vorschau ist Default.",
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
    beschreibung: "Textzwillinge (.txt) fuer PDFs unter Belege/ erzeugen und data/inbox/standardized/ sowie processed/ per Inhalts-Hash aufraeumen (tools/belege-text.mjs). error/ bleibt unangetastet. Vorschau ist Default; geloeschte Eingangsdateien werden bei einem Rollback nicht wiederhergestellt.",
    schreibFlag: "--schreiben",
    argv: async () => [],
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
    const validator = await validiere(ctx.datenroot);
    const bericht = { datenroot: ctx.datenrootRel, recht: ctx.recht };
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
    } catch (error) {
      bericht.masterdaten = `nicht lesbar: ${error.message}`;
    }
    bericht.validator = { gueltig: validator.gueltig, fehler_anzahl: validator.fehler.length, fehler: validator.fehler.slice(0, 50) };
    bericht.inbox = await inboxStand(ctx);
    return ergebnis(json(bericht));
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
  description: "Datei lesen, Pfad relativ zum App-Raum. Erlaubt: data/, Belege/, docs/, schemas/ sowie die Repo-Doku ../docs/ und ../CONTEXT.md. Textdateien bis 2 MB (groessere nur mit Zeilenbereich); ein Ordner liefert seine Eintraege. PDFs: liefert den .txt-Zwilling bzw. pdftotext-Text; mit seite:N die gerenderte Seite als Bild (fuer Bildscans). Bilder werden als Bild geliefert.",
  inputSchema: {
    type: "object",
    properties: {
      pfad: { type: "string" },
      von_zeile: { type: "integer", minimum: 1 },
      bis_zeile: { type: "integer", minimum: 1 },
      seite: { type: "integer", minimum: 1, description: "Nur PDF: Seite als Bild rendern" },
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
      const zwilling = absolut.replace(/\.pdf$/i, ".txt");
      const zwillingText = await readFile(zwilling, "utf8").catch(() => null);
      if (zwillingText !== null) {
        return ergebnis(`# Textzwilling ${relativ.replace(/\.pdf$/i, ".txt")}\n${zeilenbereich(zwillingText, args.von_zeile, args.bis_zeile, relativ)}`);
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
        const bisher = await readFile(absolut, "utf8").catch(() => "");
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

const belegAblegen = {
  name: "beleg_ablegen",
  description: "Rohbeleg aus data/inbox/ (auch processed/, error/) sprechend benannt unter Belege/ ablegen, z. B. Belege/Kontoauszuege/<Konto>/... oder Belege/<Jahr>/<Rubrik>/... Verschiebt, legt fehlende Ordner an, ueberschreibt nie, Endung bleibt gleich. Ein .txt-Zwilling gleichen Namens neben der Quelle wird mitgenommen (so kommt ein von Hand geschriebener Bildscan-Zwilling an den Beleg: erst per datei_schreiben neben die Quelle legen). Wird bei einem Rollback nicht zurueckgenommen.",
  inputSchema: {
    type: "object",
    properties: {
      quelle: { type: "string", description: "z. B. data/inbox/processed/scan0001.pdf" },
      ziel: { type: "string", description: "z. B. Belege/2026/Versicherungen/KFZ_MusterversicherungB_Beitragsrechnung_2026.pdf" },
    },
    required: ["quelle", "ziel"],
    additionalProperties: false,
  },
  nurSchreiben: true,
  async ausfuehren(ctx, args) {
    const quelle = await loesePfad(ctx.app, args.quelle, ["data/inbox"]);
    const ziel = await loesePfad(ctx.app, args.ziel, ["Belege"]);
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

export const WERKZEUGE = [status, transaktionenAbfragen, dateiLesen, dateienSuchen, ...CLI_WERKZEUGE, dateiSchreiben, dateiErsetzen, belegAblegen];

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
