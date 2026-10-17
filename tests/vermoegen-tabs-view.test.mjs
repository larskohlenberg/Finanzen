// Vermoegensseite mit Tabs: Kopf, Tab-Leiste und die Grenzfaelle der
// Objekt-Tabs (ohne Anker, ohne Marktwert, abgeloest, keine Sonstigen).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.window = globalThis;
// Belegliste fuer die Dokumente-Kacheln; ohne Antwort bleibt die API aus.
let belegeAntwort = null;
globalThis.fetch = async (pfad) => {
  if (String(pfad).replace(/^\.\//, "").replace(/\?.*$/, "") === "api/belege") {
    return belegeAntwort ? { ok: true, json: async () => belegeAntwort } : { ok: false, status: 404, json: async () => ({}) };
  }
  const body = readFileSync(new URL(`../app/${String(pfad).replace(/^\.\//, "").replace(/\?.*$/, "").replace(/^data\/master\//, "data/demo/")}`, import.meta.url), "utf8");
  return { ok: true, json: async () => JSON.parse(body), text: async () => body };
};
await import("../app/i18n.js");
const { data, state } = await import("../app/runtime.mjs");
const { renderVermoegen } = await import("../app/views/vermoegen.mjs");
const { ladeBelege } = await import("../app/views/belege.mjs");

const FELDER = ["konten", "immobilien", "vermoegenswerte", "darlehen", "vorsorge", "zeitwerte", "transaktionen", "regelzahlungen", "fristen"];

function mitDaten(teil, zustand, pruefe) {
  const vorher = Object.fromEntries(FELDER.map((f) => [f, data[f]]));
  const stateVorher = { ...state };
  try {
    Object.assign(data, Object.fromEntries(FELDER.map((f) => [f, []])), teil);
    Object.assign(state, { lang: "de", vermoegenTab: "uebersicht", selectedVermoegenId: "", vermoegenRailMode: "position", vermoegenDetailRailClosed: false, immobilieOhneRate: false }, zustand);
    pruefe(renderVermoegen());
  } finally {
    Object.assign(data, vorher);
    Object.assign(state, stateVorher);
  }
}

const darlehen = (id, extra = {}) => ({
  darlehen_id: id, bezeichnung: `Darlehen ${id}`, status: "aktiv", anfangsbetrag: "100000.00", anfangsdatum: "2020-01-31",
  zinssatz: "2.00", sollrate: "800.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, laufzeit_bis: "2035-01-31", ...extra,
});

test("Tab-Leiste: vier Tabs, Vorsorge nur als Verweis, Sonstige nur mit aktiven Werten", () => {
  mitDaten({}, {}, (html) => {
    for (const tab of ["uebersicht", "konten", "immobilien", "darlehen"]) assert.match(html, new RegExp(`data-tab="${tab}"`));
    assert.doesNotMatch(html, /data-tab="vorsorge"/);
    assert.match(html, /class="vermoegen-tab vermoegen-tab-verweis" data-view="vorsorge"/);
    assert.doesNotMatch(html, /data-tab="sonstige"/);
  });
  mitDaten({ vermoegenswerte: [{ vermoegenswert_id: "VMW-001", bezeichnung: "Gold", typ: "edelmetall", status: "aktiv", eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 1 }] }] }, {}, (html) => {
    assert.match(html, /data-tab="sonstige"/);
  });
});

test("Sonstiger Vermoegenswert: Detail zeigt den Dokumentbereich", () => {
  const vmw = { vermoegenswert_id: "VMW-001", bezeichnung: "Gold", typ: "edelmetall", status: "aktiv", eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 1 }] };
  mitDaten({ vermoegenswerte: [vmw] }, { vermoegenTab: "sonstige", selectedVermoegenId: "vermoegenswert:VMW-001" }, (html) => {
    assert.match(html, /<div class="detail-label">Dokumente<\/div>/);
  });
});

test("Ohne Datenqualitaets-Kachel; offener Punkt an Tab und in den offenen Punkten", () => {
  mitDaten({ darlehen: [darlehen("DAR-001")] }, {}, (html) => {
    assert.match(html, /data-tab="darlehen">\s*<span class="vermoegen-tab-titel">1 Darlehen<span class="tab-punkt"/);
    assert.match(html, /<span class="vermoegen-tab-titel">0 Immobilien<\/span>\s*<span class="vermoegen-tab-unter">0,00\s€<\/span>/);
    assert.match(html, /Offene Punkte[\s\S]*?data-vermoegen="darlehen:DAR-001"/);
    assert.doesNotMatch(html, /klassen-karte/, "keine Klassenkarten mehr");
    assert.doesNotMatch(html, /Datenqualität|luecken-liste/);
  });
});

