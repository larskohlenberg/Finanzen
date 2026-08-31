// tests/pruefbericht.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { pruefbericht, renderBericht } from "../app/tools/pruefbericht.mjs";

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
