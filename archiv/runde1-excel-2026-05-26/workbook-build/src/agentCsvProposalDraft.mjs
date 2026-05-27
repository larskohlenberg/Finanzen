import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

function splitCsvLine(line, delimiter = ";") {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function parseGermanAmount(value) {
  const cleaned = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[€\s]/g, "")
    .trim();
  if (!cleaned) return null;
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/\./g, "");
  return Number(normalized);
}

function parseGermanDate(value) {
  const match = String(value ?? "").match(/^(\d{2})\.(\d{2})\.(\d{2}|\d{4})$/);
  if (!match) return "";
  const [, day, month, yearRaw] = match;
  const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
  return `${year}-${month}-${day}`;
}

function parsePeriod(value) {
  const match = String(value ?? "").match(/(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})/);
  if (!match) return { from: "", to: "", label: "" };
  return {
    from: parseGermanDate(match[1]),
    to: parseGermanDate(match[2]),
    label: `${parseGermanDate(match[1])} bis ${parseGermanDate(match[2])}`,
  };
}

function rowHash(row) {
  return crypto.createHash("sha256").update(JSON.stringify(row)).digest("hex");
}

function pad6(number) {
  return String(number).padStart(6, "0");
}

function cashflowEffect(amount) {
  if (amount > 0) return "Einnahme";
  if (amount < 0) return "Ausgabe";
  return "neutral";
}

function transferStatus(row) {
  const text = `${row["Verwendungszweck"] ?? ""} ${row["Zahlungspflichtige*r"] ?? ""} ${row["Zahlungsempfänger*in"] ?? ""}`.toLowerCase();
  return text.includes("übertrag") || text.includes("uebertrag") ? "unklar" : "kein_transfer";
}

function readMetadata(lines) {
  const account = splitCsvLine(lines[0] ?? "")[1] ?? "";
  const period = parsePeriod(splitCsvLine(lines[1] ?? "")[1] ?? "");
  const balanceText = splitCsvLine(lines[2] ?? "")[1] ?? "";
  return {
    account,
    period,
    balance: parseGermanAmount(balanceText),
  };
}

function parseRows(lines) {
  const headerIndex = lines.findIndex((line) => line.includes("Buchungsdatum") && line.includes("Betrag"));
  if (headerIndex < 0) return [];
  const headers = splitCsvLine(lines[headerIndex]);
  return lines
    .slice(headerIndex + 1)
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const cells = splitCsvLine(line);
      return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    });
}

