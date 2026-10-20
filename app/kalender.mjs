// app/kalender.mjs
// Datumsauswahl mit Vanilla Calendar Pro (ADR 0039, app/vendor/). Die Seite
// zeichnet nur einen Platzhalter <div data-kalender="name" data-wert="JJJJ-MM-TT">
// in einer eigenen Huelle (der Kalender ueberschreibt Klassen seines Elements);
// nach jedem Zeichnen haengt kalenderAnbinden den Kalender dort ein. Die
// Bibliothek wird erst beim ersten Oeffnen geladen.
let laden = null;
let offen = [];

export async function kalenderAnbinden(wurzel, { sprache = "de", beiWahl }) {
  for (const k of offen) k.destroy();
  offen = [];
  const plaetze = [...wurzel.querySelectorAll("[data-kalender]")];
  if (!plaetze.length) return;
  laden ??= import("./vendor/vanilla-calendar-pro/index.mjs");
  const { Calendar } = await laden;
  for (const platz of plaetze) {
    if (!platz.isConnected) continue;
    const wert = platz.dataset.wert || "";
    const kalender = new Calendar(platz, {
      locale: sprache === "en" ? "en-GB" : "de-DE",
      firstWeekday: 1,
      selectedDates: wert ? [wert] : [],
      ...(wert ? { selectedMonth: Number(wert.slice(5, 7)) - 1, selectedYear: Number(wert.slice(0, 4)) } : {}),
      ...(platz.dataset.min ? { dateMin: platz.dataset.min, displayDateMin: platz.dataset.min } : {}),
      onClickDate(self) {
        const gewaehlt = self.context.selectedDates[0];
        if (gewaehlt) beiWahl(platz.dataset.kalender, gewaehlt);
      },
    });
    kalender.init();
    offen.push(kalender);
  }
}
