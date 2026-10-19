// app/views/vermoegen-teile.mjs
// Gemeinsame Bausteine der Vermoegensseite (Tabs in vermoegen.mjs und
// vermoegen-objekte.mjs): Qualitaets-Chips, Wertstaende eines Objekts,
// Kennzahl-Kacheln, Dokumentliste, Rhythmus/Laufzeit-Texte.
import { data, t, tf, fmt, escapeHtml, cents } from "../runtime.mjs";
import { zielRoute } from "../routing.mjs";
import { iconSvg } from "../icons.js";
import { formatMoney, formatDate, detailRow, quelleHtml } from "../komponenten.mjs";
import { dokumentRoute, dokumenteZuObjekt } from "../belege.mjs";
import { verweise } from "./belegverweise-daten.mjs";
import { fristenZuObjekt } from "../fristen.mjs";
import { heuteIso } from "../selektoren.mjs";
import { betragJeMonatCents } from "../rhythmus.mjs";
import { belegDateienStand, renderDokumenteAusschnitt } from "./belege.mjs";


export function qualitaetChip(p) {
  if (p.fehlt || !p.qualitaet) return `<span class="chip review">${iconSvg("review")}${escapeHtml(t("vermoegen.qualityFehlend"))}</span>`;
  return `<span class="chip ${p.qualitaet === "belegt" ? "success" : "neutral"}">${p.qualitaet === "belegt" ? iconSvg("success") : ""}${escapeHtml(t(`vermoegen.quality${p.qualitaet === "belegt" ? "Belegt" : "Geschaetzt"}`))}</span>`;
}

export function kennzahl(label, wertHtml, notizHtml = "", { titel = "" } = {}) {
  return `
    <div class="kennzahl"${titel ? ` title="${escapeHtml(titel)}"` : ""}>
      <div class="kennzahl-label">${escapeHtml(label)}</div>
      <div class="kennzahl-wert">${wertHtml}</div>
      ${notizHtml ? `<div class="kennzahl-notiz">${notizHtml}</div>` : ""}
    </div>`;
}

// ganz: auf Euro gerundet, fuer Kacheln (docs/ui-regeln.md); sonst exakt.
export function geld(centsWert, { negativ = false, ganz = false } = {}) {
  if (centsWert === null || centsWert === undefined) return `<span class="muted">—</span>`;
  return `<span class="${negativ && centsWert < 0 ? "betrag-negativ" : ""}">${escapeHtml(ganz ? fmt().geldGanz(centsWert) : formatMoney(centsWert))}</span>`;
}

export function prozent(anteil, stellen = 0) {
  if (anteil === null || anteil === undefined || !Number.isFinite(anteil)) return "—";
  return fmt().prozent(anteil, stellen);
}

const FELDER_JE_KLASSE = {
  konto: ["kontostand", "depotwert"],
  immobilie: ["marktwert"],
  vermoegenswert: ["marktwert"],
  darlehen: ["restschuld"],
};

export function zeitwerteFuer(klasse, id) {
  const felder = FELDER_JE_KLASSE[klasse] ?? [];
  return (data.zeitwerte ?? [])
    .filter((zw) => zw.entitaet === klasse && zw.entitaet_id === id && felder.includes(zw.feld))
    .sort((a, b) => b.standdatum.localeCompare(a.standdatum) || b.feld.localeCompare(a.feld));
}

export function renderPositionWertstaende(p) {
  const rows = zeitwerteFuer(p.klasse, p.id);
  if (!rows.length) {
    return detailRow(t("vermoegen.wertstaende"), `<span class="muted">${escapeHtml(t("vermoegen.noWertstaende"))}</span>`);
  }
  const html = rows.slice(0, 5).map((zw) => `
    <div class="wertstand-item">
      <div><strong>${escapeHtml(formatMoney(cents(zw.wert)))}</strong> <span class="muted">${escapeHtml(formatDate(zw.standdatum))}</span></div>
      <div>${qualitaetChip({ qualitaet: zw.qualitaet })}</div>
      ${zw.quelle_hinweis ? `<div class="muted">${quelleHtml(zw.quelle_hinweis)}</div>` : ""}
    </div>`).join("");
  const more = rows.length > 5
    ? `<button class="linkish" data-action="show-vermoegen-wertstaende" data-entity="${escapeHtml(p.id)}">${escapeHtml(t("vermoegen.showAllWertstaende"))}</button>`
    : "";
  return detailRow(t("vermoegen.wertstaende"), `<div class="wertstand-list">${html}${more}</div>`);
}

