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
const { toggleKlappKachel } = await import("../app/komponenten.mjs");

const LEER = { konten: [], kategorien: [], transaktionen: [], transfers: [], immobilien: [], darlehen: [], vermoegenswerte: [], szenarien: [], regelzahlungen: [], zeitwerte: [] };
const zw = (id, feld, wert, standdatum = "2026-01-01", qualitaet = "belegt") => ({ entitaet: "vorsorge", entitaet_id: id, feld, wert, standdatum, qualitaet });

// Zwei Personen, je Tab mindestens ein Vertrag, ein ungepruefter und ein beendeter.
function fixture() {
  return {
    ...LEER,
    personen: [{ person_id: "PER-001", name: "Lena", status: "aktiv" }, { person_id: "PER-002", name: "Martin", status: "aktiv" }],
    vorsorge: [
      { vorsorge_id: "VS-001", art: "gesetzliche-rente", name: "DRV Lena", person_id: "PER-001", status: "geplant", kapitalbildend: false, leistung_beginn: "2040-04-01", geprueft_am: "2026-08-01" },
      { vorsorge_id: "VS-002", art: "riester", name: "Riester Lena", person_id: "PER-001", status: "aktiv", kapitalbildend: false, kapitalwahl: "offen", leistung_beginn: "2040-02-01", geprueft_am: "2026-08-15", quelle_hinweis: "Standmitteilung 2026", bemerkung: "Kapitalwahl noch offen" },
      { vorsorge_id: "VS-003", art: "lebensversicherung", name: "LV Lena", person_id: "PER-001", status: "aktiv", kapitalbildend: true, leistung_beginn: "2035-05-01", geprueft_am: "2026-08-01" },
      { vorsorge_id: "VS-004", art: "lebensversicherung", name: "LV Martin", person_id: "PER-002", status: "aktiv", kapitalbildend: true },
      { vorsorge_id: "VS-005", art: "schutzversicherung", sparte: "wohngebaeude", name: "Wohngebaeude", person_id: "PER-001", status: "aktiv", kapitalbildend: false, geprueft_am: "2026-10-01" },
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
  const savedState = { view: state.view, vorsorgeTab: state.vorsorgeTab, vorsorgeFilters: state.vorsorgeFilters, selectedVorsorgeId: state.selectedVorsorgeId, klappKacheln: state.klappKacheln };
  const savedPersonen = new Map(personenById);
  try {
    Object.assign(data, fixture(), aenderung);
    personenById.clear();
    for (const p of data.personen) personenById.set(p.person_id, p);
    state.view = "vorsorge";
    state.vorsorgeTab = "uebersicht";
    state.selectedVorsorgeId = "";
    state.klappKacheln = {};
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
    assert.match(html, /class="vertrag-farbe-\d"><title>Gesetzliche Rente/, "Balken je Rente in Vertragsfarbe");
    assert.match(html, /Kapitalleistungen[\s\S]*25\.000,00[\s\S]*fällig 2035/);
    assert.match(html, /Rückkaufswerte im Vermögen[\s\S]*12\.000,00/, "nur kapitalbildende mit Wert, Riester ist gebunden");
    assert.match(html, /1 von 2 kapitalbildenden bewertet/);
    assert.match(html, /230,00[\s\S]*\/ Monat/, "Beitraege Riester + LV Martin");
    assert.match(html, /900,00\s€ \/ Jahr Versicherungen/);
  });
});

