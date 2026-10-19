// Invarianten auf den Demodaten (Review Welle 2, 2.4), je an mehreren
// Stichtagen: dieselbe Frage gibt dieselbe Antwort, egal welche Ansicht fragt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMasterData } from "../app/tools/validator.mjs";
import { computeNettovermoegen, nettovermoegenVerlauf } from "../app/vermoegen.mjs";
import { computeLiquiditaetIst, liquiditaetVerlauf } from "../app/liquiditaet.mjs";
import { kontenGruppen } from "../app/uebersicht-rechnung.mjs";
import { uebersichtModell } from "../app/uebersicht-modell.mjs";
import { planIstMonate } from "../app/plan-ist-modell.mjs";
import { planIst } from "../app/plan-ist.mjs";
import { zahlungsplan } from "../app/darlehen.mjs";
import { computeSzenario } from "../app/szenarien.mjs";

const data = await loadMasterData(new URL("../app/data/demo/", import.meta.url));
const STICHTAGE = ["2024-06-30", "2025-03-31", "2025-12-31", "2026-06-22", "2026-10-19"];

test("Netto(d) = Verlauf(d) an jedem Monatsende", () => {
  for (const heute of STICHTAGE) {
    for (const p of nettovermoegenVerlauf(data, heute)) {
      assert.equal(p.netto_cents, computeNettovermoegen(data, p.datum).netto_cents, p.datum);
    }
  }
});

test("Liquiditaet heute = verfuegbares Geld der Kontentabelle = letzter Punkt des Liquiditaetsverlaufs", () => {
  for (const heute of STICHTAGE) {
    const ist = computeLiquiditaetIst(data, { today: heute }).saldo_cents;
    assert.equal(ist, kontenGruppen(data, heute).konten.summe_cents, heute);
    assert.equal(ist, liquiditaetVerlauf(data, heute).at(-1).saldo_cents, heute);
    // Liquide Konten sind Teil des Nettovermoegens mit demselben Wert.
    const n = computeNettovermoegen(data, heute);
    for (const k of computeLiquiditaetIst(data, { today: heute }).konten) {
      assert.equal(n.positionen.find((p) => p.id === k.konto_id)?.wert_cents ?? 0, k.saldo_cents ?? 0, `${heute} ${k.konto_id}`);
    }
  }
});

test("Kachel = round(Plan&Ist-Summe / Monate) bei gleicher Monatsliste", () => {
  for (const heute of STICHTAGE) {
    const u = uebersichtModell(data, heute);
    assert.deepEqual(u.mittel.monate, planIstMonate(data, heute).slice(-12), heute);
    if (!u.mittel.anzahl_monate) continue;
    const r = planIst(data, u.mittel.monate);
    assert.equal(u.mittel.einnahmen.mittel_cents, Math.round(r.einnahmen.ist_cents / u.mittel.anzahl_monate), heute);
    assert.equal(u.mittel.ausgaben.mittel_cents, Math.round(r.ausgaben.ist_cents / u.mittel.anzahl_monate), heute);
    assert.deepEqual(u.mittel.ausschluesse, r.ausschluesse, heute);
  }
});

test("Tilgung <-> Geldfluss: Summe der Zahlungen = Zinsen + getilgte Schuld; Szenario-Schuld folgt dem Zahlungsplan", () => {
  const heute = "2026-10-19";
  const netto = computeNettovermoegen(data, heute);
  for (const sz of data.szenarien) {
    const r = computeSzenario(data, { ...sz, annahmen: [] }, heute).basis;
    for (const d of r.darlehen) {
      const darlehen = data.darlehen.find((x) => x.darlehen_id === d.darlehen_id);
      const start = -netto.positionen.find((p) => p.id === d.darlehen_id).wert_cents;
      assert.equal(d.start_cents, start);
      const plan = zahlungsplan(darlehen, { start: { datum: heute, rest_cents: start }, bis: sz.reichweite_bis, regelzahlungen: data.regelzahlungen });
      const summe = (f) => plan.ereignisse.reduce((a, e) => a + e[f], 0);
      assert.equal(summe("zahlung_cents"), summe("zins_cents") + (start - d.ende_cents), `${sz.szenario_id} ${d.darlehen_id}`);
      assert.equal(plan.ereignisse.at(-1)?.rest_cents ?? start, d.ende_cents);
    }
  }
});
