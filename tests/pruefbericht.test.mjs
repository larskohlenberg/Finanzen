// tests/pruefbericht.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { runImport } from "../app/tools/import.mjs";
import { validateMasterData } from "../app/tools/validate-core.mjs";
import { laufBericht, pruefbericht, renderBericht, renderLaufBericht } from "../app/tools/pruefbericht.mjs";

let n = 0;
function tx(props) {
  n += 1;
  return {
    transaktion_id: `TXN-${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`,
    konto_id: "KTO-001", buchungsdatum: "2026-05-20", betrag: "-10.00",
    gegenpartei: "Testladen", verwendungszweck: "", ist_transfer: false, ...props,
  };
}
const auto = (p) => tx({ kategorisierung_status: "bestaetigt", bestaetigt_durch: "auto", kategorie_id: "KAT-003", ...p });
const mensch = (p) => tx({ kategorisierung_status: "bestaetigt", bestaetigt_durch: "mensch", kategorie_id: "KAT-003", ...p });
const leer = { transaktionen: [], regeln: [], konten: [], zeitwerte: [], log: [] };

test("grosse Betraege kommen zuerst und nur aus Auto-Freigaben", () => {
  const out = pruefbericht({ ...leer, transaktionen: [
    auto({ betrag: "-50.00" }), auto({ betrag: "-900.00" }), mensch({ betrag: "-5000.00" }),
  ] });
  assert.equal(out.grosse.length, 2);
  assert.equal(out.grosse[0].betrag, "-900.00");
});

test("Merchants ohne jede menschliche Bestaetigung werden gemeldet", () => {
  const out = pruefbericht({ ...leer, transaktionen: [
    auto({ gegenpartei: "Nie Gesehen" }), auto({ gegenpartei: "Schon Bekannt" }), mensch({ gegenpartei: "Schon Bekannt" }),
  ] });
  assert.deepEqual(out.nur_auto_merchants.map((m) => m.gegenpartei), ["Nie Gesehen"]);
});

test("auto-freigegebene KAT-012 werden vollstaendig gelistet", () => {
  const out = pruefbericht({ ...leer, transaktionen: [
    auto({ kategorie_id: "KAT-012" }), auto({ kategorie_id: "KAT-003" }), mensch({ kategorie_id: "KAT-012" }),
  ] });
  assert.equal(out.kat012.length, 1);
});

test("E4-Regeln werden separat gelistet", () => {
  const out = pruefbericht({ ...leer, regeln: [
    { regel_id: "REG-001", belegstufe: "E4", kategorie_id: "KAT-003", status: "aktiv", kommentar: "Web" },
    { regel_id: "REG-002", belegstufe: "E2", kategorie_id: "KAT-003", status: "aktiv", kommentar: "Bestand" },
  ] });
  assert.deepEqual(out.e4_regeln.map((r) => r.regel_id), ["REG-001"]);
});

test("Konten ohne Anker werden gemeldet", () => {
  const out = pruefbericht({ ...leer,
    konten: [{ konto_id: "KTO-001", name: "Mit Anker", kontotyp: "giro" }, { konto_id: "KTO-002", name: "Ohne Anker", kontotyp: "giro" }],
    zeitwerte: [{ entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "100.00", standdatum: "2026-01-01", qualitaet: "belegt" }],
  });
  assert.deepEqual(out.konten_ohne_anker.map((k) => k.konto_id), ["KTO-002"]);
});

test("Gate-Durchfall kommt aus dem juengsten Freigabe-Logeintrag", () => {
  const out = pruefbericht({ ...leer, log: [
    { zeitpunkt: "2026-08-30T10:00:00+02:00", anlass: "freigabe", gate_durchfall: [{ regel_id: "REG-900", grund: "spezifitaet" }] },
    { zeitpunkt: "2026-08-31T10:00:00+02:00", anlass: "freigabe", gate_durchfall: [{ regel_id: "REG-901", grund: "belegstufe" }] },
  ] });
  assert.deepEqual(out.gate_durchfall.map((d) => d.regel_id), ["REG-901"]);
});

