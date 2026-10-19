// app/views/upload.mjs
// Hochladen: Rohdateien per Drag&Drop oder Auswahldialog in die Inbox legen.
// Der App-Server (app/server.mjs) nimmt je Datei einen PUT entgegen; die
// Verarbeitung passiert spaeter im Import-Durchlauf. Ohne App-Server (rein
// statische Auslieferung) zeigt die Ansicht einen Hinweis statt Fehler.
// Im Demo-Modus gibt es weder Upload noch Inbox-Liste: die Inbox gehoert dem
// echten Bestand (demo-modus.mjs).
import { state, t, tf, fmt, escapeHtml } from "../runtime.mjs";
import { beiDatenwechsel } from "../lebenszyklus.mjs";
import { renderPageHead, klappKachel } from "../komponenten.mjs";
import { erstelleApiCache } from "../api-daten.mjs";
import { detailsAttr } from "../lebenszyklus.mjs";
import { auftragSchritte, dateiname, inboxMitStatus } from "../importe-anzeige.mjs";
import { iconSvg } from "../icons.js";
import { ERLAUBTE_ENDUNGEN, inboxDateiUrl, vorpruefeDatei } from "../upload-regeln.mjs";
import { uploadMoeglich } from "../demo-modus.mjs";

const ACCEPT = ERLAUBTE_ENDUNGEN.map((endung) => `.${endung}`).join(",");

const upload = {
  eintraege: [],
  laeuft: false,
  inbox: { zustand: "unbekannt", dateien: [] },
};

const formatGroesse = (bytes) => fmt().groesse(bytes);
const formatZeit = (iso) => fmt().zeitpunkt(iso);

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

// Importbericht (GET /api/v1/importe): Auftraege und Stand der wartenden Dateien.
const importeCache = erstelleApiCache({ maxEintraege: 2 });
function importeAntwort() {
  return importeCache.hole(`./api/v1/importe${state.dataMode === "demo" ? "?quelle=demo" : ""}`);
}

const STAND_CHIP = { hochgeladen: "neutral", "uebernommen-archiv-ausstehend": "review" };

function renderInbox() {
  const { zustand } = upload.inbox;
  const dateien = inboxMitStatus(upload.inbox.dateien, importeAntwort().antwort);
  if (zustand === "nicht-verfuegbar") {
    return `<p class="upload-hinweis-api" role="note">${iconSvg("review")}${escapeHtml(t("uploadPage.apiUnavailable"))}</p>`;
  }
  if (zustand !== "ok") return `<p class="muted">${escapeHtml(t("uploadPage.inboxLoading"))}</p>`;
  if (dateien.length === 0) return `<p class="muted">${escapeHtml(t("uploadPage.inboxEmpty"))}</p>`;
  return `
    <ul class="upload-liste">
      ${dateien.map((d) => `
        <li class="upload-zeile">
          <a class="upload-name upload-oeffnen" href="${escapeHtml(inboxDateiUrl(d.name))}" target="_blank" rel="noopener" title="${escapeHtml(t("uploadPage.oeffnen"))}">${escapeHtml(d.name)}</a>
          <span class="upload-groesse muted">${escapeHtml(formatGroesse(d.groesse))}</span>
          <span class="upload-status muted">
            <span class="chip ${STAND_CHIP[d.stand] ?? "neutral"}">${escapeHtml(t(`uploadPage.stand.${d.stand}`))}</span>
            ${escapeHtml(formatZeit(d.geaendert))}
            <a class="upload-herunterladen" href="${escapeHtml(inboxDateiUrl(d.name))}" download="${escapeHtml(d.name)}" aria-label="${escapeHtml(`${t("uploadPage.herunterladen")}: ${d.name}`)}" title="${escapeHtml(t("uploadPage.herunterladen"))}">${iconSvg("download")}</a>
          </span>
        </li>`).join("")}
    </ul>`;
}

