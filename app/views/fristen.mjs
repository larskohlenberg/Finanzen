// app/views/fristen.mjs
// Fristenliste (Reiter der Seite Termine) und die Bausteine, die auch die
// Termine-Kachel der Uebersicht nutzt: Bezug als Link, Dringlichkeit als Chip.
import { data, t, escapeHtml } from "../runtime.mjs";
import { formatDate } from "../komponenten.mjs";
import { anstehendeFristen } from "../fristen.mjs";
import { formatRhythmus } from "./regelzahlungen.mjs";
import { tf } from "./vermoegen-teile.mjs";

// Weit genug, dass jede erfasste Frist ihren naechsten Termin zeigt und
// abgeleitete Termine wie ein Rentenbeginn in vielen Jahren mit drin sind.
const HORIZONT_MONATE = 600;

const link = (ziel, text) => `<button class="linkish" ${ziel}>${escapeHtml(text)}</button>`;

export const tageBis = (von, bis) => Math.round((Date.parse(`${bis}T00:00:00Z`) - Date.parse(`${von}T00:00:00Z`)) / 86400000);

export const fristKlasse = (f) => (f.ueberfaellig ? "ueberfaellig" : f.bald ? "bald" : "");

// Chip "überfällig" oder "in n Tagen"; leer, wenn der Termin nicht drängt.
export function fristChip(f, today) {
  if (f.ueberfaellig) return `<span class="chip danger">${escapeHtml(t("overview.fristUeberfaellig"))}</span>`;
  if (f.bald) return `<span class="chip review">${escapeHtml(tf("overview.fristInTagen", { n: tageBis(today, f.datum) }))}</span>`;
  return "";
}

// Bezug einer Frist: Name des Objekts und Ziel des Klicks.
const BEZUG = {
  vorsorge: { liste: "vorsorge", name: "name", ziel: (id) => `data-action="open-vorsorge" data-vorsorge="${escapeHtml(id)}"` },
  darlehen: { liste: "darlehen", name: "bezeichnung" },
  immobilie: { liste: "immobilien", name: "bezeichnung" },
  vermoegenswert: { liste: "vermoegenswerte", name: "bezeichnung" },
  konto: { liste: "konten", name: "name" },
  regelzahlung: { liste: "regelzahlungen", name: "bezeichnung", ziel: (id) => `data-action="open-regelzahlung" data-regelzahlung="${escapeHtml(id)}"` },
};

export function bezugLink(bezug) {
  const b = bezug && BEZUG[bezug.typ];
  if (!b) return "";
  const objekt = (data[b.liste] ?? []).find((o) => o[`${bezug.typ}_id`] === bezug.id);
  const ziel = b.ziel ? b.ziel(bezug.id) : `data-action="select-vermoegen-objekt" data-vermoegen="${escapeHtml(`${bezug.typ}:${bezug.id}`)}"`;
  // Name aus dem Bestand oder, aus der Uebersicht-API, am Bezug selbst.
  return link(ziel, objekt?.[b.name] ?? bezug.name ?? bezug.id);
}

const leer = `<span class="muted">—</span>`;

// Je erfasster Frist der naechste offene Termin (auch ein ueberfaelliger).
function naechsteTermine(termine) {
  const je = new Map();
  for (const termin of termine) if (termin.frist_id && !je.has(termin.frist_id)) je.set(termin.frist_id, termin);
  return je;
}

export function fristenZaehler(today) {
  const termine = anstehendeFristen(data, today, HORIZONT_MONATE).filter((f) => !f.abgeleitet);
  return {
    anzahl: (data.fristen ?? []).length,
    ueberfaellig: termine.filter((f) => f.ueberfaellig).length,
    bald: termine.filter((f) => f.bald).length,
  };
}