test("Uebersicht: Tabs oben, Nettovermoegen und Restschuld nebeneinander, darunter Konten und Werte", () => {
  const zw = (entitaet, id, feld, wert, standdatum) => ({ entitaet, entitaet_id: id, feld, wert, standdatum, qualitaet: "belegt" });
  const teil = {
    konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", status: "aktiv", liquiditaetsrelevant: true, inhaber_person_ids: [] }],
    darlehen: [darlehen("DAR-001")],
    transaktionen: [{ transaktion_id: "TXN-1", konto_id: "KTO-001", buchungsdatum: "2025-01-15", betrag: "-50.00" }],
    zeitwerte: [zw("konto", "KTO-001", "kontostand", "1000.00", "2025-01-01"), zw("darlehen", "DAR-001", "restschuld", "50000.00", "2025-01-31")],
  };
  mitDaten(teil, {}, (html) => {
    const tabs = html.indexOf("vermoegen-tabs");
    const oben = html.slice(html.indexOf("kachel-paare-oben"), html.indexOf('<div class="kachel-paare">'));
    assert.ok(tabs > 0 && html.indexOf("kachel-paare-oben") > tabs, "Kennzahlen erst nach den Tabs");
    assert.match(oben, /Nettovermögen[\s\S]*zeitstrahl-linie vermoegen-netto-linie[\s\S]*Restschuld der Darlehen[\s\S]*zeitstrahl-linie vermoegen-restschuld-linie/);
    assert.match(oben, /schuldenfrei 20\d\d/);
    assert.match(oben, /data-vermoegen="darlehen:DAR-001"[^>]*>Darlehen DAR-001<\/button><span class="muted">getilgt 20\d\d/);
    const unten = html.slice(html.indexOf('<div class="kachel-paare">'));
    assert.match(unten, /Konten &amp; Depots[\s\S]*class="donut-diagramm"[\s\S]*data-vermoegen="konto:KTO-001"/);
    assert.match(unten, /Immobilien und weitere Werte/);
  });
});

test("Uebersicht: Wertstaende als filter- und sortierbare Tabelle, keine Rail", () => {
  const zw = (id, wert, standdatum, qualitaet) => ({ entitaet: "darlehen", entitaet_id: id, feld: "restschuld", wert, standdatum, qualitaet });
  const teil = { darlehen: [darlehen("DAR-001"), darlehen("DAR-002")], zeitwerte: [zw("DAR-001", "1000.00", "2025-01-31", "belegt"), zw("DAR-002", "2000.00", "2026-01-31", "geschaetzt")] };
  // Per Standard zu: nur der Kopf mit Anker, keine Tabelle.
  mitDaten(teil, { klappKacheln: {} }, (html) => {
    assert.match(html, /id="vermoegen-wertstaende"/);
    assert.match(html, /data-kachel="vermoegen.wertstaende" data-standard="false" aria-expanded="false"/);
    assert.doesNotMatch(html, /data-wertstaende-sort/);
  });
  mitDaten(teil, { klappKacheln: { "vermoegen.wertstaende": true } }, (html) => {
    assert.match(html, /id="vermoegen-wertstaende"/);
    assert.match(html, /data-wertstaende-sort="wert"/);
    assert.match(html, /data-wertstaende-filter="klasse"/);
    assert.doesNotMatch(html.slice(html.indexOf('id="vermoegen-wertstaende"')), /Rohquelle|Quelle<\/th>/);
    assert.doesNotMatch(html, /layout-with-rail/);
    assert.ok(html.indexOf("DAR-002</span>") < html.indexOf("DAR-001</span>"), "neuester Stand zuerst");
  });
  mitDaten(teil, { klappKacheln: { "vermoegen.wertstaende": true }, wertstaendeSort: { key: "wert", dir: "asc" }, wertstaendeFilters: { search: "", klasse: "", qualitaet: "" } }, (html) => {
    assert.ok(html.indexOf("DAR-001</span>") < html.indexOf("DAR-002</span>"));
  });
  mitDaten(teil, { klappKacheln: { "vermoegen.wertstaende": true }, wertstaendeFilters: { search: "", klasse: "", qualitaet: "belegt" } }, (html) => {
    assert.match(html, /1 von 2 Treffer/);
    assert.doesNotMatch(html, /DAR-002<\/span>/);
  });
});

