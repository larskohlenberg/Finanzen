import { createHash } from "node:crypto";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import { tableColumns, targetTableLayouts } from "./importWriterVerifier.mjs";

function toIsoDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return new Date(excelEpoch + Math.round(value) * 86400000).toISOString().slice(0, 10);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return "";
}

function monthKey(isoDate) {
  return isoDate.slice(0, 7);
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function displayText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function suggestionId(dateText, number) {
  return `SUG-${dateText.replaceAll("-", "")}-${String(number).padStart(3, "0")}`;
}

function fingerprint(parts) {
  return createHash("sha256")
    .update(parts.map((part) => normalizeText(part)).join("|"))
    .digest("hex")
    .slice(0, 16);
}

function hasTransferSignal(row) {
  const text = normalizeText(`${row.Zahlungsempfaenger} ${row.Zahlungspflichtiger} ${row.Verwendungszweck} ${row.Umsatztyp}`);
  return /\b(ubertrag|umbuchung|tagesgeld|depot|spar|kreditkarte|eigenes konto)\b/.test(text);
}

function counterpartyFor(row) {
  if (Number(row.Betrag) < 0) return displayText(row.Zahlungsempfaenger || row.Zahlungspflichtiger);
  return displayText(row.Zahlungspflichtiger || row.Zahlungsempfaenger);
}

function readRows(workbook, tableName) {
  const layout = targetTableLayouts[tableName];
  const sheet = workbook.worksheets.getItem(layout.sheetName);
  const columns = tableColumns[tableName];
  const endColumn = String.fromCharCode(64 + columns.length);
  const values = sheet.getRange(`A${layout.dataStartRow}:${endColumn}${layout.scanEndRow}`).values;
  return values
    .filter((row) => row[0] !== null && row[0] !== undefined && row[0] !== "")
    .map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index]])));
}

function groupRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const amount = Number(row.Betrag);
    const counterparty = counterpartyFor(row);
    const key = `${amount < 0 ? "out" : "in"}|${normalizeText(counterparty)}|${Math.round(Math.abs(amount))}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...row, BuchungsdatumIso: toIsoDate(row.Buchungsdatum), Counterparty: counterparty });
  }
  return [...groups.values()];
}

function candidateFromGroup(group) {
  const rows = [...group].sort((a, b) => a.BuchungsdatumIso.localeCompare(b.BuchungsdatumIso));
  const months = new Set(rows.map((row) => monthKey(row.BuchungsdatumIso)).filter(Boolean));
  if (rows.length < 3 || months.size < 3) return null;

  const amounts = rows.map((row) => Number(row.Betrag));
  const absMedian = Math.abs(median(amounts));
  const amountMin = Math.min(...amounts);
  const amountMax = Math.max(...amounts);
  const variability = absMedian === 0 ? 0 : Math.abs(amountMax - amountMin) / absMedian;
  if (variability > 0.25) return null;

  const first = rows[0];
  const type = hasTransferSignal(first) ? "Transfer" : Number(first.Betrag) > 0 ? "Einnahme" : "Ausgabe";
  return {
    rows,
    type,
    counterparty: first.Counterparty,
    iban: displayText(first.IBAN),
    purpose: displayText(first.Verwendungszweck),
    firstDate: rows[0].BuchungsdatumIso,
    lastDate: rows.at(-1).BuchungsdatumIso,
    medianAmount: round2(median(amounts)),
    amountMin: round2(amountMin),
    amountMax: round2(amountMax),
    variability: round2(variability),
    confidence: variability <= 0.05 ? 0.82 : 0.68,
  };
}

function buildRegularPaymentSuggestion(candidate, id, runId, createdAt, accountId) {
  return {
    Vorschlag_ID: id,
    Erkannt_am: createdAt,
    Lauf_ID: runId,
    Vorgeschlagener_Name: candidate.counterparty || candidate.purpose || "Wiederkehrendes Muster",
    Vorgeschlagene_Frequenz: "monatlich",
    Treffer_Anzahl: candidate.rows.length,
    Erstes_Datum: candidate.firstDate,
    Letztes_Datum: candidate.lastDate,
    Median_Betrag: candidate.medianAmount,
    Betrag_Min: candidate.amountMin,
    Betrag_Max: candidate.amountMax,
    Betrag_Variabilitaet: candidate.variability,
    Typ: candidate.type,
    Kategorie_ID_Vorschlag: candidate.type === "Transfer" ? "KAT012" : "KAT013",
    Person_ID_Vorschlag: "",
    Konto_ID: accountId,
    Gegenpartei_Muster: candidate.counterparty,
    IBAN_Muster: candidate.iban,
    Verwendungszweck_Muster: candidate.purpose,
    Konfidenz: candidate.confidence,
    Status: "offen",
    Erkennungs_Hinweis: `${candidate.rows.length} Treffer in ${new Set(candidate.rows.map((row) => monthKey(row.BuchungsdatumIso))).size} Monaten`,
    Kommentar: "Analyse-Draft; keine Regelzahlung aktiviert",
  };
}

function buildAgentMirror(row, candidate, runId) {
  const fp = fingerprint(["neue_Regelzahlung", row.Konto_ID, candidate.counterparty, candidate.medianAmount]);
  return {
    Vorschlag_ID: row.Vorschlag_ID,
    Vorschlag_Fingerprint: `neue_Regelzahlung|${fp}`,
    Lauf_ID: runId,
    Methodik_ID: "METH_ANALYSE_REGELZAHLUNGEN",
    Vorschlagstyp: "neue_Regelzahlung",
    Betroffene_Tabelle: "12_Regelzahlung_Vorschlaege",
    Betroffene_ID: row.Vorschlag_ID,
    Empfohlene_Aktion: "Regelzahlung pruefen",
    Begruendung: "Wiederkehrendes Monatsmuster im Import-Draft erkannt",
    Konfidenz: row.Konfidenz,
    Prioritaet: Math.abs(row.Median_Betrag) >= 1000 ? "hoch" : "normal",
    Status: "offen",
    Umsetzung_Eindeutig: false,
    Umsetzungsstatus: "nicht_beauftragt",
    Kommentar: "Gespiegelter Vorschlag; Umsetzung nur nach Nutzerentscheidung",
  };
}

function buildTransferSuggestion(candidate, id, runId) {
  const fp = fingerprint(["neue_Transferregel", candidate.counterparty, candidate.iban, candidate.purpose]);
  return {
    Vorschlag_ID: id,
    Vorschlag_Fingerprint: `neue_Transferregel|${fp}`,
    Lauf_ID: runId,
    Methodik_ID: "METH_ANALYSE_TRANSFERS",
    Vorschlagstyp: "neue_Transferregel",
    Betroffene_Tabelle: "11_Umsaetze_Modell",
    Betroffene_ID: candidate.rows[0]?.Rohumsatz_ID ? `TXN-${candidate.rows[0].Rohumsatz_ID}` : "",
    Empfohlene_Aktion: "Transferregel pruefen",
    Begruendung: "Transfer-Signal im Verwendungszweck oder Gegenparteitext erkannt",
    Konfidenz: 0.62,
    Prioritaet: "normal",
    Status: "offen",
    Umsetzung_Eindeutig: false,
    Umsetzungsstatus: "nicht_beauftragt",
    Kommentar: "Keine automatische Neutralisierung; nur Transferkandidat",
  };
}

function buildCategorySuggestion(candidate, id, runId) {
  const fp = fingerprint(["Kategorie_Mapping", candidate.counterparty, candidate.purpose, candidate.count, candidate.totalAbs]);
  return {
    Vorschlag_ID: id,
    Vorschlag_Fingerprint: `Kategorie_Mapping|${fp}`,
    Lauf_ID: runId,
    Methodik_ID: "METH_ANALYSE_KATEGORIEN",
    Vorschlagstyp: "Kategorie_Mapping",
    Betroffene_Tabelle: "11_Umsaetze_Modell",
    Betroffene_ID: candidate.firstRawId ? `TXN-${candidate.firstRawId}` : "",
    Empfohlene_Aktion: "Kategorie fuer Gegenpartei pruefen",
    Begruendung: "Mehrere offene Buchungen mit gleicher Gegenpartei oder relevantem Volumen erkannt",
    Konfidenz: candidate.count >= 5 ? 0.7 : 0.58,
    Prioritaet: candidate.totalAbs >= 1000 ? "hoch" : "normal",
    Status: "offen",
    Umsetzung_Eindeutig: false,
    Umsetzungsstatus: "nicht_beauftragt",
    Kommentar: "Kein automatisches Kategorie-Mapping; Nutzerentscheidung erforderlich",
  };
}

function transferCandidatesFromRows(rows) {
  const groups = new Map();
  for (const row of rows.filter(hasTransferSignal)) {
    const counterparty = counterpartyFor(row);
    const key = `${normalizeText(counterparty)}|${normalizeText(row.IBAN)}|${normalizeText(row.Verwendungszweck)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        rows: [],
        type: "Transfer",
        counterparty,
        iban: displayText(row.IBAN),
        purpose: displayText(row.Verwendungszweck),
        medianAmount: Number(row.Betrag),
      });
    }
    groups.get(key).rows.push({ ...row, Counterparty: counterparty, BuchungsdatumIso: toIsoDate(row.Buchungsdatum) });
  }
  return [...groups.values()].sort((a, b) => Math.abs(b.medianAmount) - Math.abs(a.medianAmount));
}

