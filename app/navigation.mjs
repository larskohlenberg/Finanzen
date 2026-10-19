// app/navigation.mjs
// Navigationsvertrag der Oberflaeche (rein, ohne DOM):
// - Spruenge in die Buchungsliste setzen immer einen definierten Filterzustand
//   (LEERE_FILTER plus das, was der Sprung meint), nie Reste des vorigen.
// - Ausgewaehlte Filter stehen in der URL (Query hinter der Hash-Route); die
//   Freitextsuche bewusst nicht, damit Suchbegriffe nicht im Verlauf landen.
// - Zurueck: ein anderer Pfad (Seite, Reiter, Detail) ist ein neuer Eintrag im
//   Browserverlauf, eine reine Filteraenderung ersetzt den aktuellen.

export const LEERE_FILTER = Object.freeze({
  account: "",
  status: "",
  category: "",
  transfer: "",
  origin: "",
  search: "",
  beleg: "",
  // VS-ID: nur die Beitragsbuchungen dieses Vorsorgevertrags.
  vorsorge: "",
  timeMode: "none",
  dateFrom: "",
  dateTo: "",
  month: "",
  quarterYear: "",
  quarter: "1",
  year: "",
  // Betrag ohne Vorzeichen in Euro, Richtung einnahme|ausgabe, Regelzahlung (RZ-ID).
  betragVon: "",
  betragBis: "",
  richtung: "",
  regelzahlung: "",
  // Genau diese Gegenpartei (aus den Gruppensummen).
  gegenpartei: "",
  // Klasse der Buchung (klassifikation.mjs), z. B. laufend fuer Einnahmen/Ausgaben.
  klasse: "",
  // Summen je kategorie|monat|gegenpartei ueber der Liste; Darstellung, kein Filter.
  gruppe: "",
});

export const ZEIT_MODI = ["none", "range", "month", "quarter", "year"];

// Sprung in die Buchungsliste: Filter = LEERE_FILTER + filter, Seite 1.
// Mit auswahl wird die Buchung geoeffnet und ihre Seite angesteuert.
export function zuBuchungen(state, { filter = {}, auswahl = "" } = {}) {
  state.view = "transactions";
  state.transactionFilters = { ...LEERE_FILTER, ...filter };
  state.transactionPage = 1;
  state.selectedTransactionId = auswahl;
  state.transactionJumpTo = auswahl;
  state.detailRailClosed = false;
}

// Filtername im Zustand -> Parameter in der URL. Reihenfolge = Reihenfolge in der URL.
const URL_NAMEN = [
  ["account", "konto"],
  ["status", "status"],
  ["category", "kategorie"],
  ["transfer", "transfer"],
  ["origin", "herkunft"],
  ["richtung", "richtung"],
  ["betragVon", "betrag_von"],
  ["betragBis", "betrag_bis"],
  ["regelzahlung", "regelzahlung"],
  ["gegenpartei", "gegenpartei"],
  ["klasse", "klasse"],
  ["gruppe", "gruppe"],
];
// Feste Wertebereiche; andere Werte aus einer von Hand geaenderten URL fallen weg.
const ERLAUBT = {
  status: ["", "offen", "vorgeschlagen", "bestaetigt", "abgelehnt"],
  transfer: ["", "only", "without"],
  origin: ["", "regel", "agent", "manuell"],
  richtung: ["", "einnahme", "ausgabe"],
  gruppe: ["", "kategorie", "monat", "gegenpartei", "regelzahlung"],
  klasse: ["", "laufend", "neutral", "transfer", "startzustand", "investition", "sondereffekt"],
};
// Eurobetrag ohne Vorzeichen (wie BETRAG_MUSTER in transaktionen-abfrage.mjs).
export const BETRAG_MUSTER = /^\d{1,9}([.,]\d{1,2})?$/;
const PFAD_NAMEN = [["beleg", "dokument"], ["vorsorge", "vorsorge"]];
const ZEIT_FELDER = {
  range: [["dateFrom", "von"], ["dateTo", "bis"]],
  month: [["month", "monat"]],
  quarter: [["quarterYear", "quartalsjahr"], ["quarter", "quartal"]],
  year: [["year", "jahr"]],
};
const MUSTER = {
  dateFrom: /^\d{4}-\d{2}-\d{2}$/,
  dateTo: /^\d{4}-\d{2}-\d{2}$/,
  month: /^\d{4}-\d{2}$/,
  quarterYear: /^\d{4}$/,
  quarter: /^[1-4]$/,
  year: /^\d{4}$/,
};

