// app/ablauf.mjs
// Verbindung von main.js zu den ausgelagerten Teilen (verlauf.mjs, rahmen.mjs,
// aktionen/*): main.js setzt hier beim Start, wie neu gezeichnet, ein Fehler
// gezeigt und der Datenstand geprueft wird. So brauchen die Teile main.js
// nicht zu importieren (kein Kreis).
export const ablauf = {
  render: () => {},
  setUiError: () => {},
  pruefeStand: () => {},
  oeffneSchnellsuche: () => {},
  springeZu: () => {},
};
