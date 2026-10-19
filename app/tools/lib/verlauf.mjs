// app/tools/lib/verlauf.mjs
// Verlauf und Vergleich von Generationen (ADR 0035, E1 Schritt 6): welche
// Dateien sich zwischen zwei Generationen unterscheiden und je Datei, wie viele
// Datensaetze neu, geaendert oder entfernt sind (bei Datensaetzen mit *_id auch
// welche). Nur lesend; alle Generationen werden ueber eine Lease gelesen, damit
// das Aufraeumen sie waehrenddessen nicht entfernt.
import path from "node:path";
import { aktuelleId, bestandsArt, liesEinstellungen, oeffneGeneration, OhneVerlauf, ORDNER, veroeffentlichteIds } from "./generationen.mjs";

export { OhneVerlauf };

// Bis zu so vielen IDs je Art nennt der Text; das Ergebnis enthaelt alle.
const IDS_IM_TEXT = 10;

const idFeld = (satz) => (satz && typeof satz === "object" && !Array.isArray(satz) ? Object.keys(satz).find((k) => k.endsWith("_id") && typeof satz[k] === "string") : undefined);

// Datensaetze einer Datei: Array-JSON oder JSON-Zeilen. Andere Formen (Objekt,
// Text, PDF, kaputtes JSON) haben keine Datensaetze -> null.
function datensaetze(rel, inhalt) {
  if (inhalt === null) return [];
  try {
    if (rel.endsWith(".jsonl")) return inhalt.split("\n").filter((z) => z.trim()).map((z) => JSON.parse(z));
    const wert = JSON.parse(inhalt);
    return Array.isArray(wert) ? wert : null;
  } catch {
    return null;
  }
}

// Datensaetze mit Id werden ueber die Id verglichen (geaendert = anderer
// Inhalt), alle anderen als Ganzes (neu/entfernt, als Mehrfachmenge).
export function vergleicheDatensaetze(alt, neu) {
  const zerlege = (liste) => {
    const nachId = new Map();
    const rest = new Map();
    for (const satz of liste) {
      const feld = idFeld(satz);
      if (feld && !nachId.has(satz[feld])) nachId.set(satz[feld], JSON.stringify(satz));
      else {
        const text = JSON.stringify(satz);
        rest.set(text, (rest.get(text) ?? 0) + 1);
      }
    }
    return { nachId, rest };
  };
  const a = zerlege(alt);
  const n = zerlege(neu);
  const ids = { neu: [], geaendert: [], entfernt: [] };
  for (const [id, text] of n.nachId) {
    if (!a.nachId.has(id)) ids.neu.push(id);
    else if (a.nachId.get(id) !== text) ids.geaendert.push(id);
  }
  for (const id of a.nachId.keys()) if (!n.nachId.has(id)) ids.entfernt.push(id);
  let restNeu = 0;
  let restEntfernt = 0;
  for (const [text, zahl] of n.rest) restNeu += Math.max(0, zahl - (a.rest.get(text) ?? 0));
  for (const [text, zahl] of a.rest) restEntfernt += Math.max(0, zahl - (n.rest.get(text) ?? 0));
  return { neu: ids.neu.length + restNeu, geaendert: ids.geaendert.length, entfernt: ids.entfernt.length + restEntfernt, ids };
}

// Unterschiede zwischen zwei geoeffneten Generationen (Leser aus
// oeffneGeneration). Liefert [{ datei, art: neu|entfernt|geaendert,
// datensaetze? }] nach Dateiname sortiert. Unveraenderte Dateien erkennt das
// Manifest (SHA-256), ohne sie zu lesen.
export async function vergleicheLeser(von, nach) {
  const [mVon, mNach] = await Promise.all([von.manifest(), nach.manifest()]);
  const alle = [...new Set([...Object.keys(mVon.dateien), ...Object.keys(mNach.dateien)])].sort();
  const dateien = [];
  for (const rel of alle) {
    const alt = mVon.dateien[rel];
    const neu = mNach.dateien[rel];
    if (alt?.sha256 === neu?.sha256) continue;
    const eintrag = { datei: rel, art: !alt ? "neu" : !neu ? "entfernt" : "geaendert" };
    if (/\.jsonl?$/.test(rel)) {
      const vorher = datensaetze(rel, alt ? await von.lies(rel) : null);
      const nachher = datensaetze(rel, neu ? await nach.lies(rel) : null);
      if (vorher && nachher) eintrag.datensaetze = vergleicheDatensaetze(vorher, nachher);
    }
    dateien.push(eintrag);
  }
  return dateien;
}

// Oeffnet die Generationen ids (fehlende, gerade weggeraeumte fehlen in der Map).
async function mitGenerationen(basis, ids, fn) {
  const leser = new Map();
  try {
    for (const id of ids) {
      const l = await oeffneGeneration(basis, id).catch(() => null);
      if (l) leser.set(id, l);
    }
    return await fn(leser);
  } finally {
    for (const l of leser.values()) await l.schliessen();
  }
}

async function nurGenerationen(basis) {
  if ((await bestandsArt(basis)) === ORDNER) throw new OhneVerlauf(basis);
}

