import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
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
const { renderVorsorge, vorsorgeRows, gebuchteBeitraege, setVorsorgeFilter, resetVorsorgeFilters, toggleVorsorgeSort } = vorsorgeView;

function saveVorsorgeFixture() {
  return {
    vorsorge: data.vorsorge,
    personen: data.personen,
    zeitwerte: data.zeitwerte,
    regelzahlungen: data.regelzahlungen,
    transaktionen: data.transaktionen,
    vorsorgeFilters: state.vorsorgeFilters,
    vorsorgeSort: state.vorsorgeSort,
    selectedVorsorgeId: state.selectedVorsorgeId,
    per001: personenById.get("PER-001"),
    per002: personenById.get("PER-002"),
  };
}

function restoreVorsorgeFixture(saved) {
  data.vorsorge = saved.vorsorge;
  data.personen = saved.personen;
  data.zeitwerte = saved.zeitwerte;
  data.regelzahlungen = saved.regelzahlungen;
  data.transaktionen = saved.transaktionen;
  state.vorsorgeFilters = saved.vorsorgeFilters;
  state.vorsorgeSort = saved.vorsorgeSort;
  state.selectedVorsorgeId = saved.selectedVorsorgeId;
  if (saved.per001 === undefined) personenById.delete("PER-001");
  else personenById.set("PER-001", saved.per001);
  if (saved.per002 === undefined) personenById.delete("PER-002");
  else personenById.set("PER-002", saved.per002);
}

test("Vorsorge-Liste rendert Rueckkaufswert und ungeprueft-Badge", () => {
  data.vorsorge = [
    {
      vorsorge_id: "VS-003",
      art: "riester",
      name: "Riester Lena",
      person_id: "PER-001",
      status: "aktiv",
      kapitalbildend: true,
      kapitalwahl: "offen",
      geprueft_am: "2026-01-15",
    },
    {
      vorsorge_id: "VS-006",
      art: "betriebsrente",
      name: "bAV Lena",
      person_id: "PER-001",
      status: "geplant",
      kapitalbildend: false,
    },
  ];
  data.zeitwerte = [
    { entitaet: "vorsorge", entitaet_id: "VS-003", feld: "rueckkaufswert", wert: "9100.00", standdatum: "2026-01-01", qualitaet: "belegt" },
    { entitaet: "vorsorge", entitaet_id: "VS-006", feld: "erwartete_rente", wert: "240.00", standdatum: "2026-01-01", qualitaet: "geschaetzt" },
  ];
  data.regelzahlungen = [
    { regelzahlung_id: "RZ-014", bezeichnung: "Riester-Beitrag Lena", betrag: "-162.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-01", status: "bestaetigt", erstellt_am: "2026-01-01", vorsorge_id: "VS-003" },
  ];
  data.personen = [{ person_id: "PER-001", name: "Lena", status: "aktiv" }];
  data.konten = [];
  data.kategorien = [];
  data.transaktionen = [];
  data.transfers = [];
  data.immobilien = [];
  data.darlehen = [];
  data.vermoegenswerte = [];
  data.szenarien = [];
  state.view = "vorsorge";

  const html = renderVorsorge();
  assert.match(html, /Riester Lena/, "Contract name must appear in the list");
  assert.match(html, /9\.100/, "Rueckkaufswert must be rendered as money (9.100)");
  assert.match(html, /ungeprüft/, "Ungeprueft badge label must appear");
  assert.match(html, /kapitalbildend/, "kapitalbildend badge must appear");
  assert.match(html, /Riester-Beitrag Lena/, "Linked Beitrag-Regelzahlung must be listed");
  assert.match(html, /nicht im Vermögen/, "Anwartschaft label must mark non-wealth income leg");
  assert.match(html, /nicht als sichere Zukunftswerte/, "Always-visible ungeprueft hint box must render");
  // M-1: status chips localize via status.* i18n keys (not raw enum)
  assert.match(html, /Aktiv/, "Status 'aktiv' must localize to 'Aktiv'");
  assert.match(html, /Geplant/, "Status 'geplant' must localize to 'Geplant' (was raw 'geplant' before status.* keys existed)");
});

