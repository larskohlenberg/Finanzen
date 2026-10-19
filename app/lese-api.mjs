// app/lese-api.mjs
//
// Schmale Lese-APIs je Ansicht (E1 Schritt 8, nur Node): der App-Server
// rechnet aus dem geparsten Bestand eines Stands (stand.mjs) genau das, was
// eine Ansicht zeigt, mit denselben reinen Rechenmodulen wie bisher der
// Browser. Jede Antwort nennt den Stand, aus dem sie gerechnet ist.
//
//   GET /api/v1/transaktionen?quelle=&<Filter>&sort=&dir=&seite=&groesse=&auswahl=&zeige=&ohneKategorie=&gruppe=
//   GET /api/v1/regelwirkung?quelle=&regel=
//   GET /api/v1/uebersicht?quelle=&heute=
//   GET /api/v1/kopfleiste?quelle=&heute=
//   GET /api/v1/liquiditaet?quelle=&heute=&bis=&granularitaet=
//   GET /api/v1/plan-ist?quelle=&heute=&periode=&granularitaet=
//   GET /api/v1/konten?quelle=&heute=
//   GET /api/v1/vermoegen?quelle=&heute=
//   GET /api/v1/vorsorge?quelle=&heute=
//   GET /api/v1/szenarien?quelle=&heute=
//   GET /api/v1/checks?quelle=&heute=
//   GET /api/v1/belegverweise?quelle=
//   GET /api/v1/importe?quelle=
import { istKalenderdatum } from "./mcp/kennzahlen.mjs";
import { kopfleisteModell } from "./kopfleiste.mjs";
import { kontenModell } from "./konten-modell.mjs";
import { vermoegenModell } from "./vermoegen-modell.mjs";
import { vorsorgeModell } from "./vorsorge-modell.mjs";
import { szenarienModell } from "./szenarien-modell.mjs";
import { checksModell } from "./checks-modell.mjs";
import { buchungsBelege } from "./belege.mjs";
import { GRANULARITAETEN, liquiditaetModell } from "./liquiditaet-modell.mjs";
import { importAbdeckung } from "./klassifikation.mjs";
import { planIstMonate, planIstRechnung, planIstVerlauf } from "./plan-ist-modell.mjs";
import { PERIODE_MUSTER } from "./plan-ist.mjs";
import { addInterval, defaultHorizonEnd, localTodayIso } from "./liquiditaet.mjs";
import { uebersichtModell } from "./uebersicht-modell.mjs";
import { importStandModell } from "./tools/lib/importstand.mjs";
import { KLASSEN } from "./klassifikation.mjs";
import { BETRAG_MUSTER, GRUPPEN, LEERER_FILTER, RICHTUNGEN, SEITENGROESSEN, SORTIERUNGEN, regelWirkungAntwort, transaktionenSeite } from "./transaktionen-abfrage.mjs";

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

// Stichtag der Oberflaeche (Tests setzen ihn fest), sonst heute. Begrenzt auf
// MAX_STICHTAG_JAHRE zurueck und ein Jahr voraus: Verlaeufe laufen monatsweise
// bis zum Stichtag, ein Stichtag im Jahr 9999 blockierte den Server.
export const MAX_STICHTAG_JAHRE = 10;
function heute(suche) {
  const jetzt = localTodayIso();
  const tag = datum(suche, "heute", jetzt);
  if (tag > addInterval(jetzt, "jahr", 1) || tag < addInterval(jetzt, "jahr", -MAX_STICHTAG_JAHRE)) {
    throw new AnfrageFehler(`heute: hoechstens ein Jahr voraus und ${MAX_STICHTAG_JAHRE} Jahre zurueck`);
  }
  return tag;
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
  for (const name of ["betragVon", "betragBis"]) {
    if (filter[name] && !BETRAG_MUSTER.test(filter[name])) throw new AnfrageFehler(`${name}: Betrag ohne Vorzeichen, z. B. 500 oder 12.50`);
  }
  if (filter.klasse && !KLASSEN.includes(filter.klasse)) throw new AnfrageFehler(`klasse: ${KLASSEN.join(", ")}`);
  if (filter.richtung && !RICHTUNGEN.includes(filter.richtung)) throw new AnfrageFehler(`richtung: ${RICHTUNGEN.join(" oder ")}`);
  const gruppe = text(suche, "gruppe");
  if (gruppe && !GRUPPEN.includes(gruppe)) throw new AnfrageFehler(`gruppe: ${GRUPPEN.join(", ")}`);
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
    gruppe,
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
    // Umfang: Importabdeckung je Konto, aus der die Monatsliste folgt.
    const umfang = jeStand(bestand, "import-abdeckung", tag, () => importAbdeckung(bestand.daten, tag));
    return { heute: tag, alle, umfang, r, verlauf };
  },
  konten: (bestand, suche) => {
    const tag = heute(suche);
    return jeStand(bestand, "konten", tag, () => kontenModell(bestand.daten, tag));
  },
  vermoegen: (bestand, suche) => {
    const tag = heute(suche);
    return jeStand(bestand, "vermoegen", tag, () => vermoegenModell(bestand.daten, tag));
  },
  vorsorge: (bestand, suche) => {
    const tag = heute(suche);
    return jeStand(bestand, "vorsorge", tag, () => vorsorgeModell(bestand.daten, tag));
  },
  szenarien: (bestand, suche) => {
    const tag = heute(suche);
    return jeStand(bestand, "szenarien", tag, () => szenarienModell(bestand.daten, tag));
  },
  checks: (bestand, suche) => {
    const tag = heute(suche);
    return jeStand(bestand, "checks", tag, () => checksModell(bestand.daten, tag));
  },
  // Importbericht (1B.5): Auftraege aus dem Stand, wartende Inbox-Dateien mit
  // Pruefsumme liest der Server (nur fuer diese Ansicht, Demo ohne Inbox).
  importe: (bestand, _suche, { wartend = [] }) => importStandModell({ auftraege: bestand.daten.importauftraege ?? [], wartend }),
  // Je Beleg nur Anzahl, Konten und Zeitraum der Buchungen; haengt nur am Stand.
  belegverweise: (bestand) => ({ buchungen: bestand.merke("belegverweise", () => buchungsBelege(bestand.daten)) }),
  kopfleiste: (bestand, suche, { quelle }) => {
    const tag = heute(suche);
    return jeStand(bestand, "kopfleiste", tag, () => kopfleisteModell(wieImBrowser(bestand, quelle), tag));
  },
};

export const LESE_ANSICHTEN = Object.freeze(Object.keys(ANSICHTEN));

// bestand: { stand, daten, validierung, merke } aus erstelleSnapshotQuelle().bestand();
// quelle: "live" oder "demo" (Anfrage mit ?quelle=demo); wartend: Inbox-
// Dateien [{ datei, sha256 }] fuer die Ansicht importe.
export function leseAnsicht(name, bestand, suche, { quelle = "live", wartend = [] } = {}) {
  const rechne = ANSICHTEN[name];
  if (!rechne) return null;
  return { stand: bestand.stand, ...rechne(bestand, suche, { quelle, wartend }) };
}