test("Darlehen ohne Anker: Karte und Detail melden es, kein Absturz; abgeloeste fehlen", () => {
  mitDaten({ darlehen: [darlehen("DAR-001"), darlehen("DAR-002", { status: "abgeloest" })] }, { vermoegenTab: "darlehen", selectedVermoegenId: "darlehen:DAR-002" }, (html) => {
    assert.match(html, /Kein belegter Restschuldstand/);
    assert.match(html, /data-vermoegen="darlehen:DAR-001"/);
    assert.doesNotMatch(html, /data-vermoegen="darlehen:DAR-002"/);
    assert.match(html, /objekt-karte active[^>]*data-vermoegen="darlehen:DAR-001"/);
    assert.match(html, /<span class="objekt-karte-id">DAR-001<\/span>/, "jede Karte zeigt die Objekt-ID");
  });
});

test("Darlehen mit Anker: Verlauf, Zins/Tilgung und Rest zum Zinsbindungsende", () => {
  const anker = { entitaet: "darlehen", entitaet_id: "DAR-001", feld: "restschuld", wert: "80000.00", standdatum: "2025-01-31", qualitaet: "belegt" };
  mitDaten({ darlehen: [darlehen("DAR-001", { zinsbindung_bis: "2099-01-31" })], zeitwerte: [anker] }, { vermoegenTab: "darlehen" }, (html) => {
    assert.match(html, /class="restschuld-ist"/);
    assert.match(html, /class="balken-tilgung/);
    assert.match(html, /Rest zum Zinsbindungsende/);
    // Detailtitel, Kennzahlen ueber, Stammdaten unter den Diagrammen, Anhang zuletzt.
    const detail = html.slice(html.indexOf("objekt-detail-titel"));
    assert.ok(detail.indexOf("Kennzahlen") < detail.indexOf("restschuld-ist"));
    assert.ok(detail.indexOf("restschuld-ist") < detail.indexOf("Stammdaten"));
    assert.ok(detail.indexOf("Stammdaten") < detail.indexOf("objekt-anhang"));
    assert.match(html, /class="detail-zweispaltig"/);
    assert.doesNotMatch(html, /Belegter Anker|Zinsen seit Anker/);
  });
});

test("Immobilie ohne Marktwert, Darlehen und Buchungen: Striche statt Zahlen", () => {
  const imm = { immobilie_id: "IMM-001", bezeichnung: "Haus", status: "aktiv", nutzung: "vermietet", wohnflaeche: "120.00", eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 1 }] };
  mitDaten({ immobilien: [imm, { ...imm, immobilie_id: "IMM-002", bezeichnung: "Verkauft", status: "verkauft" }] }, { vermoegenTab: "immobilien" }, (html) => {
    assert.match(html, /Keine zugeordneten Buchungen/);
    assert.match(html, /schuldenfrei/);
    assert.match(html, /vermietet/);
    assert.match(html, /120 m²/);
    assert.doesNotMatch(html, /data-vermoegen="immobilie:IMM-002"/);
  });
});

test("Immobilie: Stammdaten immer mit acht Feldern, Darlehen als Links nebeneinander", () => {
  const stammdatenFelder = (html) => {
    const block = html.slice(html.indexOf("stammdaten-raster"), html.indexOf("immobilie.monate"));
    return [...block.matchAll(/class="detail-label">([^<]*)</g)].map((m) => m[1]);
  };
  const duenn = { immobilie_id: "IMM-001", bezeichnung: "Haus", status: "aktiv", adresse: "Musterweg 1" };
  mitDaten({ immobilien: [duenn] }, { vermoegenTab: "immobilien" }, (html) => {
    assert.deepEqual(stammdatenFelder(html), ["Adresse", "Nutzung", "Wohnfläche", "Eigentumsanteile", "Angeschafft", "Anschaffungskosten", "Wertänderung", "Darlehen"]);
    assert.match(html, /stammdaten-raster stammdaten-fest/);
    assert.match(html, /class="detail-value leer">–</);
  });
  const voll = { ...duenn, anschaffungsdatum: "2020-01-15", anschaffungskosten: "300000.00" };
  const d1 = darlehen("DAR-001", { immobilie_id: "IMM-001", bezeichnung: "Erstes Darlehen mit langem Namen" });
  const d2 = darlehen("DAR-002", { immobilie_id: "IMM-001", bezeichnung: "Zweites Darlehen" });
  mitDaten({ immobilien: [voll], darlehen: [d1, d2] }, { vermoegenTab: "immobilien" }, (html) => {
    assert.equal(stammdatenFelder(html).length, 8);
    assert.match(html, />15\.1\.2020</);
    assert.match(html, /300\.000,00/);
    assert.match(html, /class="darlehen-links"><button[^]*?<\/button><span class="darlehen-trenner" aria-hidden="true">·<\/span><button/);
    assert.match(html, /class="linkish darlehen-link"[^>]*data-vermoegen="darlehen:DAR-001"[^>]*title="Erstes Darlehen mit langem Namen"/);
    assert.doesNotMatch(html, /<br><button class="linkish"/);
  });
});

