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
const vorsorgeView = await import("../app/views/vorsorge.mjs");
const { data, state, personenById } = runtime;
const { renderVorsorge, gebuchteBeitraege, resetVorsorgeFilters } = vorsorgeView;

const LEER = { konten: [], kategorien: [], transaktionen: [], transfers: [], immobilien: [], darlehen: [], vermoegenswerte: [], szenarien: [], regelzahlungen: [], zeitwerte: [] };
const zw = (id, feld, wert, standdatum = "2026-01-01", qualitaet = "belegt") => ({ entitaet: "vorsorge", entitaet_id: id, feld, wert, standdatum, qualitaet });

// Zwei Personen, je Tab mindestens ein Vertrag, ein ungepruefter und ein beendeter.
function fixture() {
  return {
    ...LEER,
    personen: [{ person_id: "PER-001", name: "Lena", status: "aktiv" }, { person_id: "PER-002", name: "Martin", status: "aktiv" }],
    vorsorge: [
      { vorsorge_id: "VS-001", art: "gesetzliche-rente", name: "DRV Lena", person_id: "PER-001", status: "geplant", kapitalbildend: false, leistung_beginn: "2040-04-01", geprueft_am: "2026-08-01" },
      { vorsorge_id: "VS-002", art: "riester", name: "Riester Lena", person_id: "PER-001", status: "aktiv", kapitalbildend: true, kapitalwahl: "offen", leistung_beginn: "2040-02-01", geprueft_am: "2026-08-15", quelle_hinweis: "Standmitteilung 2026", bemerkung: "Kapitalwahl noch offen" },
      { vorsorge_id: "VS-003", art: "lebensversicherung", name: "LV Lena", person_id: "PER-001", status: "aktiv", kapitalbildend: true, leistung_beginn: "2035-05-01", geprueft_am: "2026-08-01" },
      { vorsorge_id: "VS-004", art: "lebensversicherung", name: "LV Martin", person_id: "PER-002", status: "aktiv", kapitalbildend: true },
      { vorsorge_id: "VS-005", art: "schutzversicherung", name: "Wohngebaeude", person_id: "PER-001", status: "aktiv", kapitalbildend: false, geprueft_am: "2026-10-01" },
      { vorsorge_id: "VS-006", art: "schutzversicherung", name: "Alte Haftpflicht", person_id: "PER-002", status: "gekuendigt", kapitalbildend: false, geprueft_am: "2025-01-01" },
    ],
    zeitwerte: [
      zw("VS-001", "erwartete_rente", "2400.00", "2026-08-01", "geschaetzt"),
      zw("VS-002", "erwartete_rente", "150.00", "2026-01-01", "geschaetzt"),
      zw("VS-002", "rueckkaufswert", "20000.00", "2025-12-31"),
      zw("VS-003", "rueckkaufswert", "12000.00", "2026-07-01"),
      zw("VS-003", "erwartete_kapitalleistung", "25000.00", "2026-07-01"),
    ],
    regelzahlungen: [
      { regelzahlung_id: "RZ-001", bezeichnung: "Riester-Beitrag", vorsorge_id: "VS-002", betrag: "-150.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-06-01", status: "bestaetigt" },
      { regelzahlung_id: "RZ-002", bezeichnung: "LV-Beitrag Martin", vorsorge_id: "VS-004", betrag: "-80.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-06-01", status: "bestaetigt" },
      { regelzahlung_id: "RZ-003", bezeichnung: "Wohngebaeude Jahresbeitrag", vorsorge_id: "VS-005", betrag: "-900.00", rhythmus_einheit: "jahr", rhythmus_intervall: 1, anker_datum: "2025-03-10", status: "bestaetigt", konto_id: "KTO-001" },
    ],
    transaktionen: [
      { transaktion_id: "TXN-1", regelzahlung_id: "RZ-003", buchungsdatum: "2024-03-11", betrag: "-750.00", gegenpartei: "Versicherer" },
      { transaktion_id: "TXN-2", regelzahlung_id: "RZ-003", buchungsdatum: "2025-03-10", betrag: "-900.00", gegenpartei: "Versicherer" },
    ],
  };
}

function mitFixture(fn, aenderung = {}) {
  const saved = { ...data };
  const savedState = { view: state.view, vorsorgeTab: state.vorsorgeTab, vorsorgeFilters: state.vorsorgeFilters, selectedVorsorgeId: state.selectedVorsorgeId };
  const savedPersonen = new Map(personenById);
  try {
    Object.assign(data, fixture(), aenderung);
    personenById.clear();
    for (const p of data.personen) personenById.set(p.person_id, p);
    state.view = "vorsorge";
    state.vorsorgeTab = "uebersicht";
    state.selectedVorsorgeId = "";
    resetVorsorgeFilters();
    fn();
  } finally {
    for (const key of Object.keys(data)) delete data[key];
    Object.assign(data, saved);
    Object.assign(state, savedState);
    personenById.clear();
    for (const [k, v] of savedPersonen) personenById.set(k, v);
  }
}

const anzahl = (html, muster) => (html.match(muster) ?? []).length;