test("Kopf besteht aus vier einzelnen Kacheln", () => {
  mitFixture(() => {
    const html = renderVorsorge();
    const kopf = html.slice(html.indexOf("vorsorge-kopf"), html.indexOf("vermoegen-tabs"));
    assert.equal(anzahl(kopf, /<section class="panel panel-pad/g), 4);
  });
});

test("Kopf-Kacheln schluesseln ihre Summen je Vertrag auf", () => {
  mitFixture(() => {
    const html = renderVorsorge();
    const kopf = html.slice(html.indexOf("vorsorge-kopf"), html.indexOf("vermoegen-tabs"));
    const kachel = (titel) => kopf.slice(kopf.indexOf(titel), kopf.indexOf("</section>", kopf.indexOf(titel)));
    const rkw = kachel("Rückkaufswerte im Vermögen");
    assert.match(rkw, /data-vorsorge="VS-003"[^>]*>LV Lena<\/button><span class="amount">12\.000,00/);
    assert.match(rkw, /data-vorsorge="VS-003"[^>]*>LV Lena<\/button><span class="amount">12\.000,00/);
    assert.match(rkw, /data-tab="lebensversicherungen">1 ohne Wert/);
    // Donut der Rueckkaufswerte und Farbpunkte in derselben Vertragsfarbe.
    assert.match(rkw, /class="donut-diagramm"/);
    assert.match(rkw, /class="donut-segment vertrag-farbe-2"><circle[^>]*class="donut-voll"><title>LV Lena: 12\.000,00\s€ \(100 %\)/);
    assert.match(rkw, /<i class="farbpunkt vertrag-farbe-2" aria-hidden="true"><\/i><button[^>]*data-vorsorge="VS-003"/);
    assert.doesNotMatch(rkw, /Riester Lena/, "Riester steht nicht bei den Rueckkaufswerten im Vermoegen");
    // Kapital auf der Zeitachse mit Rentenbeginn, Beitraege als Donut je Bereich.
    assert.match(kachel("Kapitalleistungen"), /class="zeitachse-klein"[\s\S]*class="zeitachse-bezug"[\s\S]*class="zeitachse-marker vertrag-farbe-\d"/);
    assert.match(kachel("Beiträge"), /class="donut-segment tab-farbe-renten"><title>Renten &amp; Anwartschaften pro Jahr: 1\.800,00/);
    assert.match(kachel("Kapitalleistungen"), /LV Lena<\/button><span class="muted">2035<\/span><span class="amount">25\.000,00/);
    const beitraege = kachel("Beiträge");
    assert.match(beitraege, /data-tab="renten">Renten &amp; Anwartschaften<\/button><span class="amount">150,00\s€ \/ Monat/);
    assert.match(beitraege, /data-tab="versicherungen">Versicherungen<\/button><span class="amount">900,00\s€ \/ Jahr/);
  });
});

test("Dokumente stehen als eigene Kachel vor Bemerkung und Wertstaenden", () => {
  mitFixture(() => {
    state.selectedVorsorgeId = "VS-002";
    const html = renderVorsorge();
    const dok = html.indexOf('data-kachel="vorsorge.dokumente"');
    const anhang = html.indexOf('data-kachel="vorsorge.anhang"');
    assert.ok(dok > 0 && anhang > dok, "Dokumente-Kachel steht vor dem Anhang");
  });
});

test("Detail-Kacheln in fester Reihenfolge, Vertragsdaten und Anhang per Default zu", () => {
  mitFixture(() => {
    state.selectedVorsorgeId = "VS-002";
    let html = renderVorsorge();
    const reihenfolge = [...html.matchAll(/data-kachel="vorsorge\.(\w+)"[^>]*aria-expanded="(\w+)"/g)].map((m) => `${m[1]}=${m[2]}`);
    assert.deepEqual(reihenfolge, ["vertragsdaten=false", "dokumente=true", "beitraege=true", "anhang=false"]);
    assert.doesNotMatch(html, /stammdaten-raster/, "zugeklappte Vertragsdaten rendern keinen Inhalt");
    assert.doesNotMatch(html, /Kapitalwahl noch offen/, "Bemerkung bleibt zu");
    toggleKlappKachel("vorsorge.anhang", false);
    toggleKlappKachel("vorsorge.vertragsdaten", false);
    html = renderVorsorge();
    assert.match(html, /data-kachel="vorsorge.vertragsdaten"[^>]*aria-expanded="true"/);
    assert.match(html, /stammdaten-raster/);
    assert.match(html, /vorsorge-spalten vorsorge-spalten-breit"><div><details class="bemerkung" open>[\s\S]*Kapitalwahl noch offen[\s\S]*Wertstände/, "Bemerkung links, Wertstaende rechts");
    // Der Zustand gilt auch fuer den naechsten Vertrag.
    state.selectedVorsorgeId = "VS-001";
    assert.match(renderVorsorge(), /data-kachel="vorsorge.anhang"[^>]*aria-expanded="true"/);
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
    assert.match(html, /<span class="objekt-karte-id">VS-001<\/span>/, "jede Karte zeigt die Objekt-ID");
    assert.match(html, /Details zu<\/span>\s*<h2 class="section-title">DRV Lena<\/h2>/);
    assert.match(html, /class="kennzahl-raster"/);
    assert.match(html, /Anwartschaft/, "gesetzliche Rente hat keinen Rueckkaufswert");
  });
});

test("gewaehlter Vertrag bestimmt den Tab und zeigt Kennzahlen, Vertragsdaten und Anhang", () => {
  mitFixture(() => {
    state.selectedVorsorgeId = "VS-002";
    state.klappKacheln = { "vorsorge.vertragsdaten": true, "vorsorge.anhang": true };
    const html = renderVorsorge();
    assert.match(html, /data-tab="renten">\s*<span class="vermoegen-tab-titel">/);
    assert.match(html, /class="vermoegen-tab active"[^>]*data-tab="renten"/);
    const detail = html.slice(html.indexOf("objekt-detail-titel"));
    assert.match(detail, /Gebundenes Kapital[\s\S]*20\.000,00[\s\S]*nicht im Vermögen[\s\S]*nur bei Kündigung erreichbar/);
    assert.match(detail, /Erwartete Rente[\s\S]*bis zu 30 % als Einmalzahlung möglich/);
    assert.match(detail, /Erwartete Rente[\s\S]*150,00/);
    assert.match(detail, /1\.2\.2040[\s\S]*2 M\. vor der gesetzlichen Rente/);
    assert.match(detail, /150,00[\s\S]*\/ Monat/);
    assert.match(detail, /Vertragsdaten[\s\S]*Kapitalwahl[\s\S]*offen/);
    assert.match(detail, /class="vertragsdaten-mit-logo">[\s\S]*Kapitalwahl[\s\S]*<\/div>\s*<span class="logo-marke kuerzel-farbe-\d" aria-hidden="true">RL<\/span>\s*<\/div>/, "Logo rechts oben in den offenen Vertragsdaten");
    assert.match(detail, /Standmitteilung 2026/);
    assert.match(detail, /data-action="open-regelzahlung" data-regelzahlung="RZ-001"/);
    assert.match(detail, /<details class="bemerkung" open><summary>Bemerkung<\/summary><p>Kapitalwahl noch offen/);
    assert.match(detail, /Wertstände[\s\S]*Gebundenes Kapital \(nicht im Vermögen\) · 31\.12\.2025/);
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
    assert.match(html, /Details zu<\/span>\s*<h2 class="section-title">LV Martin<\/h2>/);
  });
});

test("Versicherung zeigt Jahresbeitrag, naechste Faelligkeit und Vorjahresvergleich aus Buchungen", () => {
  mitFixture(() => {
    state.selectedVorsorgeId = "VS-005";
    const html = renderVorsorge();
    const karte = html.slice(html.indexOf('data-action="select-vorsorge" data-vorsorge="VS-005" aria-pressed'), html.indexOf("</button>", html.indexOf('data-action="select-vorsorge" data-vorsorge="VS-005" aria-pressed')));
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

test("Versicherung mit Immobilienbezug verlinkt das Objekt auf Karte und im Detail", () => {
  mitFixture(() => {
    data.immobilien = [{ immobilie_id: "IMM-001", bezeichnung: "Musterhaus", status: "aktiv" }];
    data.transaktionen = data.transaktionen.map((tx) => ({ ...tx, immobilie_id: "IMM-001" }));
    state.selectedVorsorgeId = "VS-005";
    state.klappKacheln = { "vorsorge.vertragsdaten": true };
    const html = renderVorsorge();
    const start = html.indexOf('data-action="select-vorsorge" data-vorsorge="VS-005" aria-pressed');
    const karte = html.slice(html.lastIndexOf("<div", start), html.indexOf("</div>", start));
    assert.match(karte, /role="button" tabindex="0" data-action="select-vorsorge"/, "Karte ist kein <button>, damit der Link gueltig darin steht");
    assert.match(karte, /Gehört zu <button class="linkish" data-action="select-vermoegen-objekt" data-vermoegen="immobilie:IMM-001"[^>]*>Musterhaus<\/button>/);
    const detail = html.slice(html.indexOf("objekt-detail-titel"));
    assert.match(detail, /Gehört zu[\s\S]*data-vermoegen="immobilie:IMM-001"/);
    // Ohne zugeordnete Buchung kein Bezug.
    state.selectedVorsorgeId = "VS-002";
    assert.doesNotMatch(renderVorsorge().slice(renderVorsorge().indexOf("objekt-detail-titel")), /Gehört zu/);
  });
});

test("Beitragsaenderung erscheint mit Betrag und Prozent in Liste, Buchung und Kennzahl", () => {
  mitFixture(() => {
    state.selectedVorsorgeId = "VS-005";
    const html = renderVorsorge();
    const detail = html.slice(html.indexOf("objekt-detail-titel"));
    assert.match(detail, /Beitragsänderungen[\s\S]*ab 10\.3\.2025[\s\S]*750,00\s€ → 900,00\s€[\s\S]*\+150,00\s€ \(\+20 %\)/);
    assert.match(detail, /Letzte Buchungen[\s\S]*\+150,00\s€ \(\+20 %\)[\s\S]*-900,00/);
    assert.match(detail, /data-action="vorsorge-transactions" data-vorsorge="VS-005">Alle 2 Buchungen anzeigen/);
  });
});

test("kapitalbildende Versicherung zeigt den Rueckkaufswert auf Karte und im Detail", () => {
  mitFixture(() => {
    data.vorsorge = data.vorsorge.map((vs) => vs.vorsorge_id === "VS-005" ? { ...vs, kapitalbildend: true } : vs);
    data.zeitwerte = [...data.zeitwerte, zw("VS-005", "rueckkaufswert", "3000.00", "2026-01-01")];
    state.selectedVorsorgeId = "VS-005";
    const html = renderVorsorge();
    const start = html.indexOf('data-action="select-vorsorge" data-vorsorge="VS-005" aria-pressed');
    const karte = html.slice(start, html.indexOf("</div>", start));
    assert.match(karte, /Rückkaufswert 3\.000,00/);
    assert.match(karte, /kapitalbildend/);
    const kennzahlen = html.slice(html.indexOf("kennzahl-raster"), html.indexOf('data-kachel="vorsorge.vertragsdaten"'));
    assert.match(kennzahlen, /Rückkaufswert[\s\S]*3\.000,00/);
  });
});

test("Rueckkaufswert eines nicht kapitalbildenden Vertrags steht da, aber ausserhalb des Vermoegens", () => {
  mitFixture(() => {
    data.zeitwerte = [...data.zeitwerte, zw("VS-005", "rueckkaufswert", "3000.00", "2026-01-01")];
    state.selectedVorsorgeId = "VS-005";
    state.klappKacheln = { "vorsorge.vertragsdaten": true, "vorsorge.anhang": true };
    const html = renderVorsorge();
    const start = html.indexOf('data-action="select-vorsorge" data-vorsorge="VS-005" aria-pressed');
    assert.match(html.slice(start, html.indexOf("</div>", start)), /Rückkaufswert 3\.000,00\s€ · nicht im Vermögen/);
    const kennzahlen = html.slice(html.indexOf("kennzahl-raster"), html.indexOf('data-kachel="vorsorge.vertragsdaten"'));
    assert.match(kennzahlen, /Rückkaufswert[\s\S]*3\.000,00[\s\S]*nicht im Vermögen/);
    assert.match(html, /3\.000,00\s€<\/strong> <span class="muted">Rückkaufswert \(nicht im Vermögen\)/);
    // Der Kopf zaehlt ihn nicht mit.
    assert.match(html, /Rückkaufswerte im Vermögen[\s\S]*12\.000,00/);
  });
});

test("Versicherungs-Tab: Rangliste der Jahresbeitraege mit Veraenderung zum Vorjahr", () => {
  mitFixture(() => {
    state.vorsorgeTab = "versicherungen";
    let html = renderVorsorge();
    assert.match(html, /data-kachel="vorsorge.ranking"/);
    assert.match(html, /class="panel panel-pad klapp-panel zu vorsorge-ranking-kachel"/, "per Standard zugeklappt");
    assert.doesNotMatch(html, /class="vorsorge-ranking"/);
    state.klappKacheln = { "vorsorge.ranking": true };
    html = renderVorsorge();
    assert.match(html, /class="panel panel-pad klapp-panel\s+vorsorge-ranking-kachel"/, "Abstand zum Kartenraster ueber eigene Klasse");
    const ranking = html.slice(html.indexOf('class="vorsorge-ranking"'), html.indexOf("</ul>", html.indexOf('class="vorsorge-ranking"')));
    assert.equal((ranking.match(/<li>/g) ?? []).length, 1, "nur laufende Vertraege mit Beitrag");
    assert.match(ranking, /data-vorsorge="VS-005"[^>]*><span class="mit-logo"><span class="logo-marke logo-vergleich [^>]*>WO<\/span><span>Wohngebaeude<\/span><\/span><\/button>[\s\S]*width="100\.00"[\s\S]*900,00[\s\S]*class="chip review"[^>]*>\+20 %/);
    assert.match(html, /zusammen 900,00/);
  });
});

test("Lebensversicherung: Fortschritt Rueckkaufswert zur Ablaufleistung und Farbpunkt", () => {
  mitFixture(() => {
    state.vorsorgeTab = "lebensversicherungen";
    const html = renderVorsorge();
    const start = html.indexOf('data-action="select-vorsorge" data-vorsorge="VS-003" aria-pressed');
    const karte = html.slice(start, html.indexOf("</div>", start));
    assert.match(karte, /<strong><i class="farbpunkt vertrag-farbe-\d" aria-hidden="true"><\/i>LV Lena<\/strong><span class="objekt-karte-marke"><span class="chip neutral">Lebensversicherung<\/span><span class="logo-marke kuerzel-farbe-\d" aria-hidden="true">LL<\/span><\/span>/);
    assert.match(karte, /class="fortschritt"[\s\S]*width="48\.000"/, "12.000 von 25.000 = 48 %");
    assert.match(karte, /48 % der garantierten Ablaufleistung als Rückkaufswert/);
    const martin = html.slice(html.indexOf('data-vorsorge="VS-004" aria-pressed'));
    assert.doesNotMatch(martin.slice(0, martin.indexOf("</div>")), /class="fortschritt"/, "ohne Werte kein Fortschritt");
  });
});

test("Karte zeigt die juengste Todesfallleistung, ohne Wert keine Zeile", () => {
  const zeitwerte = [
    ...fixture().zeitwerte,
    zw("VS-003", "todesfallleistung", "40000.00", "2025-12-31"),
    zw("VS-003", "todesfallleistung", "45000.00", "2026-06-30"),
  ];
  mitFixture(() => {
    state.vorsorgeTab = "lebensversicherungen";
    const html = renderVorsorge();
    const karteVon = (id) => {
      const start = html.indexOf(`data-vorsorge="${id}" aria-pressed`);
      return html.slice(start, html.indexOf("</div>", start));
    };
    assert.match(karteVon("VS-003"), /<span class="objekt-karte-zeile">Im Todesfall 45\.000,00\s€<\/span>/);
    assert.doesNotMatch(karteVon("VS-004"), /Im Todesfall/);
  }, { zeitwerte });
});

test("Versicherungen: Sparte als Etikett auf der Kachel und in den Vertragsdaten", () => {
  mitFixture(() => {
    state.vorsorgeTab = "versicherungen";
    state.zeigeBeendete = true;
    state.selectedVorsorgeId = "VS-005";
    state.klappKacheln = { "vorsorge.vertragsdaten": true };
    const html = renderVorsorge();
    const karte = (id) => { const start = html.indexOf(`data-vorsorge="${id}" aria-pressed`); return html.slice(start, html.indexOf("</div>", start)); };
    assert.match(karte("VS-005"), /<span class="objekt-karte-marke"><span class="chip neutral">Wohngebäude<\/span>/);
    assert.doesNotMatch(karte("VS-005"), /Schutzversicherung/, "nicht die Vertragsart");
    assert.doesNotMatch(karte("VS-006"), /class="chip neutral"/, "ohne Sparte kein Etikett");
    assert.match(html, /Sparte[\s\S]{0,120}Wohngebäude/);
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
      { vorsorge_id: "VS-007", art: "riester", name: "Riester Nachfolger", person_id: "PER-001", status: "geplant", kapitalbildend: false, ersetzt_vorsorge_id: "VS-002", geprueft_am: "2026-08-15" },
    ];
    state.selectedVorsorgeId = "VS-002";
    state.klappKacheln = { "vorsorge.vertragsdaten": true };
    const html = renderVorsorge();
    assert.match(html, /Nachfolger[\s\S]*data-action="select-vorsorge" data-vorsorge="VS-007"/);
  });
});

test("Vertragsdaten zeigen die naechsten Fristen des Vertrags", async () => {
  const { addInterval, localTodayIso } = await import("../app/liquiditaet.mjs");
  const bald = addInterval(localTodayIso(), "tag", 20);
  const vorbei = addInterval(localTodayIso(), "tag", -5);
  mitFixture(() => {
    data.fristen = [
      { frist_id: "FR-001", bezeichnung: "Dynamik widersprechen", art: "widerspruch", datum: bald, vorsorge_id: "VS-002" },
      { frist_id: "FR-002", bezeichnung: "Unterlagen nachreichen", art: "wiedervorlage", datum: vorbei, vorsorge_id: "VS-002" },
      { frist_id: "FR-003", bezeichnung: "Anderer Vertrag", art: "kuendigung", datum: bald, vorsorge_id: "VS-003" },
    ];
    state.selectedVorsorgeId = "VS-002";
    state.klappKacheln = { "vorsorge.vertragsdaten": true };
    const html = renderVorsorge();
    assert.match(html, /detail-label">Fristen<[\s\S]*Unterlagen nachreichen <span class="chip review">überfällig<[\s\S]*Dynamik widersprechen/);
    assert.doesNotMatch(html, /Anderer Vertrag/);
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

test("Beitragsdynamik: fuenfte Kennzahl-Kachel, Chip auf der Karte, offener Punkt", async () => {
  const { localTodayIso, addInterval } = await import("../app/liquiditaet.mjs");
  // Termin in 30 Tagen, die beiden Vorjahre abgelehnt: letzte Chance, annehmen.
  const termin = addInterval(localTodayIso(), "tag", 30);
  const jahr = Number(termin.slice(0, 4));
  const dynamik = { termin: termin.slice(5), verlauf: [{ termin: `${jahr - 2}${termin.slice(4)}`, entscheidung: "abgelehnt" }, { termin: `${jahr - 1}${termin.slice(4)}`, entscheidung: "abgelehnt", bemerkung: "Widerspruch per Brief" }] };
  const vorsorge = fixture().vorsorge.map((vs) => (vs.vorsorge_id === "VS-003" ? { ...vs, dynamik } : vs));
  mitFixture(() => {
    assert.match(renderVorsorge(), /Offene Punkte[\s\S]*LV Lena[\s\S]*Dynamik entscheiden/);
    state.selectedVorsorgeId = "VS-003";
    const html = renderVorsorge();
    const raster = html.match(/<div class="kennzahl-raster kennzahl-raster-5">([\s\S]*?)<\/div>\s*<section/)?.[1] ?? "";
    assert.equal(anzahl(raster, /class="kennzahl"/g), 5, "fuenf Kennzahl-Kacheln");
    assert.match(raster, /title="Die letzten 2 wurden abgelehnt\. Ein weiterer Widerspruch beendet das Dynamikrecht\. Erlischt nach 3/);
    assert.match(raster, /Beitragsdynamik<\/div>\s*<div class="kennzahl-wert">Annehmen<\/div>/);
    assert.match(raster, /zum [\d.]+ · nach der Regel <span class="chip review">Letzte Chance<\/span><br>\d{4} ✗ · \d{4} ✗/);
    const kacheln = [...html.matchAll(/data-kachel="vorsorge\.(\w+)"/g)].map((m) => m[1]);
    assert.deepEqual(kacheln, ["vertragsdaten", "dokumente", "beitraege", "anhang"], "keine eigene grosse Dynamik-Kachel");
    assert.match(html, /objekt-karte-chips">[\s\S]*Dynamik annehmen/);
  }, { vorsorge });
});

test("Vertrag ohne Dynamik behaelt vier Kennzahlen", () => {
  mitFixture(() => {
    state.selectedVorsorgeId = "VS-003";
    const html = renderVorsorge();
    assert.match(html, /<div class="kennzahl-raster">/);
    assert.doesNotMatch(html, /kennzahl-raster-5|Beitragsdynamik/);
  });
});

test("Absicherung als Kennzahl-Kachel: Hauptwert, weitere Werte darunter, mit Dynamik sechs Kacheln", () => {
  const zeitwerte = [
    ...fixture().zeitwerte,
    zw("VS-003", "todesfallleistung", "40000.00", "2025-12-31"),
    zw("VS-003", "todesfallleistung", "45000.00", "2026-06-30"),
    zw("VS-003", "bu_rente", "1500.00", "2026-01-01"),
  ];
  mitFixture(() => {
    state.selectedVorsorgeId = "VS-003";
    const html = renderVorsorge();
    const raster = html.match(/<div class="kennzahl-raster kennzahl-raster-5">([\s\S]*?)<\/div>\s*<section/)?.[1] ?? "";
    assert.equal(anzahl(raster, /class="kennzahl"/g), 5, "Absicherung als fuenfte Kachel");
    assert.match(raster, /Absicherung<\/div>\s*<div class="kennzahl-wert">[\s\S]*?1\.500,00\s€<\/span> <span class="betrag-einheit">\/ Monat/);
    assert.match(raster, /BU-Rente · [\s\S]*1\.1\.2026<br>Todesfallleistung 45\.000,00\s€/, "juengster Todesfallwert unter der BU-Rente");
  }, { zeitwerte });

  const termin = "2099-12-01";
  const vorsorge = fixture().vorsorge.map((vs) => (vs.vorsorge_id === "VS-003" ? { ...vs, dynamik: { termin: termin.slice(5), verlauf: [] } } : vs));
  mitFixture(() => {
    state.selectedVorsorgeId = "VS-003";
    const html = renderVorsorge();
    assert.match(html, /<div class="kennzahl-raster kennzahl-raster-6">/);
  }, { zeitwerte, vorsorge });
});

test("Vertragsdaten zeigen die Beitragsbefreiung als Haekchen", () => {
  const vorsorge = fixture().vorsorge.map((vs) => (vs.vorsorge_id === "VS-004" ? { ...vs, beitragsbefreiung: ["bu"] } : vs));
  mitFixture(() => {
    state.selectedVorsorgeId = "VS-004";
    state.klappKacheln = { "vorsorge.vertragsdaten": true };
    const html = renderVorsorge();
    assert.match(html, /Beitragsbefreiung[\s\S]*<input type="checkbox" disabled checked> bei BU<\/label>[\s\S]*<input type="checkbox" disabled> bei Arbeitslosigkeit/);
    // Ohne Beitraege und ohne Feld keine Zeile.
    state.selectedVorsorgeId = "VS-003";
    assert.doesNotMatch(renderVorsorge(), /befreiung-liste/);
  }, { vorsorge });
});

test("Vertrag ohne Absicherungswerte zeigt keine Absicherungs-Kachel", () => {
  mitFixture(() => {
    state.selectedVorsorgeId = "VS-003";
    assert.doesNotMatch(renderVorsorge(), /kennzahl-label">Absicherung/);
  });
});

test("Beitragsdynamik: Widerspruchsfrist aus der Fristenliste in Kennzahl und Karte", async () => {
  const { localTodayIso, addInterval } = await import("../app/liquiditaet.mjs");
  const today = localTodayIso();
  const termin = addInterval(today, "tag", 30);
  const frist = addInterval(today, "tag", 20);
  const jahr = Number(termin.slice(0, 4));
  // Vorjahr angenommen: nach der Regel ablehnen, also widersprechen.
  const dynamik = { termin: termin.slice(5), verlauf: [{ termin: `${jahr - 1}${termin.slice(4)}`, entscheidung: "angenommen" }] };
  const vorsorge = fixture().vorsorge.map((vs) => (vs.vorsorge_id === "VS-003" ? { ...vs, dynamik } : vs));
  const fristen = [{ frist_id: "FR-001", bezeichnung: "Dynamik widersprechen", art: "widerspruch", datum: frist, rhythmus_einheit: "jahr", rhythmus_intervall: 1, vorsorge_id: "VS-003" }];
  mitFixture(() => {
    state.selectedVorsorgeId = "VS-003";
    const html = renderVorsorge();
    assert.match(html, /Beitragsdynamik<\/div>\s*<div class="kennzahl-wert">Widersprechen<\/div>\s*<div class="kennzahl-notiz">bis [\d.]+ · Erhöhung [\d.]+ · nach der Regel<br>\d{4} ✓/);
    assert.match(html, /objekt-karte-chips">[\s\S]*Widerspruch bis/);
    assert.doesNotMatch(html, /Dynamik ablehnen/, "der Widerspruch ersetzt den Entscheidungs-Hinweis");
  }, { vorsorge, fristen });
});

test("Beitraege und Wertentwicklung: Diagramm links, vier Kennzahlen rechts, ohne Wertstand bleibt die alte Kachel", () => {
  const zeitwerte = [
    ...fixture().zeitwerte,
    zw("VS-002", "beitragssumme", "18000.00", "2025-12-31"),
    zw("VS-002", "rueckkaufswert", "19000.00", "2024-12-31"),
    zw("VS-002", "beitragssumme", "16200.00", "2024-12-31"),
  ];
  mitFixture(() => {
    state.selectedVorsorgeId = "VS-002";
    const html = renderVorsorge();
    const kachel = html.slice(html.indexOf("Beiträge und Wertentwicklung"));
    assert.match(kachel, /class="vorsorge-spalten vorsorge-spalten-breit wert-entwicklung">\s*<div>[\s\S]*?class="wert-linie"[\s\S]*?<div class="kennzahl-raster wert-kennzahlen">/, "Diagramm vor den Kennzahlen");
    const raster = kachel.match(/<div class="kennzahl-raster wert-kennzahlen">([\s\S]*?)<\/div>\s*<\/div>\s*<div class="vorsorge-spalten/)?.[1] ?? "";
    assert.equal(anzahl(raster, /class="kennzahl"/g), 4);
    assert.match(raster, /Wert minus Beiträge<\/div>\s*<div class="kennzahl-wert"><span class="">\+2\.000,00\s€/);
    assert.match(raster, /Ertrag 2024–2025<\/div>\s*<div class="kennzahl-wert"><span class="betrag-negativ">-800,00\s€<\/span><\/div>\s*<div class="kennzahl-notiz">Wert \+1\.000,00\s€, Beiträge 1\.800,00\s€/);
    assert.match(kachel, /wert-kennzahlen[\s\S]*Noch keine Beitragsbuchung zugeordnet/, "der Beitragsteil bleibt darunter");

    state.selectedVorsorgeId = "VS-004";
    const ohne = renderVorsorge();
    assert.doesNotMatch(ohne, /wert-entwicklung/);
    assert.match(ohne, /Gebuchte Beiträge/);
  }, { zeitwerte });
});
