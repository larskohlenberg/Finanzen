// MCP-Tool `kennzahlen`: dieselben Werte wie die Uebersicht. Die Uebersicht
// wird hier mit den Demodaten im Browser-Modus geladen (runtime.mjs mit
// fetch-Shim), das Tool laeuft als eigener Server-Prozess auf einem Abzug mit
// denselben Demodaten als data/master.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import { centsToDecimal } from "../app/tools/lib/text.mjs";
import { legeAbzugAn, starteServer } from "./mcp-hilfe.mjs";

globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.window = globalThis;
globalThis.fetch = async (pfad) => {
  const rein = String(pfad).replace(/^\.\//, "").replace(/\?.*$/, "").replace(/^data\/master\//, "data/demo/");
  const body = readFileSync(new URL(`../app/${rein}`, import.meta.url), "utf8");
  return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
};
await import("../app/i18n.js");
const { data } = await import("../app/runtime.mjs");
const selektoren = await import("../app/selektoren.mjs");
const { buildNextAgentAction } = await import("../app/next-action.mjs");
const { localTodayIso } = await import("../app/liquiditaet.mjs");

const eur = (cents) => `${centsToDecimal(cents)} EUR`;

let abzug;
before(() => { abzug = legeAbzugAn(); });
after(() => abzug.aufraeumen());

test("kennzahlen liefert dieselben Werte wie die Uebersicht", async () => {
  const heute = localTodayIso();
  const s = starteServer(abzug);
  try {
    const r = await s.werkzeug("kennzahlen", { stichtag: heute });
    assert.ok(!r.isError, r.text);
    const text = r.text;
    assert.match(text, new RegExp(`Stichtag ${heute}`));

    const netto = selektoren.currentNettovermoegen();
    assert.ok(text.includes(`Nettovermoegen: ${eur(netto.netto_cents)}`), text);
    assert.ok(text.includes(`Aktiva ${eur(netto.aktiva_cents)}`));
    assert.ok(text.includes(`Passiva ${eur(netto.passiva_cents)}`));
    assert.ok(text.includes(`Summe geladener Bewegungen (Konten): ${eur(selektoren.loadedTotalAccountsBalance())}`));

    // Kontentabelle in derselben Reihenfolge und mit denselben Salden.
    const zeilen = text.split("\n");
    const kontoZeilen = zeilen.filter((z) => /^- KTO-/.test(z));
    const konten = selektoren.sortedOverviewAccounts();
    assert.deepEqual(kontoZeilen.map((z) => z.slice(2).split(" ")[0]), konten.map((k) => k.konto_id));
    for (const [i, konto] of konten.entries()) {
      const z = selektoren.overviewAccountRow(konto);
      if (z.wert_cents === null) assert.ok(kontoZeilen[i].includes(`kein Wert (${z.basis})`), kontoZeilen[i]);
      else assert.ok(kontoZeilen[i].includes(`${eur(z.wert_cents)}, ${z.qualitaet} zum ${z.belegdatum}`), kontoZeilen[i]);
      if (konto.kontotyp !== "depot") assert.ok(kontoZeilen[i].includes(`letzte Buchung ${z.letzteBuchung || "-"}`), kontoZeilen[i]);
    }

    const aktion = buildNextAgentAction(data);
    assert.ok(text.includes(aktion.type === "none" ? "Naechste Aktion: keine" : `Naechste Aktion: ${aktion.label} (${aktion.count})`), text);
    for (const item of selektoren.overviewCheckPreviewItems()) assert.ok(text.includes(item.detail), item.detail);

    // Keine Einzelbuchungen, kein Float.
    assert.doesNotMatch(text, /TRX-/);
    for (const betrag of text.match(/-?\d+(\.\d+)? EUR/g)) assert.match(betrag, /^-?\d+\.\d{2} EUR$/);
  } finally {
    await s.beenden();
  }
});

test("kennzahlen: Stichtag wirkt auf Nettovermoegen, Default ist heute", async () => {
  const { computeNettovermoegen } = await import("../app/vermoegen.mjs");
  const frueher = "2025-01-31";
  const s = starteServer(abzug);
  try {
    const alt = (await s.werkzeug("kennzahlen", { stichtag: frueher })).text;
    assert.match(alt, /Stichtag 2025-01-31/);
    assert.ok(alt.includes(`Nettovermoegen: ${eur(computeNettovermoegen(data, frueher).netto_cents)}`), alt);
    const ohne = (await s.werkzeug("kennzahlen")).text;
    assert.match(ohne, new RegExp(`Stichtag ${localTodayIso()}`));
  } finally {
    await s.beenden();
  }
});

test("kennzahlen: ungueltiges Datum wird abgewiesen, lesendes Recht genuegt", async () => {
  const s = starteServer(abzug, "lesen");
  try {
    const tools = (await s.anfrage("tools/list")).result.tools;
    const tool = tools.find((t) => t.name === "kennzahlen");
    assert.ok(tool, "kennzahlen ist mit --recht=lesen gelistet");
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.match(tool.description, /Wie stehen wir\?/);

    for (const stichtag of ["2025-13-01", "2025-02-30", "gestern", "20250101"]) {
      const r = await s.werkzeug("kennzahlen", { stichtag });
      assert.equal(r.isError, true, stichtag);
    }
    const init = await s.anfrage("initialize", { protocolVersion: "2025-06-18", capabilities: {} });
    assert.match(init.result.instructions, /kennzahlen/);
  } finally {
    await s.beenden();
  }
});