test("Kopf zeigt Alterseinkommen, Kapitalleistungen, Rueckkaufswerte und Beitraege", () => {
  mitFixture(() => {
    const html = renderVorsorge();
    assert.match(html, /Erwartetes Alterseinkommen/);
    assert.match(html, /2\.550,00/, "DRV + Riester");
    assert.match(html, /voll ab 1\.4\.2040/);
    assert.match(html, /segment-rente-0/, "Balken je Rente");
    assert.match(html, /Kapitalleistungen[\s\S]*25\.000,00[\s\S]*fällig 2035/);
    assert.match(html, /Rückkaufswerte im Vermögen[\s\S]*32\.000,00/, "nur kapitalbildende mit Wert");
    assert.match(html, /2 von 3 kapitalbildenden bewertet/);
    assert.match(html, /230,00[\s\S]*\/ Monat/, "Beitraege Riester + LV Martin");
    assert.match(html, /900,00\s€ \/ Jahr Versicherungen/);
  });
});

test("Tabs nach Vertragsart mit Anzahl, Kennzahl und Punkt bei offenen Pruefungen", () => {
  mitFixture(() => {
    const html = renderVorsorge();
    assert.equal(anzahl(html, /class="vermoegen-tab /g), 4);
    assert.match(html, /2 Renten &amp; Anwartschaften/);
    assert.match(html, /2\.550\s€ \/ Monat erwartet/);
    assert.match(html, /2 Lebensversicherungen[\s\S]*?12\.000\s€ Rückkaufswert/);
    assert.match(html, /2 Versicherungen[\s\S]*?900\s€ \/ Jahr/);
    // LV Martin ist ungeprueft: Punkt am Lebensversicherungs-Tab.
    assert.match(html, /data-tab="lebensversicherungen">\s*<span class="vermoegen-tab-titel">2 Lebensversicherungen<span class="tab-punkt"/);
    assert.doesNotMatch(html, /layout-with-rail|detail-panel/, "keine Rail mehr");
  });
});

test("Uebersicht: Karten je Tab, Zeitstrahl und offene Punkte", () => {
  mitFixture(() => {
    const html = renderVorsorge();
    assert.equal(anzahl(html, /class="tile klassen-karte"/g), 3);
    assert.match(html, /Leistungen im Zeitverlauf/);
    assert.match(html, /zeitstrahl-linie vorsorge-rente/);
    assert.match(html, /Rente \+2\.550\s€/, "Riester und DRV 2040 in einem Marker");
    assert.match(html, /Kapital 25\.000\s€/);
    assert.match(html, /Offene Punkte[\s\S]*LV Martin[\s\S]*Vorsorge ungeprüft/);
    assert.doesNotMatch(html, /Alte Haftpflicht<\/button>/, "gekuendigte Vertraege erzeugen keinen offenen Punkt");
  });
});

test("Renten-Tab: Karte je Vertrag, erster gewaehlt, Detail in voller Breite", () => {
  mitFixture(() => {
    state.vorsorgeTab = "renten";
    const html = renderVorsorge();
    assert.equal(anzahl(html, /class="objekt-karte /g), 2);
    assert.match(html, /aria-pressed="true"[^>]*>|data-vorsorge="VS-001" aria-pressed="true"/);
    assert.match(html, /Details zu<\/span>\s*<h2 class="section-title">DRV Lena/);
    assert.match(html, /class="kennzahl-raster"/);
    assert.match(html, /Anwartschaft/, "gesetzliche Rente hat keinen Rueckkaufswert");
  });
});

test("gewaehlter Vertrag bestimmt den Tab und zeigt Kennzahlen, Vertragsdaten und Anhang", () => {
  mitFixture(() => {
    state.selectedVorsorgeId = "VS-002";
    const html = renderVorsorge();
    assert.match(html, /data-tab="renten">\s*<span class="vermoegen-tab-titel">/);
    assert.match(html, /class="vermoegen-tab active"[^>]*data-tab="renten"/);
    const detail = html.slice(html.indexOf("objekt-detail-titel"));
    assert.match(detail, /Rückkaufswert[\s\S]*20\.000,00/);
    assert.match(detail, /Erwartete Rente[\s\S]*150,00/);
    assert.match(detail, /1\.2\.2040[\s\S]*2 M\. vor der gesetzlichen Rente/);
    assert.match(detail, /150,00[\s\S]*\/ Monat/);
    assert.match(detail, /Vertragsdaten[\s\S]*Kapitalwahl[\s\S]*offen/);
    assert.match(detail, /Standmitteilung 2026/);
    assert.match(detail, /data-action="open-regelzahlung" data-regelzahlung="RZ-001"/);
    assert.match(detail, /<details class="bemerkung"><summary>Bemerkung<\/summary><p>Kapitalwahl noch offen/);
    assert.match(detail, /Wertstände[\s\S]*Rückkaufswert · 31\.12\.2025/);
    assert.match(detail, /Dokumente/);
  });
});

test("ungepruefte und beendete Vertraege stehen in eigenen Gruppen", () => {
  mitFixture(() => {
    state.vorsorgeTab = "lebensversicherungen";
    let html = renderVorsorge();
    assert.match(html, /Ungeprüft \(1\)[\s\S]*Ungeprüfte Ansprüche werden nicht als sichere Zukunftswerte gerechnet[\s\S]*LV Martin/);
    assert.match(html, /objekt-karte-ungeprueft/);
    assert.match(html, /kein Wert/);

    state.vorsorgeTab = "versicherungen";
    html = renderVorsorge();
    assert.match(html, /Beendet \(1\)[\s\S]*Alte Haftpflicht/);
    assert.match(html, /Gekündigt/);
  });
});

test("Personenfilter erscheint nur bei mehreren Personen im Tab und filtert die Karten", () => {
  mitFixture(() => {
    state.vorsorgeTab = "renten";
    assert.doesNotMatch(renderVorsorge(), /data-action="vorsorge-person"/, "Renten nur von Lena");

    state.vorsorgeTab = "lebensversicherungen";
    let html = renderVorsorge();
    assert.equal(anzahl(html, /data-action="vorsorge-person"/g), 3);
    assert.equal(anzahl(html, /class="objekt-karte /g), 2);
    state.vorsorgeFilters.person = "PER-002";
    html = renderVorsorge();
    assert.equal(anzahl(html, /class="objekt-karte /g), 1);
    assert.match(html, /Details zu<\/span>\s*<h2 class="section-title">LV Martin/);
  });
});

test("Versicherung zeigt Jahresbeitrag, naechste Faelligkeit und Vorjahresvergleich aus Buchungen", () => {
  mitFixture(() => {
    state.selectedVorsorgeId = "VS-005";
    const html = renderVorsorge();
    const karte = html.slice(html.indexOf('data-vorsorge="VS-005"'), html.indexOf("</button>", html.indexOf('data-vorsorge="VS-005"')));
    assert.match(karte, /900,00[\s\S]*\/ Jahr/);
    assert.match(karte, /Vorjahr 750,00\s€ · \+20 %/);
    const detail = html.slice(html.indexOf("objekt-detail-titel"));
    assert.match(detail, /Jahresbeitrag[\s\S]*900,00/);
    assert.match(detail, /Nächste Fälligkeit[\s\S]*10\.3\.20\d\d/);
    assert.match(detail, /Veränderung zum Vorjahr[\s\S]*\+150,00/);
    assert.match(detail, /Gebuchte Beiträge der letzten fünf Jahre/);
    assert.match(detail, /balken-beitrag/);
  });
});

test("gebuchte Beitraege: die fuenf neuesten der eigenen Regelzahlungen", () => {
  mitFixture(() => {
    state.selectedVorsorgeId = "VS-002";
    const monate = ["01", "02", "03", "04", "05", "06"];
    data.transaktionen = [
      ...monate.map((m, i) => ({ transaktion_id: `TXN-${i + 1}`, regelzahlung_id: "RZ-001", buchungsdatum: `2026-${m}-01`, betrag: "-150.00", gegenpartei: "Versicherer" })),
      { transaktion_id: "TXN-X", regelzahlung_id: "RZ-999", buchungsdatum: "2026-07-01", betrag: "-70.00", gegenpartei: "Fremd" },
    ];
    assert.deepEqual(gebuchteBeitraege("VS-002").map((tx) => tx.transaktion_id), ["TXN-6", "TXN-5", "TXN-4", "TXN-3", "TXN-2"]);
    const html = renderVorsorge();
    assert.equal(anzahl(html, /data-action="open-transaction"/g), 5);
    assert.doesNotMatch(html, /TXN-1"|TXN-X/);
  });
});

test("Vorgaenger und Nachfolger sind als Vertragslinks erreichbar", () => {
  mitFixture(() => {
    data.vorsorge = [
      ...data.vorsorge,
      { vorsorge_id: "VS-007", art: "riester", name: "Riester Nachfolger", person_id: "PER-001", status: "geplant", kapitalbildend: true, ersetzt_vorsorge_id: "VS-002", geprueft_am: "2026-08-15" },
    ];
    state.selectedVorsorgeId = "VS-002";
    const html = renderVorsorge();
    assert.match(html, /Nachfolger[\s\S]*data-action="select-vorsorge" data-vorsorge="VS-007"/);
  });
});

test("unbekannte Auswahl faellt auf die Uebersicht zurueck", () => {
  mitFixture(() => {
    state.selectedVorsorgeId = "VS-999";
    const html = renderVorsorge();
    assert.match(html, /class="vermoegen-tab active"[^>]*data-tab="uebersicht"/);
    assert.doesNotMatch(html, /objekt-detail-titel/);
  });
});

test("leerer Bestand rendert ohne Fehler", () => {
  mitFixture(() => {
    const html = renderVorsorge();
    assert.match(html, /Keine erwarteten Renten erfasst/);
    assert.match(html, /Keine Leistung mit Leistungsbeginn erfasst/);
    assert.equal(anzahl(html, /class="vermoegen-tab /g), 1, "nur die Uebersicht");
  }, { vorsorge: [], zeitwerte: [], regelzahlungen: [], transaktionen: [] });
});
