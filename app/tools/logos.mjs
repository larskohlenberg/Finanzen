// app/tools/logos.mjs
// Logo-Verzeichnis pflegen: DATENROOT/logos.json plus DATENROOT/logos/<domain>.png.
//
//   node app/tools/logos.mjs <datenroot> [--top 20]
//       Bericht: Eintraege, fehlende Dateien, haeufigste Gegenparteien,
//       Regelzahlungen, Vorsorgevertraege und Konten ohne Logo.
//   node app/tools/logos.mjs <datenroot> --plan <datei.json> [--schreiben]
//   node app/tools/logos.mjs <datenroot> --domain <d> --name <n> --muster <m> [--datei <bild>] [--schreiben]
//       Logo je Domain beim Logodienst abrufen, auf hoechstens 128 px verkleinern
//       und eintragen. Plan: [{ "name", "domain", "muster" }]. Gleiche Domain =
//       Eintrag aktualisieren. Kennt der Dienst die Domain nicht oder liefert das
//       falsche Logo, bringt der Eintrag das Bild selbst mit: "bild" (PNG oder
//       JPEG, Base64) und "quelle" (https-URL, woher es stammt). Alternativ nennt
//       "datei" (bzw. --datei) eine lokale Bilddatei, relativ zum Arbeitsordner,
//       z. B. ein Logo aus einem Briefkopf; "quelle" ist dann optional. Ohne
//       --schreiben nur Vorschau (der Abruf laeuft, geschrieben wird nichts).
//
// Welche Domain zu einer Gegenpartei gehoert, entscheidet der Agent (ADR 0003,
// 0010); das Tool ruft ab, prueft und traegt ein. Logos sind Echtdaten (sie
// verraten, bei wem man Kunde ist) und liegen nur im Datenbestand.
import { mkdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dataRootFromArg } from "./data-root.mjs";
import { beginneLauf } from "./lib/fingerabdruck.mjs";
import { loadMasterData, validateMasterData } from "./validator.mjs";
import { normalizeLoose } from "./lib/text.mjs";
import { dekodierePng, istPng, kodierePng, verkleinere } from "./lib/png.mjs";
import { dekodiereJpeg, istJpeg } from "./lib/jpeg.mjs";
import { logoVerzeichnis } from "../logos.mjs";
import { localTodayIso } from "../liquiditaet.mjs";
import { neueFehler } from "./lib/validator-befund.mjs";
import { ersetzeDatei, haengeAn } from "./lib/datei.mjs";

// Logodienst: Googles Favicon-Dienst. Frei, ohne Schluessel, liefert meist PNG in
// der verlangten Groesse, bei manchen Domains aber das JPEG der Website, und 404,
// wenn er fuer die Domain nichts hat (ADR 0030). Abgelegt wird immer PNG, so
// gross wie geliefert bis 128 px: die App zeigt Logos bis 48 px, auf
// hochaufloesenden Bildschirmen also mit bis zu 96 Bildpunkten.
export const DIENST_GROESSE = 128;
export const ZIEL_GROESSE = 128;
const MIN_QUELLE = 32;
const MAX_BYTES = 1024 * 1024;
const MAX_DATEI_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 15000;

export const dienstUrl = (domain) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${DIENST_GROESSE}`;
export const logoDatei = (domain) => `logos/${domain}.png`;

const DOMAIN = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/;

// "https://www.Beispiel.de/pfad" -> "beispiel.de"; null, wenn keine Domain.
export function normalisiereDomain(roh) {
  const text = String(roh ?? "").trim();
  if (!text) return null;
  let host;
  try {
    host = new URL(text.includes("://") ? text : `https://${text}`).hostname;
  } catch {
    return null;
  }
  host = host.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  return DOMAIN.test(host) ? host : null;
}

function naechsteId(logos) {
  const max = logos.reduce((m, l) => Math.max(m, Number(/^LOGO-(\d+)$/.exec(l.logo_id)?.[1] ?? 0)), 0);
  return `LOGO-${String(max + 1).padStart(3, "0")}`;
}

