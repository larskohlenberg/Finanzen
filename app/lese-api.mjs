// app/lese-api.mjs
//
// Schmale Lese-APIs je Ansicht (E1 Schritt 8, nur Node): der App-Server
// rechnet aus dem geparsten Bestand eines Stands (stand.mjs) genau das, was
// eine Ansicht zeigt, mit denselben reinen Rechenmodulen wie bisher der
// Browser. Jede Antwort nennt den Stand, aus dem sie gerechnet ist.
//
//   GET /api/v1/transaktionen?quelle=&<Filter>&sort=&dir=&seite=&groesse=&auswahl=&zeige=&ohneKategorie=
//   GET /api/v1/regelwirkung?quelle=&regel=
import { LEERER_FILTER, SEITENGROESSEN, SORTIERUNGEN, regelWirkungAntwort, transaktionenSeite } from "./transaktionen-abfrage.mjs";

const MAX_WERT = 300;

export class AnfrageFehler extends Error {}

function text(suche, name) {
  const wert = suche.get(name) ?? "";
  if (wert.length > MAX_WERT) throw new AnfrageFehler(`${name}: zu lang`);
  return wert;
}

function ganzzahl(suche, name, standard) {
  const roh = suche.get(name);
  if (roh === null || roh === "") return standard;
  if (!/^\d{1,9}$/.test(roh)) throw new AnfrageFehler(`${name}: keine Zahl`);
  return Number(roh);
}

export function transaktionenParameter(suche) {
  const filter = {};
  for (const name of Object.keys(LEERER_FILTER)) filter[name] = text(suche, name) || LEERER_FILTER[name];
  const key = text(suche, "sort") || "date";
  if (!SORTIERUNGEN.includes(key)) throw new AnfrageFehler("sort: unbekannt");
  const dir = text(suche, "dir") || "desc";
  if (!["asc", "desc"].includes(dir)) throw new AnfrageFehler("dir: asc oder desc");
  const groesse = ganzzahl(suche, "groesse", 10);
  if (!SEITENGROESSEN.includes(groesse)) throw new AnfrageFehler(`groesse: ${SEITENGROESSEN.join(", ")}`);
  return {
    filter,
    sort: { key, dir },
    seite: ganzzahl(suche, "seite", 1),
    groesse,
    auswahl: text(suche, "auswahl"),
    zeige: text(suche, "zeige"),
    ohneKategorie: text(suche, "ohneKategorie"),
  };
}

const ANSICHTEN = {
  transaktionen: (bestand, suche) => transaktionenSeite(bestand.daten, transaktionenParameter(suche)),
  // Treffer je Regel aendern sich nur mit dem Stand: einmal je Stand zaehlen.
  regelwirkung: (bestand, suche) => {
    const regel = text(suche, "regel");
    if (!regel) return { anzahl: bestand.merke("regelwirkung", () => regelWirkungAntwort(bestand.daten).anzahl), regel: null };
    return regelWirkungAntwort(bestand.daten, { regel });
  },
};

export const LESE_ANSICHTEN = Object.freeze(Object.keys(ANSICHTEN));

// bestand: { stand, daten, merke } aus erstelleSnapshotQuelle().bestand().
export function leseAnsicht(name, bestand, suche) {
  const rechne = ANSICHTEN[name];
  if (!rechne) return null;
  return { stand: bestand.stand, ...rechne(bestand, suche) };
}