test("Vorsorge zeigt IDs und durchsucht Bemerkung sowie Quelle", () => {
  const saved = saveVorsorgeFixture();
  try {
    data.vorsorge = [
      { vorsorge_id: "VS-001", art: "riester", name: "Riester", person_id: "PER-001", status: "aktiv", kapitalbildend: true, geprueft_am: "2026-01-01", bemerkung: "Altvertrag mit Dynamik" },
      { vorsorge_id: "VS-002", art: "betriebsrente", name: "BAV", person_id: "PER-002", status: "geplant", kapitalbildend: false, quelle_hinweis: "Standmitteilung Personalabteilung" },
    ];
    data.personen = [{ person_id: "PER-001", name: "Lena" }, { person_id: "PER-002", name: "Martin" }];
    personenById.set("PER-001", data.personen[0]);
    personenById.set("PER-002", data.personen[1]);
    state.vorsorgeFilters = { search: "Dynamik", art: "", person: "", status: "", pruefstatus: "" };

    assert.deepEqual(vorsorgeRows().map((vs) => vs.vorsorge_id), ["VS-001"]);
    const html = renderVorsorge();
    assert.match(html, /<th[^>]*>.*ID/s);
    assert.match(html, /<td>VS-001<\/td>/);

    state.vorsorgeFilters.search = "Personalabteilung";
    assert.deepEqual(vorsorgeRows().map((vs) => vs.vorsorge_id), ["VS-002"]);
  } finally {
    restoreVorsorgeFixture(saved);
  }
});

test("Vorsorgefilter werden gemeinsam angewendet", () => {
  const saved = saveVorsorgeFixture();
  try {
    data.vorsorge = [
      { vorsorge_id: "VS-001", art: "riester", name: "Riester", person_id: "PER-001", status: "aktiv", kapitalbildend: true, geprueft_am: "2026-01-01" },
      { vorsorge_id: "VS-002", art: "betriebsrente", name: "BAV", person_id: "PER-002", status: "geplant", kapitalbildend: false },
    ];
    data.personen = [{ person_id: "PER-001", name: "Lena" }, { person_id: "PER-002", name: "Martin" }];
    personenById.set("PER-001", data.personen[0]);
    personenById.set("PER-002", data.personen[1]);
    state.vorsorgeFilters = { search: "", art: "riester", person: "PER-001", status: "aktiv", pruefstatus: "geprueft" };

    assert.deepEqual(vorsorgeRows().map((vs) => vs.vorsorge_id), ["VS-001"]);
  } finally {
    restoreVorsorgeFixture(saved);
  }
});

test("Vorsorge-Zustandshelfer setzen, sortieren und leeren deterministisch", () => {
  const saved = saveVorsorgeFixture();
  try {
    resetVorsorgeFilters();
    setVorsorgeFilter("art", "riester");
    assert.equal(state.vorsorgeFilters.art, "riester");
    toggleVorsorgeSort("name");
    assert.deepEqual(state.vorsorgeSort, { key: "name", dir: "asc" });
    toggleVorsorgeSort("name");
    assert.deepEqual(state.vorsorgeSort, { key: "name", dir: "desc" });
    resetVorsorgeFilters();
    assert.deepEqual(state.vorsorgeFilters, { search: "", art: "", person: "", status: "", pruefstatus: "" });
  } finally {
    restoreVorsorgeFixture(saved);
  }
});

test("Vorsorge sortiert jede Tabellenspalte stabil", () => {
  const saved = saveVorsorgeFixture();
  try {
    data.vorsorge = [
      { vorsorge_id: "VS-001", name: "Zeta", art: "riester", person_id: "PER-002", status: "aktiv", kapitalbildend: true },
      { vorsorge_id: "VS-002", name: "Alpha", art: "betriebsrente", person_id: "PER-001", status: "beendet", kapitalbildend: false },
      { vorsorge_id: "VS-003", name: "Mitte", art: "schutzversicherung", person_id: "PER-001", status: "ruhend", kapitalbildend: false },
    ];
    data.personen = [{ person_id: "PER-001", name: "Anna" }, { person_id: "PER-002", name: "Zoe" }];
    personenById.set("PER-001", data.personen[0]);
    personenById.set("PER-002", data.personen[1]);
    data.zeitwerte = [
      { entitaet: "vorsorge", entitaet_id: "VS-001", feld: "rueckkaufswert", wert: "100.00", standdatum: "2026-01-01", qualitaet: "belegt" },
      { entitaet: "vorsorge", entitaet_id: "VS-002", feld: "erwartete_rente", wert: "200.00", standdatum: "2026-01-01", qualitaet: "geschaetzt" },
    ];
    state.vorsorgeFilters = { search: "", art: "", person: "", status: "", pruefstatus: "" };
    const erwartungen = {
      id: { asc: ["VS-001", "VS-002", "VS-003"], desc: ["VS-003", "VS-002", "VS-001"] },
      name: { asc: ["VS-002", "VS-003", "VS-001"], desc: ["VS-001", "VS-003", "VS-002"] },
      art: { asc: ["VS-002", "VS-001", "VS-003"], desc: ["VS-003", "VS-001", "VS-002"] },
      person: { asc: ["VS-002", "VS-003", "VS-001"], desc: ["VS-001", "VS-002", "VS-003"] },
      status: { asc: ["VS-001", "VS-002", "VS-003"], desc: ["VS-003", "VS-002", "VS-001"] },
      wert: { asc: ["VS-001", "VS-002", "VS-003"], desc: ["VS-002", "VS-001", "VS-003"] },
    };

    for (const [key, expected] of Object.entries(erwartungen)) {
      state.vorsorgeSort = { key, dir: "asc" };
      assert.deepEqual(vorsorgeRows().map((vs) => vs.vorsorge_id), expected.asc, `${key} asc`);
      state.vorsorgeSort = { key, dir: "desc" };
      assert.deepEqual(vorsorgeRows().map((vs) => vs.vorsorge_id), expected.desc, `${key} desc`);
    }
  } finally {
    restoreVorsorgeFixture(saved);
  }
});

