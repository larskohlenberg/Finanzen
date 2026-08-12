// tests/agent-vorschlag.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { agentVorschlag } from "../app/tools/agent-vorschlag.mjs";

const tx = (over) => ({
  transaktion_id: "TXN-1",
  konto_id: "KTO-001",
  buchungsdatum: "2026-01-01",
  betrag: "-10.00",
  gegenpartei: "Irgendwer",
  verwendungszweck: "",
  kategorisierung_status: "offen",
  ...over,
});

test("offene Buchung wird vorgeschlagen mit Herkunft agent", () => {
  const out = agentVorschlag({ transaktionen: [tx({})], ids: ["TXN-1"], kategorieId: "KAT-012" });
  assert.equal(out.report.geaendert, 1);
  assert.deepEqual(out.transaktionen[0], {
    ...tx({}),
    kategorisierung_status: "vorgeschlagen",
    kategorie_id: "KAT-012",
    kategorie_herkunft: "agent",
  });
});

test("matched_regeln wird entfernt — bei Herkunft agent nie vorhanden", () => {
  const out = agentVorschlag({
    transaktionen: [tx({ matched_regeln: ["REG-001", "REG-002"] })],
    ids: ["TXN-1"],
    kategorieId: "KAT-004",
  });
  assert.equal(Object.hasOwn(out.transaktionen[0], "matched_regeln"), false);
  assert.equal(out.transaktionen[0].kategorie_herkunft, "agent");
});

test("entschiedene Buchungen werden nie angefasst", () => {
  const fest = [
    tx({ transaktion_id: "TXN-B", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "regel" }),
    tx({ transaktion_id: "TXN-A", kategorisierung_status: "abgelehnt" }),
    tx({ transaktion_id: "TXN-M", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-007", kategorie_herkunft: "manuell" }),
  ];
  const out = agentVorschlag({ transaktionen: fest, ids: ["TXN-B", "TXN-A", "TXN-M"], kategorieId: "KAT-012" });
  assert.equal(out.report.geaendert, 0);
  assert.equal(out.report.uebersprungen, 3);
  assert.deepEqual(out.transaktionen, fest);
});

test("ein bestehender Regel-Vorschlag wird nicht zum Agenten-Vorschlag umgebogen", () => {
  const regelVorschlag = tx({ kategorisierung_status: "vorgeschlagen", kategorie_id: "KAT-003", kategorie_herkunft: "regel", matched_regeln: ["REG-001"] });
  const out = agentVorschlag({ transaktionen: [regelVorschlag], ids: ["TXN-1"], kategorieId: "KAT-012" });
  assert.equal(out.report.uebersprungen, 1);
  assert.deepEqual(out.transaktionen[0], regelVorschlag);
});

test("ein eigener Agenten-Vorschlag darf korrigiert werden", () => {
  const out = agentVorschlag({
    transaktionen: [tx({ kategorisierung_status: "vorgeschlagen", kategorie_id: "KAT-012", kategorie_herkunft: "agent" })],
    ids: ["TXN-1"],
    kategorieId: "KAT-004",
  });
  assert.equal(out.report.geaendert, 1);
  assert.equal(out.transaktionen[0].kategorie_id, "KAT-004");
});

test("unveraenderter Vorschlag zaehlt als unveraendert, nicht als Aenderung", () => {
  const out = agentVorschlag({
    transaktionen: [tx({ kategorisierung_status: "vorgeschlagen", kategorie_id: "KAT-012", kategorie_herkunft: "agent" })],
    ids: ["TXN-1"],
    kategorieId: "KAT-012",
  });
  assert.equal(out.report.geaendert, 0);
  assert.equal(out.report.unveraendert, 1);
});

test("nicht getroffene IDs werden als fehlend gemeldet", () => {
  const out = agentVorschlag({ transaktionen: [tx({})], ids: ["TXN-1", "TXN-GIBTSNICHT"], kategorieId: "KAT-012" });
  assert.deepEqual(out.report.nicht_gefunden, ["TXN-GIBTSNICHT"]);
});

test("leere ID-Liste ist ein Fehler, kein stiller Volltreffer", () => {
  assert.throws(() => agentVorschlag({ transaktionen: [tx({})], ids: [], kategorieId: "KAT-012" }), /ids/);
});

test("fehlende Kategorie ist ein Fehler", () => {
  assert.throws(() => agentVorschlag({ transaktionen: [tx({})], ids: ["TXN-1"], kategorieId: "" }), /kategorie/i);
});
