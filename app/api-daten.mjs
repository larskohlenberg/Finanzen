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
  let letzte = null;
  // Fehler zum Pfad: kein erneuter Abruf bei jedem render (sonst eine
  // Endlosschleife aus Fehler und Neuzeichnen); erneut erst nach verwerfe()
  // oder fuer einen anderen Pfad.
  let fehler = null;
  let fehlerPfad = null;
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
      if (fehlerPfad === pfad) return { antwort: letzte, laedt: false, fehler, veraltet: Boolean(letzte) };
      if (!laufend.has(pfad)) {
        const meineGeneration = generation;
        fehler = null;
        fehlerPfad = null;
        laufend.set(pfad, holeJson(pfad)
          .then((antwort) => {
            if (meineGeneration !== generation) return;
            merke(pfad, antwort);
            neuZeichnen();
          })
          .catch((grund) => {
            if (meineGeneration !== generation) return;
            fehler = grund;
            fehlerPfad = pfad;
            neuZeichnen();
          })
          .finally(() => laufend.delete(pfad)));
      }
      return { antwort: letzte, laedt: !fehler, fehler, veraltet: Boolean(letzte) };
    },
    // Dieselbe Antwort unter einem zweiten Pfad, z. B. dem normalisierten
    // (Seite begrenzt, Sprung erledigt), damit der naechste render sie findet.
    merke,
    verwerfe() {
      generation += 1;
      eintraege.clear();
      laufend.clear();
      fehler = null;
      fehlerPfad = null;
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