function renderErfasste(termine, today) {
  const naechste = naechsteTermine(termine);
  // Offene zuerst nach Datum, erledigte ans Ende.
  const fristen = [...(data.fristen ?? [])].sort((a, b) => {
    const da = naechste.get(a.frist_id)?.datum ?? "9999";
    const db = naechste.get(b.frist_id)?.datum ?? "9999";
    return da.localeCompare(db) || a.frist_id.localeCompare(b.frist_id);
  });
  if (!fristen.length) return `<p class="muted">${escapeHtml(t("termine.fristenLeer"))}</p>`;
  const zeilen = fristen.map((frist) => {
    const termin = naechste.get(frist.frist_id);
    const typ = Object.keys(BEZUG).find((k) => frist[`${k}_id`]);
    const bezug = typ ? { typ, id: frist[`${typ}_id`] } : null;
    const naechsterTermin = termin
      ? `${escapeHtml(formatDate(termin.datum))} ${fristChip(termin, today)}`
      : `<span class="chip success">${escapeHtml(t("termine.erledigt"))}</span>`;
    return `
    <tr id="frist-${escapeHtml(frist.frist_id)}" class="${termin ? fristKlasse(termin) : ""}">
      <td class="id-zelle">${escapeHtml(frist.frist_id)}</td>
      <td>${escapeHtml(frist.bezeichnung)}${frist.bemerkung ? `<div class="muted">${escapeHtml(frist.bemerkung)}</div>` : ""}</td>
      <td>${escapeHtml(t(`termine.fristArt.${frist.art}`))}</td>
      <td>${bezug ? bezugLink(bezug) : leer}</td>
      <td>${frist.rhythmus_einheit ? escapeHtml(formatRhythmus(frist.rhythmus_einheit, frist.rhythmus_intervall)) : escapeHtml(t("termine.einmalig"))}</td>
      <td>${naechsterTermin}</td>
      <td>${frist.erledigt_bis ? escapeHtml(formatDate(frist.erledigt_bis)) : leer}</td>
    </tr>`;
  }).join("");
  return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${escapeHtml(t("labels.id"))}</th>
              <th>${escapeHtml(t("regelzahlungen.bezeichnung"))}</th>
              <th>${escapeHtml(t("termine.art"))}</th>
              <th>${escapeHtml(t("termine.bezug"))}</th>
              <th>${escapeHtml(t("regelzahlungen.rhythmus"))}</th>
              <th>${escapeHtml(t("termine.naechsterTermin"))}</th>
              <th>${escapeHtml(t("termine.erledigtBis"))}</th>
            </tr>
          </thead>
          <tbody>${zeilen}</tbody>
        </table>
      </div>`;
}

function renderAbgeleitete(termine, today) {
  const abgeleitet = termine.filter((f) => f.abgeleitet);
  if (!abgeleitet.length) return `<p class="muted">${escapeHtml(t("termine.abgeleitetLeer"))}</p>`;
  const zeilen = abgeleitet.map((f) => `
    <tr class="${fristKlasse(f)}">
      <td>${escapeHtml(formatDate(f.datum))} ${fristChip(f, today)}</td>
      <td>${escapeHtml(f.bezeichnung)}</td>
      <td>${f.bezug ? bezugLink(f.bezug) : leer}</td>
    </tr>`).join("");
  return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${escapeHtml(t("labels.date"))}</th>
              <th>${escapeHtml(t("regelzahlungen.bezeichnung"))}</th>
              <th>${escapeHtml(t("termine.bezug"))}</th>
            </tr>
          </thead>
          <tbody>${zeilen}</tbody>
        </table>
      </div>`;
}

export function renderFristen(today) {
  const termine = anstehendeFristen(data, today, HORIZONT_MONATE);
  return `
    <section class="panel panel-pad section-spacing" aria-labelledby="fristen-erfasst">
      <h2 id="fristen-erfasst">${escapeHtml(t("termine.erfasst"))}</h2>
      <p class="muted">${escapeHtml(t("termine.erfasstLead"))}</p>
      ${renderErfasste(termine, today)}
    </section>
    <section class="panel panel-pad section-spacing" aria-labelledby="fristen-abgeleitet">
      <h2 id="fristen-abgeleitet">${escapeHtml(t("termine.abgeleitet"))}</h2>
      <p class="muted">${escapeHtml(t("termine.abgeleitetLead"))}</p>
      ${renderAbgeleitete(termine, today)}
    </section>`;
}