test("nicht reconcilierte Kontostaende werden gemeldet", () => {
  const out = pruefbericht({ ...leer, log: [
    { anlass: "import", normalisierung: { quelle: "auszug-a.csv", zeilen_gesamt: 10, zeilen_error: 0, reconciliation_differenz: "-12.34" } },
    { anlass: "import", normalisierung: { quelle: "auszug-b.csv", zeilen_gesamt: 5, zeilen_error: 0 } },
  ] });
  assert.equal(out.reconciliation.length, 1);
  assert.equal(out.reconciliation[0].quelle, "auszug-a.csv");
});

test("Kategorie mit stark abweichendem Monat wird als Ausreisser gemeldet", () => {
  const monate = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
  const normal = monate.map((m) => auto({ buchungsdatum: `${m}-15`, betrag: "-200.00", kategorie_id: "KAT-003" }));
  const spitze = auto({ buchungsdatum: "2026-07-15", betrag: "-2000.00", kategorie_id: "KAT-003" });
  const out = pruefbericht({ ...leer, transaktionen: [...normal, spitze] });
  assert.equal(out.ausreisser.length, 1);
  assert.equal(out.ausreisser[0].kategorie_id, "KAT-003");
});

test("kleine Schwankungen sind kein Ausreisser", () => {
  const monate = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
  const normal = monate.map((m) => auto({ buchungsdatum: `${m}-15`, betrag: "-20.00", kategorie_id: "KAT-003" }));
  const leicht = auto({ buchungsdatum: "2026-07-15", betrag: "-60.00", kategorie_id: "KAT-003" });
  const out = pruefbericht({ ...leer, transaktionen: [...normal, leicht] });
  assert.deepEqual(out.ausreisser, []);
});

test("leerer Bestand liefert leere Listen statt Fehler", () => {
  const out = pruefbericht(leer);
  assert.deepEqual(out.grosse, []);
  assert.deepEqual(out.ausreisser, []);
  assert.deepEqual(out.reconciliation, []);
  assert.deepEqual(out.lernen.je_regel, []);
});

// --- Regeln auf Konten ohne menschlichen Anker (ADR 0027) ------------------

test("verliehene Belegstufe und Neuland werden getrennt gemeldet", () => {
  const anker = mensch({ konto_id: "KTO-001", kategorie_herkunft: "regel", matched_regeln: ["REG-001"] });
  const ausweitung = auto({ konto_id: "KTO-006", kategorie_herkunft: "regel", matched_regeln: ["REG-001"] });
  const neuland = auto({ konto_id: "KTO-006", kategorie_id: "KAT-007", kategorie_herkunft: "regel", matched_regeln: ["REG-002"] });
  const out = pruefbericht({ ...leer,
    transaktionen: [anker, ausweitung, neuland],
    regeln: [
      { regel_id: "REG-001", kategorie_id: "KAT-003", status: "aktiv", belegstufe: "E2", kommentar: "Bestand" },
      { regel_id: "REG-002", kategorie_id: "KAT-007", status: "aktiv", belegstufe: "E3", kommentar: "Beleg" },
    ],
  });
  assert.deepEqual(
    out.regeln_ohne_kontoanker.map((e) => [e.regel_id, e.konto_id, e.verliehen]),
    [["REG-001", "KTO-006", true], ["REG-002", "KTO-006", false]],
  );
});

test("der Bericht nennt Anker-Durchfall mit Konto", () => {
  const text = renderBericht(pruefbericht({ ...leer, log: [
    { anlass: "freigabe", gate_durchfall: [{ regel_id: "REG-001", grund: "anker", konto_id: "KTO-006" }] },
  ] }));
  assert.match(text, /REG-001 auf KTO-006: anker/);
});

// --- Reconciliation-Rendering ---------------------------------------------
// Der Import-Agent schreibt `{ betrag, grund }` und benennt die Quelle in
// `dateien`. Vorher rendete das als `undefined: Differenz [object Object]` —
// eine erklaerte Differenz war damit unlesbar.