// Eintraege pruefen und gegen den Bestand planen. Liefert je Eintrag die
// Aktion (neu|aktualisieren) und den kuenftigen Logo-Datensatz ohne Abrufdaten.
export function planeLogos({ logos = [], eintraege = [] }) {
  const fehler = [];
  const plan = [];
  const gesehen = new Set();
  let arbeit = [...logos];
  eintraege.forEach((e, i) => {
    const ort = `eintraege[${i}]`;
    const domain = normalisiereDomain(e?.domain);
    const name = String(e?.name ?? "").trim();
    const muster = String(e?.muster ?? "").trim();
    const bild = e?.bild === undefined ? null : String(e.bild).trim();
    const bilddatei = e?.datei == null ? null : String(e.datei).trim();
    const quelle = e?.quelle === undefined ? null : String(e.quelle).trim();
    if (!domain) fehler.push(`${ort}.domain: keine gueltige Domain "${e?.domain ?? ""}"`);
    if (!name) fehler.push(`${ort}.name: fehlt`);
    if (!muster || muster.split("|").some((teil) => !normalizeLoose(teil))) fehler.push(`${ort}.muster: leer oder mit leerem Teil`);
    if (bild !== null && !bild) fehler.push(`${ort}.bild: leer`);
    if (bilddatei === "") fehler.push(`${ort}.datei: leer`);
    if (bild !== null && bilddatei !== null) fehler.push(`${ort}.datei: nur bild oder datei, nicht beides`);
    if ((bild !== null || quelle !== null) && !/^https:\/\/\S+$/.test(quelle ?? "")) fehler.push(`${ort}.quelle: https-URL noetig, wenn das Bild mitkommt`);
    if (quelle !== null && bild === null && bilddatei === null) fehler.push(`${ort}.bild: fehlt zur quelle (oder datei angeben)`);
    if (domain && gesehen.has(domain)) fehler.push(`${ort}.domain: ${domain} doppelt im Plan`);
    if (fehler.some((f) => f.startsWith(`${ort}.`))) return;
    gesehen.add(domain);
    const vorhanden = arbeit.find((l) => l.domain === domain);
    const logo_id = vorhanden?.logo_id ?? naechsteId(arbeit);
    const eintrag = { logo_id, name, gegenpartei_pattern: muster, domain, datei: logoDatei(domain) };
    if (!vorhanden) arbeit = [...arbeit, eintrag];
    const extra = bild ? { bild: { base64: bild, quelle } } : bilddatei ? { bilddatei: { pfad: bilddatei, ...(quelle ? { quelle } : {}) } } : {};
    plan.push({ aktion: vorhanden ? "aktualisieren" : "neu", eintrag, ...extra });
  });
  return { plan, fehler };
}

