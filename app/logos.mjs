// app/logos.mjs
// Logo-Verzeichnis: welche Gegenpartei welches Logo traegt, und der Rueckfall
// ohne Logo (Kuerzel in fester Farbe). Reine Funktionen, im Browser und in
// tools/logos.mjs gleich. Ein Logo-Eintrag passt ueber gegenpartei_pattern
// (wie bei den Kategorisierungsregeln: lose normalisierter Teiltext, "|" trennt
// Alternativen). Regelzahlungen erben das Logo ueber ihre gebuchten
// Transaktionen, Vorsorgevertraege ueber ihre Regelzahlungen. Konten tragen
// kein Gegenpartei-Feld; ihr Name nennt die Bank ("<Bank> Girokonto ...").
import { normalizeLoose } from "./tools/lib/text.mjs";

export const KUERZEL_FARBEN = 8;

// Woerter, die im Kuerzel nichts sagen: Rechtsformen und Fuellwoerter aus
// Buchungstexten.
const FUELLWOERTER = new Set([
  "gmbh", "ggmbh", "mbh", "ag", "se", "kg", "kgaa", "ohg", "eg", "ev", "ug", "co", "ltd", "inc", "sa", "sarl", "bv", "nv", "plc", "llc",
  "und", "der", "die", "das", "von", "fuer", "für", "the", "markt", "filiale", "sagt", "dankt", "danke",
]);

export function kuerzel(name) {
  const woerter = String(name ?? "").normalize("NFC").split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !/^\d+$/.test(w) && !FUELLWOERTER.has(w.toLowerCase()));
  if (woerter.length === 0) return "?";
  if (woerter.length === 1) return woerter[0].slice(0, 2).toUpperCase();
  return `${woerter[0][0]}${woerter[1][0]}`.toUpperCase();
}

// Feste Farbe je Name (FNV-1a ueber den lose normalisierten Namen).
export function kuerzelFarbe(name) {
  let hash = 0x811c9dc5;
  for (const zeichen of normalizeLoose(name)) {
    hash ^= zeichen.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % KUERZEL_FARBEN;
}

// Laenge des laengsten Musterteils, der im Text steckt; 0 = kein Treffer.
function trefferLaenge(text, pattern) {
  let laenge = 0;
  for (const teil of String(pattern ?? "").split("|")) {
    const t = normalizeLoose(teil);
    if (t && text.includes(t)) laenge = Math.max(laenge, t.length);
  }
  return laenge;
}

// Bester Logo-Eintrag fuer einen Text: der mit dem laengsten passenden
// Musterteil, bei Gleichstand der erste in der Liste.
export function logoFuerText(logos, text) {
  const norm = normalizeLoose(text);
  if (!norm) return null;
  let bester = null;
  let besteLaenge = 0;
  for (const logo of logos ?? []) {
    const laenge = trefferLaenge(norm, logo.gegenpartei_pattern);
    if (laenge > besteLaenge) {
      bester = logo;
      besteLaenge = laenge;
    }
  }
  return bester;
}

function haeufigstes(logos) {
  const zaehler = new Map();
  for (const logo of logos) if (logo) zaehler.set(logo, (zaehler.get(logo) ?? 0) + 1);
  let bester = null;
  for (const [logo, n] of zaehler) if (!bester || n > zaehler.get(bester)) bester = logo;
  return bester;
}

// Nachschlagewerk fuer einen Bestand { logos, transaktionen, regelzahlungen }.
// Ergebnisse werden je Text bzw. ID gemerkt; der Bestand aendert sich in der
// App nur mit einem Neuladen.
export function logoVerzeichnis({ logos = [], transaktionen = [], regelzahlungen = [] }) {
  const jeText = new Map();
  const jeRz = new Map();
  const jeVs = new Map();
  let buchungenJeRz = null;
  let rzJeVs = null;

  const fuerGegenpartei = (text) => {
    const key = String(text ?? "");
    if (!jeText.has(key)) jeText.set(key, logoFuerText(logos, key));
    return jeText.get(key);
  };

  const fuerRegelzahlung = (rz) => {
    if (!rz) return null;
    if (!jeRz.has(rz.regelzahlung_id)) {
      if (!buchungenJeRz) {
        buchungenJeRz = new Map();
        for (const tx of transaktionen) {
          if (!tx.regelzahlung_id) continue;
          if (!buchungenJeRz.has(tx.regelzahlung_id)) buchungenJeRz.set(tx.regelzahlung_id, []);
          buchungenJeRz.get(tx.regelzahlung_id).push(tx);
        }
      }
      const geerbt = haeufigstes((buchungenJeRz.get(rz.regelzahlung_id) ?? []).map((tx) => fuerGegenpartei(tx.gegenpartei)));
      jeRz.set(rz.regelzahlung_id, geerbt ?? logoFuerText(logos, rz.bezeichnung));
    }
    return jeRz.get(rz.regelzahlung_id);
  };

  const fuerVorsorge = (vs) => {
    if (!vs) return null;
    if (!jeVs.has(vs.vorsorge_id)) {
      if (!rzJeVs) {
        rzJeVs = new Map();
        for (const rz of regelzahlungen) {
          if (!rz.vorsorge_id) continue;
          if (!rzJeVs.has(rz.vorsorge_id)) rzJeVs.set(rz.vorsorge_id, []);
          rzJeVs.get(rz.vorsorge_id).push(rz);
        }
      }
      const geerbt = haeufigstes((rzJeVs.get(vs.vorsorge_id) ?? []).map(fuerRegelzahlung));
      jeVs.set(vs.vorsorge_id, geerbt ?? logoFuerText(logos, vs.name));
    }
    return jeVs.get(vs.vorsorge_id);
  };

  const fuerKonto = (konto) => (konto ? fuerGegenpartei(konto.name) : null);

  return { fuerGegenpartei, fuerRegelzahlung, fuerVorsorge, fuerKonto };
}