// Read-only Rückverweis: Szenarien, die eine Sondertilgung auf dieses Darlehen
// planen. Hat KEINEN Einfluss auf die Restschuld — rein informativ.
function sondertilgungsRueckverweise(darlehenId) {
  const treffer = [];
  for (const sz of data.szenarien ?? []) {
    for (const a of sz.annahmen ?? []) {
      if (a.gegenbuchung?.ziel_typ === "darlehen" && a.gegenbuchung.ziel_id === darlehenId) {
        treffer.push({ szenario_id: sz.szenario_id, name: sz.name, status: sz.status, qualitaet: a.qualitaet });
      }
    }
  }
  return treffer;
}

function annahmeQualitaetChip(q) {
  const stil = { belegt: ["success", "success", "Belegt"], geschaetzt: ["neutral", "", "Geschaetzt"], offen: ["review", "review", "Offen"] };
  const [cls, icon, wort] = stil[q] ?? stil.offen;
  return `<span class="chip ${cls}">${icon ? iconSvg(icon) : ""}${escapeHtml(t(`szenarien.quality${wort}`))}</span>`;
}

function szenarioStatusChip(status) {
  const stil = { entwurf: "neutral", bestaetigt: "success", verworfen: "review" };
  return `<span class="chip ${stil[status] ?? "neutral"}">${escapeHtml(t(`szenarien.status.${status}`))}</span>`;
}

export function sondertilgungenRow(darlehenId) {
  const treffer = sondertilgungsRueckverweise(darlehenId);
  if (!treffer.length) return "";
  const rows = treffer.map((tr) => `
    <div class="rail-item">
      <a class="linkish" href="${escapeHtml(zielRoute("open-szenario", tr.szenario_id))}" data-action="open-szenario" data-szenario="${escapeHtml(tr.szenario_id)}">${escapeHtml(tr.name)}</a>
      ${szenarioStatusChip(tr.status)}
      ${annahmeQualitaetChip(tr.qualitaet)}
    </div>`).join("");
  return detailRow(t("vermoegen.sondertilgungenTitle"), `<div class="rail-list">${rows}</div><p class="muted">${escapeHtml(t("vermoegen.sondertilgungenHinweis"))}</p>`);
}

export function rhythmusLabel(einheit, intervall) {
  const e = t(`vermoegen.rhythmus.${einheit}`);
  const einheitText = e === `vermoegen.rhythmus.${einheit}` ? einheit : e;
  return Number(intervall) > 1 ? `${intervall} ${einheitText}` : einheitText;
}

export function laufzeitText(von, bis) {
  if (!von || !bis) return "";
  const [vy, vm, vd] = von.split("-").map(Number);
  const [by, bm, bd] = bis.split("-").map(Number);
  let monate = (by - vy) * 12 + (bm - vm);
  if (bd < vd) monate -= 1;
  const jahre = Math.floor(monate / 12);
  const restMonate = monate % 12;
  if (jahre > 0 && restMonate > 0) return `${jahre} ${t("vermoegen.jahre")} ${restMonate} ${t("vermoegen.monate")}`;
  if (jahre > 0) return `${jahre} ${t("vermoegen.jahre")}`;
  return `${Math.max(0, restMonate)} ${t("vermoegen.monate")}`;
}

// Monatliche Belastung einer Rate (fuer Summen ueber Darlehen mit anderem Rhythmus).
export function rateJeMonatCents(darlehen) {
  return betragJeMonatCents(cents(darlehen.sollrate), darlehen.rhythmus_einheit, darlehen.rhythmus_intervall);
}