test("Reconciliation-Differenz als Objekt wird lesbar gerendert", () => {
  const text = renderBericht(pruefbericht({ ...leer, log: [
    { anlass: "import", normalisierung: {
      dateien: 1, // Anzahl, kein Name — taugt nicht als Quellenangabe
      reconciliation_differenz: { konto_id: "KTO-006", betrag: "-99.99", grund: "Kopfstand liegt nach der letzten Buchung" },
    } },
  ] }));
  assert.match(text, /KTO-006: Differenz -99\.99 — Kopfstand liegt nach der letzten Buchung/);
  assert.doesNotMatch(text, /\[object Object\]/);
  assert.doesNotMatch(text, /undefined/);
});

test("die aeltere Form aus quelle und Decimal-String bleibt lesbar", () => {
  const text = renderBericht(pruefbericht({ ...leer, log: [
    { anlass: "import", normalisierung: { quelle: "auszug-a.csv", reconciliation_differenz: "-12.34" } },
  ] }));
  assert.match(text, /auszug-a\.csv: Differenz -12\.34/);
  assert.doesNotMatch(text, /undefined/);
});

test("ohne konto_id faellt die Quelle auf den Anlass des Logeintrags zurueck", () => {
  const text = renderBericht(pruefbericht({ ...leer, log: [
    { anlass: "Erstimport Testkonto", normalisierung: { dateien: 3, reconciliation_differenz: { betrag: "-1.00" } } },
    { normalisierung: { reconciliation_differenz: { grund: "Anker fehlt" } } },
  ] }));
  assert.match(text, /Erstimport Testkonto: Differenz -1\.00/);
  assert.match(text, /\(ohne Quellenangabe\): Differenz \(ohne Betrag\) — Anker fehlt/);
  assert.doesNotMatch(text, /undefined/);
});

test("leerer Bestand rendert ohne undefined", () => {
  const text = renderBericht(pruefbericht(leer));
  assert.doesNotMatch(text, /undefined/);
  assert.match(text, /REGELN AUF KONTEN OHNE MENSCHLICHEN ANKER \(0\)/);
});

test("Agenten-Schaetzungen werden gezaehlt, menschlich entschiedene nicht", () => {
  const out = pruefbericht({ ...leer, transaktionen: [
    auto({ kategorie_herkunft: "agent" }),
    auto({ kategorie_herkunft: "agent", kategorie_id: "KAT-012" }),
    tx({ kategorisierung_status: "vorgeschlagen", kategorie_herkunft: "agent", kategorie_id: "KAT-003" }),
    mensch({ kategorie_herkunft: "agent" }),
    auto({ kategorie_herkunft: "regel" }),
  ] });
  assert.equal(out.agent_geschaetzt, 3);
  const text = renderBericht(out);
  assert.match(text, /VOM AGENTEN GESCHAETZT, HERKUNFT AGENT \(3\)/);
  assert.match(text, /Filter Herkunft = Agent/);
});

// --- Erledigte Differenzen und nachgerechnete Saldenkette -------------------
// Vorher stand jede je protokollierte Differenz fuer immer im Bericht, auch
// nachdem ein spaeterer Lauf die Luecke geschlossen hatte.

const diff = (konto_id, betrag) => ({ anlass: "import", normalisierung: { reconciliation_differenz: { konto_id, betrag, grund: "Auszug fehlt" } } });
const erledigt = (konto_id) => ({ anlass: "import", normalisierung: { reconciliation_erledigt: { konto_id, bezug: "frueherer Lauf", grund: "Auszug nachgereicht" } } });

test("eine spaeter erledigte Differenz verschwindet aus dem Bericht", () => {
  const out = pruefbericht({ ...leer, log: [diff("KTO-002", "1.23"), diff("KTO-006", "45.67"), erledigt("KTO-002")] });
  assert.deepEqual(out.reconciliation.map((r) => r.quelle), ["KTO-006"]);
});

