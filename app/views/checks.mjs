// app/views/checks.mjs
// Prüfungen: Transfer-Checks + Vermögens-Checks. Bereich der Administration
// (#/administration/checks), keine eigene Seite mehr.
import { data, state, t, escapeHtml, cents, transaktionenById, kontenById } from "../runtime.mjs";
import { iconSvg } from "../icons.js";
import { formatMoney, formatDate, categoryName } from "../komponenten.mjs";
import { heuteIso } from "../selektoren.mjs";
import { kopfleisteAntwort } from "./kopfleiste-daten.mjs";
import { erstelleApiCache } from "../api-daten.mjs";

// Transfer-Pruefung, Vermoegens-Checks und Prognose-Realismus rechnet der
// App-Server (GET /api/v1/checks, app/checks-modell.mjs).
const cache = erstelleApiCache({ maxEintraege: 4 });

function checksAntwort(heute) {
  const suche = new URLSearchParams();
  if (state.dataMode === "demo") suche.set("quelle", "demo");
  suche.set("heute", heute);
  return cache.hole(`./api/v1/checks?${suche}`);
}

// Prognose-Realismus-Guardrails (Cash-Realismus, ungeplante Kategorien): hängen
// an den Stammdaten, nicht an einem Szenario — deshalb hier zuhause, nicht auf
// der Szenarioseite. Menschenlesbarer Satz aus den strukturierten Feldern.
function guardrailItem(g) {
  const titel = t(`szenarien.warnCode.${g.code}.titel`);
  const kat = g.kategorie_id ? categoryName(g.kategorie_id) : "";
  let detail = g.text;
  if (g.code === "cash-realismus") {
    detail = t("checksPage.cashRealismusText")
      .replace("{kategorie}", kat)
      .replace("{plan}", formatMoney(g.plan_cents))
      .replace("{ist}", formatMoney(g.ist_cents));
  } else if (g.code === "kategorie-ungeplant") {
    detail = t("checksPage.kategorieUngeplantText")
      .replace("{kategorie}", kat)
      .replace("{ist}", formatMoney(g.ist_cents));
  }
  return `
    <div class="rail-item">
      <span class="chip review">${iconSvg("review")}${escapeHtml(titel)}</span>
      <span>${escapeHtml(detail)}</span>
    </div>`;
}

// Die Rechenmodule schreiben Check-Texte mit Rohwerten ("erwartet 34792.40",
// "2026-03-31"). Fuer die Anzeige werden Betraege mit zwei Nachkommastellen und
// ISO-Daten lokal formatiert; IDs (VS-003) und Termine ohne Jahr (12-01) bleiben.
export function lesbarerCheckText(text) {
  return String(text ?? "")
    .replace(/(?<![\w.-])\d{4}-\d{2}-\d{2}(?![\w.-])/g, (iso) => formatDate(iso))
    .replace(/(?<![\w.,-])(-?\d+)\.(\d{2})(?![\w.]|,\d)/g, (_, ganz, rest) => formatMoney(Number(ganz) * 100 + Math.sign(Number(`${ganz}1`)) * Number(rest)));
}

// Zähler für die obere Leiste: was nur hier sichtbar ist. Offene Kategorien und
// Importfehler haben dort eigene Chips und zählen deshalb nicht mit.
// Zaehlt der Server (GET /api/v1/kopfleiste); 0, solange die Antwort laedt.
export function offeneChecksAnzahl() {
  return kopfleisteAntwort()?.offene_checks ?? 0;
}

