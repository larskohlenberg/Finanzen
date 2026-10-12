// app/vermoegen-routen.mjs
// Tabs der Vermoegensseite und ihre Klassen. Gemeinsam genutzt von routing.mjs
// (Hash-Routen) und belege.mjs (Links aus Dokumenten auf Datensaetze).

export const VERMOEGEN_TABS = ["uebersicht", "konten", "immobilien", "darlehen", "sonstige"];
export const KLASSE_FUER_TAB = { konten: "konto", immobilien: "immobilie", darlehen: "darlehen", sonstige: "vermoegenswert" };
export const TAB_FUER_KLASSE = Object.fromEntries(Object.entries(KLASSE_FUER_TAB).map(([tab, klasse]) => [klasse, tab]));

// "#/vermoegen/immobilien/IMM-001" fuer Klasse und ID.
export function vermoegenRoute(klasse, id) {
  const tab = TAB_FUER_KLASSE[klasse];
  if (!tab) return "#/vermoegen";
  return id ? `#/vermoegen/${tab}/${encodeURIComponent(id)}` : `#/vermoegen/${tab}`;
}
