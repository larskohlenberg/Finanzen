// Vermoegensseite mit Tabs: Kopf, Tab-Leiste und die Grenzfaelle der
// Objekt-Tabs (ohne Anker, ohne Marktwert, abgeloest, keine Sonstigen).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.window = globalThis;
globalThis.fetch = async (pfad) => {
  const body = readFileSync(new URL(`../app/${String(pfad).replace(/^\.\//, "").replace(/\?.*$/, "")}`, import.meta.url), "utf8");
  return { ok: true, json: async () => JSON.parse(body), text: async () => body };
};
await import("../app/i18n.js");
const { data, state } = await import("../app/runtime.mjs");
const { renderVermoegen } = await import("../app/views/vermoegen.mjs");

const FELDER = ["konten", "immobilien", "vermoegenswerte", "darlehen", "vorsorge", "zeitwerte", "transaktionen", "regelzahlungen"];

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

test("Tab-Leiste: vier Tabs, kein Vorsorge-Tab, Sonstige nur mit aktiven Werten", () => {
  mitDaten({}, {}, (html) => {
    for (const tab of ["uebersicht", "konten", "immobilien", "darlehen"]) assert.match(html, new RegExp(`data-tab="${tab}"`));
    assert.doesNotMatch(html, /data-tab="vorsorge"/);
    assert.doesNotMatch(html, /data-tab="sonstige"/);
  });
  mitDaten({ vermoegenswerte: [{ vermoegenswert_id: "VMW-001", bezeichnung: "Gold", typ: "edelmetall", status: "aktiv", eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 1 }] }] }, {}, (html) => {
    assert.match(html, /data-tab="sonstige"/);
  });
});

test("Kopf: Punkt am Tab und Eintrag in den offenen Punkten bei fehlendem Wert", () => {
  mitDaten({ darlehen: [darlehen("DAR-001")] }, {}, (html) => {
    assert.match(html, /data-tab="darlehen">\s*<span class="vermoegen-tab-titel">Darlehen<span class="tab-punkt"/);
    assert.match(html, /<ul class="luecken-liste">[\s\S]*data-tab="darlehen">Darlehen<\/button>:\s*1 offen/);
  });
});

test("Darlehen ohne Anker: Karte und Detail melden es, kein Absturz; abgeloeste fehlen", () => {
  mitDaten({ darlehen: [darlehen("DAR-001"), darlehen("DAR-002", { status: "abgeloest" })] }, { vermoegenTab: "darlehen", selectedVermoegenId: "darlehen:DAR-002" }, (html) => {
    assert.match(html, /Kein belegter Restschuldstand/);
    assert.match(html, /data-vermoegen="darlehen:DAR-001"/);
    assert.doesNotMatch(html, /data-vermoegen="darlehen:DAR-002"/);
    assert.match(html, /objekt-karte active[^>]*data-vermoegen="darlehen:DAR-001"/);
  });
});

test("Darlehen mit Anker: Verlauf, Zins/Tilgung und Rest zum Zinsbindungsende", () => {
  const anker = { entitaet: "darlehen", entitaet_id: "DAR-001", feld: "restschuld", wert: "80000.00", standdatum: "2025-01-31", qualitaet: "belegt" };
  mitDaten({ darlehen: [darlehen("DAR-001", { zinsbindung_bis: "2099-01-31" })], zeitwerte: [anker] }, { vermoegenTab: "darlehen" }, (html) => {
    assert.match(html, /class="restschuld-ist"/);
    assert.match(html, /class="balken-tilgung/);
    assert.match(html, /Rest zum Zinsbindungsende/);
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
