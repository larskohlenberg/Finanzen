const icons = {
  overview: [
    '<path d="m3 9 9-7 9 7"/>',
    '<path d="M9 22V12h6v10"/>',
    '<path d="M21 22H3"/>',
  ],
  transactions: [
    '<path d="M8 6h13"/>',
    '<path d="M8 12h13"/>',
    '<path d="M8 18h13"/>',
    '<path d="M3 6h.01"/>',
    '<path d="M3 12h.01"/>',
    '<path d="M3 18h.01"/>',
  ],
  liquiditaet: [
    '<path d="M4 10h12"/>',
    '<path d="M4 14h9"/>',
    '<path d="M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2"/>',
  ],
  regelzahlungen: [
    '<path d="M21 12a9 9 0 0 1-9 9 9.8 9.8 0 0 1-6.74-2.74L3 16"/>',
    '<path d="M3 21v-5h5"/>',
    '<path d="M3 12a9 9 0 0 1 15.74-6.26L21 8"/>',
    '<path d="M16 8h5V3"/>',
  ],
  // Kalender mit Uhr: Regelzahlungen und Fristen.
  termine: [
    '<path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/>',
    '<path d="M16 2v4"/>',
    '<path d="M8 2v4"/>',
    '<path d="M3 10h5"/>',
    '<path d="M17.5 17.5 16 16.3V14"/>',
    '<circle cx="16" cy="16" r="6"/>',
  ],
  // Bankgebaeude: was wir besitzen und wo es liegt.
  vermoegen: [
    '<path d="M3 22h18"/>',
    '<path d="M6 18v-7"/>',
    '<path d="M10 18v-7"/>',
    '<path d="M14 18v-7"/>',
    '<path d="M18 18v-7"/>',
    '<path d="M11.12 2.2a2 2 0 0 1 1.76 0l7.87 3.85c.47.23.3.95-.23.95H3.48c-.53 0-.7-.72-.23-.95z"/>',
  ],
  // Schirm: abgesichert fuer spaeter (Versicherungen und Altersvorsorge).
  vorsorge: [
    '<path d="M22 12a10 10 0 0 0-20 0Z"/>',
    '<path d="M12 12v8a2 2 0 0 0 4 0"/>',
    '<path d="M12 2v1"/>',
  ],
  // Weggabelung: was waere, wenn ...
  szenarien: [
    '<path d="M16 3h5v5"/>',
    '<path d="M8 3H3v5"/>',
    '<path d="M12 22v-8.3a4 4 0 0 0-1.17-2.87L3 3"/>',
    '<path d="m15 9 6-6"/>',
  ],
  masterdata: [
    '<rect width="7" height="7" x="3" y="3" rx="1"/>',
    '<rect width="7" height="7" x="14" y="3" rx="1"/>',
    '<rect width="7" height="7" x="14" y="14" rx="1"/>',
    '<rect width="7" height="7" x="3" y="14" rx="1"/>',
  ],
  checks: [
    '<path d="M20 6 9 17l-5-5"/>',
  ],
  export: [
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    '<path d="M7 10l5 5 5-5"/>',
    '<path d="M12 15V3"/>',
  ],
  upload: [
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    '<path d="m17 8-5-5-5 5"/>',
    '<path d="M12 3v12"/>',
  ],
  belege: [
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/>',
    '<path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
    '<path d="M10 13H8"/>',
    '<path d="M16 17H8"/>',
    '<path d="M16 13h-2"/>',
  ],
  folder: [
    '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  ],
  download: [
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    '<path d="m7 10 5 5 5-5"/>',
    '<path d="M12 15V3"/>',
  ],
  external: [
    '<path d="M15 3h6v6"/>',
    '<path d="M10 14 21 3"/>',
    '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  ],
  logout: [
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
    '<path d="m16 17 5-5-5-5"/>',
    '<path d="M21 12H9"/>',
  ],
  lock: [
    '<rect width="18" height="11" x="3" y="11" rx="2"/>',
    '<path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  ],
  close: [
    '<path d="M18 6 6 18"/>',
    '<path d="m6 6 12 12"/>',
  ],
  more: [
    '<circle cx="12" cy="12" r="1"/>',
    '<circle cx="19" cy="12" r="1"/>',
    '<circle cx="5" cy="12" r="1"/>',
  ],
  chevronDown: [
    '<path d="m6 9 6 6 6-6"/>',
  ],
  chevronRight: [
    '<path d="m9 18 6-6-6-6"/>',
  ],
  chevronLeft: [
    '<path d="m15 18-6-6 6-6"/>',
  ],
  warning: [
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>',
    '<path d="M12 9v4"/>',
    '<path d="M12 17h.01"/>',
  ],
  transfer: [
    '<path d="M8 3 4 7l4 4"/>',
    '<path d="M4 7h16"/>',
    '<path d="m16 21 4-4-4-4"/>',
    '<path d="M20 17H4"/>',
  ],
  search: [
    '<circle cx="11" cy="11" r="8"/>',
    '<path d="m21 21-4.3-4.3"/>',
  ],
  clear: [
    '<path d="M18 6 6 18"/>',
    '<path d="m6 6 12 12"/>',
  ],
  copy: [
    '<rect width="14" height="14" x="8" y="8" rx="2"/>',
    '<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  ],
  success: [
    '<path d="M20 6 9 17l-5-5"/>',
  ],
  review: [
    '<circle cx="12" cy="12" r="10"/>',
    '<path d="M12 8v4"/>',
    '<path d="M12 16h.01"/>',
  ],
  neutral: [
    '<circle cx="12" cy="12" r="10"/>',
    '<path d="M8 12h8"/>',
  ],
};

function escapeAttr(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function iconSvg(name, options = {}) {
  const paths = icons[name] ?? icons.neutral;
  const size = Number(options.size ?? 18);
  const className = options.className ? ` ${escapeAttr(options.className)}` : "";
  const label = options.label ? escapeAttr(options.label) : "";
  const aria = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';

  return `<svg class="icon${className}" ${aria} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false">${paths.join("")}</svg>`;
}
