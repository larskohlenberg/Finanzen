// app/views/export.mjs
// Export (#/administration/export): Backup zum Herunterladen. Die ZIPs baut der App-Server
// beim Klick (GET /api/export/<art>, app/export.mjs). Im Demomodus kommen
// Daten und Dokumente aus data/demo (demo-modus.mjs), nie die echten.
import { state, t, escapeHtml } from "../runtime.mjs";
import { iconSvg } from "../icons.js";
import { exportUrl } from "../demo-modus.mjs";

const ARTEN = ["komplett", "dokumente", "daten"];

function karte(art) {
  return `
    <section class="panel panel-pad export-karte">
      <h2>${escapeHtml(t(`exportPage.${art}.titel`))}</h2>
      <p class="muted">${escapeHtml(t(`exportPage.${art}.text`))}</p>
      <a class="belege-download" href="${escapeHtml(exportUrl(art, state.dataMode))}" download>${iconSvg("download")}${escapeHtml(t("exportPage.herunterladen"))}</a>
    </section>
  `;
}

export function renderExport() {
  return `
    <p class="page-lead section-spacing">${escapeHtml(t("exportPage.lead"))}</p>
    <div class="export-karten">${ARTEN.map(karte).join("")}</div>
    ${state.dataMode === "demo" ? `<p class="muted">${escapeHtml(t("exportPage.demoHinweis"))}</p>` : ""}
  `;
}