test("ein Erledigt-Vermerk vor der Differenz hakt sie nicht ab", () => {
  const out = pruefbericht({ ...leer, log: [erledigt("KTO-002"), diff("KTO-002", "1.23")] });
  assert.deepEqual(out.reconciliation.map((r) => r.quelle), ["KTO-002"]);
});

test("Erledigt-Vermerk als Liste hakt mehrere Konten ab", () => {
  const liste = { anlass: "import", normalisierung: { reconciliation_erledigt: [{ konto_id: "KTO-002" }, { konto_id: "KTO-006" }] } };
  const out = pruefbericht({ ...leer, log: [diff("KTO-002", "1.23"), diff("KTO-006", "1.00"), liste] });
  assert.deepEqual(out.reconciliation, []);
});

const konto = { konto_id: "KTO-001", name: "Giro", kontotyp: "giro", status: "aktiv" };
const stand = (standdatum, wert) => ({ entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert, standdatum, qualitaet: "belegt" });

test("aufgehende Saldenkette meldet nichts", () => {
  const out = pruefbericht({ ...leer, konten: [konto],
    zeitwerte: [stand("2026-07-31", "100.00"), stand("2026-08-31", "70.00")],
    transaktionen: [tx({ buchungsdatum: "2026-08-10", betrag: "-30.00" })],
  });
  assert.deepEqual(out.salden_drift, []);
});

test("fehlende Buchungen zwischen zwei Ankern werden nachgerechnet gemeldet", () => {
  const out = pruefbericht({ ...leer, konten: [konto],
    zeitwerte: [stand("2026-07-31", "100.00"), stand("2026-08-31", "70.00")],
    transaktionen: [tx({ buchungsdatum: "2026-08-10", betrag: "-10.00" })],
  });
  assert.equal(out.salden_drift.length, 1);
  assert.equal(out.salden_drift[0].differenz_cents, -2000);
  const text = renderBericht(out);
  assert.match(text, /KTO-001  2026-07-31 -> 2026-08-31: belegt 70\.00, erwartet 90\.00, Differenz -20\.00/);
});

test("Depots und geschlossene Konten werden nicht nachgerechnet", () => {
  const out = pruefbericht({ ...leer,
    konten: [{ ...konto, kontotyp: "depot" }],
    zeitwerte: [stand("2026-07-31", "100.00"), stand("2026-08-31", "70.00")],
  });
  assert.deepEqual(out.salden_drift, []);
});

test("Altformat ohne konto_id wird ueber das Konto im Anlass abgehakt", () => {
  const alt = { anlass: "Erstimport KTO-006 aus einer Umsatzanzeige", normalisierung: { reconciliation_differenz: { betrag: "45.67", grund: "Buchungen ohne Datum" } } };
  const out = pruefbericht({ ...leer, log: [alt, erledigt("KTO-006")] });
  assert.deepEqual(out.reconciliation, []);
});

test("Anlass mit mehreren Konten bleibt ohne eindeutige Zuordnung sichtbar", () => {
  const alt = { anlass: "Import KTO-002 und KTO-006", normalisierung: { reconciliation_differenz: { betrag: "1.00" } } };
  const out = pruefbericht({ ...leer, log: [alt, erledigt("KTO-006")] });
  assert.equal(out.reconciliation.length, 1);
});

