// app/error.mjs
// Zentrale Fehlergrenze: kapselt Render- und Aktionsfehler, damit nie ein
// Bildschirm weiss bleibt und kein Handler einen Fehler still schluckt.
import { t, escapeHtml } from "./runtime.mjs";

// Bewusst trivial und nur von t/escapeHtml abhaengig, damit das Panel selbst
// nicht werfen kann.
export function renderErrorPanel(error, kontext) {
  const message = error?.message ?? String(error ?? "");
  const stack = error?.stack ?? "";
  const details = `${kontext ? `${kontext}\n\n` : ""}${message}\n\n${stack}`;
  return `
    <section class="error-panel" role="alert">
      <strong>${escapeHtml(t("error.viewTitle"))}</strong>
      <details>
        <summary>${escapeHtml(t("error.detailsToggle"))}</summary>
        <pre>${escapeHtml(details)}</pre>
      </details>
    </section>`;
}

// Render-Grenze: gibt das HTML von fn() zurueck, bei Fehler stattdessen das Panel.
export function safeRender(fn, kontext) {
  try {
    return fn();
  } catch (error) {
    console.error(kontext, error);
    return renderErrorPanel(error, kontext);
  }
}

// Aktions-Grenze: umhuellt einen Event-Handler; bei Fehler onError(error) statt
// stillem Abbruch.
export function guard(fn, onError) {
  return (...args) => {
    try {
      return fn(...args);
    } catch (error) {
      console.error(error);
      onError(error);
    }
  };
}
