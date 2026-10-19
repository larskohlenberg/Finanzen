// app/api-daten.mjs
//
// Browser: Antworten der schmalen Lese-APIs (server.mjs, lese-api.mjs) je
// Ansicht. render() bleibt synchron: eine Ansicht fragt ihren Cache mit dem
// Pfad der Anfrage; fehlt die Antwort, startet hier der Abruf und die Ansicht
// zeigt so lange ihre letzte Antwort (oder "laedt"). Ist die Antwort da, wird
// neu gezeichnet. Bei neuem Datenstand verwirft der Stand-Waechter alle Caches
// (verwerfeApiCaches); geholt wird dann nur, was die aktive Ansicht braucht.
// Finanzdaten: fetch mit no-store, nichts im Browser-Speicher.

let neuZeichnen = () => {};
const caches = new Set();

// main.js setzt hier render().
export function beiApiAntwort(fn) {
  neuZeichnen = fn;
}

export function verwerfeApiCaches() {
  for (const cache of caches) cache.verwerfe();
}

async function holeJson(pfad) {
  const antwort = await fetch(pfad, { cache: "no-store" });
  const body = await antwort.json().catch(() => null);
  if (!antwort.ok) throw new Error(`${pfad.split("?")[0]}: HTTP ${antwort.status}${body?.grund ? ` (${body.grund})` : ""}`);
  return body;
}

// Ein Cache je Ansicht. hole(pfad) -> { antwort, laedt, fehler }: antwort ist
// die zum Pfad oder, solange sie laedt, die letzte (veraltet: true).
export function erstelleApiCache({ maxEintraege = 30 } = {}) {
  const eintraege = new Map();
  const laufend = new Map();
  // Fehler je Pfad: kein erneuter Abruf bei jedem render (sonst eine
  // Endlosschleife aus Fehler und Neuzeichnen, auch wenn eine Ansicht zwei
  // Pfade fragt); erneut erst nach verwerfe().
  const fehlerJePfad = new Map();
  let letzte = null;
  let generation = 0;

  function merke(pfad, antwort) {
    eintraege.delete(pfad);
    eintraege.set(pfad, antwort);
    while (eintraege.size > maxEintraege) eintraege.delete(eintraege.keys().next().value);
  }

  const cache = {
    hole(pfad) {
      if (eintraege.has(pfad)) {
        letzte = eintraege.get(pfad);
        return { antwort: letzte, laedt: false, fehler: null, veraltet: false };
      }
      if (fehlerJePfad.has(pfad)) return { antwort: letzte, laedt: false, fehler: fehlerJePfad.get(pfad), veraltet: Boolean(letzte) };
      if (!laufend.has(pfad)) {
        const meineGeneration = generation;
        const abruf = holeJson(pfad)
          .then((antwort) => {
            if (meineGeneration !== generation) return;
            merke(pfad, antwort);
            neuZeichnen();
          })
          .catch((grund) => {
            if (meineGeneration !== generation) return;
            fehlerJePfad.set(pfad, grund);
            neuZeichnen();
          })
          // Nur den eigenen Eintrag austragen: nach verwerfe() kann dort schon
          // der Abruf des neuen Stands stehen.
          .finally(() => {
            if (laufend.get(pfad) === abruf) laufend.delete(pfad);
          });
        laufend.set(pfad, abruf);
      }
      return { antwort: letzte, laedt: true, fehler: null, veraltet: Boolean(letzte) };
    },
    // Dieselbe Antwort unter einem zweiten Pfad, z. B. dem normalisierten
    // (Seite begrenzt, Sprung erledigt), damit der naechste render sie findet.
    merke,
    verwerfe() {
      generation += 1;
      eintraege.clear();
      laufend.clear();
      fehlerJePfad.clear();
    },
    // Fuer den Sitzungsschutz: auch die zuletzt gezeigte Antwort vergessen.
    leere() {
      cache.verwerfe();
      letzte = null;
    },
  };
  caches.add(cache);
  return cache;
}

export function leereApiCaches() {
  for (const cache of caches) cache.leere();
}