export function renderChecks() {
  const { antwort, fehler } = checksAntwort(heuteIso());
  if (!antwort) {
    return `
    <section class="panel panel-pad section-spacing"><p class="muted" role="status">${escapeHtml(fehler ? `${t("checksPage.loadFailed")} (${fehler.message})` : t("checksPage.loading"))}</p></section>`;
  }
  // Gepaarte Transfers sind der Normalfall; aufgelistet wird nur, was hakt.
  const { anzahl: transferAnzahl, unvollstaendig } = antwort.transfers;
  const m5 = antwort.vermoegen;
  const guardrails = antwort.guardrails;
  return `
    <p class="page-lead section-spacing">${escapeHtml(t("checksPage.lead"))}</p>
    ${data.checks.length > 0 ? `
      <section class="panel panel-pad section-spacing">
        <h2 class="section-title">${escapeHtml(t("checksPage.title"))}</h2>
        <div class="rail-list">${renderCheckItems(data.checks)}</div>
      </section>
    ` : ""}
    ${(data.importfehler?.length ?? 0) > 0 ? `
      <section class="panel panel-pad section-spacing">
        <h2 class="section-title">${escapeHtml(t("checksPage.importErrors"))}</h2>
        <p class="page-lead">${escapeHtml(t("checksPage.importErrorsLead"))}</p>
        <div class="rail-list">
          ${data.importfehler.map((fehler) => `
            <div class="rail-item">
              <span class="chip danger">${iconSvg("warning")}${escapeHtml(fehler.reason)}</span>
              <span>${escapeHtml(fehler.rohquelle)} · ${escapeHtml(t("labels.row"))} ${escapeHtml(String(fehler.row ?? "-"))}</span>
              <span class="muted">${escapeHtml(fehler.detail)}</span>
            </div>
          `).join("")}
        </div>
      </section>
    ` : ""}
    ${transferAnzahl > 0 ? `
      <section class="panel panel-pad section-spacing">
        <h2 class="section-title">${escapeHtml(t("checksPage.transfers"))}</h2>
        <p class="page-lead">${escapeHtml(t("checksPage.transfersLead"))}</p>
        ${unvollstaendig.length === 0 ? `<p class="muted">${escapeHtml(t("checksPage.transfersAllOk").replace("{n}", String(transferAnzahl)))}</p>` : `
        <div class="rail-list">
          ${unvollstaendig.map((tc) => `
            <div class="rail-item">
              <span class="chip review">${iconSvg("review")}${escapeHtml(t("checksPage.transferIncomplete"))}</span>
              <span>${escapeHtml(tc.transfer_id)} · ${escapeHtml(formatMoney(cents(tc.betrag)))}</span>
            </div>
          `).join("")}
        </div>`}
      </section>
    ` : ""}
    ${m5.length > 0 ? `
      <section class="panel panel-pad section-spacing">
        <h2 class="section-title">${escapeHtml(t("nav.vermoegen"))}</h2>
        <div class="rail-list">
          ${m5.map((check) => `
            <div class="rail-item">
              <span class="chip review">${iconSvg("review")}${escapeHtml(t(`vermoegen.checkArt.${check.art}`))}</span>
              <button class="linkish" data-action="open-vermoegen-entity" data-vklasse="${escapeHtml(check.entitaet)}" data-vid="${escapeHtml(check.entitaet_id)}">${escapeHtml(check.entitaet_id)}</button>
              <span class="muted">${escapeHtml(lesbarerCheckText(check.text))}</span>
            </div>
          `).join("")}
        </div>
      </section>
    ` : ""}
    <section class="panel panel-pad section-spacing">
      <h2 class="section-title">${escapeHtml(t("checksPage.prognoseRealismus"))}</h2>
      <p class="page-lead">${escapeHtml(t("checksPage.prognoseRealismusLead"))}</p>
      ${guardrails.length ? `<div class="rail-list">${guardrails.map(guardrailItem).join("")}</div>` : `<p class="muted">${escapeHtml(t("checksPage.prognoseRealismusOk"))}</p>`}
    </section>
  `;
}

export function renderCheckItems(checks) {
  return checks.map((check) => {
    const title = check.title ?? t(check.title_key);
    const detail = check.detail ?? t(check.detail_key);
    const affected = check.entity_id ? affectedLabel(check) : data.metadata.label;
    const buttonAttrs = check.scope === "vermoegen"
      ? `data-action="open-vermoegen-entity" data-vklasse="${escapeHtml(check.entitaet || "")}" data-vid="${escapeHtml(check.entity_id || "")}"`
      : `data-action="open-entity" data-scope="${escapeHtml(check.scope)}" data-entity="${escapeHtml(check.entity_id || "")}"`;
    return `
      <div class="rail-item">
        <span class="chip ${check.severity === "success" ? "success" : "review"}">${check.severity === "success" ? iconSvg("success") : iconSvg("review")}${escapeHtml(title)}</span>
        <button class="linkish" ${buttonAttrs}>${escapeHtml(affected)}</button>
        <span class="muted">${escapeHtml(detail)}</span>
      </div>
    `;
  }).join("");
}

function affectedLabel(check) {
  if (check.scope === "vermoegen") return check.entity_id;
  if (check.scope === "konto") return kontenById.get(check.entity_id)?.name || check.entity_id;
  if (check.scope === "transaktion") {
    const tx = transaktionenById.get(check.entity_id);
    return tx ? `${tx.buchungsdatum} · ${tx.gegenpartei}` : check.entity_id;
  }
  return check.entity_id;
}
