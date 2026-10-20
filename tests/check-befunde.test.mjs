// Pruefbefunde als strukturierte Werte (Review Welle 2, Check-Texte): die
// Rechenmodule liefern Code, Objekt, Betraege und Daten; Saetze baut
// check-texte.mjs mit den Formatierern des Aufrufers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeVermoegenChecks } from "../app/vermoegen.mjs";
import { rechneSzenario, guardrailWarnungen } from "../app/szenarien.mjs";
import { szenarioWarnungText, vermoegenCheckText } from "../app/check-texte.mjs";

const zw = (entitaet, id, feld, wert, standdatum) => ({ entitaet, entitaet_id: id, feld, wert, standdatum, qualitaet: "belegt" });

function daten() {
  return {
    konten: [
      { konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" },
      { konto_id: "KTO-002", name: "Depot", kontotyp: "depot", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: false, status: "aktiv" },
    ],
    transaktionen: [{ transaktion_id: "TXN-1", konto_id: "KTO-001", buchungsdatum: "2026-02-10", betrag: "-10.00" }],
    zeitwerte: [zw("konto", "KTO-001", "kontostand", "100.00", "2026-01-31"), zw("konto", "KTO-001", "kontostand", "95.50", "2026-02-28"), zw("konto", "KTO-002", "depotwert", "1000.00", "2025-01-31")],
    immobilien: [], vermoegenswerte: [], vorsorge: [], darlehen: [], regelzahlungen: [], fristen: [],
  };
}

const FORMAT = { geld: (c) => `<${c}>`, datum: (d) => `[${d}]` };

test("Vermoegens-Checks tragen Werte statt Text", () => {
  const checks = computeVermoegenChecks(daten(), "2026-06-30");
  for (const c of checks) assert.equal(c.text, undefined, c.art);
  const drift = checks.find((c) => c.art === "reconciliation-drift");
  assert.deepEqual({ ...drift }, { art: "reconciliation-drift", entitaet: "konto", entitaet_id: "KTO-001", name: "Giro", von: "2026-01-31", bis: "2026-02-28", erwartet_cents: 9000, belegt_cents: 9550, differenz_cents: 550 });
  const alt = checks.find((c) => c.art === "bewertung-veraltet");
  assert.equal(alt.standdatum, "2025-01-31");
  assert.equal(alt.schwelle_monate, 3);
  assert.equal(vermoegenCheckText(drift, FORMAT), "Konto Giro: Buchungen passen nicht zum Kontoauszug [2026-02-28] (erwartet <9000>, belegt <9550>)");
  assert.equal(vermoegenCheckText(drift), "Konto Giro: Buchungen passen nicht zum Kontoauszug 2026-02-28 (erwartet 90.00, belegt 95.50)");
  assert.equal(vermoegenCheckText(alt, FORMAT), "Depot Depot: Depotwert vom [2025-01-31] älter als 3 Monate");
});

test("Szenario-Warnungen und Prognose-Hinweise tragen Werte statt Text", () => {
  const d = daten();
  d.zeitwerte = d.zeitwerte.filter((z) => z.entitaet_id !== "KTO-001");
  const r = rechneSzenario(d, { szenario_id: "SZN-001", name: "T", status: "entwurf", stand: "2026-06-30", reichweite_bis: "2026-12-31", erstellt_am: "2026-06-30",
    annahmen: [{ annahme_id: "A1", art: "regelzahlung-aenderung", regelzahlung_id: "RZ-404", aktion: "beenden", ab: "2026-08-01", qualitaet: "belegt" }] }, "2026-06-30");
  for (const w of r.warnungen) assert.equal(w.text, undefined, w.code);
  const start = r.warnungen.find((w) => w.code === "startbestand-unbekannt");
  assert.deepEqual(start.positionen, [{ klasse: "konto", id: "KTO-001", name: "Giro" }]);
  assert.equal(szenarioWarnungText(start), "Startbestand unvollständig, ohne belegten Wert: Konto Giro");
  const ae = r.warnungen.find((w) => w.code === "aenderung-wirkungslos");
  assert.equal(ae.regelzahlung_id, "RZ-404");
  assert.equal(szenarioWarnungText(ae), "Änderung auf unbekannte Regelzahlung RZ-404");
  assert.equal(szenarioWarnungText({ code: "cash-realismus", kategorie_id: "KAT-003", plan_cents: 10000, ist_cents: 25000 }, FORMAT), "Geplante Ausgaben für KAT-003 (<10000>/Monat) liegen deutlich unter dem Ist-Durchschnitt (<25000>/Monat)");
  for (const g of guardrailWarnungen(d, "2026-06-30")) assert.equal(g.text, undefined);
});

test("Saetze folgen den Vorlagen der Oberflaechensprache, fehlende fallen auf Deutsch zurueck", () => {
  globalThis.window = globalThis;
  return import("../app/i18n.js").then(() => {
    const en = window.FINANCE_I18N.en.checkText;
    const vorlage = (k) => en[k];
    const drift = { art: "reconciliation-drift", entitaet: "konto", entitaet_id: "KTO-1", name: "Giro", bis: "2026-02-28", erwartet_cents: 9000, belegt_cents: 9550 };
    assert.equal(vermoegenCheckText(drift, { vorlage }), "Account Giro: bookings do not match the statement of 2026-02-28 (expected 90.00, recorded 95.50)");
    assert.equal(szenarioWarnungText({ code: "liquiditaet-negativ" }, { vorlage: () => undefined }), "Liquidität bereits im ersten Monat negativ");
    assert.deepEqual(Object.keys(en).sort(), Object.keys(window.FINANCE_I18N.de.checkText).sort());
  });
});
