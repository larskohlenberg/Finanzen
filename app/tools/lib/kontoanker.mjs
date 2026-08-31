// app/tools/lib/kontoanker.mjs
//
// Eine `belegstufe` bewertet die Beleglage zum Zeitpunkt der Regelanlage — nicht
// die Frage, ob dieser Beleg noch deckt, was die Regel heute erreicht (ADR 0027).
// E2 heisst "identischer Merchant im Bestand schon entschieden"; welcher Teil
// des Bestands das war, haelt die Regel nirgends fest. Trifft sie spaeter ein
// Konto, auf dem niemand ihre Kategorie je entschieden hat, ist die Stufe dort
// **verliehen** statt verdient — die Regel hat sich nicht geaendert, ihre Welt
// hat sich geaendert.

// Dieselbe Definition von "menschlich" wie die Referenzmenge der
// Spezifitaetspruefung: eine Auto-Freigabe belegt nichts, sie ist genau das,
// was hier geprueft wird.
const istMensch = (tx) => tx.bestaetigt_durch === "mensch" || tx.kategorie_herkunft === "manuell";

const paar = (kategorie_id, konto_id) => `${kategorie_id}|${konto_id}`;

// Menschlich entschiedene (Kategorie, Konto)-Paare — die Anker.
export function ankerpaare(transaktionen) {
  const paare = new Set();
  for (const tx of transaktionen ?? []) {
    if (istMensch(tx) && tx.kategorie_id) paare.add(paar(tx.kategorie_id, tx.konto_id));
  }
  return paare;
}

// Auf welchen Konten eine Regel im Bestand trifft. Quelle ist `matched_regeln`,
// nicht ein erneuter Matching-Lauf: das Feld haelt fest, was der
// Kategorisierungslauf tatsaechlich getan hat.
export function trefferkonten(transaktionen) {
  const treffer = new Map();
  for (const tx of transaktionen ?? []) {
    for (const regel_id of tx.matched_regeln ?? []) {
      if (!treffer.has(regel_id)) treffer.set(regel_id, new Map());
      const konten = treffer.get(regel_id);
      konten.set(tx.konto_id, (konten.get(tx.konto_id) ?? 0) + 1);
    }
  }
  return treffer;
}

// EINMAL vor einem Lauf bilden, aus demselben Grund wie die Referenzmenge:
// sonst zaehlten die Freigaben des Laufs als ihr eigener Anker.
export function kontoanker(transaktionen) {
  return { paare: ankerpaare(transaktionen), treffer: trefferkonten(transaktionen) };
}

// Gate-Praedikat. Wahr nur fuer die **verliehene** Stufe: die Regel hat auf
// einem anderen von ihr getroffenen Konto einen menschlichen Anker, auf diesem
// nicht. Eine Regel ganz ohne Anker ist damit ausdruecklich nicht betroffen —
// ihre Stufe ruht auf Beleg, Buchungstext oder Recherche (E1/E3/E4) und ist
// kontounabhaengig; sie zu blockieren hiesse, fuer jedes neue Konto den
// Bucket-Dialog wiederherzustellen, den ADR 0025 abgeschafft hat.
export function stufeVerliehen(regel, konto_id, anker) {
  if (!regel?.kategorie_id) return false;
  if (anker.paare.has(paar(regel.kategorie_id, konto_id))) return false;
  const konten = anker.treffer.get(regel.regel_id);
  if (!konten) return false;
  for (const anderes of konten.keys()) {
    if (anker.paare.has(paar(regel.kategorie_id, anderes))) return true;
  }
  return false;
}

// Berichtssicht: jedes (Regel, Konto)-Paar ohne menschlichen Anker. `verliehen`
// trennt die blockierende Ausweitung von der blossen Neuerschliessung, die nur
// zur Kenntnis genommen wird.
export function ungedeckteKonten(regeln, anker) {
  const offen = [];
  for (const regel of regeln ?? []) {
    if (regel.status !== "aktiv") continue;
    const konten = anker.treffer.get(regel.regel_id);
    if (!konten) continue;
    const gedeckt = [...konten.keys()].filter((k) => anker.paare.has(paar(regel.kategorie_id, k))).sort();
    for (const [konto_id, anzahl] of konten) {
      if (anker.paare.has(paar(regel.kategorie_id, konto_id))) continue;
      offen.push({
        regel_id: regel.regel_id, kategorie_id: regel.kategorie_id,
        belegstufe: regel.belegstufe ?? null, konto_id, anzahl,
        gedeckt, verliehen: gedeckt.length > 0,
      });
    }
  }
  // Die verliehene Stufe zuerst: dort hat das Gate gehalten, dort liegt die Arbeit.
  return offen.sort((a, b) => (b.verliehen - a.verliehen) || (b.anzahl - a.anzahl) || a.regel_id.localeCompare(b.regel_id));
}
