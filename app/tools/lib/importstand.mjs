// @ts-check
// app/tools/lib/importstand.mjs
// Importbericht fuer Oberflaeche und MCP (Review 1B.5): was liegt wartend in
// der Inbox, was ist uebernommen, was wurde abgewiesen. Rein, ohne I/O:
// Auftraege aus importauftraege.jsonl, wartende Dateien (Name, optional
// Pruefsumme) liest der Aufrufer.
//
// Status einer wartenden Datei:
// - hochgeladen: kein Auftrag zu ihrer Pruefsumme (oder ohne Pruefsumme)
// - uebernommen-archiv-ausstehend: ein Auftrag hat sie uebernommen, sie liegt
//   aber noch in der Inbox (Abbruch vor dem Archivieren); der naechste
//   Inbox-Lauf archiviert sie nur.

/**
 * @typedef {object} Importauftrag
 * @property {string} auftrag_id
 * @property {string} zeitpunkt
 * @property {string} quelle
 * @property {string} quelle_sha256
 * @property {string} profil_id
 * @property {string} [konto_id]
 * @property {"uebernommen"|"teilweise"|"abgewiesen"} status
 * @property {{ gelesen: number, uebernommen: number, dubletten: number, abgewiesen: number }} zeilen
 * @property {{ zeile: number, grund: string, rohzeile?: string }[]} [abgewiesen]
 * @property {string} [grund]
 * @property {string} [archiv]
 * @property {number} [pruefen]
 */

/**
 * @param {{ auftraege: Importauftrag[], wartend: { datei: string, sha256?: string }[], anzahl?: number }} eingabe
 */
export function importStandModell({ auftraege, wartend, anzahl = 20 }) {
  const nachSumme = new Map(auftraege.map((a) => [a.quelle_sha256, a]));
  const sortiert = [...auftraege].sort((a, b) => (a.zeitpunkt < b.zeitpunkt ? 1 : a.zeitpunkt > b.zeitpunkt ? -1 : 0));
  return {
    auftraege: sortiert.slice(0, anzahl).map((a) => ({
      auftrag_id: a.auftrag_id,
      zeitpunkt: a.zeitpunkt,
      quelle: a.quelle,
      profil_id: a.profil_id,
      konto_id: a.konto_id ?? null,
      status: a.status,
      zeilen: a.zeilen,
      abgewiesen: a.abgewiesen ?? [],
      grund: a.grund ?? null,
      archiv: a.archiv ?? null,
      pruefen: a.pruefen ?? 0,
    })),
    wartend: wartend.map((w) => {
      const auftrag = w.sha256 ? nachSumme.get(w.sha256) : undefined;
      return auftrag && auftrag.status !== "abgewiesen"
        ? { datei: w.datei, status: "uebernommen-archiv-ausstehend", auftrag_id: auftrag.auftrag_id }
        : { datei: w.datei, status: "hochgeladen" };
    }),
    summe: {
      auftraege: auftraege.length,
      teilweise: auftraege.filter((a) => a.status === "teilweise").length,
      abgewiesen: auftraege.filter((a) => a.status === "abgewiesen").length,
      wartend: wartend.length,
    },
  };
}