// Gestapelter Balken als SVG: die CSP der App verbietet style-Attribute, SVG-
// Geometrie ist davon nicht betroffen. teile: [{ anteil 0..1, klasse, titel? }],
// laenge: Anteil der vollen Breite (Passiva im Massstab der Aktiva).
export function balkenSvg(teile, { klasse = "vermoegen-balken", laenge = 1 } = {}) {
  let x = 0;
  const rects = teile.filter((tl) => tl.anteil > 0).map((tl) => {
    const breite = Math.min(tl.anteil, 1 - x) * 100;
    // Mit Titel hoverbar (diagramm-hover.mjs): data-titel fuer die Box, data-label
    // ordnet den Abschnitt seiner Legendenzeile zu. Kein <title>, sonst doppelter Tooltip.
    const trenner = tl.titel ? tl.titel.lastIndexOf(": ") : -1;
    const label = tl.label ?? (trenner > 0 ? tl.titel.slice(0, trenner) : tl.titel);
    const hover = tl.titel ? ` data-titel="${escapeHtml(tl.titel)}" data-label="${escapeHtml(label)}"` : "";
    const rect = `<rect x="${(x * 100).toFixed(3)}" y="0" width="${breite.toFixed(3)}" height="10" class="${tl.titel ? "balken-segment " : ""}${tl.klasse}"${hover}></rect>`;
    x += breite / 100;
    return rect;
  }).join("");
  const breiteGesamt = (Math.max(0, Math.min(1, laenge)) * 100).toFixed(2);
  return `<svg class="${klasse}" viewBox="0 0 100 10" preserveAspectRatio="none" width="${breiteGesamt}%" aria-hidden="true"><rect x="0" y="0" width="100" height="10" class="balken-grund" />${rects}</svg>`;
}

// Dokumente eines Objekts als Ausschnitt der Dokumentenansicht (Ordnerbaum und
// Tabelle), fuer Details in voller Breite. In schmalen Rails bleibt dokumenteHtml.
export function dokumenteBrowserHtml(ids, ordner = []) {
  const { zustand, dateien } = belegDateienStand();
  const liste = dokumenteZuObjekt({ dateien, index: verweise(), ids, ordner });
  const html = liste.length ? renderDokumenteAusschnitt({ pfade: liste.map((d) => d.pfad), schluessel: ids[0], ids }) : "";
  if (html) return html;
  const text = zustand === "laedt" || zustand === "unbekannt" ? t("vermoegen.dokumente.laedt") : t("vermoegen.dokumente.keine");
  return `<p class="muted">${escapeHtml(text)}</p>`;
}

export function dokumenteHtml(ids, ordner = []) {
  const { zustand, dateien } = belegDateienStand();
  const liste = dokumenteZuObjekt({ dateien, index: verweise(), ids, ordner });
  if (!liste.length) {
    const text = zustand === "laedt" || zustand === "unbekannt" ? t("vermoegen.dokumente.laedt") : t("vermoegen.dokumente.keine");
    return `<p class="muted">${escapeHtml(text)}</p>`;
  }
  return `<ul class="dokument-liste">${liste.map((d) => `
    <li><a class="linkish" href="${escapeHtml(dokumentRoute(d.pfad))}">${iconSvg("belege")}${escapeHtml(d.name)}</a></li>`).join("")}</ul>`;
}

// Naechste Termine eines Objekts (erfasste Fristen und abgeleitete Termine,
// ADR 0031) als Zeilen "Datum Bezeichnung"; leer, wenn keine anstehen.
export function fristenText(typ, id, max = 3) {
  const termine = fristenZuObjekt(data, heuteIso(), typ, id).slice(0, max);
  return termine.map((termin) => `<div>${escapeHtml(formatDate(termin.datum))} · ${escapeHtml(termin.bezeichnung)}${termin.ueberfaellig
    ? ` <span class="chip review">${escapeHtml(t("vermoegen.fristUeberfaellig"))}</span>` : ""}</div>`).join("");
}