test("Vorsorge-Sortierung setzt fehlende Anzeigewerte in beide Richtungen ans Ende", () => {
  const saved = saveVorsorgeFixture();
  try {
    data.vorsorge = [
      { vorsorge_id: "VS-001", name: "Ohne Person", art: "riester", person_id: "", status: "aktiv", kapitalbildend: false },
      { vorsorge_id: "VS-002", name: "Anna", art: "riester", person_id: "PER-001", status: "aktiv", kapitalbildend: false },
      { vorsorge_id: "VS-003", name: "Zoe", art: "riester", person_id: "PER-002", status: "aktiv", kapitalbildend: false },
    ];
    data.personen = [{ person_id: "PER-001", name: "Anna" }, { person_id: "PER-002", name: "Zoe" }];
    personenById.set("PER-001", data.personen[0]);
    personenById.set("PER-002", data.personen[1]);
    state.vorsorgeFilters = { search: "", art: "", person: "", status: "", pruefstatus: "" };

    state.vorsorgeSort = { key: "person", dir: "asc" };
    assert.deepEqual(vorsorgeRows().map((vs) => vs.vorsorge_id), ["VS-002", "VS-003", "VS-001"]);
    state.vorsorgeSort = { key: "person", dir: "desc" };
    assert.deepEqual(vorsorgeRows().map((vs) => vs.vorsorge_id), ["VS-003", "VS-002", "VS-001"]);
  } finally {
    restoreVorsorgeFixture(saved);
  }
});

test("ausgewählte Vorsorge zeigt vollständige Detail-Rail", () => {
  const saved = saveVorsorgeFixture();
  try {
    data.personen = [{ person_id: "PER-001", name: "Lena" }];
    personenById.set("PER-001", data.personen[0]);
    data.vorsorge = [
      { vorsorge_id: "VS-002", art: "riester", name: "Riester alt", person_id: "PER-001", status: "gekuendigt", kapitalbildend: true },
      {
        vorsorge_id: "VS-003",
        art: "riester",
        name: "Riester Lena",
        person_id: "PER-001",
        status: "aktiv",
        kapitalbildend: true,
        kapitalwahl: "offen",
        geprueft_am: "2026-01-15",
        leistung_beginn: "2042-08-01",
        ersetzt_vorsorge_id: "VS-002",
        quelle_hinweis: "Standmitteilung 2026",
        quelle_standdatum: "2026-01-01",
        bemerkung: "Kapitalwahl offen",
      },
      { vorsorge_id: "VS-004", art: "riester", name: "Riester Nachfolger", person_id: "PER-001", status: "geplant", kapitalbildend: true, ersetzt_vorsorge_id: "VS-003" },
    ];
    data.zeitwerte = [
      { entitaet: "vorsorge", entitaet_id: "VS-003", feld: "rueckkaufswert", wert: "9100.00", standdatum: "2026-01-01", qualitaet: "belegt" },
      { entitaet: "vorsorge", entitaet_id: "VS-003", feld: "erwartete_rente", wert: "240.00", standdatum: "2026-01-01", qualitaet: "geschaetzt" },
      { entitaet: "vorsorge", entitaet_id: "VS-003", feld: "erwartete_kapitalleistung", wert: "31000.00", standdatum: "2026-01-01", qualitaet: "geschaetzt" },
    ];
    data.regelzahlungen = [{ regelzahlung_id: "RZ-014", bezeichnung: "Riester-Beitrag", betrag: "-162.00", vorsorge_id: "VS-003" }];
    data.transaktionen = [];
    state.vorsorgeFilters = { search: "", art: "", person: "", status: "", pruefstatus: "" };
    state.selectedVorsorgeId = "VS-003";
    const html = renderVorsorge();

    assert.match(html, /layout-with-rail/);
    assert.match(html, /detail-panel/);
    assert.match(html, /data-action="close-vorsorge-rail"/);
    assert.match(html, /VS-003/);
    assert.match(html, /Standmitteilung 2026/);
    assert.match(html, /Kapitalwahl offen/);
    assert.match(html, /Riester-Beitrag/);
    assert.match(html, /Rückkaufswert/);
    assert.match(html, /Erwartete Rente/);
    assert.match(html, /Riester alt/);
    assert.match(html, /Riester Nachfolger/);
  } finally {
    restoreVorsorgeFixture(saved);
  }
});

