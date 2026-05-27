function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

function isInactive(row) {
  return String(row.Status ?? "").trim().toLowerCase() === "inaktiv";
}

function isDiscarded(row) {
  return ["inaktiv", "verworfen", "abgelehnt"].includes(String(row.Status ?? "").trim().toLowerCase());
}

function isTransfer(row) {
  return row.Ist_Transfer === true || String(row.Ist_Transfer).toLowerCase() === "true";
}

export function calculateLiquidityToday(accounts) {
  return roundCurrency(
    accounts
      .filter((row) => !isInactive(row))
      .filter((row) => row.Liquide_relevant === true || String(row.Liquide_relevant).toLowerCase() === "true")
      .reduce((sum, row) => sum + asNumber(row.Aktueller_Stand), 0),
  );
}

export function calculateFreeLiquidity({ liquidityToday, assumptions, scenarioId = "S01" }) {
  const reserve = assumptions
    .filter((row) => !isInactive(row))
    .find((row) => row.Name === "Sicherheitsreserve" && row.Bereich === "Liquiditaet" && row.Szenario_ID === scenarioId);
  return roundCurrency(asNumber(liquidityToday) - asNumber(reserve?.Wert));
}

export function calculateActualMonthlyCashflow({ transactions, month }) {
  return roundCurrency(
    transactions
      .filter((row) => row.Buchungsmonat === month)
      .filter((row) => row.Szenario_Wirkung === "Ist")
      .filter((row) => !isTransfer(row))
      .reduce((sum, row) => sum + asNumber(row.Betrag), 0),
  );
}

export function calculateExpectedMonthlyCashflow({ regularPayments, assumptions, scenarioId = "S01" }) {
  const monthlyRegularPayments = regularPayments
    .filter((row) => !isDiscarded(row))
    .filter((row) => row.Szenario_Wirkung === scenarioId)
    .filter((row) => String(row.Frequenz ?? "").trim().toLowerCase() === "monatlich")
    .reduce((sum, row) => sum + asNumber(row.Erwarteter_Betrag), 0);

  const variableExpenseAssumption = assumptions
    .filter((row) => !isInactive(row))
    .find(
      (row) =>
        row.Name === "Variable Ausgaben-Schaetzung" &&
        row.Bereich === "Cashflow" &&
        row.Szenario_ID === scenarioId,
    );
  const variableExpenses = variableExpenseAssumption ? -Math.abs(asNumber(variableExpenseAssumption.Wert)) : 0;

  return roundCurrency(monthlyRegularPayments + variableExpenses);
}

export function calculateUncategorizedExpenseShare({ transactions, month, openCategoryId = "KAT013" }) {
  const expenseTransactions = transactions
    .filter((row) => row.Buchungsmonat === month)
    .filter((row) => !isTransfer(row))
    .filter((row) => asNumber(row.Betrag) < 0);
  const totalExpenses = expenseTransactions.reduce((sum, row) => sum + Math.abs(asNumber(row.Betrag)), 0);
  if (totalExpenses === 0) {
    return 0;
  }

  const openExpenses = expenseTransactions
    .filter((row) => row.Kategorie_ID === openCategoryId)
    .reduce((sum, row) => sum + Math.abs(asNumber(row.Betrag)), 0);
  return Math.round((openExpenses / totalExpenses) * 10000) / 100;
}

export function calculateRunwayMonths({ freeLiquidity, monthlyNetCashflow }) {
  const liquidity = asNumber(freeLiquidity);
  const monthlyNet = asNumber(monthlyNetCashflow);
  if (monthlyNet >= 0) {
    return "unbegrenzt_bei_positivem_cashflow";
  }
  if (liquidity <= 0) {
    return 0;
  }
  return Math.round((liquidity / Math.abs(monthlyNet)) * 10) / 10;
}

export function calculateScenarioTimeline({ startingLiquidity, monthlyNetCashflow, months }) {
  let cumulativeLiquidity = asNumber(startingLiquidity);
  return months.map((month) => {
    const netCashflow = roundCurrency(monthlyNetCashflow);
    cumulativeLiquidity = roundCurrency(cumulativeLiquidity + netCashflow);
    return { month, netCashflow, cumulativeLiquidity };
  });
}