test("Immobilie und Darlehen zeigen ihre Fristen unter den Stammdaten", async () => {
  const { addInterval, localTodayIso } = await import("../app/liquiditaet.mjs");
  const bald = addInterval(localTodayIso(), "monat", 2);
  const imm = { immobilie_id: "IMM-001", bezeichnung: "Haus", status: "aktiv", adresse: "Musterweg 1" };
  const fristen = [{ frist_id: "FR-001", bezeichnung: "Grundsteuer pruefen", art: "wiedervorlage", datum: bald, immobilie_id: "IMM-001" }];
  mitDaten({ immobilien: [imm], fristen }, { vermoegenTab: "immobilien" }, (html) => {
    assert.match(html, /detail-label">Fristen<\/div>\s*<div class="detail-value"><div>[^<]* · Grundsteuer pruefen<\/div>/);
  });
  const d = darlehen("DAR-001", { zinsbindung_bis: bald });
  mitDaten({ darlehen: [d] }, { vermoegenTab: "darlehen" }, (html) => {
    assert.match(html, /detail-label">Fristen<[\s\S]*Zinsbindung endet/);
  });
  mitDaten({ immobilien: [imm] }, { vermoegenTab: "immobilien" }, (html) => {
    assert.doesNotMatch(html, /detail-label">Fristen</);
  });
});

test("Immobilie: Monatstabelle und Umschalter ohne Darlehensrate", () => {
  const imm = { immobilie_id: "IMM-001", bezeichnung: "Haus", status: "aktiv", eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 1 }] };
  const monat = new Date().toISOString().slice(0, 7);
  const vormonat = new Date(Date.UTC(Number(monat.slice(0, 4)), Number(monat.slice(5, 7)) - 2, 15)).toISOString().slice(0, 10);
  const teil = {
    immobilien: [imm],
    darlehen: [darlehen("DAR-001", { immobilie_id: "IMM-001" })],
    regelzahlungen: [{ regelzahlung_id: "RZ-001", darlehen_id: "DAR-001", kategorie_id: "KAT-012" }],
    transaktionen: [
      { transaktion_id: "T1", konto_id: "KTO-001", immobilie_id: "IMM-001", buchungsdatum: vormonat, betrag: "-800.00", kategorie_id: "KAT-012" },
      { transaktion_id: "T2", konto_id: "KTO-001", immobilie_id: "IMM-001", buchungsdatum: vormonat, betrag: "-50.00", kategorie_id: "KAT-003" },
    ],
  };
  mitDaten(teil, { vermoegenTab: "immobilien" }, (html) => {
    assert.match(html, /data-action="immobilie-rate" data-rate="ohne"/);
    assert.match(html, /class="monats-tabelle"/);
    assert.match(html, /-850,00/);
    // Stammdaten ueber Diagramm und Tabelle, Wertstaende und Dokumente darunter.
    assert.ok(html.indexOf("objekt-detail-titel") < html.indexOf("stammdaten-raster"));
    assert.ok(html.indexOf("stammdaten-raster") < html.indexOf("monats-tabelle"));
    // Karte nur Auswahl: keine Kennzahl-Zeilen mehr.
    assert.doesNotMatch(html, /objekt-karte-zeile/);
    // Betraege springen in die gefilterten Transaktionen.
    assert.match(html, /data-action="immobilie-transactions" data-immobilie="IMM-001" data-monat="\d{4}-\d{2}" data-kategorie="KAT-012"/);
    assert.match(html, /data-action="immobilie-transactions" data-immobilie="IMM-001" data-von="\d{4}-\d{2}-01" data-bis="\d{4}-\d{2}-31"/);
    assert.ok(html.indexOf("monats-tabelle") < html.indexOf("objekt-anhang"));
    assert.match(html, /data-spalten="/);
  });
  mitDaten(teil, { vermoegenTab: "immobilien", immobilieOhneRate: true }, (html) => {
    const tabelle = html.slice(html.indexOf('class="monats-tabelle"'));
    assert.doesNotMatch(tabelle, /-850,00/);
    assert.match(tabelle, /-50,00/);
    assert.match(html, /Tilgung baut Vermögen auf/);
  });
});

test("Kein style-Attribut im HTML: die CSP der App wuerde es blockieren", () => {
  const anker = { entitaet: "darlehen", entitaet_id: "DAR-001", feld: "restschuld", wert: "80000.00", standdatum: "2025-01-31", qualitaet: "belegt" };
  for (const vermoegenTab of ["uebersicht", "konten", "immobilien", "darlehen"]) {
    mitDaten({ darlehen: [darlehen("DAR-001")], zeitwerte: [anker] }, { vermoegenTab }, (html) => {
      assert.doesNotMatch(html, /\sstyle="/, vermoegenTab);
    });
  }
});

test("Immobilie: Einnahmen und Ausgaben zusammengefasst, Drill-down nach Kategorie", () => {
  const imm = { immobilie_id: "IMM-001", bezeichnung: "Haus", status: "aktiv", eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 1 }] };
  const monat = new Date().toISOString().slice(0, 7);
  const vormonatTag = new Date(Date.UTC(Number(monat.slice(0, 4)), Number(monat.slice(5, 7)) - 2, 15)).toISOString().slice(0, 10);
  const vormonat = vormonatTag.slice(0, 7);
  const teil = {
    immobilien: [imm],
    darlehen: [darlehen("DAR-001", { immobilie_id: "IMM-001", konto_id: "KTO-006" })],
    regelzahlungen: [{ regelzahlung_id: "RZ-001", darlehen_id: "DAR-001", kategorie_id: "KAT-012" }],
    transaktionen: [
      { transaktion_id: "T1", konto_id: "KTO-006", immobilie_id: "IMM-001", buchungsdatum: vormonatTag, betrag: "-800.00", kategorie_id: "KAT-012" },
      { transaktion_id: "T2", konto_id: "KTO-006", immobilie_id: "IMM-001", buchungsdatum: vormonatTag, betrag: "-50.00", kategorie_id: "KAT-003" },
      { transaktion_id: "T3", konto_id: "KTO-006", immobilie_id: "IMM-001", buchungsdatum: vormonatTag, betrag: "-7.00", kategorie_id: "KAT-004" },
      { transaktion_id: "T4", konto_id: "KTO-006", immobilie_id: "IMM-001", buchungsdatum: vormonatTag, betrag: "20.00", kategorie_id: "KAT-003" },
      { transaktion_id: "T5", konto_id: "KTO-006", immobilie_id: "IMM-001", buchungsdatum: vormonatTag, betrag: "800.00", kategorie_id: "KAT-011", ist_transfer: true },
    ],
  };
  mitDaten(teil, { vermoegenTab: "immobilien" }, (html) => {
    const tabelle = html.slice(html.indexOf('class="monats-tabelle"'));
    assert.match(tabelle, /<th class="amount">Einnahmen<\/th><th class="amount">Ausgaben<\/th>/);
    assert.match(tabelle, /Eigenanteil<\/th>/);
    const knopf = tabelle.slice(tabelle.indexOf(`data-drill="${vormonat}:aus"`));
    assert.match(knopf.slice(0, knopf.indexOf("</button>")), /-57,00/);
    assert.doesNotMatch(tabelle, /drill-zeile/);
  });
  mitDaten(teil, { vermoegenTab: "immobilien", immobilieDrill: `${vormonat}:aus` }, (html) => {
    const zeile = html.slice(html.indexOf('class="drill-zeile"'));
    const drill = (html.match(/<tr class="drill-zeile">[\s\S]*?<\/tr>/g) ?? []).join("");
    assert.equal((drill.match(/drill-zeile/g) ?? []).length, 2);
    // Je Kategorie eine Zeile, Betrag in der Ausgaben-Spalte (3. Zelle).
    const erste = drill.slice(0, drill.indexOf("</tr>"));
    const zellen = erste.split("<td").slice(1);
    assert.match(zellen[0], /drill-name/);
    assert.equal(zellen[1].includes("betrag-link"), false);
    assert.match(zellen[2], /data-kategorie="KAT-003"/);
    assert.match(drill, /data-kategorie="KAT-003"[\s\S]*?-50,00/);
    assert.match(drill, /data-kategorie="KAT-004"[\s\S]*?-7,00/);
    assert.ok(drill.indexOf("KAT-003") < drill.indexOf("KAT-004"));
    assert.doesNotMatch(drill, /20,00/);
  });
});

test("Immobilie und Darlehen: grosse Kacheln klappbar, Anhang per Standard zu", () => {
  const imm = { immobilie_id: "IMM-001", bezeichnung: "Haus", status: "aktiv", bemerkung: "Notiz zum Haus", eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 1 }] };
  mitDaten({ immobilien: [imm] }, { vermoegenTab: "immobilien", klappKacheln: {} }, (html) => {
    const kacheln = [...html.matchAll(/data-kachel="([\w.]+)" data-standard="(\w+)" aria-expanded="(\w+)"/g)].map((m) => `${m[1]}=${m[3]}`);
    assert.deepEqual(kacheln, ["immobilie.stammdaten=true", "immobilie.monate=true", "immobilie.dokumente=true", "immobilie.anhang=false"]);
    assert.doesNotMatch(html, /Notiz zum Haus/, "zugeklappter Anhang rendert keinen Inhalt");
  });
  mitDaten({ immobilien: [imm] }, { vermoegenTab: "immobilien", klappKacheln: { "immobilie.anhang": true } }, (html) => {
    assert.match(html, /Notiz zum Haus/);
  });
  mitDaten({ darlehen: [darlehen("DAR-001")] }, { vermoegenTab: "darlehen", klappKacheln: {} }, (html) => {
    const kacheln = [...html.matchAll(/data-kachel="([\w.]+)" data-standard="(\w+)" aria-expanded="(\w+)"/g)].map((m) => `${m[1]}=${m[3]}`);
    assert.deepEqual(kacheln, ["darlehen.kennzahlen=true", "darlehen.verlauf=true", "darlehen.stammdaten=true", "darlehen.dokumente=true", "darlehen.anhang=false"]);
  });
});