test("Dubletten-Prueffaelle aus dem Protokoll stehen im Bericht, bis ein spaeterer Eintrag sie als geprueft abhakt", () => {
  const fall = { art: "teilweise_vorhanden", konto_id: "KTO-001", zeilen: [2, 3], in_datei: 2, im_bestand: 1, geschrieben: 1, hinweis: "nach Anzahl" };
  const log = [
    { zeitpunkt: "2026-09-01T10:00:00Z", anlass: "inbox-lauf", dubletten_pruefen: [{ ...fall, quelle: "data/inbox/alt.csv" }] },
    { zeitpunkt: "2026-09-02T10:00:00Z", anlass: "dubletten-pruefung", dubletten_geprueft: true },
    { zeitpunkt: "2026-09-03T10:00:00Z", anlass: "inbox-lauf", dubletten_pruefen: [{ ...fall, quelle: "data/inbox/neu.csv" }] },
    { zeitpunkt: "2026-09-04T10:00:00Z", anlass: "freigabe" },
  ];
  const out = pruefbericht({ ...leer, log });
  assert.deepEqual(out.dubletten_pruefen.map((f) => f.quelle), ["data/inbox/neu.csv"]);
  assert.equal(out.dubletten_pruefen[0].zeitpunkt, "2026-09-03T10:00:00Z");
  const text = renderBericht(out);
  assert.match(text, /DUBLETTEN-PRUEFFAELLE AUS IMPORTEN \(1\)/);
  assert.match(text, /teilweise_vorhanden\s+KTO-001\s+data\/inbox\/neu\.csv/);
  assert.doesNotMatch(text, /alt\.csv/);

  const geprueft = pruefbericht({ ...leer, log: [...log, { anlass: "dubletten-pruefung", dubletten_geprueft: true }] });
  assert.deepEqual(geprueft.dubletten_pruefen, []);
  assert.match(renderBericht(geprueft), /DUBLETTEN-PRUEFFAELLE AUS IMPORTEN \(0\)/);
});

// --- Bericht zum Lauf (ADR 0040) ------------------------------------------

const vor = "2026-11-01T10:00:00.000Z";
const marke = { anlass: "import-durchlauf", zeitpunkt: "2026-11-02T10:00:00.000Z" };
const nach = "2026-11-03T10:00:00.000Z";

test("der Lauf umfasst nur Buchungen nach dem letzten Abschluss", () => {
  const alt = auto({ betrag: "-9000.00", importiert_am: vor });
  const ohneDatum = auto({ betrag: "-8000.00" });
  const neu = auto({ betrag: "-20.00", importiert_am: nach });
  const b = laufBericht({ ...leer, transaktionen: [alt, ohneDatum, neu], log: [marke] });
  assert.equal(b.anzahl, 1);
  assert.deepEqual(b.grosse.map((tx) => tx.transaktion_id), [neu.transaktion_id]);
});

test("ohne neue Buchungen zeigt der Bericht den zuletzt abgeschlossenen Lauf", () => {
  const frueher = auto({ importiert_am: "2026-10-01T10:00:00.000Z" });
  const letzter = auto({ importiert_am: vor });
  const b = laufBericht({ ...leer, transaktionen: [frueher, letzter], log: [{ anlass: "import-durchlauf", zeitpunkt: "2026-10-02T10:00:00.000Z" }, marke] });
  assert.equal(b.anzahl, 1);
  assert.equal(b.grosse[0].transaktion_id, letzter.transaktion_id);
  assert.match(renderLaufBericht(b), /zuletzt abgeschlossen/);
});

test("ohne Abschlusseintrag zaehlt alles mit Importdatum zum Lauf", () => {
  const b = laufBericht({ ...leer, transaktionen: [auto({ importiert_am: vor }), auto({ importiert_am: nach }), auto({})] });
  assert.equal(b.anzahl, 2);
});

test("neu ist nur ein Haendler, den der Bestand vorher nicht kannte", () => {
  const b = laufBericht({ ...leer, log: [marke], transaktionen: [
    auto({ gegenpartei: "Stammladen", importiert_am: vor }),
    auto({ gegenpartei: "Stammladen", importiert_am: nach }),
    auto({ gegenpartei: "Erstladen", betrag: "-5.00", importiert_am: nach }),
    auto({ gegenpartei: "Erstladen", betrag: "-7.00", importiert_am: nach }),
  ] });
  assert.deepEqual(b.neue_haendler.map((h) => [h.gegenpartei, h.anzahl, h.summe_cent]), [["Erstladen", 2, -1200]]);
});

function monatsreihe(kategorie_id) {
  return ["2026-07", "2026-08", "2026-09"].map((m) => auto({ kategorie_id, buchungsdatum: `${m}-10`, betrag: "-100.00", importiert_am: vor }));
}

