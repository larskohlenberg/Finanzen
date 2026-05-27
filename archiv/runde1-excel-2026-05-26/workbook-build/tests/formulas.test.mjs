import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateActualMonthlyCashflow,
  calculateExpectedMonthlyCashflow,
  calculateFreeLiquidity,
  calculateLiquidityToday,
  calculateScenarioTimeline,
  calculateUncategorizedExpenseShare,
  calculateRunwayMonths,
} from "../src/formulas.mjs";

test("calculates current liquidity from liquid-relevant account balances", () => {
  const accounts = [
    { Konto_ID: "KTO001", Kontoart: "Girokonto", Aktueller_Stand: 4250, Liquide_relevant: true, Status: "belegt" },
    { Konto_ID: "KTO002", Kontoart: "Immobilie", Aktueller_Stand: 300000, Liquide_relevant: false, Status: "belegt" },
    { Konto_ID: "KTO003", Kontoart: "Tagesgeld", Aktueller_Stand: 1200.5, Liquide_relevant: true, Status: "belegt" },
    { Konto_ID: "KTO004", Kontoart: "Girokonto", Aktueller_Stand: 100, Liquide_relevant: true, Status: "inaktiv" },
  ];

  assert.equal(calculateLiquidityToday(accounts), 5450.5);
});

test("calculates free liquidity after the active safety reserve", () => {
  const assumptions = [
    { Annahme_ID: "ASM001", Name: "Sicherheitsreserve", Bereich: "Liquiditaet", Wert: 3000, Szenario_ID: "S01", Status: "geschaetzt" },
    { Annahme_ID: "ASM999", Name: "Sicherheitsreserve", Bereich: "Liquiditaet", Wert: 1000, Szenario_ID: "S02", Status: "geschaetzt" },
    { Annahme_ID: "ASM000", Name: "Sicherheitsreserve", Bereich: "Liquiditaet", Wert: 999, Szenario_ID: "S01", Status: "inaktiv" },
  ];

  assert.equal(calculateFreeLiquidity({ liquidityToday: 4250, assumptions, scenarioId: "S01" }), 1250);
});

test("calculates actual monthly cashflow from non-transfer model transactions", () => {
  const transactions = [
    { Betrag: 2500, Buchungsmonat: "2026-05", Szenario_Wirkung: "Ist", Ist_Transfer: false },
    { Betrag: -1200, Buchungsmonat: "2026-05", Szenario_Wirkung: "Ist", Ist_Transfer: false },
    { Betrag: -186.42, Buchungsmonat: "2026-05", Szenario_Wirkung: "Ist", Ist_Transfer: false },
    { Betrag: -74.9, Buchungsmonat: "2026-05", Szenario_Wirkung: "Ist", Ist_Transfer: false },
    { Betrag: -999, Buchungsmonat: "2026-05", Szenario_Wirkung: "Ist", Ist_Transfer: true },
    { Betrag: 500, Buchungsmonat: "2026-06", Szenario_Wirkung: "Ist", Ist_Transfer: false },
  ];

  assert.equal(calculateActualMonthlyCashflow({ transactions, month: "2026-05" }), 1038.68);
});

test("calculates expected monthly cashflow from monthly rules and variable expense assumptions", () => {
  const regularPayments = [
    { Regel_ID: "REG001", Frequenz: "monatlich", Erwarteter_Betrag: -1200, Status: "offen", Szenario_Wirkung: "S01" },
    { Regel_ID: "REG002", Frequenz: "jaehrlich", Erwarteter_Betrag: -600, Status: "offen", Szenario_Wirkung: "S01" },
    { Regel_ID: "REG003", Frequenz: "monatlich", Erwarteter_Betrag: -50, Status: "verworfen", Szenario_Wirkung: "S01" },
    { Regel_ID: "REG004", Frequenz: "monatlich", Erwarteter_Betrag: 100, Status: "offen", Szenario_Wirkung: "S02" },
  ];
  const assumptions = [
    { Name: "Variable Ausgaben-Schaetzung", Bereich: "Cashflow", Wert: 900, Szenario_ID: "S01", Status: "platzhalter" },
    { Name: "Variable Ausgaben-Schaetzung", Bereich: "Cashflow", Wert: 100, Szenario_ID: "S02", Status: "platzhalter" },
  ];

  assert.equal(calculateExpectedMonthlyCashflow({ regularPayments, assumptions, scenarioId: "S01" }), -2100);
});

test("calculates uncategorized expense share from open model transactions", () => {
  const transactions = [
    { Betrag: 2500, Buchungsmonat: "2026-05", Cashflow_Wirkung: "Einnahme", Kategorie_ID: "KAT001", Ist_Transfer: false },
    { Betrag: -1200, Buchungsmonat: "2026-05", Cashflow_Wirkung: "Ausgabe", Kategorie_ID: "KAT002", Ist_Transfer: false },
    { Betrag: -186.42, Buchungsmonat: "2026-05", Cashflow_Wirkung: "Ausgabe", Kategorie_ID: "KAT003", Ist_Transfer: false },
    { Betrag: -74.9, Buchungsmonat: "2026-05", Cashflow_Wirkung: "Ausgabe", Kategorie_ID: "KAT013", Ist_Transfer: false },
    { Betrag: -500, Buchungsmonat: "2026-05", Cashflow_Wirkung: "Ausgabe", Kategorie_ID: "KAT013", Ist_Transfer: true },
  ];

  assert.equal(calculateUncategorizedExpenseShare({ transactions, month: "2026-05", openCategoryId: "KAT013" }), 5.13);
});

test("calculates runway months from free liquidity and expected burn", () => {
  assert.equal(calculateRunwayMonths({ freeLiquidity: 1250, monthlyNetCashflow: -2100 }), 0.6);
  assert.equal(calculateRunwayMonths({ freeLiquidity: 1250, monthlyNetCashflow: 100 }), "unbegrenzt_bei_positivem_cashflow");
});

test("calculates scenario timeline from starting liquidity and monthly net cashflow", () => {
  assert.deepEqual(
    calculateScenarioTimeline({
      startingLiquidity: 4250,
      monthlyNetCashflow: -2100,
      months: ["2026-05", "2026-06", "2026-07"],
    }),
    [
      { month: "2026-05", netCashflow: -2100, cumulativeLiquidity: 2150 },
      { month: "2026-06", netCashflow: -2100, cumulativeLiquidity: 50 },
      { month: "2026-07", netCashflow: -2100, cumulativeLiquidity: -2050 },
    ],
  );
});
