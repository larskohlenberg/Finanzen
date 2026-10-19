// app/mcp/werkzeuge.mjs
// Die MCP-Tools. Drei Sorten:
// - Lese-Tools (status, kennzahlen, transaktionen_abfragen, datei_lesen, dateien_suchen),
// - 1:1-Wrapper um die CLIs in app/tools/ (Vorschau ist Default, schreiben:true
//   setzt das Schreib-Flag der CLI und braucht --recht=schreiben),
// - Datei-Schreiben (datei_schreiben, datei_ersetzen, beleg_ablegen, beleg_teilen,
//   beleg_ergaenzen, beleg_verwerfen, inbox_verwerfen, inbox_zurueckholen), nur mit
//   --recht=schreiben.
// Jeder schreibende Vorgang laeuft durch mitRollback (Validator + Rueckspielen).
import { execFile } from "node:child_process";
import { constants as fsKonstanten } from "node:fs";
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ersetzeVerweise } from "../tools/belege-umziehen.mjs";
import { UMGEBUNG as SPERRE_UMGEBUNG } from "../tools/lib/schreibsperre.mjs";
import { planeTeilung } from "../tools/lib/seiten.mjs";
import { loadMasterData, validateMasterData } from "../tools/validator.mjs";
import { localTodayIso } from "../liquiditaet.mjs";
import { abfragen } from "./abfrage.mjs";
import { pruefeArgumente } from "./argumente.mjs";
import { istKalenderdatum, kennzahlenText, planIstText } from "./kennzahlen.mjs";
import { LESE_WURZELN, PfadFehler, bestandWurzeln, loesePfad, pruefeEndung, pruefeKeinAktiverTyp } from "./pfade.mjs";
import { kopiereDatenroot, mitRollback } from "./schreiben.mjs";
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
  description: "Default false = Vorschau, es wird nichts geschrieben. true schreibt (nur mit --recht=schreiben); danach laeuft der Validator, bei neuen Fehlern oder einem Werkzeugfehler wird der Bestand zurueckgesetzt.",
};

// Die Kategorisierungsregel (ADR 0029) an einer Stelle: Anleitung und
// Werkzeugbeschreibungen nennen sie wortgleich.
export const KATEGORIE_REGEL = "Regeln nur mit Beleg (Belegleiter E1-E4). Einzelbuchungen ohne Beleg schaetzt der Agent: plausibelste Kategorie als Einzelvorschlag (agent_vorschlag); KAT-012 nur, wenn keine Kategorie plausibel ist.";

const ergebnis = (text, isError = false) => ({ text, isError });

// Belege/ gehoert nur zu data/master; andere Bestaende haben keine Belegablage.
function belegeWurzel(ctx) {
  const { belege, datenroot } = bestandWurzeln(ctx);
  if (!belege) throw new PfadFehler(`Belege/ gehoert zum Bestand data/master; ${datenroot} hat keine Belegablage`);
  return belege;
}
const json = (wert) => JSON.stringify(wert, null, 2);

// ---------------------------------------------------------------- CLI-Laeufe

