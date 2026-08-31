// tests/freigabe.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { freigabe } from "../app/tools/freigabe.mjs";

let n = 0;
function tx(props) {
  n += 1;
  return {
    transaktion_id: `TXN-${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`,
    dedupe_hash: `h${n}`, rohquelle: "data/inbox/x.csv", konto_id: "KTO-001",
    buchungsdatum: "2026-05-20", betrag: "-10.00", gegenpartei: "Testladen",
    verwendungszweck: "", ist_transfer: false, ...props,
  };
}
function regel(props) {
  return { regel_id: "REG-001", gegenpartei_pattern: "testladen", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-06-01", kommentar: "Testregel", belegstufe: "E2", ...props };
}
function vorschlag(props) {
  return tx({ kategorisierung_status: "vorgeschlagen", kategorie_id: "KAT-003", kategorie_herkunft: "regel", matched_regeln: ["REG-001"], ...props });
}
const streuend = () => [
  tx({ gegenpartei: "Testladen Ortstoken", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", bestaetigt_durch: "mensch" }),
  tx({ gegenpartei: "Baumarkt Ortstoken", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-005", bestaetigt_durch: "mensch" }),
  tx({ gegenpartei: "Apotheke Ortstoken", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-007", bestaetigt_durch: "mensch" }),
];

test("saubere Regel gibt frei", () => {
  const out = freigabe({ transaktionen: [vorschlag()], regeln: [regel()] });
  assert.equal(out.transaktionen[0].kategorisierung_status, "bestaetigt");
  assert.equal(out.transaktionen[0].bestaetigt_durch, "auto");
  assert.equal(out.report.freigegeben, 1);
});

test("Agentenvorschlag wird freigegeben", () => {
  const t = tx({ kategorisierung_status: "vorgeschlagen", kategorie_id: "KAT-012", kategorie_herkunft: "agent" });
  const out = freigabe({ transaktionen: [t], regeln: [] });
  assert.equal(out.transaktionen[0].bestaetigt_durch, "auto");
  assert.equal(out.report.agent_freigegeben, 1);
});

test("fehlende belegstufe haelt zurueck", () => {
  const r = regel(); delete r.belegstufe;
  const out = freigabe({ transaktionen: [vorschlag()], regeln: [r] });
  assert.equal(out.transaktionen[0].kategorisierung_status, "vorgeschlagen");
  assert.equal(out.report.gate_durchfall[0].grund, "belegstufe");
});

test("inaktive Regel haelt zurueck", () => {
  const out = freigabe({ transaktionen: [vorschlag()], regeln: [regel({ status: "inaktiv" })] });
  assert.equal(out.report.gate_durchfall[0].grund, "inaktiv");
});

test("leerer Kommentar haelt zurueck", () => {
  const out = freigabe({ transaktionen: [vorschlag()], regeln: [regel({ kommentar: "  " })] });
  assert.equal(out.report.gate_durchfall[0].grund, "kommentar");
});

test("gesperrte Belegstufe haelt zurueck", () => {
  const out = freigabe({ transaktionen: [vorschlag()], regeln: [regel({ belegstufe: "E4" })], gesperrteBelegstufen: ["E4"] });
  assert.equal(out.report.gate_durchfall[0].grund, "gesperrt");
});

test("unspezifisches Muster haelt zurueck", () => {
  const v = vorschlag({ gegenpartei: "Neuer Laden Ortstoken" });
  const out = freigabe({ transaktionen: [...streuend(), v], regeln: [regel({ gegenpartei_pattern: "ortstoken" })] });
  assert.equal(out.report.gate_durchfall[0].grund, "spezifitaet");
  assert.equal(out.report.zurueckgehalten, 1);
});

test("Auto-Freigaben dieses Laufs veraendern die Referenzmenge nicht", () => {
  // Zirkularitaetstest: die Referenzmenge wird EINMAL vor dem Lauf gebildet.
  // Sonst wuerden 50 Freigaben auf eine Kategorie das Muster nachtraeglich
  // spezifisch erscheinen lassen.
  const viele = Array.from({ length: 50 }, () => vorschlag({ gegenpartei: "Irgendwas Ortstoken" }));
  const out = freigabe({ transaktionen: [...streuend(), ...viele], regeln: [regel({ gegenpartei_pattern: "ortstoken" })] });
  assert.equal(out.report.freigegeben, 0);
  assert.equal(out.report.zurueckgehalten, 50);
});

test("nicht-vorgeschlagene Buchungen bleiben unberuehrt", () => {
  const offen = tx({ kategorisierung_status: "offen" });
  const out = freigabe({ transaktionen: [offen], regeln: [regel()] });
  assert.deepEqual(out.transaktionen[0], offen);
});

test("unbekannte Regel-ID haelt zurueck statt abzustuerzen", () => {
  const out = freigabe({ transaktionen: [vorschlag({ matched_regeln: ["REG-999"] })], regeln: [regel()] });
  assert.equal(out.report.zurueckgehalten, 1);
  assert.equal(out.report.gate_durchfall[0].grund, "unbekannt");
});

test("freigaben zaehlt je Regel mit Belegstufe", () => {
  const out = freigabe({ transaktionen: [vorschlag(), vorschlag()], regeln: [regel()] });
  assert.equal(out.report.freigaben[0].regel_id, "REG-001");
  assert.equal(out.report.freigaben[0].anzahl, 2);
  assert.equal(out.report.freigaben[0].belegstufe, "E2");
});

test("eine durchgefallene von zwei Regeln haelt die Buchung zurueck", () => {
  const v = vorschlag({ matched_regeln: ["REG-001", "REG-002"] });
  const out = freigabe({ transaktionen: [v], regeln: [regel(), regel({ regel_id: "REG-002", status: "inaktiv" })] });
  assert.equal(out.transaktionen[0].kategorisierung_status, "vorgeschlagen");
});

// --- Verliehene Belegstufe (ADR 0027) -------------------------------------
// Die Regel hat sich nicht geaendert, ihre Welt hat sich geaendert: eine auf
// KTO-001 verdiente Stufe traegt auf KTO-006 nichts.
const ankerAufEins = () => tx({
  konto_id: "KTO-001", kategorisierung_status: "bestaetigt", bestaetigt_durch: "mensch",
  kategorie_herkunft: "regel", kategorie_id: "KAT-003", matched_regeln: ["REG-001"],
});

test("verliehene Belegstufe haelt auf dem fremden Konto zurueck", () => {
  const out = freigabe({
    transaktionen: [ankerAufEins(), vorschlag({ konto_id: "KTO-006" })],
    regeln: [regel()],
  });
  assert.equal(out.transaktionen[1].kategorisierung_status, "vorgeschlagen");
  assert.equal(out.report.gate_durchfall[0].grund, "anker");
  assert.equal(out.report.gate_durchfall[0].konto_id, "KTO-006");
});

test("dieselbe Regel gibt auf ihrem Ankerkonto weiter frei", () => {
  // Der Kern des Kriteriums: es haengt am Paar aus Regel und Konto, nicht an
  // der Regel. Eine Ausweitung darf den bewaehrten Teil nicht mitreissen.
  const out = freigabe({
    transaktionen: [ankerAufEins(), vorschlag({ konto_id: "KTO-001" }), vorschlag({ konto_id: "KTO-006" })],
    regeln: [regel()],
  });
  assert.equal(out.report.freigegeben, 1);
  assert.equal(out.report.zurueckgehalten, 1);
  assert.equal(out.transaktionen[1].konto_id, "KTO-001");
  assert.equal(out.transaktionen[1].bestaetigt_durch, "auto");
});

test("eine Regel ohne Anker erschliesst ein neues Konto und gibt frei", () => {
  // E3 ruht auf einem Beleg, nicht auf dem Bestand. Wuerde das Gate auch hier
  // greifen, waere fuer jedes neue Konto der Bucket-Dialog zurueck.
  const out = freigabe({
    transaktionen: [vorschlag({ konto_id: "KTO-006" })],
    regeln: [regel({ belegstufe: "E3" })],
  });
  assert.equal(out.report.freigegeben, 1);
  assert.deepEqual(out.report.gate_durchfall, []);
});

test("Auto-Freigaben dieses Laufs schaffen keinen Kontoanker", () => {
  // Zirkularitaetstest, zweite Achse: sonst wuerde die erste durchgerutschte
  // Buchung auf KTO-006 die Stufe fuer alle folgenden legitimieren.
  const viele = Array.from({ length: 5 }, () => vorschlag({ konto_id: "KTO-006" }));
  const out = freigabe({ transaktionen: [ankerAufEins(), ...viele], regeln: [regel()] });
  assert.equal(out.report.freigegeben, 0);
  assert.equal(out.report.zurueckgehalten, 5);
});

test("strukturelle Gruende schlagen den Ankergrund", () => {
  // Der Ankergrund gilt einem Paar, die anderen der Regel selbst. Eine kaputte
  // Regel soll als kaputt gemeldet werden, nicht als Ausweitung.
  const out = freigabe({
    transaktionen: [ankerAufEins(), vorschlag({ konto_id: "KTO-006" })],
    regeln: [regel({ kommentar: "  " })],
  });
  assert.equal(out.report.gate_durchfall[0].grund, "kommentar");
  assert.equal(out.report.gate_durchfall[0].konto_id, undefined);
});
