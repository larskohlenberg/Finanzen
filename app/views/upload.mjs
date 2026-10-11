// app/views/upload.mjs
// Hochladen: Rohdateien per Drag&Drop oder Auswahldialog in die Inbox legen.
// Der App-Server (app/server.mjs) nimmt je Datei einen PUT entgegen; die
// Verarbeitung passiert spaeter im Import-Durchlauf. Ohne App-Server (rein
// statische Auslieferung) zeigt die Ansicht einen Hinweis statt Fehler.
import { state, t, escapeHtml } from "../runtime.mjs";
import { renderPageHead } from "../komponenten.mjs";
import { iconSvg } from "../icons.js";
import { ERLAUBTE_ENDUNGEN, vorpruefeDatei } from "../upload-regeln.mjs";

const ACCEPT = ERLAUBTE_ENDUNGEN.map((endung) => `.${endung}`).join(",");

const upload = {
  eintraege: [],
  laeuft: false,
  inbox: { zustand: "unbekannt", dateien: [] },
};

function formatGroesse(bytes) {
  const nf = (n, stellen) => n.toLocaleString(state.lang === "en" ? "en-GB" : "de-DE", { maximumFractionDigits: stellen });
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${nf(bytes / 1024, 0)} KB`;
  return `${nf(bytes / (1024 * 1024), 1)} MB`;
}

function formatZeit(iso) {
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return "";
  return datum.toLocaleString(state.lang === "en" ? "en-GB" : "de-DE", { dateStyle: "medium", timeStyle: "short" });
}

function grundText(grund) {
  const key = `uploadPage.grund.${grund}`;
  const text = t(key);
  return text === key ? grund : text;
}

const STATUS_CHIP = { wartet: "neutral", laedt: "review", hochgeladen: "success", vorhanden: "neutral", abgelehnt: "danger" };
const STATUS_ICON = { wartet: "neutral", laedt: "upload", hochgeladen: "success", vorhanden: "success", abgelehnt: "warning" };

function renderEintrag(e) {
  let detail = "";
  if ((e.status === "hochgeladen" || e.status === "vorhanden") && e.gespeichertAls && e.gespeichertAls !== e.name) {
    detail = `${t("uploadPage.neuerName")} ${e.gespeichertAls}`;
  }
  if (e.status === "abgelehnt") detail = grundText(e.grund);
  return `
    <li class="upload-zeile">
      <span class="upload-name">${escapeHtml(e.name)}</span>
      <span class="upload-groesse muted">${escapeHtml(formatGroesse(e.groesse))}</span>
      <span class="upload-status">
        <span class="chip ${STATUS_CHIP[e.status]}">${iconSvg(STATUS_ICON[e.status])}${escapeHtml(t(`uploadPage.status.${e.status}`))}</span>
        ${detail ? `<span class="upload-detail">${escapeHtml(detail)}</span>` : ""}
      </span>
    </li>`;
}

function renderInbox() {
  const { zustand, dateien } = upload.inbox;
  if (zustand === "nicht-verfuegbar") {
    return `<p class="upload-hinweis-api" role="note">${iconSvg("review")}${escapeHtml(t("uploadPage.apiUnavailable"))}</p>`;
  }
  if (zustand !== "ok") return `<p class="muted">${escapeHtml(t("uploadPage.inboxLoading"))}</p>`;
  if (dateien.length === 0) return `<p class="muted">${escapeHtml(t("uploadPage.inboxEmpty"))}</p>`;
  return `
    <ul class="upload-liste">
      ${dateien.map((d) => `
        <li class="upload-zeile">
          <span class="upload-name">${escapeHtml(d.name)}</span>
          <span class="upload-groesse muted">${escapeHtml(formatGroesse(d.groesse))}</span>
          <span class="upload-status muted">${escapeHtml(formatZeit(d.geaendert))}</span>
        </li>`).join("")}
    </ul>`;
}

export function renderUpload() {
  return `
    ${renderPageHead(t("uploadPage.title"), t("uploadPage.lead"))}
    <div class="stack">
      <p class="upload-hinweis panel panel-pad">${iconSvg("review")}<span>${escapeHtml(t("uploadPage.hinweis"))}</span></p>
      <section class="panel upload-drop" data-upload-drop aria-labelledby="upload-drop-title">
        <span class="upload-drop-icon">${iconSvg("upload", { size: 32 })}</span>
        <h2 class="section-title" id="upload-drop-title">${escapeHtml(t("uploadPage.dropTitle"))}</h2>
        <p class="page-lead">${escapeHtml(t("uploadPage.dropHint"))}</p>
        <button type="button" class="upload-button" data-action="upload-choose">${iconSvg("upload")}${escapeHtml(t("uploadPage.choose"))}</button>
        <input type="file" multiple accept="${escapeHtml(ACCEPT)}" id="upload-input" data-upload-input hidden>
      </section>
      ${upload.eintraege.length ? `
        <section class="panel panel-pad" aria-labelledby="upload-queue-title">
          <h2 class="section-title" id="upload-queue-title">${escapeHtml(t("uploadPage.queueTitle"))}</h2>
          <ul class="upload-liste" aria-live="polite">${upload.eintraege.map(renderEintrag).join("")}</ul>
        </section>` : ""}
      <section class="panel panel-pad" aria-labelledby="upload-inbox-title">
        <div class="upload-kopf">
          <h2 class="section-title" id="upload-inbox-title">${escapeHtml(t("uploadPage.inboxTitle"))}</h2>
          <button type="button" class="chip neutral linkish" data-action="upload-refresh">${iconSvg("regelzahlungen")}${escapeHtml(t("uploadPage.refresh"))}</button>
        </div>
        ${renderInbox()}
      </section>
    </div>
  `;
}

// Inbox-Liste vom Server holen. Kein Zwischen-Render beim Start: die Ansicht
// zeigt "unbekannt" und "laedt" gleich (Ladehinweis).
export async function ladeInbox(aktualisiere) {
  upload.inbox.zustand = "laedt";
  try {
    const antwort = await fetch("./api/inbox", { cache: "no-store" });
    const json = antwort.ok ? await antwort.json() : null;
    if (!Array.isArray(json?.dateien)) throw new Error("keine Inbox-API");
    upload.inbox = { zustand: "ok", dateien: json.dateien };
  } catch {
    upload.inbox = { zustand: "nicht-verfuegbar", dateien: [] };
  }
  aktualisiere();
}

export function inboxBeiBedarfLaden(aktualisiere) {
  if (upload.inbox.zustand === "unbekannt") void ladeInbox(aktualisiere);
}

async function ladeHoch(eintrag) {
  try {
    const antwort = await fetch(`./api/inbox/${encodeURIComponent(eintrag.name)}`, {
      method: "PUT",
      headers: { "X-Finanzen-Upload": "1", "Content-Type": "application/octet-stream" },
      body: eintrag.datei,
    });
    let json = null;
    try {
      json = await antwort.json();
    } catch {
      json = null;
    }
    if (json?.status === "hochgeladen" || json?.status === "vorhanden") {
      eintrag.status = json.status;
      eintrag.gespeichertAls = json.name;
    } else if (json?.status === "abgelehnt") {
      eintrag.status = "abgelehnt";
      eintrag.grund = json.grund;
    } else {
      eintrag.status = "abgelehnt";
      eintrag.grund = [404, 405, 501].includes(antwort.status) ? "api-fehlt" : "serverfehler";
    }
  } catch {
    eintrag.status = "abgelehnt";
    eintrag.grund = "netzwerk";
  }
  eintrag.datei = null;
}

// Nacheinander hochladen: eine Datei pro Anfrage, Status je Zeile.
async function abarbeiten(aktualisiere) {
  if (upload.laeuft) return;
  upload.laeuft = true;
  try {
    for (let eintrag = upload.eintraege.find((e) => e.status === "wartet"); eintrag; eintrag = upload.eintraege.find((e) => e.status === "wartet")) {
      eintrag.status = "laedt";
      aktualisiere();
      await ladeHoch(eintrag);
      aktualisiere();
    }
  } finally {
    upload.laeuft = false;
  }
  await ladeInbox(aktualisiere);
}

export function dateienEinreihen(dateien, aktualisiere) {
  const liste = [...(dateien ?? [])];
  if (liste.length === 0) return;
  for (const datei of liste) {
    const vorab = vorpruefeDatei(datei);
    upload.eintraege.push({
      name: datei.name,
      groesse: datei.size,
      datei: vorab.ok ? datei : null,
      status: vorab.ok ? "wartet" : "abgelehnt",
      grund: vorab.ok ? "" : vorab.grund,
      gespeichertAls: "",
    });
  }
  aktualisiere();
  void abarbeiten(aktualisiere);
}