// "?konto=KTO-1&zeit=month&monat=2026-03" oder "" ohne Filter. beleg und
// vorsorge sind sonst Pfadteile der Route (routing.mjs); nur wenn der Pfad
// schon eine Buchung adressiert, kommen sie mit pfadfilter in die Query.
// search bleibt immer draussen.
export function filterAlsQuery(filter, { pfadfilter = false, imPfad = "" } = {}) {
  const suche = new URLSearchParams();
  for (const [name, param] of PFAD_NAMEN) {
    if (filter[name] && (pfadfilter || (imPfad && imPfad !== name))) suche.set(param, filter[name]);
  }
  for (const [name, param] of URL_NAMEN) if (filter[name]) suche.set(param, filter[name]);
  const zeit = ZEIT_FELDER[filter.timeMode];
  if (zeit) {
    suche.set("zeit", filter.timeMode);
    for (const [name, param] of zeit) if (filter[name]) suche.set(param, filter[name]);
  }
  const text = suche.toString();
  return text ? `?${text}` : "";
}

// Gegenstueck: vollstaendiger Filterzustand aus der Query (ohne "?").
// Unbekannte Parameter und ungueltige Zeitangaben fallen weg.
export function filterAusQuery(query) {
  const suche = new URLSearchParams(query ?? "");
  const filter = { ...LEERE_FILTER };
  for (const [name, param] of [...PFAD_NAMEN, ...URL_NAMEN]) {
    const wert = suche.get(param) ?? "";
    const gueltig = ERLAUBT[name] ? ERLAUBT[name].includes(wert) : name.startsWith("betrag") ? !wert || BETRAG_MUSTER.test(wert) : true;
    filter[name] = gueltig ? wert : "";
  }
  const modus = suche.get("zeit");
  if (ZEIT_FELDER[modus]) {
    filter.timeMode = modus;
    for (const [name, param] of ZEIT_FELDER[modus]) {
      const wert = suche.get(param) ?? "";
      if (MUSTER[name].test(wert)) filter[name] = wert;
    }
  }
  return filter;
}

// Aktive, als Chip sichtbare Filter. Die Suche hat ihr eigenes Feld mit
// Loeschknopf; der Zeitfilter zaehlt einmal (Name "zeit").
export function aktiveFilter(filter) {
  const liste = [];
  for (const name of ["beleg", "vorsorge", "regelzahlung", "account", "status", "category", "gegenpartei", "klasse", "transfer", "origin", "richtung"]) {
    if (filter[name]) liste.push({ name, wert: filter[name] });
  }
  if (filter.betragVon || filter.betragBis) liste.push({ name: "betrag", wert: `${filter.betragVon}-${filter.betragBis}` });
  if (zeitfilterAktiv(filter)) liste.push({ name: "zeit", wert: filter.timeMode });
  return liste;
}

export function zeitfilterAktiv(filter) {
  if (filter.timeMode === "range") return Boolean(filter.dateFrom || filter.dateTo);
  if (filter.timeMode === "month") return Boolean(filter.month);
  if (filter.timeMode === "quarter") return Boolean(filter.quarterYear);
  if (filter.timeMode === "year") return Boolean(filter.year);
  return false;
}

// Zeitfilter auf "alle Zeit" zuruecksetzen (Quartal bleibt auf dem Standard).
export function ohneZeitfilter(filter) {
  return { ...filter, timeMode: "none", dateFrom: "", dateTo: "", month: "", quarterYear: "", quarter: "1", year: "" };
}

const pfadVon = (route) => String(route ?? "").split("?")[0];

// true: pushState (anderer Pfad = andere Seite, anderer Reiter, Detail);
// false: replaceState (nur Filter in der Query geaendert oder gar nichts).
export function neuerVerlaufseintrag(alteRoute, neueRoute) {
  return pfadVon(alteRoute) !== pfadVon(neueRoute);
}

// "TX-1 · Transaktionen · Finanzmodell": spezifischster Teil zuerst.
export function seitenTitel(teile, app) {
  return [...teile].reverse().filter(Boolean).concat(app).join(" · ");
}