function categoryCandidatesFromRows(rows) {
  const groups = new Map();
  for (const row of rows.filter((entry) => !hasTransferSignal(entry))) {
    const counterparty = counterpartyFor(row);
    const key = normalizeText(counterparty);
    if (!key) continue;
    if (!groups.has(key)) {
      groups.set(key, {
        rows: [],
        counterparty,
        purpose: displayText(row.Verwendungszweck),
        firstRawId: row.Rohumsatz_ID,
        totalAbs: 0,
        count: 0,
      });
    }
    const group = groups.get(key);
    group.rows.push(row);
    group.count += 1;
    group.totalAbs += Math.abs(Number(row.Betrag) || 0);
  }
  return [...groups.values()]
    .filter((candidate) => candidate.count >= 5 || candidate.totalAbs >= 1000)
    .sort((a, b) => b.totalAbs - a.totalAbs);
}

export async function createAnalysisSuggestionsFromWorkbookDraft({
  workbookPath,
  importId,
  runId,
  createdAt,
  firstSuggestionNumber = 1,
  maxRecurringSuggestions = 50,
  maxTransferSuggestions = 25,
}) {
  const input = await FileBlob.load(workbookPath);
  const workbook = await SpreadsheetFile.importXlsx(input);
  const rows = readRows(workbook, "10_Umsaetze_Roh").filter((row) => row.Import_ID === importId);
  const candidates = groupRows(rows)
    .map(candidateFromGroup)
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.medianAmount) - Math.abs(a.medianAmount));

  let nextNumber = firstSuggestionNumber;
  const regularPaymentSuggestions = candidates.slice(0, maxRecurringSuggestions).map((candidate) => {
    const id = suggestionId(createdAt, nextNumber);
    nextNumber += 1;
    return buildRegularPaymentSuggestion(candidate, id, runId, createdAt, candidate.rows[0].Quellkonto_ID);
  });

  const agentSuggestions = regularPaymentSuggestions.map((row, index) => buildAgentMirror(row, candidates[index], runId));
  const transferSource = [...candidates.filter((candidate) => candidate.type === "Transfer"), ...transferCandidatesFromRows(rows)];
  const seenTransferFingerprints = new Set();
  const transferSuggestions = transferSource
    .filter((candidate) => {
      const fp = fingerprint(["neue_Transferregel", candidate.counterparty, candidate.iban, candidate.purpose]);
      if (seenTransferFingerprints.has(fp)) return false;
      seenTransferFingerprints.add(fp);
      return true;
    })
    .slice(0, maxTransferSuggestions)
    .map((candidate) => {
      const id = suggestionId(createdAt, nextNumber);
      nextNumber += 1;
      return buildTransferSuggestion(candidate, id, runId);
    });
  agentSuggestions.push(...transferSuggestions);

  const recurringCounterparties = new Set(candidates.map((candidate) => normalizeText(candidate.counterparty)));
  const categorySuggestions = categoryCandidatesFromRows(rows)
    .filter((candidate) => !recurringCounterparties.has(normalizeText(candidate.counterparty)))
    .slice(0, 25)
    .map((candidate) => {
      const id = suggestionId(createdAt, nextNumber);
      nextNumber += 1;
      return buildCategorySuggestion(candidate, id, runId);
    });
  agentSuggestions.push(...categorySuggestions);

  return {
    regularPaymentSuggestions,
    agentSuggestions,
    summary: {
      importId,
      rowsAnalyzed: rows.length,
      recurringCandidates: regularPaymentSuggestions.length,
      transferCandidates: transferSuggestions.length,
      categoryCandidates: categorySuggestions.length,
    },
  };
}