test("Vorsorge-Rail zeigt nur die fünf neuesten explizit verknüpften Beiträge", () => {
  const saved = saveVorsorgeFixture();
  try {
    data.personen = [{ person_id: "PER-001", name: "Lena" }];
    personenById.set("PER-001", data.personen[0]);
    data.vorsorge = [{ vorsorge_id: "VS-003", art: "riester", name: "Riester Lena", person_id: "PER-001", status: "aktiv", kapitalbildend: true }];
    data.zeitwerte = [];
    data.regelzahlungen = [
      { regelzahlung_id: "RZ-001", bezeichnung: "Alt", betrag: "-10.00", vorsorge_id: "VS-003" },
      { regelzahlung_id: "RZ-002", bezeichnung: "Neu", betrag: "-20.00", vorsorge_id: "VS-003" },
      { regelzahlung_id: "RZ-999", bezeichnung: "Fremd", betrag: "-70.00", vorsorge_id: "VS-999" },
    ];
    data.transaktionen = [
      { transaktion_id: "TXN-1", regelzahlung_id: "RZ-001", buchungsdatum: "2026-01-01", betrag: "-10.00", gegenpartei: "A" },
      { transaktion_id: "TXN-2", regelzahlung_id: "RZ-001", buchungsdatum: "2026-02-01", betrag: "-20.00", gegenpartei: "B" },
      { transaktion_id: "TXN-3", regelzahlung_id: "RZ-002", buchungsdatum: "2026-03-01", betrag: "-30.00", gegenpartei: "C" },
      { transaktion_id: "TXN-4", regelzahlung_id: "RZ-002", buchungsdatum: "2026-04-01", betrag: "-40.00", gegenpartei: "D" },
      { transaktion_id: "TXN-5", regelzahlung_id: "RZ-002", buchungsdatum: "2026-05-01", betrag: "-50.00", gegenpartei: "E" },
      { transaktion_id: "TXN-6", regelzahlung_id: "RZ-002", buchungsdatum: "2026-06-01", betrag: "-60.00", gegenpartei: "F" },
      { transaktion_id: "TXN-X", regelzahlung_id: "RZ-999", buchungsdatum: "2026-07-01", betrag: "-70.00", gegenpartei: "X" },
    ];
    state.vorsorgeFilters = { search: "", art: "", person: "", status: "", pruefstatus: "" };
    state.selectedVorsorgeId = "VS-003";

    assert.deepEqual(gebuchteBeitraege("VS-003").map((tx) => tx.transaktion_id), ["TXN-6", "TXN-5", "TXN-4", "TXN-3", "TXN-2"]);
    const html = renderVorsorge();
    assert.equal((html.match(/data-action="open-transaction"/g) ?? []).length, 5);
    assert.doesNotMatch(html, /TXN-1|TXN-X/);
  } finally {
    restoreVorsorgeFixture(saved);
  }
});

test("ausgefilterte oder unbekannte Vorsorge öffnet keine Rail", () => {
  const saved = saveVorsorgeFixture();
  try {
    data.vorsorge = [{ vorsorge_id: "VS-003", art: "riester", name: "Riester Lena", person_id: "PER-001", status: "aktiv", kapitalbildend: true }];
    state.vorsorgeFilters = { search: "", art: "", person: "", status: "", pruefstatus: "" };
    state.selectedVorsorgeId = "VS-999";
    assert.doesNotMatch(renderVorsorge(), /detail-panel/);
    state.selectedVorsorgeId = "VS-003";
    state.vorsorgeFilters.search = "kein Treffer";
    assert.doesNotMatch(renderVorsorge(), /detail-panel/);
  } finally {
    restoreVorsorgeFixture(saved);
  }
});
