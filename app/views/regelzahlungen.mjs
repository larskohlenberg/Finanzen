// app/views/regelzahlungen.mjs
// Regelzahlungs-Liste (Reiter der Seite Termine): naechste Faelligkeit, letzte
// Buchung, ueberfaellig; sortier- und filterbar (Modell: termine-modell.mjs).
import { data, state, t, tf, escapeHtml } from "../runtime.mjs";
import { iconSvg } from "../icons.js";
import { formatMoney, formatDate, mitLogo } from "../komponenten.mjs";
import { toCents } from "../liquiditaet.mjs";
import { heuteIso } from "../selektoren.mjs";
import { erstelleApiCache } from "../api-daten.mjs";
import { regelzahlungZeilen, UEBERFAELLIG_TOLERANZ_TAGE, ZEIGEN } from "../termine-modell.mjs";

export function formatRhythmus(einheit, intervall) {
  const key = intervall === 1 ? "eins" : "mehr";
  return tf(`rhythmus.${einheit}.${key}`, { n: String(intervall) });
}

// Buchungen je Regelzahlung (Anzahl, letzte) rechnet der Server als Gruppen
// der Buchungsliste; die Liste selbst kommt aus den Stammdaten.
const cache = erstelleApiCache({ maxEintraege: 2 });
function buchungenJeRegelzahlung() {
  const suche = new URLSearchParams();
  if (state.dataMode === "demo") suche.set("quelle", "demo");
  suche.set("gruppe", "regelzahlung");
  suche.set("groesse", "10");
  return cache.hole(`./api/v1/transaktionen?${suche}`);
}

function sortKopf(key, label, { amount = false } = {}) {
  const sort = state.regelzahlungSort;
  const aktiv = sort.key === key;
  const richtung = aktiv ? (sort.dir === "asc" ? "ascending" : "descending") : "none";
  return `<th${amount ? ' class="amount"' : ""} aria-sort="${richtung}"><button class="linkish sort-th" data-action="rz-sort" data-sort="${key}">${escapeHtml(label)}${aktiv ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}</button></th>`;
}

function statusZelle(z) {
  if (z.ueberfaellig) {
    const titel = tf("regelzahlungen.ueberfaelligHinweis", { datum: formatDate(z.erwartet), tage: UEBERFAELLIG_TOLERANZ_TAGE, stand: formatDate(z.importstand) });
    return `<span class="chip danger" title="${escapeHtml(titel)}">${iconSvg("warning")}${escapeHtml(t("regelzahlungen.ueberfaellig"))}</span>`;
  }
  if (z.beendet) return `<span class="chip neutral">${escapeHtml(t("regelzahlungen.beendet"))}</span>`;
  // Laufend: nur das Symbol, der Status steht im Tooltip; das Enddatum zeigt die Spalte Gueltig.
  const bestaetigt = z.rz.status === "bestaetigt";
  const label = escapeHtml(t(`status.${z.rz.status}`));
  return `<span class="chip ${bestaetigt ? "success" : "neutral"} status-marke" title="${label}" aria-label="${label}">${iconSvg(bestaetigt ? "success" : "neutral")}</span>`;
}

// Gueltigkeit im Monatsraster, kurz als "1/2027": von der ersten Faelligkeit bis
// aktiv_bis. Bei wenig Platz bricht die Zeile zwischen den Monaten um.
const kurzMonat = (iso) => `${Number(iso.slice(5, 7))}/${iso.slice(0, 4)}`;
function gueltigZelle(rz) {
  const von = kurzMonat(rz.anker_datum);
  return escapeHtml(rz.aktiv_bis ? tf("regelzahlungen.gueltigVonBis", { von, bis: kurzMonat(rz.aktiv_bis) }) : tf("regelzahlungen.gueltigAb", { von }));
}