// Vergleich zweier Generationen per Id.
export async function vergleicheGenerationen(basis, vonId, nachId) {
  await nurGenerationen(basis);
  return mitGenerationen(basis, [vonId, nachId], async (leser) => {
    for (const id of [vonId, nachId]) if (!leser.has(id)) throw new Error(`Generation ${id} gibt es nicht (mehr)`);
    return vergleicheLeser(leser.get(vonId), leser.get(nachId));
  });
}

// Die letzten `anzahl` Generationen, neueste zuerst: Id, Zeit, ausloesendes
// Werkzeug, Quelle (bei rueckgaengig die wiederhergestellte Generation) und
// die Aenderungen gegenueber der vorherigen aufbewahrten Generation.
export async function liesVerlauf(basis, { anzahl = 10 } = {}) {
  await nurGenerationen(basis);
  if (!Number.isInteger(anzahl) || anzahl < 1) throw new Error(`anzahl muss eine ganze Zahl >= 1 sein: ${anzahl}`);
  const aktuell = await aktuelleId(basis);
  const alle = (await veroeffentlichteIds(basis)).filter((id) => Number(id) <= Number(aktuell));
  const gezeigt = alle.slice(-anzahl);
  const { behalten } = await liesEinstellungen(basis);
  const eintraege = await mitGenerationen(basis, alle.slice(-(anzahl + 1)), async (leser) => {
    const liste = [];
    for (const id of gezeigt) {
      const l = leser.get(id);
      if (!l) continue;
      const m = await l.manifest();
      const vorgaengerId = alle[alle.indexOf(id) - 1];
      const vorgaenger = vorgaengerId ? leser.get(vorgaengerId) : null;
      liste.push({
        id,
        aktuell: id === aktuell,
        zeit: m.zeit ?? null,
        wer: m.wer ?? null,
        quelle: m.quelle ?? null,
        vorgaenger: vorgaenger ? vorgaengerId : null,
        // Wiederherstellung: Quelle ist nicht der direkte Vorgaenger.
        wiederherstellung: Boolean(m.quelle && vorgaengerId && m.quelle !== vorgaengerId),
        aenderungen: vorgaenger ? await vergleicheLeser(vorgaenger, l) : null,
      });
    }
    return liste.reverse();
  });
  return { aktuell, behalten, aufbewahrt: alle.length, eintraege };
}

// ---------------------------------------------------------------- Text

function idListe(ids) {
  const gezeigt = ids.slice(0, IDS_IM_TEXT).join(", ");
  return ids.length > IDS_IM_TEXT ? `${gezeigt} und ${ids.length - IDS_IM_TEXT} weitere` : gezeigt;
}

const zahlenText = (d) => [d.neu && `${d.neu} neu`, d.geaendert && `${d.geaendert} geaendert`, d.entfernt && `${d.entfernt} entfernt`].filter(Boolean).join(", ");

// Eine Zeile je Datei, darunter die IDs (je Art hoechstens IDS_IM_TEXT).
export function aenderungsText(aenderungen, { einzug = "  " } = {}) {
  if (!aenderungen.length) return [`${einzug}keine Unterschiede`];
  const zeilen = [];
  for (const a of aenderungen) {
    const d = a.datensaetze;
    const teile = [];
    if (a.art !== "geaendert") teile.push(`Datei ${a.art}`);
    if (d) teile.push(zahlenText(d) || "nur Reihenfolge/Format");
    else if (a.art === "geaendert") teile.push("Inhalt geaendert");
    zeilen.push(`${einzug}${a.datei}: ${teile.join("; ")}`);
    if (d) for (const [art, ids] of Object.entries(d.ids)) if (ids.length) zeilen.push(`${einzug}  ${art}: ${idListe(ids)}`);
  }
  return zeilen;
}

// Kurzfassung einer Generation in einer Zeile.
export function kurzfassung(eintrag) {
  if (!eintrag.aenderungen) return "aeltester aufbewahrter Stand, kein Vergleich";
  if (!eintrag.aenderungen.length) return "keine Unterschiede";
  return eintrag.aenderungen.map((a) => {
    const d = a.datensaetze;
    const zahlen = d ? [d.neu && `+${d.neu}`, d.geaendert && `~${d.geaendert}`, d.entfernt && `-${d.entfernt}`].filter(Boolean).join(" ") : a.art;
    return zahlen ? `${a.datei} (${zahlen})` : a.datei;
  }).join(", ");
}

const zeitText = (iso) => (iso ? `${iso.replace("T", " ").slice(0, 19)} UTC` : "Zeit unbekannt");

export function verlaufText(verlauf, datenroot) {
  const zeilen = [
    `Verlauf ${path.basename(String(datenroot))}: aktuell G${verlauf.aktuell}, ${verlauf.aufbewahrt} Generation(en) aufbewahrt (behalten: ${verlauf.behalten} fruehere)`,
    "Kurzfassung je Generation gegenueber der vorherigen: Datei (+neu ~geaendert -entfernt Datensaetze)",
  ];
  for (const e of verlauf.eintraege) {
    const quelle = e.wiederherstellung ? `, stellt G${e.quelle} wieder her` : "";
    zeilen.push(`G${e.id}${e.aktuell ? " (aktuell)" : ""}  ${zeitText(e.zeit)}  ${e.wer ?? "Werkzeug unbekannt"}${quelle}`);
    zeilen.push(`  ${kurzfassung(e)}`);
  }
  return zeilen.join("\n");
}
