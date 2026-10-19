// app/lebenszyklus.mjs
// Lebenszyklus der Oberflaeche (rein, ohne DOM):
// - Datenwechsel: neuer Datenstand oder Sitzungssperre. Module mit eigenem
//   Zwischenspeicher (Dokumente, Inbox, Overlays) melden hier einen
//   Aufraeumer an; main.js meldet den Wechsel.
// - Entpreller fuer Eingaben, die eine Server-Anfrage ausloesen.
// - IME: waehrend einer Komposition (z. B. japanische Eingabe) nichts tun.
// - <details>: der vom Nutzer gesetzte Zustand ueberlebt das Neuzeichnen.

const aufraeumer = new Set();

// fn(grund) mit grund "stand" (neuer Datenstand) oder "sperre" (Sitzung
// gesperrt: alles vergessen). Liefert eine Abmeldefunktion.
export function beiDatenwechsel(fn) {
  aufraeumer.add(fn);
  return () => aufraeumer.delete(fn);
}

export function datenwechselMelden(grund) {
  for (const fn of [...aufraeumer]) fn(grund);
}

// Ruft fn erst, wenn ms lang kein weiterer Aufruf kam. sofort() fuehrt einen
// anstehenden Aufruf gleich aus, abbrechen() verwirft ihn.
export function erstelleEntpreller(fn, ms, uhr = globalThis) {
  let timer = null;
  const entpreller = () => {
    if (timer !== null) uhr.clearTimeout(timer);
    timer = uhr.setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
  entpreller.sofort = () => {
    if (timer === null) return;
    uhr.clearTimeout(timer);
    timer = null;
    fn();
  };
  entpreller.ausstehend = () => timer !== null;
  entpreller.abbrechen = () => {
    if (timer !== null) uhr.clearTimeout(timer);
    timer = null;
  };
  return entpreller;
}

// Eingabe-Ereignis verarbeiten? Nicht mitten in einer IME-Komposition; das
// abschliessende compositionend loest die Verarbeitung aus.
export function eingabeBereit(event) {
  return !event?.isComposing;
}

// Zustand der <details> je stabiler id (Muster wie klappKachel): bis zum
// Neuladen der Seite.
const detailsZustand = new Map();

export function merkeDetails(id, offen) {
  if (id) detailsZustand.set(id, Boolean(offen));
}

// Attribute fuer <details${detailsAttr("bereich.teil")}>.
export function detailsAttr(id, standardOffen = false) {
  const offen = detailsZustand.has(id) ? detailsZustand.get(id) : standardOffen;
  return ` data-details="${String(id).replace(/["&<>]/g, "")}"${offen ? " open" : ""}`;
}
