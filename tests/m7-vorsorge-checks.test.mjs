import { test } from "node:test";
import assert from "node:assert/strict";
import { computeVermoegenChecks } from "../app/vermoegen.mjs";

const TODAY = "2026-06-28";
const base = { konten: [], immobilien: [], vermoegenswerte: [], darlehen: [], transaktionen: [], regelzahlungen: [] };

test("vorsorge-ungeprueft feuert ohne geprueft_am", () => {
  const checks = computeVermoegenChecks({
    ...base,
    vorsorge: [{ vorsorge_id: "VS-006", art: "betriebsrente", name: "bAV Lena", person_id: "PER-001", status: "geplant", kapitalbildend: false }],
    zeitwerte: [{ entitaet: "vorsorge", entitaet_id: "VS-006", feld: "erwartete_rente", wert: "240.00", standdatum: "2026-01-01", qualitaet: "geschaetzt" }],
  }, TODAY);
  assert.ok(checks.some((c) => c.art === "vorsorge-ungeprueft" && c.entitaet_id === "VS-006"));
});

test("vorsorge-ungeprueft verschwindet mit geprueft_am", () => {
  const checks = computeVermoegenChecks({
    ...base,
    vorsorge: [{ vorsorge_id: "VS-006", art: "betriebsrente", name: "bAV", person_id: "PER-001", status: "geplant", kapitalbildend: false, geprueft_am: "2026-03-01" }],
    zeitwerte: [{ entitaet: "vorsorge", entitaet_id: "VS-006", feld: "erwartete_rente", wert: "240.00", standdatum: "2026-03-01", qualitaet: "geschaetzt" }],
  }, TODAY);
  assert.ok(!checks.some((c) => c.art === "vorsorge-ungeprueft"));
});

test("vorsorge-wiedervorlage feuert bei alter Pruefung", () => {
  const checks = computeVermoegenChecks({
    ...base,
    vorsorge: [{ vorsorge_id: "VS-001", art: "gesetzliche-rente", name: "GRV", person_id: "PER-001", status: "geplant", kapitalbildend: false, geprueft_am: "2024-01-01" }],
    zeitwerte: [{ entitaet: "vorsorge", entitaet_id: "VS-001", feld: "erwartete_rente", wert: "1480.00", standdatum: "2024-01-01", qualitaet: "geschaetzt" }],
  }, TODAY);
  assert.ok(checks.some((c) => c.art === "vorsorge-wiedervorlage" && c.entitaet_id === "VS-001"));
});

test("vorsorge-wechsel warnt bei kuenftigem Beitragsende ohne Nachfolger", () => {
  const checks = computeVermoegenChecks({ ...base,
    vorsorge: [{ vorsorge_id: "VS-007", art: "schutzversicherung", name: "KFZ-HV alt", person_id: "PER-001", status: "gekuendigt", kapitalbildend: false, geprueft_am: "2026-01-01" }],
    regelzahlungen: [{ regelzahlung_id: "RZ-014", bezeichnung: "KFZ-HV alt", betrag: "-92.00", rhythmus_einheit: "jahr", rhythmus_intervall: 1, anker_datum: "2025-01-01", aktiv_bis: "2026-12-31", status: "bestaetigt", erstellt_am: "2025-01-01", vorsorge_id: "VS-007" }],
  }, TODAY);
  assert.ok(checks.some((c) => c.art === "vorsorge-wechsel" && c.entitaet_id === "VS-007"));
});

test("vorsorge-wechsel schweigt mit lueckenlosem Nachfolger", () => {
  const checks = computeVermoegenChecks({ ...base,
    vorsorge: [
      { vorsorge_id: "VS-007", art: "schutzversicherung", name: "KFZ-HV alt", person_id: "PER-001", status: "gekuendigt", kapitalbildend: false, geprueft_am: "2026-01-01" },
      { vorsorge_id: "VS-008", art: "schutzversicherung", name: "KFZ-HV neu", person_id: "PER-001", status: "aktiv", kapitalbildend: false, geprueft_am: "2026-01-01", ersetzt_vorsorge_id: "VS-007" },
    ],
    regelzahlungen: [
      { regelzahlung_id: "RZ-014", bezeichnung: "KFZ alt", betrag: "-92.00", rhythmus_einheit: "jahr", rhythmus_intervall: 1, anker_datum: "2025-01-01", aktiv_bis: "2026-12-31", status: "bestaetigt", erstellt_am: "2025-01-01", vorsorge_id: "VS-007" },
      { regelzahlung_id: "RZ-015", bezeichnung: "KFZ neu", betrag: "-88.00", rhythmus_einheit: "jahr", rhythmus_intervall: 1, anker_datum: "2027-01-01", status: "bestaetigt", erstellt_am: "2026-12-01", vorsorge_id: "VS-008" },
    ],
  }, TODAY);
  assert.ok(!checks.some((c) => c.art === "vorsorge-wechsel"));
});

