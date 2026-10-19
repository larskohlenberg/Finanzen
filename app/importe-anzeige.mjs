// app/importe-anzeige.mjs
// Upload/Inbox-Status fuer die Oberflaeche (rein, ohne DOM). Der Importbericht
// (GET /api/v1/importe, app/tools/lib/importstand.mjs) kennt die Auftraege und
// den Stand der wartenden Dateien; hier wird er auf die Inbox-Liste und auf
// Schritte je Auftrag abgebildet:
//   hochgeladen -> gelesen -> uebernommen | teilweise | abgewiesen -> abgeschlossen (archiviert)

export function dateiname(pfad) {
  const text = String(pfad ?? "");
  return text.slice(text.lastIndexOf("/") + 1);
}

// Inbox-Dateien (Name, Groesse, Zeit) mit ihrem Stand aus dem Bericht:
// hochgeladen (wartet auf den Import-Durchlauf) oder uebernommen-archiv-ausstehend.
export function inboxMitStatus(dateien, importe) {
  const je = new Map((importe?.wartend ?? []).map((w) => [w.datei, w]));
  return (dateien ?? []).map((d) => ({
    ...d,
    stand: je.get(d.name)?.status ?? "hochgeladen",
    auftrag_id: je.get(d.name)?.auftrag_id ?? null,
  }));
}

// Schritte eines Auftrags mit Zahlen; erledigt heisst erreicht.
export function auftragSchritte(auftrag) {
  const z = auftrag.zeilen ?? {};
  const gelesen = (z.gelesen ?? 0) > 0;
  return [
    { schritt: "hochgeladen", erledigt: true },
    { schritt: "gelesen", erledigt: gelesen, ...(gelesen ? { zahl: z.gelesen } : {}) },
    { schritt: auftrag.status, erledigt: true, ...(auftrag.status === "abgewiesen" ? {} : { zahl: z.uebernommen ?? 0 }) },
    { schritt: "abgeschlossen", erledigt: Boolean(auftrag.archiv) },
  ];
}