test("auffaellig ist nur ein Monat, den der Lauf beruehrt, ohne Transfers und Regelzahlungen", () => {
  const b = laufBericht({ ...leer, log: [marke], transaktionen: [
    ...monatsreihe("KAT-003"), ...monatsreihe("KAT-004"), ...monatsreihe("KAT-005"), ...monatsreihe("KAT-006"),
    auto({ kategorie_id: "KAT-003", buchungsdatum: "2026-10-10", betrag: "-900.00", importiert_am: nach }),
    // gleich hoch, aber nicht aus diesem Lauf
    auto({ kategorie_id: "KAT-004", buchungsdatum: "2026-10-10", betrag: "-900.00", importiert_am: vor }),
    auto({ kategorie_id: "KAT-005", buchungsdatum: "2026-10-10", betrag: "-900.00", regelzahlung_id: "RZ-001", importiert_am: nach }),
    auto({ kategorie_id: "KAT-006", buchungsdatum: "2026-10-10", betrag: "-900.00", ist_transfer: true, importiert_am: nach }),
  ] });
  assert.deepEqual(b.ausreisser.map((a) => a.kategorie_id), ["KAT-003"]);
});

test("Gate-Durchfall zaehlt nur aus dem laufenden Fenster", () => {
  const alt = { anlass: "freigabe", zeitpunkt: vor, gate_durchfall: [{ regel_id: "REG-900", grund: "anker" }] };
  const transaktionen = [auto({ importiert_am: nach })];
  assert.deepEqual(laufBericht({ ...leer, transaktionen, log: [alt, marke] }).gate_durchfall, []);
  const neu = { anlass: "freigabe", zeitpunkt: nach, gate_durchfall: [{ regel_id: "REG-901", grund: "anker" }] };
  assert.deepEqual(laufBericht({ ...leer, transaktionen, log: [alt, marke, neu] }).gate_durchfall.map((d) => d.regel_id), ["REG-901"]);
});

test("Bestandsprobleme stehen auch ohne neue Buchungen im Bericht", () => {
  const b = laufBericht({ ...leer, konten: [{ konto_id: "KTO-002", name: "Ohne Anker", kontotyp: "giro" }], log: [marke] });
  assert.match(renderLaufBericht(b), /BESTAND: KONTEN OHNE BELEGTEN ANKER \(1\)/);
  assert.doesNotMatch(renderLaufBericht(b), /Keine Auffaelligkeiten/);
});

test("ein ruhiger Lauf bleibt kurz und laesst leere Abschnitte weg", () => {
  const text = renderLaufBericht(laufBericht({ ...leer, log: [marke], transaktionen: [
    auto({ gegenpartei: "Stammladen", importiert_am: vor }), auto({ gegenpartei: "Stammladen", importiert_am: nach }),
  ] }));
  assert.match(text, /DIESER LAUF: 1 neue Buchung seit 2026-11-02, Summe -10\.00/);
  assert.match(text, /Keine Auffaelligkeiten/);
  assert.doesNotMatch(text, /NEUE HAENDLER|KAT-012|BESTAND:|undefined/);
});

test("der Import setzt importiert_am, und der Validator prueft die Form", () => {
  const entry = { konto_id: "KTO-001", buchungsdatum: "2026-06-03", betrag: "-4.20", gegenpartei: "Testkiosk", verwendungszweck: "Test", rohquelle: "data/inbox/test.csv" };
  const { transaktionen } = runImport({ entries: [entry], konten: [{ konto_id: "KTO-001" }], kategorien: [], kategorisierungsregeln: [], transaktionen: [], transfers: [], importiertAm: nach });
  assert.equal(transaktionen[0].importiert_am, nach);

  const feldBefunde = (tx) => validateMasterData({ transaktionen: [tx] }).befunde.filter((f) => String(f.feld ?? f.pfad ?? f.objekt ?? "").includes("importiert_am") || String(f.meldung ?? f.text ?? "").includes("importiert_am"));
  assert.deepEqual(feldBefunde(transaktionen[0]), []);
  assert.ok(feldBefunde({ ...transaktionen[0], importiert_am: "gestern" }).length > 0);
});