// sperre: die von mitRollback gehaltene Schreibsperre; die CLI erbt sie ueber
// die Umgebung und nimmt keine eigene.
function starte(ctx, skript, args, sperre = null) {
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(ctx.app, "tools", skript), ...args], {
      cwd: ctx.app,
      env: sperre ? { ...process.env, [SPERRE_UMGEBUNG]: sperre.kennung } : process.env,
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
// schreibt immer (derzeit keine) — dann laeuft die Vorschau gegen
// eine Wegwerfkopie des Datenroots, und beim Schreiben wird kein Flag gereicht.
// rueckrollungBeiFehler: false fuer Laeufe, die Dateien ausserhalb des
// Bestands verschieben (Inbox-Archiv, Belege); dort wuerde ein Zuruecksetzen nur
// des Bestands Verweise ins Leere zeigen lassen. Sie setzen nur bei neuen
// Validatorfehlern zurueck. mitBelegen: der Lauf arbeitet auf Belege/.
function cli({ name, skript, beschreibung, eigenschaften = {}, pflicht = [], schreibFlag, ohneVorschau = false, okCodes = [0], rueckrollungBeiFehler = true, mitBelegen = false, argv }) {
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
      const lauf = async (root, kopfzeile, sperre = null) => {
        const cliArgs = await argv(ctx, args, root);
        const flag = schreiben && !ohneVorschau ? [schreibFlag] : [];
        let r;
        try {
          r = await starte(ctx, skript, [...cliArgs, ...flag], sperre);
        } finally {
          await cliArgs.aufraeumen?.();
        }
        const teile = [kopfzeile, `tools/${skript} — Exitcode: ${r.exitCode}`, r.stdout.trimEnd()];
        if (r.stderr.trim()) teile.push(`--- stderr ---\n${r.stderr.trimEnd()}`);
        return ergebnis(teile.join("\n"), !okCodes.includes(r.exitCode));
      };
      if (schreiben) return mitRollback(ctx.datenroot, (sperre) => lauf(ctx.datenrootRel, "Modus: schreiben", sperre), { rueckrollungBeiFehler });
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
        await writeFile(datei, JSON.stringify(a.kandidaten));
      } else if (a.kandidaten_datei) {
        // Den geprueften absoluten Pfad reichen: die CLI soll nichts mehr deuten.
        datei = (await loesePfad(ctx.app, a.kandidaten_datei, bestandWurzeln(ctx).schreiben)).absolut;
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
      const out = [root];
      if (a.top) out.push("--top", String(a.top));
      if (!a.eintraege) return out;
      const eintraege = [];
      for (const e of a.eintraege) {
        eintraege.push(e.datei ? { ...e, datei: (await loesePfad(ctx.app, e.datei, logoQuellen(ctx))).absolut } : e);
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
        await writeFile(datei, JSON.stringify(a.umzuege));
      } else if (a.plan_datei) {
        datei = (await loesePfad(ctx.app, a.plan_datei, bestandWurzeln(ctx).schreiben)).absolut;
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
  const ordner = path.join(ctx.app, bestandWurzeln(ctx).inbox);
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
    const bericht = { datenroot: ctx.datenrootRel, recht: ctx.recht, ...(ctx.release ? { version: releaseStand(ctx) } : {}) };
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
    const daten = await loadMasterData(pathToFileURL(`${ctx.datenroot}${path.sep}`));
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
    const daten = await loadMasterData(pathToFileURL(`${ctx.datenroot}${path.sep}`));
    return ergebnis(planIstText(daten, stichtag, { zeitraum: args.zeitraum ?? "gesamt", darstellung: args.darstellung, verlauf: args.verlauf }));
  },
};

const transaktionenAbfragen = {
  name: "transaktionen_abfragen",
  description: "Transaktionen filtern und optional gruppieren. Alle Filter sind UND-verknuepft; text sucht case-insensitiv als Teilstring in Gegenpartei, Verwendungszweck und Bemerkung; immobilie filtert auf den Immobilienbezug. Ohne gruppieren_nach: Zeilen (limit Default 100, max 1000) plus Anzahl und Gesamtsumme. Mit gruppieren_nach: Summen je Gruppe; Zeilen nur mit mit_zeilen:true. Summen sind Decimal-Strings, cent-genau gerechnet. Hinweis: Startzustandsbuchungen (transaktionstyp Startzustand) stehen unter der neutralen Kategorie Startzustand; in reinen Summen ueber alle Buchungen sind sie enthalten.",
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

// Ziel eines Dateiwerkzeugs: nur im Bestand der Sitzung (samt Inbox,
// Importprofilen, Papierkorb) und nur mit erlaubter Endung.
async function schreibZiel(ctx, pfad) {
  const ziel = await loesePfad(ctx.app, pfad, bestandWurzeln(ctx).schreiben);
  pruefeEndung(ziel.relativ);
  return ziel;
}

const dateiSchreiben = {
  name: "datei_schreiben",
  description: "Ganze Textdatei im Bestand der Sitzung oder in dessen Inbox/Importprofilen schreiben oder anlegen (max. 10 MB), z. B. eine standardisierte JSONL unter <inbox>/standardized/ (data/master: data/inbox/), ein Importprofil (data/master: data/import-profile/) oder eine Masterdatei. Nur Endungen json, jsonl, csv, txt, md, pdf, png, jpg. Mit anhaengen:true wird der Inhalt als Zeile(n) ans Dateiende gehaengt (z. B. ein Eintrag in agent_log.jsonl). Nicht Belege/, nicht andere Bestaende. Vorschau ist Default; erst schreiben:true schreibt. Danach laeuft der Validator; bei neuen Fehlern oder einem Werkzeugfehler wird der Bestand zurueckgesetzt. Kategorien nie per Datei-Edit an Transaktionen setzen — dafuer gibt es bestaetigen/agent_vorschlag.",
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
    return mitRollback(ctx.datenroot, async () => {
      if (args.anhaengen) {
        // Nur eine fehlende Datei gilt als leer; jeder andere Lesefehler bricht ab,
        // sonst ersetzte das Anhaengen den unlesbaren Inhalt.
        const bisher = await readFile(absolut, "utf8").catch((error) => {
          if (error.code === "ENOENT") return "";
          throw error;
        });
        await schreibeAtomar(absolut, `${bisher.replace(/\n*$/, bisher ? "\n" : "")}${args.inhalt.replace(/\n*$/, "\n")}`);
        return ergebnis(`${relativ}: ${bytes} Bytes angehaengt.`);
      }
      await schreibeAtomar(absolut, args.inhalt);
      return ergebnis(`${relativ} geschrieben (${bytes} Bytes).`);
    });
  },
};

const dateiErsetzen = {
  name: "datei_ersetzen",
  description: "Exakten Textabschnitt in einer Datei im Bestand der Sitzung oder in dessen Inbox/Importprofilen ersetzen. alt muss genau einmal vorkommen (sonst Fehler, nichts geaendert). Vorschau ist Default; erst schreiben:true schreibt. Danach laeuft der Validator; bei neuen Fehlern oder einem Werkzeugfehler wird der Bestand zurueckgesetzt.",
  inputSchema: {
    type: "object",
    properties: { pfad: { type: "string" }, alt: { type: "string", minLength: 1 }, neu: { type: "string" }, schreiben: SCHREIBEN },
    required: ["pfad", "alt", "neu"],
    additionalProperties: false,
  },
  nurSchreiben: true,
  async ausfuehren(ctx, args) {
    const { absolut, relativ } = await schreibZiel(ctx, args.pfad);
    const pruefen = async () => {
      const info = await stat(absolut).catch(() => null);
      if (!info?.isFile()) return { fehler: `${relativ} existiert nicht` };
      if (info.size > MAX_SCHREIBEN) return { fehler: `${relativ} ist groesser als 10 MB` };
      const text = await readFile(absolut, "utf8");
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
    return mitRollback(ctx.datenroot, async () => {
      // Unter der Schreibreihenfolge neu lesen: dazwischen kann ein anderer
      // Aufruf die Datei geaendert haben.
      const jetzt = await pruefen();
      if (jetzt.fehler) return ergebnis(jetzt.fehler, true);
      await schreibeAtomar(absolut, jetzt.text.slice(0, jetzt.erste) + args.neu + jetzt.text.slice(jetzt.erste + args.alt.length));
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
        paare.push([{ absolut: zwilling, relativ: path.relative(ctx.app, zwilling) }, { absolut: zielZwilling, relativ: path.relative(ctx.app, zielZwilling) }]);
      }
    }
    for (const [, z] of paare) {
      if (await lstat(z.absolut).catch(() => null)) return ergebnis(`${z.relativ} existiert bereits — nichts verschoben`, true);
    }
    const bericht = paare.map(([q, z]) => `${q.relativ} -> ${z.relativ}`).join("\n");
    if (!args.schreiben) return ergebnis(`Vorschau (nichts verschoben):\n${bericht}`);
    return mitVerschieben(ctx, async () => {
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
  const w = bestandWurzeln(ctx);
  const inbox = path.join(ctx.app, w.inbox);
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
    const belegt = await Promise.all(gruppe.map((g) => lstat(path.join(ctx.app, zielFuer(g, n))).then(() => true, () => false)));
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
    const zwilling = await loesePfad(ctx.app, path.relative(ctx.app, `${stamm}.txt`), [belegeWurzel(ctx)]).catch(() => null);
    if (zwilling && (await istDatei(zwilling.absolut))) gruppe.push({ absolut: zwilling.absolut, rest: ".txt" });
  }
  const { papierkorb } = bestandWurzeln(ctx);
  const korbStamm = path.join(papierkorb, localTodayIso(), path.relative(ctx.app, stamm));
  const zielFuer = (g, n) => `${korbStamm}${n > 1 ? `-${n}` : ""}${g.rest}`;
  let n = 1;
  while ((await Promise.all(gruppe.map((g) => lstat(path.join(ctx.app, zielFuer(g, n))).then(() => true, () => false)))).some(Boolean)) n += 1;
  const paare = [];
  for (const g of gruppe) {
    paare.push([
      { absolut: g.absolut, relativ: path.relative(ctx.app, g.absolut).split(path.sep).join("/") },
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

async function inDenPapierkorb(paare) {
  for (const [q, z] of paare) {
    // Wie data/ selbst: nicht fuer alle lesbar (die umask allein liesse 775 zu).
    await mkdir(path.dirname(z.absolut), { recursive: true, mode: 0o750 });
    await rename(q.absolut, z.absolut);
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
    return mitVerschieben(ctx, async () => {
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
    return mitVerschieben(ctx, async () => {
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
    return mitVerschieben(ctx, async () => {
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
      for (const v of verweise) await schreibeAtomar(path.join(ctx.datenroot, v.name), ersetzeVerweise(v.text, ersetzungen).text);
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

const belegVerwerfen = {
  name: "beleg_verwerfen",
  description: "Abgelegten Beleg unter Belege/ samt .txt-Zwilling in den Papierkorb data/papierkorb/<JJJJ-MM-TT>/Belege/... verschieben, z. B. eine Doublette. Nichts wird geloescht; bei Namenskollision bekommt die Datei ein Suffix (-2, -3 ...). Nennen Stamm- oder Bewegungsdaten den Beleg noch, wird abgewiesen: erst den Verweis umstellen (datei_ersetzen, belege_umziehen). grund wird als notiz in agent_log.jsonl protokolliert. Den Papierkorb leert nur der Nutzer. Vorschau ist Default; wird bei einem Rollback nicht zurueckgenommen.",
  inputSchema: {
    type: "object",
    properties: {
      pfad: { type: "string", description: "z. B. Belege/Vorsorge/VS-001_Muster/2026/2026_Muster_Jahresinformation_Seite-2.pdf" },
      grund: { type: "string", maxLength: 300, description: "Kurz, z. B. \"Doublette, Seite steckt in ..._Jahresinformation.pdf\"" },
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
    const verweise = await datenMitVerweis(ctx, paare.map(([q]) => q.relativ));
    if (verweise.length) {
      return ergebnis(`${beleg.relativ} wird noch verwiesen — nichts verschoben:\n${verweise.map((v) => `${v.name}: ${v.anzahl}`).join("\n")}`, true);
    }
    const bericht = paare.map(([q, z]) => `${q.relativ} -> ${z.relativ}`).join("\n");
    if (!args.schreiben) return ergebnis(`Vorschau (nichts verschoben):\n${bericht}`);
    return mitVerschieben(ctx, async () => {
      await inDenPapierkorb(paare);
      await protokolliere(ctx, {
        anlass: "beleg-verwerfen",
        inputs: paare.map(([q]) => q.relativ),
        papierkorb: paare.map(([, z]) => z.relativ),
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
    return mitVerschieben(ctx, async () => {
      await rename(quelle.absolut, ziel.absolut);
      await protokolliere(ctx, { anlass: "inbox-zurueckholen", inputs: [quelle.relativ], notiz: `Aus error/ zurueck nach ${ziel.relativ}` });
      return ergebnis(`${quelle.relativ} -> ${ziel.relativ}`);
    });
  },
};

export const WERKZEUGE = [status, kennzahlen, planIstWerkzeug, transaktionenAbfragen, dateiLesen, dateienSuchen, ...CLI_WERKZEUGE, dateiSchreiben, dateiErsetzen, belegAblegen, belegTeilen, belegErgaenzen, belegVerwerfen, inboxVerwerfen, inboxZurueckholen];

export function sichtbareWerkzeuge(ctx) {
  return WERKZEUGE
    .filter((w) => !w.nurSchreiben || ctx.recht === "schreiben")
    .map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, ...(annotations ? { annotations } : {}) }));
}

// Schreibende Aufrufe einer Sitzung laufen nacheinander: Clients schicken
// Tool-Aufrufe parallel, und Lesen-Aendern-Schreiben (anhaengen, ersetzen)
// sowie Kopie und Rueckspielen in mitRollback vertragen keine Ueberlappung.
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
