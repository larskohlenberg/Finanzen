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
  vermoegen: [
    '<path d="m3 17 6-6 4 4 8-8"/>',
    '<path d="M14 7h7v7"/>',
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