// Logo beim Dienst holen und zur Ablage aufbereiten. holen ist fetch-artig
// (fuer Tests austauschbar). Ergebnis: { ok, png, breite, hoehe, quelle, hinweis }
// oder { ok: false, fehler }.
export async function holeLogo(domain, { holen = fetch } = {}) {
  const quelle = dienstUrl(domain);
  let antwort;
  try {
    antwort = await holen(quelle, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    return { ok: false, quelle, fehler: `Abruf fehlgeschlagen: ${error.message}` };
  }
  if (antwort.status === 404) return { ok: false, quelle, fehler: "Dienst kennt fuer diese Domain kein Logo (404)" };
  if (!antwort.ok) return { ok: false, quelle, fehler: `Dienst antwortet mit HTTP ${antwort.status}` };
  return bereiteAuf(Buffer.from(await antwort.arrayBuffer()), quelle, "Dienst liefert");
}

// Mitgebrachtes Bild (Base64) wie einen Abruf aufbereiten; quelle sagt, woher es stammt.
export function eigenesLogo({ base64, quelle }) {
  return bereiteAuf(Buffer.from(base64, "base64"), quelle, "Bild hat");
}

// Logo aus einer lokalen Bilddatei uebernehmen, z. B. aus einem Briefkopf oder
// Pressebereich, wenn der Dienst nur ein winziges Bild hat. Gleiche Pruefung
// wie beim Abruf: nur PNG oder Baseline-JPEG (kein SVG), verkleinert auf
// hoechstens 128 px. Ohne eigene quelle nennt sie die Herkunft "datei:<name>".
export async function leseLogoDatei(pfad, { lesen = readFile, quelle = `datei:${basename(String(pfad))}` } = {}) {
  let bytes;
  try {
    bytes = await lesen(pfad);
  } catch (error) {
    return { ok: false, quelle, fehler: error.code === "ENOENT" ? `Datei nicht gefunden: ${pfad}` : `Datei nicht lesbar: ${error.message}` };
  }
  return bereiteAuf(Buffer.from(bytes), quelle, "Datei hat", MAX_DATEI_BYTES);
}

function bereiteAuf(bytes, quelle, wer, maxBytes = MAX_BYTES) {
  if (bytes.length > maxBytes) return { ok: false, quelle, fehler: `Bild zu gross (${bytes.length} Bytes)` };
  const format = istPng(bytes) ? "PNG" : istJpeg(bytes) ? "JPEG" : null;
  if (!format) return { ok: false, quelle, fehler: "Bild ist weder PNG noch JPEG" };
  let bild;
  try {
    bild = format === "PNG" ? dekodierePng(bytes) : dekodiereJpeg(bytes);
  } catch (error) {
    return { ok: false, quelle, fehler: `${format} nicht lesbar: ${error.message}` };
  }
  const klein = verkleinere(bild, ZIEL_GROESSE);
  const hinweis = Math.max(bild.breite, bild.hoehe) < MIN_QUELLE ? `${wer} nur ${bild.breite}x${bild.hoehe} px, wirkt evtl. unscharf` : undefined;
  return { ok: true, quelle, png: kodierePng(klein), breite: klein.breite, hoehe: klein.hoehe, quell_breite: bild.breite, quell_hoehe: bild.hoehe, ...(hinweis ? { hinweis } : {}) };
}

// Bericht: was hat ein Logo, was nicht. vorhandeneDateien: Set der
// datei-Pfade, die auf der Platte liegen.
export function logoBericht({ logos = [], transaktionen = [], regelzahlungen = [], vorsorge = [], konten = [] }, { top = 20, vorhandeneDateien = null } = {}) {
  const verzeichnis = logoVerzeichnis({ logos, transaktionen, regelzahlungen });
  const gruppen = new Map();
  let mitGegenpartei = 0;
  let mitLogo = 0;
  for (const tx of transaktionen) {
    const key = normalizeLoose(tx.gegenpartei);
    if (!key) continue;
    mitGegenpartei += 1;
    if (verzeichnis.fuerGegenpartei(tx.gegenpartei)) {
      mitLogo += 1;
      continue;
    }
    if (!gruppen.has(key)) gruppen.set(key, { gegenpartei: tx.gegenpartei, buchungen: 0, zuletzt: "" });
    const g = gruppen.get(key);
    g.buchungen += 1;
    if (tx.buchungsdatum > g.zuletzt) g.zuletzt = tx.buchungsdatum;
  }
  const ohneLogo = [...gruppen.values()].sort((a, b) => b.buchungen - a.buchungen || a.gegenpartei.localeCompare(b.gegenpartei));
  return {
    logos: logos.length,
    ...(vorhandeneDateien ? { dateien_fehlen: logos.filter((l) => !vorhandeneDateien.has(l.datei)).map((l) => `${l.logo_id} ${l.datei}`) } : {}),
    buchungen_mit_gegenpartei: mitGegenpartei,
    buchungen_mit_logo: mitLogo,
    gegenparteien_ohne_logo: ohneLogo.length,
    haeufigste_ohne_logo: ohneLogo.slice(0, top),
    regelzahlungen_ohne_logo: regelzahlungen
      .filter((rz) => rz.status === "bestaetigt" && !verzeichnis.fuerRegelzahlung(rz))
      .map((rz) => `${rz.regelzahlung_id} ${rz.bezeichnung}`),
    vorsorge_ohne_logo: vorsorge.filter((vs) => !verzeichnis.fuerVorsorge(vs)).map((vs) => `${vs.vorsorge_id} ${vs.name}`),
    konten_ohne_logo: konten.filter((k) => k.kontotyp !== "bar" && !verzeichnis.fuerKonto(k)).map((k) => `${k.konto_id} ${k.name}`),
  };
}

// Abrufergebnisse in den Bestand uebernehmen. Liefert die neue Logo-Liste.
export function uebernehme(logos, ergebnisse, heute) {
  let neu = [...logos];
  for (const { eintrag, abruf } of ergebnisse) {
    if (!abruf.ok) continue;
    const datensatz = { ...eintrag, quelle: abruf.quelle, abgerufen_am: heute };
    const index = neu.findIndex((l) => l.logo_id === eintrag.logo_id);
    if (index >= 0) neu[index] = datensatz;
    else neu = [...neu, datensatz];
  }
  return neu;
}

// --- CLI -------------------------------------------------------------------

function parseArgs(argv) {
  const opt = { root: null, plan: null, domain: null, name: null, muster: null, datei: null, top: 20, schreiben: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const wert = () => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`${arg}: Wert fehlt`);
      i += 1;
      return v;
    };
    if (arg === "--schreiben") opt.schreiben = true;
    else if (arg === "--plan") opt.plan = wert();
    else if (arg === "--domain") opt.domain = wert();
    else if (arg === "--name") opt.name = wert();
    else if (arg === "--muster") opt.muster = wert();
    else if (arg === "--datei") opt.datei = wert();
    else if (arg === "--top") opt.top = Number(wert());
    else if (arg.startsWith("--fingerabdruck=")) continue; // lib/fingerabdruck.mjs
    else if (arg.startsWith("--")) throw new Error(`Unbekannte Option ${arg}`);
    else if (!opt.root) opt.root = arg;
    else throw new Error(`Unerwartetes Argument ${arg}`);
  }
  if (!opt.root) throw new Error("Datenbestand fehlt (z. B. data/master)");
  if (!Number.isInteger(opt.top) || opt.top < 1) throw new Error("--top: ganze Zahl ab 1");
  if (opt.datei && opt.plan) throw new Error("--datei nur mit --domain/--name/--muster, im Plan je Eintrag als datei");
  return opt;
}

