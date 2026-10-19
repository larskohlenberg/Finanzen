// MCP-Tool `kennzahlen`: dieselben Werte wie die Uebersicht. Die Uebersicht
// wird hier mit den Demodaten im Browser-Modus geladen (runtime.mjs mit
// fetch-Shim), das Tool laeuft als eigener Server-Prozess auf einem Abzug mit
// denselben Demodaten als data/master.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import { centsToDecimal } from "../app/tools/lib/text.mjs";
import { legeAbzugAn, starteServer } from "./mcp-hilfe.mjs";
import { bestandAntwort } from "./hilfe-bestand.mjs";

globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.window = globalThis;
globalThis.fetch = async (pfad) => {
  const bestand = bestandAntwort(pfad);
  if (bestand) return bestand;
  const rein = String(pfad).replace(/^\.\//, "").replace(/\?.*$/, "").replace(/^data\/master\//, "data/demo/");
  const body = readFileSync(new URL(`../app/${rein}`, import.meta.url), "utf8");
  return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
};
await import("../app/i18n.js");
const { data } = await import("../app/runtime.mjs");
const selektoren = await import("../app/selektoren.mjs");
const { buildNextAgentAction } = await import("../app/next-action.mjs");
const { localTodayIso } = await import("../app/liquiditaet.mjs");
const { checkItems, checkVorschau } = await import("../app/uebersicht-rechnung.mjs");

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
    const gruppen = selektoren.overviewAccountGroups();
    assert.ok(text.includes(`Verfuegbares Geld: ${eur(gruppen.konten.summe_cents)} (= Summe Konten der Tabelle, ${gruppen.konten.belegt} von ${gruppen.konten.gesamt} belegt`), text);
    assert.ok(text.includes(`Summe Depots: ${eur(gruppen.depots.summe_cents)}`), text);
    // Trend der Kacheln: Jahresvergleich der Summen (oder der Hinweis, dass Vormonate fehlen).
    assert.match(text, /Trend \(Ø letzte 12 Monate gegen die 12 davor|Trend: fuer den Vergleich fehlen/);

    // Kontentabelle in derselben Reihenfolge und mit denselben Salden.
    const zeilen = text.split("\n");
    const kontoZeilen = zeilen.filter((z) => /^- KTO-/.test(z));
    const konten = selektoren.sortedOverviewAccounts();
    assert.deepEqual(kontoZeilen.map((z) => z.slice(2).split(" ")[0]), konten.map((k) => k.konto_id));
    for (const [i, konto] of konten.entries()) {
      const z = selektoren.overviewAccountRow(konto);
      if (z.wert_cents === null) assert.ok(kontoZeilen[i].includes(`kein Wert (${z.basis})`), kontoZeilen[i]);
      else assert.ok(kontoZeilen[i].includes(`${eur(z.wert_cents)}, ${z.qualitaet} zum ${z.belegdatum}${z.veraltet ? ", veraltet" : ""}`), kontoZeilen[i]);
      assert.doesNotMatch(kontoZeilen[i], /letzte Buchung/);
    }

    const aktion = buildNextAgentAction(data);
    assert.ok(text.includes(aktion.type === "none" ? "Naechste Aktion: keine" : `Naechste Aktion: ${aktion.label} (${aktion.count})`), text);
    for (const item of checkVorschau(checkItems(data, heute))) assert.ok(text.includes(item.detail), item.detail);

    // Fristen: dieselben Termine wie anstehendeFristen, eine Zeile je Termin.
    const { anstehendeFristen } = await import("../app/fristen.mjs");
    const { fristZeile } = await import("../app/mcp/kennzahlen.mjs");
    const termine = anstehendeFristen(data, heute);
    assert.ok(text.includes(`Fristen (12 Monate ab Stichtag, dazu ueberfaellige; bald = innerhalb 60 Tagen): ${termine.length}`), text);
    assert.ok(termine.length > 0, "Demodaten haben Fristen");
    for (const termin of termine) assert.ok(text.includes(fristZeile(termin)), fristZeile(termin));

    // Absicherung je versicherter Person wie in der Kachel.
    const { absicherung } = await import("../app/absicherung.mjs");
    const personen = absicherung(data, heute);
    assert.ok(personen.some((p) => p.bu.posten.length && p.tod.posten.length), "Demodaten zeigen BU und Tod");
    assert.match(text, /Absicherung je versicherter Person/);
    for (const p of personen) {
      assert.ok(text.includes(`- ${p.person_id} ${p.name}: BU `), p.person_id);
      for (const x of [...p.bu.posten, ...p.tod.posten]) assert.ok(text.includes(`${x.vorsorge_id} ${x.name}: ${x.feld} ${eur(x.wert_cents)}, Stand ${x.standdatum}`), x.feld);
    }

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