export function renderUpload() {
  if (!uploadMoeglich(state.dataMode)) {
    return `
    ${renderPageHead(t("uploadPage.title"), t("uploadPage.lead"))}
    <p class="upload-hinweis-api" role="note">${iconSvg("review")}${escapeHtml(t("uploadPage.demoGesperrt"))}</p>
  `;
  }
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
        <p class="muted">${escapeHtml(t("uploadPage.standHinweis"))}</p>
        ${renderInbox()}
      </section>
      ${klappKachel({ id: "upload.importe", titel: t("uploadPage.importeTitel"), inhalt: renderImporte() })}
    </div>
  `;
}

const SCHRITT_KLASSE = { uebernommen: "success", teilweise: "review", abgewiesen: "danger" };

// Je Auftrag: Datei, Zeitpunkt, Schritte bis "abgeschlossen", Zeilenzahlen,
// abgewiesene Zeilen aufklappbar, Archivort.
function renderImporte() {
  const { antwort, fehler } = importeAntwort();
  if (!antwort) return `<p class="muted" role="status">${escapeHtml(fehler ? fehler.message : t("uploadPage.importeLaden"))}</p>`;
  if (!antwort.auftraege.length) return `<p class="muted">${escapeHtml(t("uploadPage.importeLeer"))}</p>`;
  return `<ul class="import-liste">${antwort.auftraege.map((a) => {
    const z = a.zeilen ?? {};
    const schritte = auftragSchritte(a).map((s) => `<li class="${s.erledigt ? "erledigt" : "offen"} ${SCHRITT_KLASSE[s.schritt] ?? ""}">${escapeHtml(t(`uploadPage.schritt.${s.schritt}`))}${s.zahl !== undefined ? ` <span class="muted">(${s.zahl})</span>` : ""}</li>`).join("");
    const abgewiesen = a.abgewiesen?.length ? `
      <details class="import-abgewiesen"${detailsAttr(`import.${a.auftrag_id}`)}>
        <summary>${escapeHtml(tf("uploadPage.abgewieseneZeilen", { n: a.abgewiesen.length }))}</summary>
        <ul>${a.abgewiesen.map((r) => `<li><strong>${escapeHtml(tf("uploadPage.zeile", { n: r.zeile }))}</strong> · ${escapeHtml(r.grund)}${r.rohzeile ? `<div class="muted import-rohzeile">${escapeHtml(r.rohzeile)}</div>` : ""}</li>`).join("")}</ul>
      </details>` : "";
    return `
      <li class="import-eintrag">
        <div class="import-kopf"><strong>${escapeHtml(dateiname(a.quelle))}</strong> <span class="muted">${escapeHtml(formatZeit(a.zeitpunkt))} · ${escapeHtml(a.auftrag_id)}</span></div>
        <ol class="import-schritte">${schritte}</ol>
        <div class="muted">${escapeHtml(tf("uploadPage.zeilen", { gelesen: z.gelesen ?? 0, uebernommen: z.uebernommen ?? 0, dubletten: z.dubletten ?? 0, abgewiesen: z.abgewiesen ?? 0 }))}${a.pruefen ? ` · ${escapeHtml(tf("uploadPage.pruefen", { n: a.pruefen }))}` : ""}</div>
        ${a.grund ? `<div>${escapeHtml(tf("uploadPage.grundAbgewiesen", { grund: a.grund }))}</div>` : ""}
        ${abgewiesen}
        ${a.archiv ? `<div class="muted">${escapeHtml(tf("uploadPage.archiv", { pfad: a.archiv }))}</div>` : ""}
      </li>`;
  }).join("")}</ul>`;
}

// Inbox-Liste vom Server holen. Kein Zwischen-Render beim Start: die Ansicht
// zeigt "unbekannt" und "laedt" gleich (Ladehinweis).
// Bei Sitzungssperre Inbox-Liste und Upload-Protokoll vergessen; spaete
// Antworten gehoeren zur alten Generation.
let inboxGeneration = 0;
beiDatenwechsel((grund) => {
  if (grund !== "sperre") return;
  inboxGeneration += 1;
  upload.eintraege = [];
  upload.inbox = { zustand: "unbekannt", dateien: [] };
});

export async function ladeInbox(aktualisiere) {
  if (!uploadMoeglich(state.dataMode)) return;
  upload.inbox.zustand = "laedt";
  // Mit der Inbox-Liste auch den Importbericht neu holen.
  importeCache.verwerfe();
  const meine = ++inboxGeneration;
  try {
    const antwort = await fetch("./api/inbox", { cache: "no-store" });
    const json = antwort.ok ? await antwort.json() : null;
    if (meine !== inboxGeneration) return;
    if (!Array.isArray(json?.dateien)) throw new Error("keine Inbox-API");
    upload.inbox = { zustand: "ok", dateien: json.dateien };
  } catch {
    if (meine !== inboxGeneration) return;
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
  if (liste.length === 0 || !uploadMoeglich(state.dataMode)) return;
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
