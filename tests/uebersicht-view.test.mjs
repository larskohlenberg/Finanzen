import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { apiAbwarten, bestandAntwort } from "./hilfe-bestand.mjs";

// Die Lese-APIs rechnen ueber den Bestand der App (data), den die Tests aendern.
let appDaten = null;

globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = { getItem: (key) => (key === "finance-m2-data-mode" ? "demo" : null), setItem: () => {} };
globalThis.window = globalThis;
globalThis.fetch = async (path) => {
  const bestand = bestandAntwort(path, { daten: appDaten });
  if (bestand) return bestand;
  const cleanPath = String(path).replace(/^\.\//, "").replace(/\?.*$/, "");
  const body = readFileSync(new URL(`../app/${cleanPath}`, import.meta.url), "utf8");
  return {
    ok: true,
    json: async () => JSON.parse(body),
    text: async () => body,
  };
};
await import("../app/i18n.js");

const runtime = await import("../app/runtime.mjs");
const overviewView = await import("../app/views/uebersicht.mjs");
const { data, state } = runtime;
const { renderOverview } = overviewView;
appDaten = data;
const { verwerfeApiCaches } = await import("../app/api-daten.mjs");
// Die Kennzahlen kommen vom Server (GET /api/v1/uebersicht): Bestand geaendert
// -> Antworten verwerfen, zeichnen, auf die Antwort warten, erneut zeichnen.
async function gerenderteUebersicht() {
  verwerfeApiCaches();
  renderOverview();
  await apiAbwarten();
  return renderOverview();
}
const { renderMasterdata } = await import("../app/views/stammdaten.mjs");
const { renderAccountPanels } = await import("../app/komponenten.mjs");
const { kontenAntwort } = await import("../app/views/konten-daten.mjs");
const { heuteIso } = await import("../app/selektoren.mjs");
// Werte der Konten kommen vom Server (GET /api/v1/konten).
async function kontenPanels() {
  verwerfeApiCaches();
  kontenAntwort(heuteIso());
  await apiAbwarten();
  return renderAccountPanels(kontenAntwort(heuteIso()).antwort);
}

test("Termin-Kachel listet jährliche Zahlungen der nächsten zwölf Monate mit Zeitleiste", async () => {
  const { localTodayIso } = await import("../app/liquiditaet.mjs");
  const heute = localTodayIso();
  const [y, m, d] = heute.split("-").map(Number);
  const iso = (dy, dm, dd = d) => new Date(Date.UTC(y + dy, m - 1 + dm, dd)).toISOString().slice(0, 10);
  data.validation = { valid: true, errors: [] };
  data.importfehler = [];
  data.checks = [];
  data.konten = [{ konto_id: "KTO-901", name: "Testgiro", kontotyp: "giro", inhaber_person_ids: [], liquiditaetsrelevant: true, status: "aktiv" }];
  data.transaktionen = [];
  data.transfers = [];
  data.immobilien = [];
  data.darlehen = [];
  data.vermoegenswerte = [];
  data.vorsorge = [];
  data.zeitwerte = [];
  data.fristen = [];
  const basis = { status: "bestaetigt", rhythmus_einheit: "jahr", rhythmus_intervall: 1 };
  data.regelzahlungen = [
    { ...basis, regelzahlung_id: "RZ-901", bezeichnung: "Wohngebäude Jahresbeitrag", betrag: "-480.00", anker_datum: iso(-1, 1, 1), konto_id: "KTO-901" },
    { ...basis, regelzahlung_id: "RZ-902", bezeichnung: "Kfz-Beitrag", betrag: "-150.00", anker_datum: iso(-1, 2, 1), vorsorge_id: "VS-901" },
    { ...basis, regelzahlung_id: "RZ-905", bezeichnung: "Weihnachtsgeld", betrag: "1500.00", anker_datum: iso(-1, 2, 1) },
    { ...basis, regelzahlung_id: "RZ-903", bezeichnung: "Erst im Sommer", betrag: "-50.00", anker_datum: iso(-1, 6, 1) },
    { ...basis, regelzahlung_id: "RZ-904", bezeichnung: "Monatlich", betrag: "-10.00", rhythmus_einheit: "monat", anker_datum: iso(0, -1) },
  ];
  state.view = "overview";
  state.lang = "de";

  const html = (await gerenderteUebersicht());
  const kachel = html.match(/<section class="panel panel-pad uebersicht-termine"[\s\S]*?<\/section>/)?.[0] ?? "";

  assert.doesNotMatch(html, /Checks im Blick/);
  assert.match(kachel, /Termine · nächste zwölf Monate/);
  assert.match(kachel, /Jährliche Zahlungen/);
  assert.match(kachel, /data-action="open-regelzahlung" data-regelzahlung="RZ-901">Wohngebäude Jahresbeitrag/);
  assert.match(kachel, /480,00/);
  assert.match(kachel, /RZ-901[\s\S]*?von Testgiro/);
  // Mit Vorsorgebezug fuehrt der Klick ins Vorsorgeobjekt, sonst zur Regelzahlung.
  assert.match(kachel, /data-action="open-vorsorge" data-vorsorge="VS-901">Kfz-Beitrag[\s\S]*Konto nicht hinterlegt[\s\S]*150,00/);
  assert.doesNotMatch(kachel, /data-regelzahlung="RZ-902"/);
  // Zwoelf Monate: auch der Sommertermin, aber keine Einnahmen und keine Monatsraten.
  assert.match(kachel, /Erst im Sommer/);
  assert.ok(kachel.indexOf("RZ-901") < kachel.indexOf("VS-901") && kachel.indexOf("VS-901") < kachel.indexOf("RZ-903"), "nach Datum sortiert");
  assert.doesNotMatch(kachel, /RZ-904|RZ-905|Weihnachtsgeld|Monatlich/);
  // Zeitleiste mit einem Kreis je Zahlung.
  assert.match(kachel, /<svg class="terminleiste"/);
  assert.equal((kachel.match(/class="terminleiste-marker kreis zahlung"/g) ?? []).length, 3);

  data.regelzahlungen = [];
  const leer = (await gerenderteUebersicht()).match(/<section class="panel panel-pad uebersicht-termine"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(leer, /Keine jährliche Zahlung in den nächsten zwölf Monaten/);
  assert.doesNotMatch(leer, /terminleiste/);
});

test("Kontentabelle zeigt belegte Depot- und Kontostaende statt fester 'noch nicht belegt'-Texte", async (t) => {
  // Feste Uhr: der Depotstand vom 15.9.2026 darf nicht mit dem echten Datum altern.
  state.heute = "2026-10-19";
  t.after(() => { delete state.heute; });
  const personId = data.personen[0]?.person_id ?? "PER-001";
  data.validation = { valid: true, errors: [] };
  data.importfehler = [];
  data.checks = [];
  const basis = { inhaber_person_ids: [personId], liquiditaetsrelevant: true, status: "aktiv", kontoreferenz: "DE00TEST" };
  data.konten = [
    { ...basis, konto_id: "KTO-901", name: "Depot belegt", kontotyp: "depot" },
    { ...basis, konto_id: "KTO-902", name: "Depot ohne Wert", kontotyp: "depot" },
    { ...basis, konto_id: "KTO-903", name: "Giro belegt", kontotyp: "giro" },
    { ...basis, konto_id: "KTO-904", name: "Giro ohne Anker", kontotyp: "giro" },
    { ...basis, konto_id: "KTO-905", name: "Kasse", kontotyp: "bar", liquiditaetsrelevant: false },
    { ...basis, konto_id: "KTO-906", name: "Festgeld", kontotyp: "festgeld", liquiditaetsrelevant: false },
  ];
  data.transaktionen = [
    { transaktion_id: "TXN-T1", konto_id: "KTO-903", buchungsdatum: "2026-05-01", betrag: "-4000.00" },
    { transaktion_id: "TXN-T2", konto_id: "KTO-903", buchungsdatum: "2026-06-10", betrag: "-50.00" },
  ];
  data.transfers = [];
  data.regelzahlungen = [];
  data.immobilien = [];
  data.darlehen = [];
  data.vermoegenswerte = [];
  data.vorsorge = [];
  data.fristen = [];
  data.zeitwerte = [
    { entitaet: "konto", entitaet_id: "KTO-901", feld: "depotwert", standdatum: "2026-09-15", wert: "4321.09", qualitaet: "belegt" },
    { entitaet: "konto", entitaet_id: "KTO-903", feld: "kontostand", standdatum: "2026-06-08", wert: "1200.00", qualitaet: "belegt" },
    { entitaet: "konto", entitaet_id: "KTO-906", feld: "kontostand", standdatum: "2026-06-01", wert: "20000.00", qualitaet: "belegt" },
  ];
  state.view = "overview";
  state.lang = "de";

  const html = await kontenPanels();
  const zeile = (id) => html.match(new RegExp(`<tr[^>]*id="konto-${id}"[\\s\\S]*?</tr>`))[0];

  assert.match(zeile("KTO-901"), /4\.321,09/);
  assert.match(zeile("KTO-901"), /chip success[^"]*"[\s\S]*belegt · 15\.9\.2026/);
  assert.doesNotMatch(zeile("KTO-901"), /veraltet/);
  assert.match(zeile("KTO-901"), /15\.9\.2026/);
  assert.doesNotMatch(zeile("KTO-901"), /noch nicht belegt/);

  assert.match(zeile("KTO-902"), /chip danger[\s\S]*Depotwert noch nicht belegt/);

  assert.match(zeile("KTO-903"), /1\.150,00/);
  assert.doesNotMatch(zeile("KTO-903"), /-4\.050,00|−4\.050,00/);
  assert.match(zeile("KTO-903"), /belegt · 10\.6\.2026 · veraltet/);
  assert.doesNotMatch(html, /Letzte Buchung/);
  assert.doesNotMatch(zeile("KTO-903"), /noch nicht belegt/);

  assert.match(zeile("KTO-904"), /chip danger[\s\S]*Kontostand noch nicht belegt · nicht enthalten/);

  // Summenzeile der Konten (nur KTO-903, KTO-904 ohne Beleg), Depots getrennt summiert.
  assert.doesNotMatch(html, /in der Tabelle/);
  assert.match(html, /<tr class="table-sum"[\s\S]*?Summe Konten = Verfügbares Geld[\s\S]*?1\.150,00/);
  assert.match(html, /<tr class="table-sum"[\s\S]*?Summe Depots[\s\S]*?4\.321,09/);
  assert.doesNotMatch(html, /Summe geladener Bewegungen/);
  assert.match(zeile("KTO-905"), /chip neutral[\s\S]*Bargeld wird nicht bewertet/);

  // Konten, Depots und Weitere als eigene Kacheln mit je eigener Tabelle.
  const kachel = (titel) => html.match(new RegExp(`<section class="panel panel-pad">\\s*<h2 class="section-title">${titel}</h2>[\\s\\S]*?</section>`))?.[0] ?? "";
  assert.match(kachel("Konten"), /KTO-903[\s\S]*Summe Konten = Verfügbares Geld/);
  assert.doesNotMatch(kachel("Konten"), /KTO-901|KTO-905/);
  assert.match(kachel("Depots"), /KTO-901[\s\S]*Summe Depots/);
  assert.doesNotMatch(kachel("Depots"), /KTO-903/);
  assert.match(kachel("Weitere Konten \\(nicht im verfügbaren Geld\\)"), /KTO-905/);
  assert.equal((html.match(/<table class="account-table">/g) ?? []).length, 3);
  assert.doesNotMatch(html, /class="group-row"/);

  // Die Uebersicht zeigt keine Kontentabellen mehr, sondern Bereichskacheln.
  const uebersicht = (await gerenderteUebersicht());
  const bereich = (id) => uebersicht.match(new RegExp(`<section class="panel panel-pad uebersicht-kachel[^"]*" aria-labelledby="kachel-${id}">[\\s\\S]*?</section>`))?.[0] ?? "";
  assert.doesNotMatch(uebersicht, /account-table|hero-kpi|Nächste Aktion|copy-next-agent-prompt/);
  assert.match(bereich("liquiditaet"), /data-view="liquiditaet"[\s\S]*Liquidität/);
  assert.match(bereich("liquiditaet"), /<div class="kpi-value">1\.150\s€<\/div>[\s\S]*Verfügbares Geld · Stand 10\.6\.2026/);
  // Liquiditaet nur als Ist-Stand je Konto, ohne Prognose.
  assert.match(bereich("liquiditaet"), /data-tab="konten">Giro belegt<\/(?:a|button)><span class="amount">1\.150\s€/);
  assert.match(bereich("liquiditaet"), /Giro ohne Anker<\/(?:a|button)><span class="amount"><span class="muted">nicht belegt/);
  assert.doesNotMatch(bereich("liquiditaet"), /diagramm-wrap|Tiefster Stand|In zwölf Monaten/);
  assert.match(bereich("vermoegen"), /data-action="vermoegen-tab" data-tab="konten"[^>]*>Konten<\/(?:a|button)>[\s\S]*?1\.150\s€/);
  assert.match(bereich("vermoegen"), /data-action="vermoegen-tab" data-tab="konten"[^>]*>Depots<\/(?:a|button)>[\s\S]*?4\.321\s€/);
  // Festgeld als eigene Zeile zwischen Konten und Depots, nicht unter Konten.
  assert.match(bereich("vermoegen"), /data-tab="konten"[^>]*>Konten<\/(?:a|button)>[\s\S]*?data-tab="konten"[^>]*>Festgeld<\/(?:a|button)><span class="amount">20\.000\s€[\s\S]*?data-tab="konten"[^>]*>Depots<\/(?:a|button)>/);
  assert.match(bereich("vermoegen"), /segment-festgeld/);
  // Konten, Festgeld und Depots in der Unterkachel "Schnell verfuegbar", zusammen 25.471,09.
  assert.match(bereich("vermoegen"), /uebersicht-kachel-breit/);
  assert.match(bereich("vermoegen"), /Schnell verfügbar<\/h3>\s*<div class="vermoegen-teil-wert">25\.471\s€/);
  assert.match(bereich("vermoegen"), /Langfristig gebunden<\/h3>[\s\S]*Nichts erfasst/);
  assert.match(bereich("vermoegen"), /<svg class="vermoegen-balken"/);
  assert.match(bereich("vorsorge"), /Keine erwarteten Renten erfasst/);

  // Stammdaten: nur Stammdaten, keine Werte, Belegstaende oder Summen.
  state.view = "masterdata";
  state.masterSection = "konten";
  const stamm = renderMasterdata();
  const kontenTabelle = stamm.match(/<table class="master-account-table">[\s\S]*?<\/table>/)?.[0] ?? "";
  for (const id of ["KTO-901", "KTO-902", "KTO-903", "KTO-904", "KTO-905"]) assert.match(kontenTabelle, new RegExp(id));
  assert.match(kontenTabelle, /Liquiditätsrelevant/);
  assert.doesNotMatch(kontenTabelle, /Wert heute|Belegter Stand|table-sum|1\.150,00|noch nicht belegt/);
  assert.match(zeile("KTO-903"), /chip review/);
});

test("Termin-Kachel zeigt Fristen mit Spur, Objekt-Link und Hinweis auf bald und ueberfaellig", async () => {
  const { localTodayIso, addInterval } = await import("../app/liquiditaet.mjs");
  const heute = localTodayIso();
  data.validation = { valid: true, errors: [] };
  data.importfehler = [];
  data.checks = [];
  data.konten = [];
  data.transaktionen = [];
  data.transfers = [];
  data.regelzahlungen = [];
  data.immobilien = [{ immobilie_id: "IMM-901", bezeichnung: "Testhaus", status: "aktiv" }];
  data.darlehen = [{ darlehen_id: "DAR-901", bezeichnung: "Testdarlehen", status: "aktiv", zinsbindung_bis: addInterval(heute, "monat", 5) }];
  data.vermoegenswerte = [];
  data.vorsorge = [{ vorsorge_id: "VS-901", art: "lebensversicherung", name: "Testvertrag", person_id: "PER-001", status: "aktiv", kapitalbildend: true }];
  data.zeitwerte = [];
  data.fristen = [
    { frist_id: "FR-901", bezeichnung: "Dynamik widersprechen", art: "widerspruch", datum: addInterval(heute, "tag", 10), vorsorge_id: "VS-901" },
    { frist_id: "FR-902", bezeichnung: "Alte Frist", art: "sonstiges", datum: addInterval(heute, "tag", -3) },
    { frist_id: "FR-903", bezeichnung: "Abrechnung pruefen", art: "wiedervorlage", datum: addInterval(heute, "monat", 8), immobilie_id: "IMM-901" },
    { frist_id: "FR-904", bezeichnung: "Erledigt", art: "sonstiges", datum: addInterval(heute, "monat", 2), erledigt_bis: addInterval(heute, "monat", 2) },
  ];
  state.view = "overview";
  state.lang = "de";

  const kachel = (await gerenderteUebersicht()).match(/<section class="panel panel-pad uebersicht-termine"[\s\S]*?<\/section>/)?.[0] ?? "";
  // Der Spaltentitel fuehrt auf den Fristen-Reiter der Seite Termine.
  const spalte = kachel.match(/<h3 class="termine-titel"><a class="linkish" href="#\/termine\/fristen" data-action="termine-tab" data-tab="fristen">Fristen<\/a><\/h3>[\s\S]*?<\/ul>/)?.[0] ?? "";
  assert.match(kachel, />Fristen<\/text>/);
  assert.equal((kachel.match(/class="terminleiste-marker raute/g) ?? []).length, 4);
  assert.match(spalte, /<li class="ueberfaellig" data-datum="[^"]+">[\s\S]*Alte Frist[\s\S]*chip danger">überfällig/);
  assert.match(spalte, /<li class="bald" data-datum="[^"]+">[\s\S]*Dynamik widersprechen[\s\S]*data-action="open-vorsorge" data-vorsorge="VS-901">Testvertrag[\s\S]*in 10 Tagen/);
  assert.match(spalte, /Zinsbindung endet[\s\S]*data-action="select-vermoegen-objekt" data-vermoegen="darlehen:DAR-901">Testdarlehen/);
  assert.match(spalte, /Abrechnung pruefen[\s\S]*data-vermoegen="immobilie:IMM-901">Testhaus/);
  assert.doesNotMatch(spalte, /Erledigt/);
  assert.ok(spalte.indexOf("Alte Frist") < spalte.indexOf("Dynamik widersprechen"), "nach Datum sortiert");

  // Darunter die zwei Kacheln Absicherung.
  assert.match((await gerenderteUebersicht()), /uebersicht-termine[\s\S]*<div class="absicherung-kacheln">\s*<section class="panel panel-pad absicherung-kachel"/);

  data.fristen = [];
  data.darlehen = [];
  const leer = (await gerenderteUebersicht()).match(/<section class="panel panel-pad uebersicht-termine"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(leer, /Keine Frist in den nächsten zwölf Monaten/);
});

test("Vermoegenskachel trennt schnell verfuegbar und langfristig, Vorsorge zeigt Rente und Einmalzahlungen", async () => {
  data.validation = { valid: true, errors: [] };
  data.importfehler = [];
  data.checks = [];
  data.konten = [{ konto_id: "KTO-901", name: "Testgiro", kontotyp: "giro", inhaber_person_ids: [], liquiditaetsrelevant: true, status: "aktiv" }];
  data.transaktionen = [];
  data.transfers = [];
  data.regelzahlungen = [];
  data.fristen = [];
  data.immobilien = [
    { immobilie_id: "IMM-901", bezeichnung: "Testhaus", status: "aktiv", eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 1 }] },
    { immobilie_id: "IMM-902", bezeichnung: "Testwohnung", status: "aktiv", eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 1 }] },
  ];
  data.darlehen = [{ darlehen_id: "DAR-901", bezeichnung: "Testdarlehen", status: "aktiv" }];
  data.vermoegenswerte = [];
  data.vorsorge = [
    { vorsorge_id: "VS-901", art: "lebensversicherung", name: "Testvertrag", person_id: "PER-001", status: "aktiv", kapitalbildend: true, beitrag: "-50.00", beitrag_rhythmus: "monat", leistung_beginn: "2040-12-01" },
    { vorsorge_id: "VS-902", art: "rentenversicherung", name: "Testrente", person_id: "PER-001", status: "aktiv", kapitalbildend: true, beitrag: "-50.00", beitrag_rhythmus: "monat", leistung_beginn: "2043-03-01" },
  ];
  data.zeitwerte = [
    { entitaet: "konto", entitaet_id: "KTO-901", feld: "kontostand", standdatum: "2026-09-01", wert: "1000.00", qualitaet: "belegt" },
    { entitaet: "immobilie", entitaet_id: "IMM-901", feld: "marktwert", standdatum: "2026-01-01", wert: "300000.00", qualitaet: "geschaetzt" },
    { entitaet: "immobilie", entitaet_id: "IMM-902", feld: "marktwert", standdatum: "2026-01-01", wert: "50000.00", qualitaet: "geschaetzt" },
    { entitaet: "darlehen", entitaet_id: "DAR-901", feld: "restschuld", standdatum: "2026-09-01", wert: "100000.00", qualitaet: "belegt" },
    { entitaet: "vorsorge", entitaet_id: "VS-901", feld: "erwartete_kapitalleistung", standdatum: "2026-01-01", wert: "150000.00", qualitaet: "belegt" },
    { entitaet: "vorsorge", entitaet_id: "VS-901", feld: "beitragsfreie_kapitalleistung", standdatum: "2026-01-01", wert: "100000.00", qualitaet: "belegt" },
    { entitaet: "vorsorge", entitaet_id: "VS-901", feld: "rueckkaufswert", standdatum: "2026-01-01", wert: "30000.00", qualitaet: "belegt" },
    { entitaet: "vorsorge", entitaet_id: "VS-902", feld: "rueckkaufswert", standdatum: "2026-01-01", wert: "20000.00", qualitaet: "belegt" },
    { entitaet: "vorsorge", entitaet_id: "VS-902", feld: "erwartete_rente", standdatum: "2026-01-01", wert: "100.00", qualitaet: "belegt" },
  ];
  state.view = "overview";
  state.lang = "de";

  const html = (await gerenderteUebersicht());
  const teil = (titel) => html.match(new RegExp(`<h3 class="vermoegen-teil-titel">${titel}</h3>[\\s\\S]*?</ul>`))?.[0] ?? "";
  assert.match(html, /aria-labelledby="kachel-vermoegen">[\s\S]*?<div class="kpi-value">301\.000\s€/);
  assert.match(teil("Schnell verfügbar"), /vermoegen-teil-wert">1\.000\s€[\s\S]*Konten/);
  assert.doesNotMatch(teil("Schnell verfügbar"), /Immobilien|Darlehen/);
  // Langfristig netto: Immobilien minus Darlehen, mit Schuldenbalken.
  // Jede Immobilie eine eigene Zeile, die wertvollste zuerst, keine Sammelzeile.
  assert.match(teil("Langfristig gebunden"), /vermoegen-teil-wert">250\.000\s€[\s\S]*segment-darlehen[\s\S]*data-vklasse="immobilie" data-vid="IMM-901"[^>]*>Testhaus<\/(?:a|button)><span class="amount">300\.000\s€[\s\S]*data-vklasse="immobilie" data-vid="IMM-902"[^>]*>Testwohnung<\/(?:a|button)><span class="amount">50\.000\s€[\s\S]*Darlehen/);
  assert.doesNotMatch(teil("Langfristig gebunden"), />Immobilien</);
  // Lange Namen werden per CSS abgeschnitten; der volle Name steht im Tooltip.
  assert.match(teil("Langfristig gebunden"), /<a class="linkish" href="#\/vermoegen\/immobilien\/IMM-901" data-action="open-vermoegen-entity" data-vklasse="immobilie" data-vid="IMM-901" title="Testhaus">Testhaus<\/a>/);

  const vorsorge = html.match(/aria-labelledby="kachel-vorsorge">[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.doesNotMatch(vorsorge.replace(/<span class="info-tipp"[\s\S]*?<\/span><\/span>/g, ""), /Beiträge|Offene Punkte/);
  // Einmalzahlungen gross, mit Leiste und Zeile je Vertrag, die in den Vertrag fuehrt.
  // Es zaehlt der Wert ohne weitere Beitraege; der bei Weiterzahlung steht nur daneben.
  assert.match(vorsorge, /Einmalzahlungen fällig<\/(?:a|button)><\/h3>\s*<div class="kpi-value">100\.000\s€/);
  assert.match(vorsorge, /info-tipp-text" role="tooltip">Fällig 2040\.[^<]*Werden alle Beiträge bis zum Ablauf gezahlt, sind es 150\.000\s€\./);
  assert.match(vorsorge, /<svg class="vermoegen-balken"[\s\S]*data-titel="Testvertrag: 100\.000,00\s€" data-label="Testvertrag"/);
  assert.match(vorsorge, /data-action="open-vorsorge" data-vorsorge="VS-901">Testvertrag<\/(?:a|button)><span class="kopf-rechts"><span class="kopf-rechts-zeile"><span class="muted">1\.12\.2040<\/span><span class="amount">100\.000\s€<\/span><\/span><span class="muted kopf-unter">\(bei Weiterzahlung 150\.000\s€\)<\/span><\/span><\/li>/);
  // Rueckkaufswerte stehen getrennt unter den beiden Teilen, mit Vermerk, nicht im langfristigen Teil.
  assert.doesNotMatch(teil("Langfristig gebunden"), /Rückkaufswerte/);
  const rueckkauf = html.match(/<div class="vermoegen-teil vermoegen-teil-breit">[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? "";
  assert.match(rueckkauf, /Rückkaufswerte der Versicherungen<\/h3>/);
  assert.match(rueckkauf, /data-action="vorsorge-tab" data-tab="lebensversicherungen"[^>]*>Wird als Kapital ausgezahlt<\/a><span class="muted">ab 2040<\/span>/);
  assert.match(rueckkauf, /vermoegen-teil-wert">50\.000\s€/);
  assert.match(rueckkauf, />Wird als Kapital ausgezahlt<\/a><span class="muted">ab 2040<\/span><span class="amount">30\.000\s€/);
  assert.match(rueckkauf, /segment-vorsorge-rente[\s\S]*data-tab="renten"[^>]*>Wird verrentet<\/a><span class="muted">ab 2043<\/span><span class="amount">20\.000\s€/);
  assert.match(rueckkauf, /Wert bei Kündigung heute\./);
  assert.match(vorsorge, /<h3 class="vermoegen-teil-titel uebersicht-werttitel"><a class="linkish" href="#\/vorsorge\/renten" data-action="vorsorge-tab" data-tab="renten">Monatliche Renten<\/a><\/h3>\s*<div class="kpi-value">/);
});

test("Flache Kacheln oben: monatliche Einnahmen und Ausgaben mit Kategorien und Links in die Buchungen", async () => {
  const { localTodayIso, addInterval } = await import("../app/liquiditaet.mjs");
  const vorMonat = addInterval(`${localTodayIso().slice(0, 7)}-01`, "monat", -1);
  data.validation = { valid: true, errors: [] };
  data.importfehler = [];
  data.checks = [];
  data.konten = [{ konto_id: "KTO-901", name: "Testgiro", kontotyp: "giro", inhaber_person_ids: [], liquiditaetsrelevant: true, status: "aktiv" }];
  data.transfers = [];
  data.regelzahlungen = [];
  data.immobilien = [];
  data.darlehen = [];
  data.vermoegenswerte = [];
  data.vorsorge = [];
  // Kontoauszug bis heute: belegt den Vormonat vollstaendig (Importabdeckung).
  data.zeitwerte = [{ entitaet: "konto", entitaet_id: "KTO-901", feld: "kontostand", wert: "0.00", standdatum: localTodayIso(), qualitaet: "belegt" }];
  data.fristen = [];
  data.kategorien = [
    { kategorie_id: "KAT-001", name: "Gehalt", typ: "einnahme" },
    { kategorie_id: "KAT-003", name: "Wohnen", typ: "ausgabe" },
    { kategorie_id: "KAT-004", name: "Lebensmittel", typ: "ausgabe" },
    { kategorie_id: "KAT-005", name: "Mobilitaet", typ: "ausgabe" },
    { kategorie_id: "KAT-006", name: "Freizeit", typ: "ausgabe" },
    { kategorie_id: "KAT-007", name: "Gesundheit", typ: "ausgabe" },
    { kategorie_id: "KAT-008", name: "Sonstiges", typ: "ausgabe" },
  ];
  const tx = (betrag, kategorie_id) => ({ konto_id: "KTO-901", buchungsdatum: vorMonat, betrag, kategorie_id, ist_transfer: false });
  data.transaktionen = [tx("3000.00", "KAT-001"), tx("-1000.00", "KAT-003"), tx("-400.00", "KAT-004"), tx("-200.00", "KAT-005"), tx("-50.00", "KAT-006"), tx("-30.00", "KAT-007"), tx("-20.00", "KAT-008")];
  state.view = "overview";
  state.lang = "de";

  const html = (await gerenderteUebersicht());
  const kachel = (id) => html.match(new RegExp(`<section class="panel panel-pad uebersicht-flach-kachel" aria-labelledby="kachel-${id}">[\\s\\S]*?</section>`))?.[0] ?? "";
  assert.ok(html.indexOf("uebersicht-flach") < html.indexOf("uebersicht-kacheln"), "ganz oben");
  assert.match(kachel("einnahmen"), /Monatliche Einnahmen[\s\S]*<div class="kpi-value">3\.000\s€ <span class="betrag-einheit">/);
  assert.match(kachel("einnahmen"), /1 Monat · /);
  assert.match(kachel("ausgaben"), /<div class="kpi-value">1\.700\s€/);
  // Bei den Ausgaben die fuenf groessten Kategorien als Link in die Buchungen, der Rest als "Übrige".
  assert.match(kachel("ausgaben"), new RegExp(`data-action="kategorie-transactions" data-kategorie="KAT-003" data-von="${vorMonat}" data-bis="[0-9-]+" title="Wohnen">Wohnen</button>`));
  assert.match(kachel("ausgaben"), /Gesundheit<\/button>[\s\S]*<span>Übrige<\/span><span class="amount">20\s€/);
  // "Übrige" klappt die weiteren Kategorien auf, jede mit Link in die Buchungen.
  assert.match(kachel("ausgaben"), /<details data-details="uebersicht\.uebrige\.ausgaben"><summary>[\s\S]*Übrige[\s\S]*<ul class="flach-unterliste"><li><button class="linkish" data-action="kategorie-transactions" data-kategorie="KAT-008"/);

  // Sparquote: (3000 - 1700) / 3000 = 43 %, Rest bleibt auf den Konten.
  assert.match(kachel("sparquote"), /Sparquote[\s\S]*<div class="kpi-value">43\s%<\/div>[\s\S]*1\.300\s€ \/ Monat übrig/);
  assert.match(kachel("sparquote"), /<summary>[\s\S]*?Konten &amp; Tagesgeld<\/span><span class="amount">1\.300\s€[\s\S]*?data-konto="KTO-901"/);
  assert.match(kachel("sparquote"), /class="info-tipp"[\s\S]*Sparquote = \(Einnahmen − Ausgaben\)/);
  assert.doesNotMatch(kachel("sparquote"), /flach-fuss/);

  data.transaktionen = [];
  assert.doesNotMatch((await gerenderteUebersicht()), /uebersicht-flach/);
});

test("Termine: Eintraege einzeilig, voller Text im Tooltip", async () => {
  data.validation = { valid: true, errors: [] };
  data.vorsorge = [{ vorsorge_id: "VS-901", art: "lebensversicherung", name: "Testvertrag mit langem Namen", person_id: "PER-001", status: "aktiv" }];
  data.fristen = [{ frist_id: "FR-901", bezeichnung: "Dynamik widersprechen", art: "widerspruch", datum: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), vorsorge_id: "VS-901" }];
  state.view = "overview";
  state.lang = "de";
  const html = (await gerenderteUebersicht());
  const termine = html.match(/aria-labelledby="kachel-termine">[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(termine, /<span class="termine-text" title="Dynamik widersprechen · Testvertrag mit langem Namen"><span>Dynamik widersprechen<\/span><span class="muted"><(?:a|button)/);
});

test("Testuhr: Depotstand gilt genau drei Monate nach dem Stand als veraltet (davor, am Tag, danach)", async (t) => {
  t.after(() => { delete state.heute; });
  data.validation = { valid: true, errors: [] };
  data.importfehler = [];
  data.checks = [];
  data.konten = [{ konto_id: "KTO-951", name: "Ruhiges Depot", kontotyp: "depot", inhaber_person_ids: [], liquiditaetsrelevant: true, status: "aktiv" }];
  data.transaktionen = [];
  data.transfers = [];
  data.regelzahlungen = [];
  data.immobilien = [];
  data.darlehen = [];
  data.vermoegenswerte = [];
  data.vorsorge = [];
  data.fristen = [];
  data.zeitwerte = [{ entitaet: "konto", entitaet_id: "KTO-951", feld: "depotwert", standdatum: "2026-09-15", wert: "1000.00", qualitaet: "belegt" }];
  state.view = "overview";
  state.lang = "de";
  const zeile = async (heute) => {
    state.heute = heute;
    return (await kontenPanels()).match(/<tr[^>]*id="konto-KTO-951"[\s\S]*?<\/tr>/)[0];
  };
  assert.doesNotMatch(await zeile("2026-12-14"), /veraltet/);
  assert.match(await zeile("2026-12-15"), /belegt · 15\.9\.2026 · veraltet/);
  assert.match(await zeile("2026-12-16"), /veraltet/);
});
