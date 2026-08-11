// app/tools/belege-text.mjs
//
// Textzwilling der Belege: Jedes PDF unter `Belege/` hat eine gleichnamige
// `.txt` daneben. Der Zwilling ist rohes `pdftotext -layout`-Ergebnis und
// deshalb jederzeit aus dem Beleg wiederherstellbar — er wird neu erzeugt,
// nicht verschoben.
//
// `data/inbox/standardized/` wird ueber den Inhalts-Hash aufgeraeumt, nicht
// ueber den Dateinamen: Der Agent benennt Belege beim Ablegen um, Namen
// driften also systematisch auseinander. Inhalte tun das nicht.

export const MARKER_KOPF = "# Kein Textlayer";
export const GELESEN_KOPF = "# Vom Agenten aus dem Bildscan gelesen";

const nfc = (wert) => wert.normalize("NFC");
const nachPfad = (a, b) => a.pfad.localeCompare(b.pfad);
const istPdf = (pfad) => /\.pdf$/i.test(pfad);
const istTxt = (pfad) => /\.txt$/i.test(pfad);
const zielFuer = (pfad) => pfad.replace(/\.pdf$/i, ".txt");

export function planZwillinge({ belege }) {
  const dateien = belege.map((datei) => ({ ...datei, pfad: nfc(datei.pfad) })).sort(nachPfad);
  const pdfs = dateien.filter((datei) => istPdf(datei.pfad));
  const zwillinge = dateien.filter((datei) => istTxt(datei.pfad));
  const zwillingNachPfad = new Map(zwillinge.map((zwilling) => [zwilling.pfad, zwilling]));
  const erwarteteZwillinge = new Set(pdfs.map((pdf) => zielFuer(pdf.pfad)));

  const erzeugen = [];
  const offen = [];

  for (const pdf of pdfs) {
    const ziel = zielFuer(pdf.pfad);
    const vorhanden = zwillingNachPfad.get(ziel);
    if (!vorhanden) {
      erzeugen.push({ pdf: pdf.pfad, ziel });
      continue;
    }
    // Der Marker bleibt so lange stehen, bis der Agent den Scan gelesen hat.
    // Ihn bei jedem Lauf zu melden macht daraus eine Restliste, die nicht
    // veralten kann, weil sie aus dem Dateisystem hergeleitet wird.
    if ((vorhanden.kopf ?? "").startsWith(MARKER_KOPF)) {
      offen.push({ ort: vorhanden.pfad, grund: "OCR ausstehend" });
    }
  }

  for (const zwilling of zwillinge) {
    if (!erwarteteZwillinge.has(zwilling.pfad)) {
      offen.push({ ort: zwilling.pfad, grund: "Zwilling ohne Beleg" });
    }
  }

  offen.sort((a, b) => a.ort.localeCompare(b.ort));
  return { erzeugen, offen };
}
