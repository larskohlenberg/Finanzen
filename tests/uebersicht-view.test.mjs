import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = { getItem: (key) => (key === "finance-m2-data-mode" ? "demo" : null), setItem: () => {} };
globalThis.window = globalThis;
globalThis.fetch = async (path) => {
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
const { renderMasterdata } = await import("../app/views/stammdaten.mjs");
const { renderAccountPanels } = await import("../app/komponenten.mjs");

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

  const html = renderOverview();
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
  const leer = renderOverview().match(/<section class="panel panel-pad uebersicht-termine"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(leer, /Keine jährliche Zahlung in den nächsten zwölf Monaten/);
  assert.doesNotMatch(leer, /terminleiste/);
});

test("Kontentabelle zeigt belegte Depot- und Kontostaende statt fester 'noch nicht belegt'-Texte", () => {
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
  ];
  state.view = "overview";
  state.lang = "de";

  const html = renderAccountPanels();
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
  const uebersicht = renderOverview();
  const bereich = (id) => uebersicht.match(new RegExp(`<section class="panel panel-pad uebersicht-kachel" aria-labelledby="kachel-${id}">[\\s\\S]*?</section>`))?.[0] ?? "";
  assert.doesNotMatch(uebersicht, /account-table|hero-kpi|Nächste Aktion|copy-next-agent-prompt/);
  assert.match(bereich("liquiditaet"), /data-view="liquiditaet"[\s\S]*Liquidität/);
  assert.match(bereich("liquiditaet"), /<div class="kpi-value">1\.150,00\s€<\/div>[\s\S]*Verfügbares Geld · Stand 10\.6\.2026/);
  assert.match(bereich("vermoegen"), /data-action="vermoegen-tab" data-tab="konten">Konten<\/button>[\s\S]*?1\.150,00/);
  assert.match(bereich("vermoegen"), /data-action="vermoegen-tab" data-tab="konten">Depots<\/button>[\s\S]*?4\.321,09/);
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

  const kachel = renderOverview().match(/<section class="panel panel-pad uebersicht-termine"[\s\S]*?<\/section>/)?.[0] ?? "";
  const spalte = kachel.match(/<h3 class="termine-titel">Fristen<\/h3>[\s\S]*?<\/ul>/)?.[0] ?? "";
  assert.match(kachel, />Fristen<\/text>/);
  assert.equal((kachel.match(/class="terminleiste-marker raute/g) ?? []).length, 4);
  assert.match(spalte, /<li class="ueberfaellig">[\s\S]*Alte Frist[\s\S]*chip danger">überfällig/);
  assert.match(spalte, /<li class="bald">[\s\S]*Dynamik widersprechen[\s\S]*data-action="open-vorsorge" data-vorsorge="VS-901">Testvertrag[\s\S]*in 10 Tagen/);
  assert.match(spalte, /Zinsbindung endet[\s\S]*data-action="select-vermoegen-objekt" data-vermoegen="darlehen:DAR-901">Testdarlehen/);
  assert.match(spalte, /Abrechnung pruefen[\s\S]*data-vermoegen="immobilie:IMM-901">Testhaus/);
  assert.doesNotMatch(spalte, /Erledigt/);
  assert.ok(spalte.indexOf("Alte Frist") < spalte.indexOf("Dynamik widersprechen"), "nach Datum sortiert");

  // Darunter die Kachel Absicherung.
  assert.match(renderOverview(), /uebersicht-termine[\s\S]*<section class="panel panel-pad absicherung-kachel"/);

  data.fristen = [];
  data.darlehen = [];
  const leer = renderOverview().match(/<section class="panel panel-pad uebersicht-termine"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(leer, /Keine Frist in den nächsten zwölf Monaten/);
});