async function vorhanden(url) {
  try {
    await readFile(url);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  let opt;
  try {
    opt = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error("Aufruf: node app/tools/logos.mjs <datenroot> [--top N] | [--plan <datei.json> | --domain <d> --name <n> --muster <m> [--datei <bild>]] [--schreiben]");
    process.exitCode = 2;
    return;
  }
  const root = dataRootFromArg(opt.root, null, new URL("../", import.meta.url));
  // Schreibsperre und ggf. Fingerabdruck-Pruefung fuer den ganzen Lauf
  // (Lesen bis Schreiben); die Vorschau nennt den Fingerabdruck.
  if (root) await beginneLauf(fileURLToPath(root), opt.schreiben);
  const data = await loadMasterData(root);

  let eintraege = null;
  if (opt.plan) eintraege = JSON.parse(await readFile(opt.plan, "utf8"));
  else if (opt.domain || opt.name || opt.muster || opt.datei) eintraege = [{ domain: opt.domain, name: opt.name, muster: opt.muster, ...(opt.datei ? { datei: opt.datei } : {}) }];

  if (!eintraege) {
    const dateien = new Set();
    for (const l of data.logos) if (await vorhanden(new URL(l.datei, root))) dateien.add(l.datei);
    console.log(JSON.stringify(logoBericht(data, { top: opt.top, vorhandeneDateien: dateien }), null, 2));
    console.log("\nBericht — nichts geschrieben. Logos nachziehen mit --plan <datei.json> bzw. --domain/--name/--muster.");
    return;
  }
  if (!Array.isArray(eintraege)) throw new Error("Plan muss eine Liste [{ name, domain, muster, bild?, datei?, quelle? }] sein");

  const { plan, fehler } = planeLogos({ logos: data.logos, eintraege });
  if (fehler.length) {
    console.error("Plan ungueltig, nichts abgerufen:");
    for (const f of fehler) console.error(`- ${f}`);
    process.exitCode = 2;
    return;
  }

  const ergebnisse = [];
  for (const schritt of plan) {
    let abruf;
    if (schritt.bild) abruf = eigenesLogo(schritt.bild);
    else if (schritt.bilddatei) abruf = await leseLogoDatei(resolve(schritt.bilddatei.pfad), schritt.bilddatei.quelle ? { quelle: schritt.bilddatei.quelle } : {});
    else abruf = await holeLogo(schritt.eintrag.domain);
    ergebnisse.push({ ...schritt, abruf });
  }
  const heute = localTodayIso();
  const logos = uebernehme(data.logos, ergebnisse, heute);
  const fehlgeschlagen = ergebnisse.filter((e) => !e.abruf.ok);

  console.log(JSON.stringify({
    modus: opt.schreiben ? "geschrieben" : "vorschau",
    ergebnisse: ergebnisse.map(({ aktion, eintrag, abruf }) => ({
      aktion,
      logo_id: eintrag.logo_id,
      name: eintrag.name,
      domain: eintrag.domain,
      muster: eintrag.gegenpartei_pattern,
      ...(abruf.ok
        ? { ergebnis: "ok", quelle: abruf.quelle, datei: eintrag.datei, pixel: `${abruf.breite}x${abruf.hoehe}`, bytes: abruf.png.length, ...(abruf.hinweis ? { hinweis: abruf.hinweis } : {}) }
        : { ergebnis: "fehlgeschlagen", fehler: abruf.fehler }),
    })),
  }, null, 2));
  if (fehlgeschlagen.length) process.exitCode = 1;

  if (!opt.schreiben) {
    console.log("\nVorschau — nichts geschrieben. Mit --schreiben eintragen.");
    return;
  }
  const geschrieben = await schreibeLogos(root, data, ergebnisse, logos, new Date());
  for (const f of geschrieben.fehler) console.error(`- ${f}`);
  if (!geschrieben.ok) {
    console.error("Validierung fehlgeschlagen.");
    process.exitCode = 1;
  } else {
    console.log(`\nGeschrieben: ${geschrieben.anzahl} Logo(s). Validator: gueltig.`);
  }
}

// PNGs ablegen, logos.json schreiben, im agent_log.jsonl protokollieren,
// danach validieren. Vorher wird die neue Logo-Liste gegen den Validator
// geprueft; scheitert das, wird nichts geschrieben.
export async function schreibeLogos(root, data, ergebnisse, logos, jetzt) {
  const ok = ergebnisse.filter((e) => e.abruf.ok);
  if (ok.length === 0) return { ok: true, anzahl: 0, fehler: [] };
  const vorab = validateMasterData({ ...data, logos }).errors.filter((f) => f.startsWith("logos"));
  if (vorab.length) return { ok: false, anzahl: 0, fehler: vorab.slice(0, 20) };

  await mkdir(new URL("logos/", root), { recursive: true });
  for (const { eintrag, abruf } of ok) {
    await ersetzeDatei(new URL(eintrag.datei, root), abruf.png);
  }
  await ersetzeDatei(new URL("logos.json", root), `${JSON.stringify(logos, null, 2)}\n`);
  await haengeAn(new URL("agent_log.jsonl", root), `${JSON.stringify({
    zeitpunkt: jetzt.toISOString(),
    anlass: "logos",
    notiz: `${ok.length} Logo(s) eingetragen`,
    quellen: ok.map((e) => e.abruf.quelle),
    betroffene_ids: ok.map((e) => e.eintrag.logo_id),
    neu: ok.filter((e) => e.aktion === "neu").map((e) => e.eintrag.logo_id),
    domains: ok.map((e) => e.eintrag.domain),
    aus_datei: ok.filter((e) => e.bilddatei).map((e) => e.eintrag.domain),
    fehlgeschlagen: ergebnisse.filter((e) => !e.abruf.ok).map((e) => e.eintrag.domain),
  })}\n`);

  // Nur neue Fehler zaehlen (wie mitRollback); alte stehen schon im Bestand.
  const neu = neueFehler(validateMasterData(data).errors, validateMasterData(await loadMasterData(root)).errors);
  return { ok: neu.length === 0, anzahl: ok.length, fehler: neu.slice(0, 20) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
