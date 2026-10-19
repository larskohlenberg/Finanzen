// Eigenschaftstests Geld und Rhythmus (Review Welle 2, 2.4) mit festem
// Zufallsgenerator: gleiche Saat, gleiche Faelle, reproduzierbar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { centsToDecimal, toCents } from "../app/tools/lib/text.mjs";
import { addInterval, betragJeJahrCents, betragJeMonatCents, termin, termine, zinsJePeriodeCents } from "../app/rhythmus.mjs";
import { zahlungsplan } from "../app/darlehen.mjs";
import { verteileRundung } from "../app/uebersicht-rechnung.mjs";

// mulberry32: kleiner, deterministischer Generator.
function zufall(saat) {
  let a = saat >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SAAT = 20261020;
const RUNDEN = 500;
const ganz = (r, min, max) => min + Math.floor(r() * (max - min + 1));
const datum = (r) => `${ganz(r, 2000, 2040)}-${String(ganz(r, 1, 12)).padStart(2, "0")}-${String(ganz(r, 1, 28)).padStart(2, "0")}`;
const EINHEITEN = ["tag", "woche", "monat", "jahr"];

test("Geld: Decimal-String und Cent sind verlustfrei umkehrbar", () => {
  const r = zufall(SAAT);
  for (let i = 0; i < RUNDEN; i++) {
    const cents = ganz(r, -1e9, 1e9);
    assert.equal(toCents(centsToDecimal(cents)), cents, String(cents));
  }
});

test("Geld: Rundung auf Euro verteilt exakt auf das gerundete Ziel", () => {
  const r = zufall(SAAT + 1);
  for (let i = 0; i < RUNDEN; i++) {
    const werte = Array.from({ length: ganz(r, 1, 8) }, () => ganz(r, 0, 5e6));
    const summe = werte.reduce((a, b) => a + b, 0);
    const verteilt = verteileRundung(werte, summe);
    assert.equal(verteilt.reduce((a, b) => a + b, 0), Math.round(summe / 100) * 100);
    verteilt.forEach((v, j) => assert.ok(Math.abs(v - werte[j]) < 200, `${v} ~ ${werte[j]}`));
  }
});

test("Zins: ganzzahlig, hoechstens ein halber Cent vom exakten Wert, halbe Cent vom Betrag weg", () => {
  const r = zufall(SAAT + 2);
  for (let i = 0; i < RUNDEN; i++) {
    const rest = ganz(r, -5e7, 5e8);
    const satz = `${ganz(r, 0, 12)}.${String(ganz(r, 0, 9999)).padStart(4, "0")}`;
    const einheit = EINHEITEN[ganz(r, 0, 3)];
    const intervall = ganz(r, 1, 4);
    const zins = zinsJePeriodeCents(rest, satz, einheit, intervall);
    assert.ok(Number.isInteger(zins));
    // exakt: rest * satzE4 * intervall / (1e6 * P), als Bruch in BigInt
    const P = { tag: 365n, woche: 52n, monat: 12n, jahr: 1n }[einheit];
    const [a, b] = satz.split(".");
    const num = BigInt(rest) * (BigInt(a) * 10000n + BigInt(b)) * BigInt(intervall);
    const den = 1000000n * P;
    const diff2 = (BigInt(zins) * den - num) * 2n; // 2 x Abweichung
    assert.ok(diff2 <= den && diff2 >= -den, `${rest} ${satz} ${einheit}/${intervall}: ${zins}`);
    if (diff2 === den || diff2 === -den) assert.equal(Math.sign(Number(diff2)), Math.sign(rest) || 1, "halber Cent vom Betrag weg");
    assert.equal(zinsJePeriodeCents(-rest, satz, einheit, intervall), -zins || 0, "symmetrisch");
  }
});

test("Rhythmus: Termine aufsteigend, im Fenster, Monatsende geklemmt; Termin k ist Anker + k Intervalle", () => {
  const r = zufall(SAAT + 3);
  for (let i = 0; i < RUNDEN; i++) {
    const anker = datum(r);
    const einheit = EINHEITEN[ganz(r, 1, 3)];
    const intervall = ganz(r, 1, 3);
    const von = addInterval(anker, "monat", -ganz(r, 0, 30));
    const bis = addInterval(anker, "monat", ganz(r, 0, 30));
    const ende = r() < 0.3 ? addInterval(anker, "monat", ganz(r, 0, 30)) : null;
    const liste = termine(anker, einheit, intervall, { von, bis, ende, vorAnker: true });
    for (let j = 1; j < liste.length; j++) assert.ok(liste[j - 1] < liste[j], "aufsteigend, ohne Doppel");
    for (const d of liste) {
      assert.ok(d >= von && d <= bis && (!ende || d <= ende), d);
      assert.ok(Number(d.slice(8, 10)) <= new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0)).getUTCDate());
    }
    // vorwaerts ohne vorAnker beginnt am Anker
    const vor = termine(anker, einheit, intervall, { bis });
    if (vor.length) assert.equal(vor[0], anker);
    for (let k = 0; k < vor.length; k++) assert.equal(vor[k], termin(anker, einheit, intervall, k));
  }
});

test("Rhythmus: Monats- und Jahresbetrag aus derselben Perioden-Tabelle", () => {
  const r = zufall(SAAT + 4);
  for (let i = 0; i < RUNDEN; i++) {
    const cents = ganz(r, -1e7, 1e7);
    const einheit = EINHEITEN[ganz(r, 0, 3)];
    const intervall = ganz(r, 1, 6);
    assert.ok(Math.abs(betragJeMonatCents(cents, einheit, intervall) * 12 - betragJeJahrCents(cents, einheit, intervall)) <= 6);
  }
});

test("Darlehen: Zahlung = Zins + Tilgung, Rest nie negativ, Summe Tilgung = Anfang - Ende", () => {
  const r = zufall(SAAT + 5);
  for (let i = 0; i < 200; i++) {
    const start = ganz(r, 0, 5e7);
    const darlehen = { darlehen_id: "DAR-001", anfangsdatum: datum(r), zinssatz: `${ganz(r, 0, 8)}.${String(ganz(r, 0, 99)).padStart(2, "0")}`, sollrate: centsToDecimal(ganz(r, 1000, 300000)), rhythmus_einheit: "monat", rhythmus_intervall: ganz(r, 1, 3) };
    const st = r() < 0.5 ? [{ datum: addInterval(darlehen.anfangsdatum, "monat", ganz(r, 1, 60)), nominal_cents: ganz(r, 0, 2e7), annahme_id: "A1" }] : [];
    const plan = zahlungsplan(darlehen, { start: { datum: darlehen.anfangsdatum, rest_cents: start }, bis: addInterval(darlehen.anfangsdatum, "jahr", 10), sondertilgungen: st });
    let rest = start;
    for (const e of plan.ereignisse) {
      assert.equal(e.zahlung_cents, e.zins_cents + e.tilgung_cents);
      rest -= e.tilgung_cents;
      assert.equal(e.rest_cents, rest);
      assert.ok(e.rest_cents >= 0);
    }
    if (plan.schluss) assert.equal(plan.ereignisse.find((e) => e.datum === plan.schluss.datum && e.rest_cents === 0)?.zahlung_cents, plan.schluss.zahlung_cents);
  }
});
