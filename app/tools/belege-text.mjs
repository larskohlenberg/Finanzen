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
  // Originalpfade (z.B. von macOS readdir in NFD-Form) behalten wir wie gegeben.
  // Nur fuer Vergleiche normalisieren wir temporaer (Typ-Pruefung, Map-Keys, Set).
  const dateien = [...belege].sort(nachPfad);
  const pdfs = dateien.filter((datei) => istPdf(nfc(datei.pfad)));
  const zwillinge = dateien.filter((datei) => istTxt(nfc(datei.pfad)));
  const zwillingNachPfad = new Map(zwillinge.map((zwilling) => [nfc(zwilling.pfad), zwilling]));
  const erwarteteZwillinge = new Set(pdfs.map((pdf) => zielFuer(nfc(pdf.pfad))));

  const erzeugen = [];
  const offen = [];

  for (const pdf of pdfs) {
    const zielNorm = zielFuer(nfc(pdf.pfad));
    const vorhanden = zwillingNachPfad.get(zielNorm);
    if (!vorhanden) {
      erzeugen.push({ pdf: pdf.pfad, ziel: zielFuer(pdf.pfad) });
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
    if (!erwarteteZwillinge.has(nfc(zwilling.pfad))) {
      offen.push({ ort: zwilling.pfad, grund: "Zwilling ohne Beleg" });
    }
  }

  offen.sort((a, b) => a.ort.localeCompare(b.ort));
  return { erzeugen, offen };
}

export function planAufraeumen({ zwillinge, staging }) {
  // Erstelle eine Map, die Inhalts-Hashes auf Belege-Pfade abbildet.
  // Ein Hash kann mehrmals vorkommen, aber wir speichern den erstesten Treffer
  // (sortiert nach Pfad fuer Determinismus). Dies ermoeglicht die Pairing ueber
  // Inhalts-Hash statt Dateinamen — die Archive benennen Belege beim Ablegen um,
  // aber der Inhalt driftet nicht auseinander.
  const pfadNachHash = new Map();
  for (const zwilling of [...zwillinge].sort(nachPfad)) {
    if (zwilling.hash && !pfadNachHash.has(zwilling.hash)) {
      pfadNachHash.set(zwilling.hash, nfc(zwilling.pfad));
    }
  }

  const loeschen = [];
  const offen = [];

  // Verarbeite Textvorlaeufe in sortierter Reihenfolge fuer Stabilität.
  for (const vorlauf of [...staging].sort((a, b) => a.name.localeCompare(b.name))) {
    // Ein leerer Textvorlauf (nur Form-Feeds oder Leerraum) traegt keine Information
    // und wird immer geraeumt — auch wenn ein Hash-Treffer existiert. Dies verhindert,
    // dass vermeintlich offene Punkte ewig liegen bleiben.
    if (vorlauf.zeichen === 0) {
      loeschen.push({ name: vorlauf.name, grund: "leerer Textvorlauf" });
      continue;
    }

    // Pruefe auf Hash-Treffer mit einem existierenden Beleg.
    const treffer = pfadNachHash.get(vorlauf.hash);
    if (treffer) {
      loeschen.push({ name: vorlauf.name, grund: `Hash-Treffer: ${treffer}` });
      continue;
    }

    // Kein Treffer: Der Beleg wurde noch nicht abgelegt.
    offen.push({ ort: vorlauf.name, grund: "Beleg noch nicht abgelegt" });
  }

  return { loeschen, offen };
}
