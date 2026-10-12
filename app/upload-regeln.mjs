// app/upload-regeln.mjs
// Gemeinsame Regeln fuer den Upload in die Inbox — ohne DOM und ohne node:-
// Module, damit Browser (Vorpruefung in der Upload-Ansicht) und App-Server
// (massgebliche Pruefung) dieselben Grenzen nutzen.

export const ERLAUBTE_ENDUNGEN = Object.freeze(["pdf", "csv", "xlsx", "xls", "txt", "png", "jpg", "jpeg", "heic", "heif"]);
// HEIC/HEIF wandelt der Server beim Upload in JPEG um (heif-convert): Browser
// ausser Safari zeigen HEIC nicht an, OCR und MCP-Bildinhalt brauchen JPEG/PNG.
export const HEIC_ENDUNGEN = Object.freeze(["heic", "heif"]);
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function endungVon(name) {
  const punkt = String(name).lastIndexOf(".");
  return punkt > 0 ? String(name).slice(punkt + 1).toLowerCase() : "";
}

export function istHeic(name) {
  return HEIC_ENDUNGEN.includes(endungVon(name));
}

export function endungErlaubt(name) {
  return ERLAUBTE_ENDUNGEN.includes(endungVon(name));
}

// Clientseitige Vorpruefung einer File-Instanz ({ name, size }). Der Server
// bleibt massgeblich; das hier spart nur den Umweg ueber das Netz.
export function vorpruefeDatei({ name, size }) {
  if (!endungErlaubt(name)) return { ok: false, grund: "endung-nicht-erlaubt" };
  if (size > MAX_UPLOAD_BYTES) return { ok: false, grund: "zu-gross" };
  return { ok: true };
}