// Ausschnitt einer Klappkachel: vom Kopf bis zum Kopf der naechsten.
function kachelInhalt(html, id) {
  const start = html.indexOf(`data-kachel="${id}"`);
  assert.ok(start >= 0, `Kachel ${id} fehlt`);
  const ende = html.indexOf("data-kachel=", start + 1);
  return html.slice(start, ende < 0 ? undefined : ende);
}

test("Immobilie: Link auf alle Buchungen steht in der Monatskachel, nicht bei den Dokumenten", () => {
  const imm = { immobilie_id: "IMM-001", bezeichnung: "Musterhaus", status: "aktiv", eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 1 }] };
  const monat = new Date().toISOString().slice(0, 7);
  const vormonat = new Date(Date.UTC(Number(monat.slice(0, 4)), Number(monat.slice(5, 7)) - 2, 15)).toISOString().slice(0, 10);
  const teil = {
    immobilien: [imm],
    transaktionen: [
      { transaktion_id: "T1", konto_id: "KTO-001", immobilie_id: "IMM-001", buchungsdatum: vormonat, betrag: "-50.00", kategorie_id: "KAT-003" },
      { transaktion_id: "T2", konto_id: "KTO-001", immobilie_id: "IMM-001", buchungsdatum: "2019-03-15", betrag: "-20.00", kategorie_id: "KAT-003" },
    ],
  };
  mitDaten(teil, { vermoegenTab: "immobilien", klappKacheln: {} }, (html) => {
    const link = /data-action="immobilie-transactions" data-immobilie="IMM-001">Alle 2 Buchungen anzeigen/;
    assert.match(kachelInhalt(html, "immobilie.monate"), link, "auch Buchungen ausserhalb der 12 Monate zaehlen");
    assert.doesNotMatch(kachelInhalt(html, "immobilie.dokumente"), /immobilie-transactions/);
  });
  mitDaten({ immobilien: [imm] }, { vermoegenTab: "immobilien", klappKacheln: {} }, (html) => {
    assert.doesNotMatch(html, /Buchungen anzeigen/, "ohne zugeordnete Buchungen kein Link");
  });
});