test("vorsorge-wechsel schweigt bei vergangenem Ende", () => {
  const checks = computeVermoegenChecks({ ...base,
    vorsorge: [{ vorsorge_id: "VS-007", art: "schutzversicherung", name: "alt", person_id: "PER-001", status: "gekuendigt", kapitalbildend: false, geprueft_am: "2026-01-01" }],
    regelzahlungen: [{ regelzahlung_id: "RZ-014", bezeichnung: "alt", betrag: "-92.00", rhythmus_einheit: "jahr", rhythmus_intervall: 1, anker_datum: "2024-01-01", aktiv_bis: "2025-06-30", status: "bestaetigt", erstellt_am: "2024-01-01", vorsorge_id: "VS-007" }],
  }, TODAY);
  assert.ok(!checks.some((c) => c.art === "vorsorge-wechsel"));
});

test("vorsorge-wechsel warnt bei Deckungsluecke (Nachfolger schliesst nicht lueckenlos an)", () => {
  const checks = computeVermoegenChecks({ ...base,
    vorsorge: [
      { vorsorge_id: "VS-007", art: "schutzversicherung", name: "KFZ-HV alt", person_id: "PER-001", status: "gekuendigt", kapitalbildend: false, geprueft_am: "2026-01-01" },
      { vorsorge_id: "VS-008", art: "schutzversicherung", name: "KFZ-HV neu", person_id: "PER-001", status: "aktiv", kapitalbildend: false, geprueft_am: "2026-01-01", ersetzt_vorsorge_id: "VS-007" },
    ],
    regelzahlungen: [
      { regelzahlung_id: "RZ-014", bezeichnung: "KFZ alt", betrag: "-92.00", rhythmus_einheit: "jahr", rhythmus_intervall: 1, anker_datum: "2025-01-01", aktiv_bis: "2026-12-31", status: "bestaetigt", erstellt_am: "2025-01-01", vorsorge_id: "VS-007" },
      // Nachfolger beginnt erst 2027-03-01 -> Luecke nach ende+1Tag (2027-01-01)
      { regelzahlung_id: "RZ-015", bezeichnung: "KFZ neu", betrag: "-88.00", rhythmus_einheit: "jahr", rhythmus_intervall: 1, anker_datum: "2027-03-01", status: "bestaetigt", erstellt_am: "2026-12-01", vorsorge_id: "VS-008" },
    ],
  }, TODAY);
  assert.ok(checks.some((c) => c.art === "vorsorge-wechsel" && c.entitaet_id === "VS-007" && /Deckungsl/.test(c.text)));
});

test("vorsorge-wechsel warnt wenn Nachfolger gar keinen Beitrag traegt", () => {
  const checks = computeVermoegenChecks({ ...base,
    vorsorge: [
      { vorsorge_id: "VS-007", art: "schutzversicherung", name: "KFZ-HV alt", person_id: "PER-001", status: "gekuendigt", kapitalbildend: false, geprueft_am: "2026-01-01" },
      { vorsorge_id: "VS-008", art: "schutzversicherung", name: "KFZ-HV neu", person_id: "PER-001", status: "aktiv", kapitalbildend: false, geprueft_am: "2026-01-01", ersetzt_vorsorge_id: "VS-007" },
    ],
    regelzahlungen: [
      { regelzahlung_id: "RZ-014", bezeichnung: "KFZ alt", betrag: "-92.00", rhythmus_einheit: "jahr", rhythmus_intervall: 1, anker_datum: "2025-01-01", aktiv_bis: "2026-12-31", status: "bestaetigt", erstellt_am: "2025-01-01", vorsorge_id: "VS-007" },
      // VS-008 hat keine Beitrags-Regelzahlung
    ],
  }, TODAY);
  assert.ok(checks.some((c) => c.art === "vorsorge-wechsel" && c.entitaet_id === "VS-007"));
});