export async function createProposalFromCsvDraft({
  sourcePath,
  maxTransactions,
  ids,
  accountId,
  personId,
  importDate,
}) {
  const sourceBuffer = await fs.readFile(sourcePath);
  const sourceText = sourceBuffer.toString("utf8").replace(/^\uFEFF/, "");
  const lines = sourceText.split(/\r?\n/).filter((line) => line.length > 0);
  const metadata = readMetadata(lines);
  const parsedRows = parseRows(lines).slice(0, maxTransactions);

  const sourceHash = crypto.createHash("sha256").update(sourceBuffer).digest("hex");
  const basename = path.basename(sourcePath);

  const rawTransactions = parsedRows.map((row, index) => {
    const sequence = index + 1;
    const rawId = `RAW-${ids.importId}-${pad6(sequence)}`;
    return {
      Rohumsatz_ID: rawId,
      Import_ID: ids.importId,
      Quellkonto_ID: accountId,
      Importdatei: basename,
      Importdatum: importDate,
      Zeilennummer_Import: sequence,
      Zeilenhash: rowHash(row),
      Duplikat_Status: "neu",
      Parse_Status: "ok",
      Parse_Hinweis: "",
      Buchungsdatum: parseGermanDate(row["Buchungsdatum"]),
      Wertstellung: parseGermanDate(row["Wertstellung"]),
      Status_Bank: row["Status"] ?? "",
      Zahlungspflichtiger: row["Zahlungspflichtige*r"] ?? "",
      Zahlungsempfaenger: row["Zahlungsempfänger*in"] ?? "",
      Verwendungszweck: row["Verwendungszweck"] ?? "",
      Umsatztyp: row["Umsatztyp"] ?? "",
      IBAN: row["IBAN"] ?? "",
      Betrag: parseGermanAmount(row["Betrag (€)"]),
      Glaeubiger_ID: row["Gläubiger-ID"] ?? "",
      Mandatsreferenz: row["Mandatsreferenz"] ?? "",
      Kundenreferenz: row["Kundenreferenz"] ?? "",
    };
  });

  const modelTransactions = rawTransactions.map((row) => ({
    Transaktion_ID: `TXN-${row.Rohumsatz_ID}`,
    Rohumsatz_ID: row.Rohumsatz_ID,
    Konto_ID: accountId,
    Zielkonto_ID: "",
    Kategorie_ID: "KAT013",
    Person_ID: "",
    Regel_ID: "",
    Regel_Match_Status: "kein_match",
    Regel_Match_Hinweis: "Agent-Draft: keine finale Regelentscheidung",
    Erwartetes_Zahldatum: row.Buchungsdatum,
    Betragsabweichung: "",
    Tage_Abweichung: "",
    Betrag: row.Betrag,
    Buchungsmonat: row.Buchungsdatum.slice(0, 7),
    Cashflow_Wirkung: cashflowEffect(row.Betrag),
    Szenario_Wirkung: "Ist",
    Ist_Transfer: false,
    Transfer_Status: transferStatus(row),
    Transfer_Typ: "",
    Gegenbuchung_Transaktion_ID: "",
    Transfer_Regel_ID: "",
    Lebenshaltung_Relevant: true,
    Transfer_Pruefhinweis: transferStatus(row) === "unklar" ? "Transferkandidat im Draft" : "",
    Status: "offen",
    Kommentar: "Agent-Draft; Kategorie und Person pruefen",
  }));

  return {
    sourceRow: {
      Quelle_ID: ids.sourceId,
      Quellenart: "Bankexport",
      Eltern_Quelle_ID: "",
      Eingangskanal: "agent_draft",
      Originaldateiname: basename,
      Dateiname_Modell: basename,
      Dateipfad: sourcePath,
      Dateihash: sourceHash,
      Belegtyp: "CSV",
      Quelle_Anbieter: "Bank",
      Belegdatum: importDate,
      Standdatum: metadata.period.to || importDate,
      Abrufdatum: importDate,
      Wertname: "Kontostand Export",
      Wert: metadata.balance,
      Einheit: "EUR",
      Zeitraum: metadata.period.label,
      Zeitraum_von: metadata.period.from,
      Zeitraum_bis: metadata.period.to,
      Seite_Abschnitt: "CSV Kopf",
      Zielblatt: "10_Umsaetze_Roh",
      Ziel_ID: ids.importId,
      Person_ID: personId,
      Objekt_ID: "",
      Szenario_Relevanz: "S01",
      Status: "ungeprueft",
      Unsicherheit: "Agent-Draft mit begrenzter Zeilenanzahl",
      Kommentar: `Draft aus ${rawTransactions.length} von ${parseRows(lines).length} CSV-Zeilen`,
      Geprueft_am: "",
    },
    importRun: {
      Import_ID: ids.importId,
      Importdatei: basename,
      Quellkonto_ID: accountId,
      Quelle_ID: ids.sourceId,
      Zeitraum_von: metadata.period.from,
      Zeitraum_bis: metadata.period.to,
      Kontostand_Export: metadata.balance,
      Kontostand_Datum: metadata.period.to || importDate,
      Importdatum: importDate,
      Zeilen_gesamt: rawTransactions.length,
      Zeilen_importiert: rawTransactions.length,
      Duplikate: 0,
      Parse_Fehler: 0,
      Status: "agent_draft",
      Lauf_ID: ids.runId,
      Kommentar: "Begrenzter Agent-Durchstich; noch kein Vollimport",
    },
    rawTransactions,
    modelTransactions,
    warnings: [
      {
        Warnungs_ID: ids.warningId,
        Warnungs_Fingerprint: `${ids.checkId}|${ids.importId}`,
        Check_ID: ids.checkId,
        Schweregrad: "Warnung",
        Titel: "Agent-Draft enthaelt offene Kategorien",
        Betroffene_Tabelle: "11_Umsaetze_Modell",
        Betroffene_ID: modelTransactions[0]?.Transaktion_ID ?? "",
        Status: "offen",
        Naechste_Aktion: "Kategorien und Transfers pruefen",
        Kommentar: "Alle Draft-Modellumsaetze bleiben KAT013",
      },
    ],
    checks: [
      {
        Check_ID: ids.checkId,
        Checkgruppe: "Import",
        Beschreibung: "Agent-Draft enthaelt offene Kategorien",
        Schweregrad: "Warnung",
        Status: "offen",
        Betroffene_Quelle_ID: ids.sourceId,
        Betroffene_Annahme_ID: "",
        Betroffener_Import_ID: ids.importId,
        Betroffener_Kontrollspur_ID: "",
        Betroffene_Tabelle: "11_Umsaetze_Modell",
        Betroffene_ID: modelTransactions[0]?.Transaktion_ID ?? "",
        Ausloeser: "Kategorie_ID = KAT013",
        Naechste_Aktion: "Kategorien und Transfers pruefen",
        Kommentar: "Bewusst offener Import-Durchstich",
      },
    ],
    questions: [
      "Kategorien fuer Draft-Zeilen fachlich bestaetigen.",
      "Transferkandidaten pruefen, bevor Regeln aktiviert werden.",
    ],
  };
}
