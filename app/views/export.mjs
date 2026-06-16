// app/views/export.mjs
// Export-Hinweis-Ansicht.
import { state, t, escapeHtml } from "../runtime.mjs";
import { renderPageHead } from "../komponenten.mjs";

export function renderExport() {
  return `
    ${renderPageHead(t("exportPage.title"), t("exportPage.lead"))}
    <section class="panel empty-state">
      <div>
        <h2>${escapeHtml(t("exportPage.lead"))}</h2>
        <p class="page-lead">${escapeHtml(t("exportPage.body"))}</p>
      </div>
    </section>
  `;
}