test("Immobilie: Dokumente zeigen die Belege der Versicherungen mit Bezug auf sie", async () => {
  const ISO = "2026-02-01T10:00:00.000Z";
  const datei = (pfad) => ({ pfad, groesse: 10, geaendert: ISO, typ: "pdf" });
  belegeAntwort = {
    dateien: [
      datei("Belege/Versicherungen/Hausrat_Musterversicherer_123/police_2025.pdf"),
      datei("Belege/Vorsorge/VS-101_Hausrat/beitrag_2026.pdf"),
      datei("Belege/Versicherungen/Wohngebaeude_Andere_456/police_2025.pdf"),
    ],
  };
  await ladeBelege(() => {});
  const imm = (id, bezeichnung) => ({ immobilie_id: id, bezeichnung, status: "aktiv", eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 1 }] });
  const vertrag = (id, quelle, extra = {}) => ({ vorsorge_id: id, art: "versicherung", name: `Vertrag ${id}`, person_id: "PER-001", status: "aktiv", quelle_hinweis: quelle, ...extra });
  const teil = {
    immobilien: [imm("IMM-001", "Musterhaus"), imm("IMM-002", "Musterwohnung")],
    vorsorge: [
      vertrag("VS-101", "Police unter Belege/Versicherungen/Hausrat_Musterversicherer_123/"),
      // Gekuendigt, Bezug auf das andere Objekt.
      vertrag("VS-102", "Belege/Versicherungen/Wohngebaeude_Andere_456/", { status: "gekuendigt" }),
    ],
    regelzahlungen: [
      { regelzahlung_id: "RZ-101", vorsorge_id: "VS-101", kategorie_id: "KAT-003", betrag: "-10.00", rhythmus_einheit: "monat", rhythmus_intervall: 1 },
      { regelzahlung_id: "RZ-102", vorsorge_id: "VS-102", kategorie_id: "KAT-003", betrag: "-10.00", rhythmus_einheit: "monat", rhythmus_intervall: 1 },
    ],
    transaktionen: [
      { transaktion_id: "T1", konto_id: "KTO-001", regelzahlung_id: "RZ-101", immobilie_id: "IMM-001", buchungsdatum: "2026-01-15", betrag: "-10.00", kategorie_id: "KAT-003" },
      { transaktion_id: "T2", konto_id: "KTO-001", regelzahlung_id: "RZ-102", immobilie_id: "IMM-002", buchungsdatum: "2026-01-15", betrag: "-10.00", kategorie_id: "KAT-003" },
    ],
  };
  try {
    mitDaten(teil, { vermoegenTab: "immobilien", selectedVermoegenId: "immobilie:IMM-001", klappKacheln: {} }, (html) => {
      const dokumente = kachelInhalt(html, "immobilie.dokumente");
      assert.match(dokumente, /belege-ausschnitt/);
      assert.match(dokumente, /data-beleg-ordner="Belege\/Versicherungen\/Hausrat_Musterversicherer_123"/, "Belegordner aus quelle_hinweis");
      assert.match(dokumente, /data-beleg-ordner="Belege\/Vorsorge\/VS-101_Hausrat"/, "Objektordner des Vertrags");
      assert.doesNotMatch(dokumente, /Wohngebaeude_Andere_456/);
    });
    // Gekuendigter Vertrag bleibt drin; nur ein Ast, also listet der Ausschnitt die Datei.
    mitDaten(teil, { vermoegenTab: "immobilien", selectedVermoegenId: "immobilie:IMM-002", klappKacheln: {} }, (html) => {
      const dokumente = kachelInhalt(html, "immobilie.dokumente");
      assert.match(dokumente, /police_2025\.pdf/);
      assert.doesNotMatch(dokumente, /Hausrat_Musterversicherer_123|VS-101_Hausrat/);
    });
    // Ohne gebuchten Beitrag mit immobilie_id kein Bezug, also keine Belege.
    mitDaten({ ...teil, transaktionen: [teil.transaktionen[0]] }, { vermoegenTab: "immobilien", selectedVermoegenId: "immobilie:IMM-002", klappKacheln: {} }, (html) => {
      assert.match(kachelInhalt(html, "immobilie.dokumente"), /Keine Dokumente zugeordnet/);
    });
  } finally {
    belegeAntwort = null;
  }
});
