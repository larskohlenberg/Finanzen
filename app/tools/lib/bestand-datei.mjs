// @ts-check
// app/tools/lib/bestand-datei.mjs
// Lesen und Schreiben der Bestandsdateien fuer die schmalen Schreibwerkzeuge
// (regel_schreiben, stammdatum_setzen, zeitwert_anhaengen, protokoll_eintrag,
// transfer_extern): JSON-Listen mit einem Eintrag je Zeile wie von Hand
// gepflegt, JSONL mit einer Zeile je Eintrag, Protokoll als angehaengte Zeile.
import { readFile } from "node:fs/promises";
import { ersetzeDatei, haengeAn } from "./datei.mjs";

/** @param {URL} url @param {unknown[]} [fallback] @returns {Promise<any[]>} */
export async function liesJsonListe(url, fallback) {
  try {
    return JSON.parse(await readFile(url, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && fallback) return fallback;
    throw error;
  }
}

/** @param {URL} url @returns {Promise<any[]>} */
export async function liesJsonl(url) {
  let text = "";
  try {
    text = await readFile(url, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return text.split(/\r?\n/).filter((z) => z.trim()).map((z) => JSON.parse(z));
}

/** @param {unknown[]} liste */
export function alsJsonListe(liste) {
  return liste.length ? `[\n${liste.map((e) => `  ${JSON.stringify(e)}`).join(",\n")}\n]\n` : "[]\n";
}

/** @param {URL} url @param {unknown[]} liste */
export async function schreibeJsonListe(url, liste) {
  await ersetzeDatei(url, alsJsonListe(liste));
}

/** @param {URL} url @param {unknown[]} liste */
export async function schreibeJsonl(url, liste) {
  await ersetzeDatei(url, liste.map((e) => JSON.stringify(e)).join("\n") + (liste.length ? "\n" : ""));
}

/** @param {URL} root Datenroot @param {Record<string, unknown>} eintrag */
export async function protokolliere(root, eintrag) {
  await haengeAn(new URL("agent_log.jsonl", root), `${JSON.stringify(eintrag)}\n`);
}

// Was aus einer Inbox-Datei wurde, als Importauftrag anhaengen (Importbericht
// der Oberflaeche); vergibt die naechste IMP-Id. auftrag ohne auftrag_id.
/** @param {URL} root Datenroot @param {Record<string, unknown>} auftrag */
export async function haengeImportauftragAn(root, auftrag) {
  const url = new URL("importauftraege.jsonl", root);
  const bisher = await liesJsonl(url);
  const eintrag = { auftrag_id: naechsteId(bisher, "auftrag_id", "IMP"), ...auftrag };
  await schreibeJsonl(url, [...bisher, eintrag]);
  return eintrag;
}

// Naechste laufende Nummer einer ID-Klasse (PRAEFIX-NNN, mindestens drei Stellen).
/** @param {Record<string, any>[]} liste @param {string} feld @param {string} praefix */
export function naechsteId(liste, feld, praefix) {
  const muster = new RegExp(`^${praefix}-(\\d+)$`);
  const max = liste.reduce((m, e) => Math.max(m, Number(muster.exec(e?.[feld] ?? "")?.[1] ?? 0)), 0);
  return `${praefix}-${String(max + 1).padStart(3, "0")}`;
}

/** @param {string[]} argv @param {string} name */
export function argWert(argv, name) {
  const a = argv.find((x) => x.startsWith(`--${name}=`));
  return a === undefined ? undefined : a.slice(name.length + 3);
}

/** @param {string[]} argv @param {string} name */
export function argJson(argv, name) {
  const wert = argWert(argv, name);
  if (wert === undefined) return undefined;
  try {
    return JSON.parse(wert);
  } catch (error) {
    throw new Error(`--${name}: kein gueltiges JSON (${error.message})`);
  }
}
