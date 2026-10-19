// app/stand-wechsel.mjs
//
// Haelt die App auf dem Datenstand des Servers, ohne die Seite neu zu laden:
// bei Klick, Navigation oder Rueckkehr in den Tab fragt pruefe() die
// Standkennung ab (billig) und laedt nur bei neuem Stand den Snapshot. Die
// Uebernahme (data ersetzen, neu zeichnen) macht der Aufrufer in uebernehme.
//
// Reine Logik ohne DOM und Timer, damit sie ohne Browser testbar ist.

export const MINDESTABSTAND_MS = 1500;

export function erstelleStandWaechter({ stand, holeStand, holeSnapshot, uebernehme, jetzt = () => Date.now(), abstandMs = MINDESTABSTAND_MS }) {
  let aktuell = stand ?? null;
  let laufend = null;
  let zuletzt = -Infinity;

  async function lauf(erzwingen) {
    zuletzt = jetzt();
    // Erzwungen (Knopf "Daten neu laden"): direkt bedingt laden, 304 = unveraendert.
    if (!erzwingen && (await holeStand()) === aktuell) return false;
    const bundle = await holeSnapshot(aktuell);
    if (!bundle) return false;
    aktuell = bundle.metadata?.stand ?? null;
    uebernehme(bundle);
    return true;
  }

  return {
    get stand() {
      return aktuell;
    },
    // true, wenn ein neuer Stand uebernommen wurde. Laeuft schon eine Pruefung,
    // gilt deren Ergebnis; kurz nach der letzten wird nicht erneut gefragt.
    pruefe({ erzwingen = false } = {}) {
      if (laufend) return laufend;
      if (!erzwingen && jetzt() - zuletzt < abstandMs) return Promise.resolve(false);
      laufend = lauf(erzwingen).finally(() => {
        laufend = null;
      });
      return laufend;
    },
  };
}