export function renderRegelzahlungen() {
  const today = heuteIso();
  const kontoName = (id) => data.konten.find((k) => k.konto_id === id)?.name ?? id;
  const { antwort } = buchungenJeRegelzahlung();
  const zeilen = regelzahlungZeilen(data.regelzahlungen, antwort ? antwort.gruppen ?? [] : null, today, { zeigen: state.regelzahlungZeigen, sort: state.regelzahlungSort, immer: state.selectedRegelzahlungId, importstand: antwort?.importstand ?? null });
  const rows = zeilen.map((z) => {
    const rz = z.rz;
    const angesteuert = rz.regelzahlung_id === state.selectedRegelzahlungId;
    const buchungenRoute = `#/transaktionen?regelzahlung=${encodeURIComponent(rz.regelzahlung_id)}`;
    const letzte = !antwort ? `<span class="muted">…</span>`
      : z.letzte ? `<a class="linkish" href="${escapeHtml(buchungenRoute)}" data-action="regelzahlung-buchungen" data-regelzahlung="${escapeHtml(rz.regelzahlung_id)}">${escapeHtml(formatDate(z.letzte))}</a> <span class="muted">· ${escapeHtml(tf("regelzahlungen.buchungen", { n: z.anzahl }))}</span>`
        : `<span class="muted">${escapeHtml(t("regelzahlungen.keineBuchung"))}</span>`;
    return `
    <tr id="regelzahlung-${escapeHtml(rz.regelzahlung_id)}" class="${[angesteuert && "angesteuert", z.ueberfaellig && "ueberfaellig"].filter(Boolean).join(" ")}"${angesteuert ? ` aria-current="true"` : ""}>
      <td>${mitLogo({ regelzahlung: rz }, `${escapeHtml(rz.bezeichnung)}<div class="id-zeile muted">${escapeHtml(rz.regelzahlung_id)}</div>`, { groesse: "tabelle" })}</td>
      <td class="amount">${escapeHtml(formatMoney(toCents(rz.betrag)))}</td>
      <td>${escapeHtml(formatRhythmus(rz.rhythmus_einheit, rz.rhythmus_intervall))}</td>
      <td>${gueltigZelle(rz)}</td>
      <td>${rz.konto_id ? escapeHtml(kontoName(rz.konto_id)) : `<span class="muted">—</span>`}</td>
      <td>${z.naechste ? escapeHtml(formatDate(z.naechste)) : `<span class="muted">—</span>`}</td>
      <td>${letzte}</td>
      <td>${statusZelle(z)}</td>
    </tr>
  `;
  }).join("");
  const zeigen = `
    <div class="rz-auswahl" role="group" aria-label="${escapeHtml(t("regelzahlungen.zeigen"))}">
      <span class="muted">${escapeHtml(t("regelzahlungen.zeigen"))}:</span>
      ${ZEIGEN.map((z) => `<button class="chip ${state.regelzahlungZeigen === z ? "success" : "neutral"} linkish" data-action="rz-zeigen" data-zeigen="${z}" aria-pressed="${state.regelzahlungZeigen === z}">${escapeHtml(t(`regelzahlungen.zeigenOption.${z}`))}</button>`).join("")}
    </div>`;
  return `
    <section class="panel panel-pad section-spacing">
      <p class="muted">${escapeHtml(t("regelzahlungen.lead"))}</p>
      ${data.regelzahlungen.length ? `
      ${zeigen}
      ${zeilen.length ? `
      <div class="table-wrap">
        <table class="rz-tabelle">
          <thead>
            <tr>
              ${sortKopf("bezeichnung", t("regelzahlungen.bezeichnung"))}
              ${sortKopf("betrag", t("labels.amount"), { amount: true })}
              <th>${escapeHtml(t("regelzahlungen.rhythmus"))}</th>
              <th>${escapeHtml(t("regelzahlungen.gueltig"))}</th>
              <th>${escapeHtml(t("regelzahlungen.konto"))}</th>
              ${sortKopf("naechste", t("regelzahlungen.naechsteFaelligkeit"))}
              ${sortKopf("letzte", t("regelzahlungen.letzteBuchung"))}
              <th>${escapeHtml(t("labels.status"))}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>` : `<p class="muted">${escapeHtml(t("regelzahlungen.leerGefiltert"))}</p>`}` : `<p class="muted">${escapeHtml(t("regelzahlungen.empty"))}</p>`}
    </section>
  `;
}
