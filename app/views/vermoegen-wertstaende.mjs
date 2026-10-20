// app/views/vermoegen-wertstaende.mjs
// Alle Wertstaende (zeitwerte) als filter- und sortierbare Tabelle auf dem
// Uebersichts-Tab der Vermoegensseite. Filter und Sortierung wie bei Vorsorge.
import { data, state, t, escapeHtml, cents, kontenById } from "../runtime.mjs";
import { formatMoney, formatDate, renderTableFilters, klappKachel } from "../komponenten.mjs";
import { matchesQuery } from "../tools/lib/text.mjs";
import { qualitaetChip } from "./vermoegen-teile.mjs";

const KLASSEN = ["konto", "immobilie", "darlehen", "vermoegenswert", "vorsorge"];
const LEER_FILTER = { search: "", klasse: "", qualitaet: "" };

export function setWertstaendeFilter(name, value) {
  if (Object.hasOwn(state.wertstaendeFilters, name)) state.wertstaendeFilters[name] = value;
}

export function resetWertstaendeFilters() {
  state.wertstaendeFilters = { ...LEER_FILTER };
}

export function toggleWertstaendeSort(key) {
  state.wertstaendeSort = state.wertstaendeSort.key === key
    ? { key, dir: state.wertstaendeSort.dir === "asc" ? "desc" : "asc" }
    : { key, dir: key === "stand" || key === "wert" ? "desc" : "asc" };
}

function entityLabel(entitaet, entitaetId) {
  if (entitaet === "konto") return kontenById.get(entitaetId)?.name || entitaetId;
  if (entitaet === "immobilie") return data.immobilien?.find((i) => i.immobilie_id === entitaetId)?.bezeichnung || entitaetId;
  if (entitaet === "vermoegenswert") return data.vermoegenswerte?.find((v) => v.vermoegenswert_id === entitaetId)?.bezeichnung || entitaetId;
  if (entitaet === "darlehen") return data.darlehen?.find((d) => d.darlehen_id === entitaetId)?.bezeichnung || entitaetId;
  if (entitaet === "vorsorge") return data.vorsorge?.find((v) => v.vorsorge_id === entitaetId)?.name || entitaetId;
  return entitaetId;
}

function feldLabel(feld) {
  const key = `vermoegen.feld.${feld}`;
  return t(key) === key ? feld : t(key);
}

function zeilen() {
  return (data.zeitwerte ?? []).map((zw) => ({
    zw,
    position: entityLabel(zw.entitaet, zw.entitaet_id),
    klasse: t(`vermoegen.klasse.${zw.entitaet}`),
    feld: feldLabel(zw.feld),
    wert: cents(zw.wert),
  }));
}

function sortiert(liste) {
  const { key, dir } = state.wertstaendeSort;
  const faktor = dir === "asc" ? 1 : -1;
  const locale = state.lang === "de" ? "de" : "en";
  const wert = (z) => {
    if (key === "stand") return z.zw.standdatum;
    if (key === "wert") return z.wert;
    if (key === "qualitaet") return z.zw.qualitaet;
    return z[key] ?? "";
  };
  return liste.slice().sort((a, b) => {
    const av = wert(a);
    const bv = wert(b);
    const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv), locale);
    if (cmp !== 0) return cmp * faktor;
    return b.zw.standdatum.localeCompare(a.zw.standdatum) || a.position.localeCompare(b.position, locale);
  });
}

function wertstaendeZeilen() {
  const f = state.wertstaendeFilters;
  return sortiert(zeilen().filter((z) => {
    if (f.klasse && z.zw.entitaet !== f.klasse) return false;
    if (f.qualitaet && z.zw.qualitaet !== f.qualitaet) return false;
    return matchesQuery([z.position, z.zw.entitaet_id, z.klasse, z.feld, z.zw.quelle_hinweis], f.search);
  }));
}

function sortKopf(key, label, amount = false) {
  const { key: aktiv, dir } = state.wertstaendeSort;
  const pfeil = aktiv === key ? (dir === "asc" ? " ▲" : " ▼") : "";
  const aria = aktiv === key ? ` aria-sort="${dir === "asc" ? "ascending" : "descending"}"` : "";
  return `<th${amount ? ' class="amount"' : ""}${aria}><button class="linkish sort-th" data-wertstaende-sort="${escapeHtml(key)}">${escapeHtml(label)}${escapeHtml(pfeil)}</button></th>`;
}

export function renderWertstaendeTabelle() {
  const rows = wertstaendeZeilen();
  const filter = renderTableFilters({
    searchFields: [{ name: "search", label: t("vorsorge.filterSearch"), type: "search", placeholder: t("vermoegen.wertstaendeSuche") }],
    fields: [
      { name: "klasse", label: t("vermoegen.filterKlasse"), options: [["", t("vermoegen.filterAll")], ...KLASSEN.map((k) => [k, t(`vermoegen.klasse.${k}`)])] },
      { name: "qualitaet", label: t("vermoegen.filterQualitaet"), options: [["", t("vermoegen.filterAll")], ["belegt", t("vermoegen.qualityBelegt")], ["geschaetzt", t("vermoegen.qualityGeschaetzt")]] },
    ],
    filters: state.wertstaendeFilters,
    filterAttr: "wertstaende-filter",
    clearAction: "clear-wertstaende-filter",
    resetAction: "reset-wertstaende-filters",
    resultCount: rows.length,
    totalCount: (data.zeitwerte ?? []).length,
  });
  const body = rows.map((z) => `
    <tr>
      <td><strong>${escapeHtml(z.position)}</strong><br><span class="muted">${escapeHtml(z.zw.entitaet_id)}</span></td>
      <td>${escapeHtml(z.klasse)}</td>
      <td>${escapeHtml(z.feld)}</td>
      <td>${escapeHtml(formatDate(z.zw.standdatum))}</td>
      <td class="amount">${escapeHtml(formatMoney(z.wert))}</td>
      <td>${qualitaetChip({ qualitaet: z.zw.qualitaet })}</td>
    </tr>`).join("");
  const leer = (data.zeitwerte ?? []).length ? t("vermoegen.keineWertstaendeTreffer") : t("vermoegen.noWertstaende");
  // Klappkachel wie alle grossen Abschnitte, per Standard zu (docs/ui-regeln.md).
  return klappKachel({ id: "vermoegen.wertstaende", titel: t("vermoegen.wertstaende"), offen: false, klasse: "section-spacing", htmlId: "vermoegen-wertstaende", inhalt: `
      <p class="muted">${escapeHtml(t("vermoegen.wertstaendeLead"))}</p>
      ${filter}
      ${rows.length ? `
        <div class="table-wrap wertstaende-table">
          <table>
            <thead><tr>
              ${sortKopf("position", t("vermoegen.position"))}
              ${sortKopf("klasse", t("vermoegen.klasseHead"))}
              ${sortKopf("feld", t("vermoegen.feldHead"))}
              ${sortKopf("stand", t("vermoegen.stand"))}
              ${sortKopf("wert", t("vermoegen.wert"), true)}
              ${sortKopf("qualitaet", t("vermoegen.qualitaetHead"))}
            </tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>` : `<p class="muted">${escapeHtml(leer)}</p>`}` });
}
