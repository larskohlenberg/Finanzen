// app/lese-api.mjs
//
// Schmale Lese-APIs je Ansicht (E1 Schritt 8, nur Node): der App-Server
// rechnet aus dem geparsten Bestand eines Stands (stand.mjs) genau das, was
// eine Ansicht zeigt, mit denselben reinen Rechenmodulen wie bisher der
// Browser. Jede Antwort nennt den Stand, aus dem sie gerechnet ist.
//
//   GET /api/v1/transaktionen?quelle=&<Filter>&sort=&dir=&seite=&groesse=&auswahl=&zeige=&ohneKategorie=
//   GET /api/v1/regelwirkung?quelle=&regel=
//   GET /api/v1/uebersicht?quelle=&heute=
//   GET /api/v1/kopfleiste?quelle=&heute=
//   GET /api/v1/liquiditaet?quelle=&heute=&bis=&granularitaet=
//   GET /api/v1/plan-ist?quelle=&heute=&periode=&granularitaet=
import { istKalenderdatum } from "./mcp/kennzahlen.mjs";
import { kopfleisteModell } from "./kopfleiste.mjs";
import { GRANULARITAETEN, liquiditaetModell } from "./liquiditaet-modell.mjs";
import { planIstMonate, planIstRechnung, planIstVerlauf } from "./plan-ist-modell.mjs";
import { PERIODE_MUSTER } from "./plan-ist.mjs";
import { addInterval, defaultHorizonEnd, localTodayIso } from "./liquiditaet.mjs";
import { uebersichtModell } from "./uebersicht-modell.mjs";
import { LEERER_FILTER, SEITENGROESSEN, SORTIERUNGEN, regelWirkungAntwort, transaktionenSeite } from "./transaktionen-abfrage.mjs";

const MAX_WERT = 300;
export const MAX_HORIZONT_JAHRE = 30;

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

// Datum aus der Anfrage: leer -> standard, sonst ein gueltiges Kalenderdatum.
function datum(suche, name, standard) {
  const wert = text(suche, name);
  if (!wert) return standard;
  if (!istKalenderdatum(wert)) throw new AnfrageFehler(`${name}: gueltiges Datum JJJJ-MM-TT`);
  return wert;
}

// Stichtag der Oberflaeche (Tests setzen ihn fest), sonst heute.
function heute(suche) {
  return datum(suche, "heute", localTodayIso());
}

// Je Stand gemerkt wird nur der heutige Tag; andere Stichtage (Tests, ein
// Browser ueber Mitternacht) werden gerechnet, aber nicht aufgehoben, damit
// der Speicher je Stand begrenzt bleibt.
function jeStand(bestand, name, tag, rechne) {
  return tag === localTodayIso() ? bestand.merke(`${name}:${tag}`, rechne) : rechne();
}

// Der Bestand, wie ihn der Browser kannte: mit Modus, Validator-Befund und
// (leeren) Checks und Importfehlern; next-action.mjs liest daraus.
function wieImBrowser(bestand, quelle) {
  return { ...bestand.daten, metadata: { dataMode: quelle }, validation: bestand.validierung, checks: [], importfehler: [] };
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
  uebersicht: (bestand, suche) => {
    const tag = heute(suche);
    return jeStand(bestand, "uebersicht", tag, () => uebersichtModell(bestand.daten, tag));
  },
  liquiditaet: (bestand, suche) => {
    const granularitaet = text(suche, "granularitaet") || "monat";
    if (!GRANULARITAETEN.includes(granularitaet)) throw new AnfrageFehler(`granularitaet: ${GRANULARITAETEN.join(", ")}`);
    const tag = heute(suche);
    // bis leer: Standardhorizont der Prognose. Hoechstens MAX_HORIZONT_JAHRE
    // voraus: die Prognose rechnet synchron je Termin, ein Horizont im Jahr
    // 9999 blockierte den Server und braeuchte Hunderte MB.
    const bis = datum(suche, "bis", defaultHorizonEnd(tag));
    if (bis > addInterval(tag, "jahr", MAX_HORIZONT_JAHRE)) throw new AnfrageFehler(`bis: hoechstens ${MAX_HORIZONT_JAHRE} Jahre voraus`);
    return liquiditaetModell(bestand.daten, { heute: tag, bis, granularitaet });
  },
  "plan-ist": (bestand, suche) => {
    const granularitaet = text(suche, "granularitaet") || "jahr";
    if (!GRANULARITAETEN.includes(granularitaet)) throw new AnfrageFehler(`granularitaet: ${GRANULARITAETEN.join(", ")}`);
    // Zeitraum wie im MCP-Werkzeug plan_ist: "" ganzer Bestand, 12m, Jahr, Quartal, Monat.
    const periode = text(suche, "periode");
    if (periode && !PERIODE_MUSTER.test(periode)) throw new AnfrageFehler("periode: 12m, JJJJ, JJJJ-Qn oder JJJJ-MM");
    const tag = heute(suche);
    // Gemerkt werden nur wenige Teile je Stand: Monate, Verlauf je
    // Granularitaet (3) und die Rechnung fuer "" und 12m. Andere Zeitraeume
    // werden je Anfrage gerechnet (eine Rechnung, wenige Millisekunden).
    const alle = jeStand(bestand, "plan-ist-monate", tag, () => planIstMonate(bestand.daten, tag));
    const verlauf = jeStand(bestand, `plan-ist-verlauf:${granularitaet}`, tag, () => planIstVerlauf(bestand.daten, alle, granularitaet));
    const rechne = () => planIstRechnung(bestand.daten, alle, periode);
    const r = periode === "" || periode === "12m" ? jeStand(bestand, `plan-ist-rechnung:${periode}`, tag, rechne) : rechne();
    return { heute: tag, alle, r, verlauf };
  },
  kopfleiste: (bestand, suche, { quelle }) => {
    const tag = heute(suche);
    return jeStand(bestand, "kopfleiste", tag, () => kopfleisteModell(wieImBrowser(bestand, quelle), tag));
  },
};

export const LESE_ANSICHTEN = Object.freeze(Object.keys(ANSICHTEN));

// bestand: { stand, daten, validierung, merke } aus erstelleSnapshotQuelle().bestand();
// quelle: "live" oder "demo" (Anfrage mit ?quelle=demo).
export function leseAnsicht(name, bestand, suche, { quelle = "live" } = {}) {
  const rechne = ANSICHTEN[name];
  if (!rechne) return null;
  return { stand: bestand.stand, ...rechne(bestand, suche, { quelle }) };
}
