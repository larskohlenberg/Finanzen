import fs from "node:fs/promises";
import crypto from "node:crypto";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";
import {
  calculateActualMonthlyCashflow,
  calculateExpectedMonthlyCashflow,
  calculateFreeLiquidity,
  calculateLiquidityToday,
  calculateRunwayMonths,
  calculateScenarioTimeline,
  calculateUncategorizedExpenseShare,
} from "./src/formulas.mjs";

const outputDir = new URL("../outputs/finanzmodell-v1-startmappe/", import.meta.url);
const outputPath = new URL("Finanzmodell_V1_Startmappe.xlsx", outputDir);
const previewDir = new URL("previews/", outputDir);

const sheetOrder = [
  "00_Dashboard",
  "01_Personen",
  "02_Kategorien",
  "03_Konten",
  "04_Immobilien",
  "05_Immobilien_Details",
  "06_Versicherungen",
  "07_Rente",
  "10_Umsaetze_Roh",
  "11_Umsaetze_Modell",
  "12_Regelzahlungen",
  "20_Vermoegen",
  "30_Cashflow",
  "40_Szenarien",
  "41_Ereignisse",
  "42_Annahmen",
  "43_Zeitachse",
  "44_Liquiditaet",
  "60_Warnungen",
  "73_Agent_Vorschlaege",
  "90_Quellen",
  "98_Kontrollspur",
  "99_Checks",
];

const tableBuildOrder = [
  "01_Personen",
  "02_Kategorien",
  "03_Konten",
  "40_Szenarien",
  "42_Annahmen",
  "90_Quellen",
  "10_Importlaeufe",
  "10_Umsaetze_Roh",
  "11_Transferregeln",
  "11_Umsaetze_Modell",
  "12_Regelzahlungen",
  "12_Regelzahlung_Vorschlaege",
  "73_Agent_Vorschlaege",
  "60_Warnungen_Aktuell",
  "60_Warnungen_Bearbeitung",
  "60_Warnungen",
  "43_Zeitachse",
  "44_Liquiditaet",
  "30_Cashflow",
  "20_Vermoegen",
  "04_Immobilien",
  "05_Immobilien_Details",
  "06_Versicherungen",
  "07_Rente",
  "41_Ereignisse",
  "98_Build_Verifikation",
  "98_Agentenlaeufe",
  "98_Artefakt_Referenzen",
  "99_Checks",
  "00_Dashboard",
];

const colors = {
  navy: "#123047",
  slate: "#334155",
  blue: "#1D4ED8",
  paleBlue: "#EAF2F8",
  teal: "#0F766E",
  paleTeal: "#DFF5F2",
  green: "#15803D",
  yellow: "#FEF3C7",
  amber: "#B45309",
  red: "#B91C1C",
  paleRed: "#FEE2E2",
  gray: "#F3F6F8",
  line: "#CBD5E1",
  white: "#FFFFFF",
  black: "#111827",
};

const statusValues = ["offen", "belegt", "geprueft", "geschaetzt", "inaktiv"];
const annahmenStatusValues = ["platzhalter", "geschaetzt", "belegt", "geprueft"];
const kontrollStatusValues = [
  "nicht_ausgefuehrt",
  "bestanden",
  "bestanden_mit_warnung",
  "fehlgeschlagen",
  "nicht_pruefbar",
];
const vorschlagStatusValues = ["offen", "angenommen", "abgelehnt", "zurueckgestellt", "erledigt", "verworfen"];

const d = (yyyyMmDd) => {
  const [year, month, day] = yyyyMmDd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const sha = (text) => crypto.createHash("sha256").update(text).digest("hex");

const seed = {
  personen: [
    ["P01", "Nutzer", "Person", "", "", 67, "offen", "Geburtsdatum und Renteneintrittsalter nachtragen"],
    ["P02", "Ehefrau", "Person", "", "", 67, "offen", "Basisdaten noch offen"],
    ["HH", "Haushalt / Familie", "Haushalt", "", "", "", "belegt", "Haushaltsanker fuer Auswertungen"],
  ],
  kategorien: [
    ["KAT001", "Einkommen", "Cashflow", "Einnahme", true, "belegt", "Lohn, Rente, Kapitalertraege"],
    ["KAT002", "Wohnen & Immobilien", "Ausgaben", "Ausgabe", true, "belegt", "Miete, Nebenkosten, Objektkosten"],
    ["KAT003", "Lebenshaltung", "Ausgaben", "Ausgabe", true, "belegt", "Lebensmittel, Alltag"],
    ["KAT004", "Mobilitaet", "Ausgaben", "Ausgabe", true, "belegt", "Auto, OPNV, Reisen nah"],
    ["KAT005", "Versicherungen & Vorsorge", "Ausgaben", "Ausgabe", true, "belegt", "Versicherungen, Vorsorge"],
    ["KAT006", "Gesundheit", "Ausgaben", "Ausgabe", true, "belegt", "Gesundheitliche Ausgaben"],
    ["KAT007", "Familie & Haushalt", "Ausgaben", "Ausgabe", true, "belegt", "Familien- und Haushaltskosten"],
    ["KAT008", "Freizeit & Reisen", "Ausgaben", "Ausgabe", true, "belegt", "Freizeit, Urlaub"],
    ["KAT009", "Steuern & Abgaben", "Ausgaben", "Ausgabe", true, "belegt", "Steuern und Abgaben"],
    ["KAT010", "Sparen & Investieren", "Transfer", "neutral", false, "belegt", "Depot, Sparen, Anlage"],
    ["KAT011", "Kredite & Finanzierung", "Ausgaben", "Ausgabe", true, "belegt", "Kredite, Zinsen, Tilgung"],
    ["KAT012", "Interne Transfers", "Transfer", "neutral", false, "belegt", "Umbuchungen zwischen eigenen Konten"],
    ["KAT013", "Sonstiges / zu pruefen", "Offen", "unbekannt", true, "offen", "Startkategorie fuer ungepruefte Buchungen"],
  ],
  konten: [
    ["KTO001", "Girokonto Startimport", "Bank", "Girokonto", "P01", 1, "DE** **** **** 1234", 4250, d("2026-05-18"), "SRC-20260518-001", true, false, true, "belegt", "Startsaldo aus Import/Quelle; noch nicht verifiziert"],
  ],
  szenarien: [
    ["S01", "Standard", "aktiv", d("2026-05-01"), d("2027-04-30"), "belegt", "Aktives Standardszenario fuer V1"],
    ["S02", "Konservativ", "vorbereitet", "", "", "offen", "Sichtbarer Platzhalter"],
    ["S03", "Stressfall", "vorbereitet", "", "", "offen", "Sichtbarer Platzhalter"],
  ],
  annahmen: [
    ["ASM001", "Sicherheitsreserve", "Liquiditaet", 3000, "EUR", d("2026-05-01"), "", "S01", "geschaetzt", "SRC-20260518-001", "", "Reserve als erste Annahme, bis Zielhoehe bestaetigt ist"],
    ["ASM002", "Variable Ausgaben-Schaetzung", "Cashflow", 900, "EUR/Monat", d("2026-05-01"), "", "S01", "platzhalter", "", "", "Platzhalter, bis Regelzahlungen und variable Ausgaben stabil erkannt sind"],
    ["ASM003", "Planungsende", "Zeitachse", d("2027-04-30"), "Datum", d("2026-05-01"), "", "S01", "geschaetzt", "", "", "V1-Horizont fuer spaetere Runway-Rechnung"],
  ],
  quellen: [
    ["SRC-20260518-001", "Bankexport", "", "manuell", "girokonto_startimport.csv", "girokonto_startimport.csv", "workbook-build/tests/fixtures/csv/girokonto_test.csv", "nicht_pruefbar", "CSV", "Bank", d("2026-05-18"), d("2026-05-18"), d("2026-05-21"), "Startsaldo", 4250, "EUR", "Mai 2026", d("2026-05-01"), d("2026-05-18"), "Export", "03_Konten", "KTO001", "P01", "", "S01", "ungeprueft", "Fixture fehlt oder Hash noch nicht pruefbar", "Startquelle fuer Thin-Slice", ""],
  ],
  importlaeufe: [
    ["IMP-20260518-001", "girokonto_startimport.csv", "KTO001", "SRC-20260518-001", d("2026-05-01"), d("2026-05-18"), 4250, d("2026-05-18"), d("2026-05-21"), 4, 4, 0, 0, "importiert_ungeprueft", "RUN-20260521-001", "Startimport als struktureller Slice; Parser noch nicht produktiv"],
  ],
  umsaetzeRoh: [
    ["RAW-IMP-20260518-001-000001", "IMP-20260518-001", "KTO001", "girokonto_startimport.csv", d("2026-05-21"), 1, sha("2026-05-02|Arbeitgeber|2500"), "neu", "ok", "", d("2026-05-02"), d("2026-05-02"), "gebucht", "Arbeitgeber GmbH", "P01", "Gehalt Mai", "Gutschrift", "DE**ARBEIT", 2500, "", "", ""],
    ["RAW-IMP-20260518-001-000002", "IMP-20260518-001", "KTO001", "girokonto_startimport.csv", d("2026-05-21"), 2, sha("2026-05-05|Miete|-1200"), "neu", "ok", "", d("2026-05-05"), d("2026-05-05"), "gebucht", "P01", "Vermieter", "Miete Mai", "Lastschrift", "DE**MIETE", -1200, "", "", ""],
    ["RAW-IMP-20260518-001-000003", "IMP-20260518-001", "KTO001", "girokonto_startimport.csv", d("2026-05-21"), 3, sha("2026-05-08|Supermarkt|-186.42"), "neu", "ok", "", d("2026-05-08"), d("2026-05-08"), "gebucht", "P01", "Supermarkt", "Kartenzahlung", "Kartenzahlung", "", -186.42, "", "", ""],
    ["RAW-IMP-20260518-001-000004", "IMP-20260518-001", "KTO001", "girokonto_startimport.csv", d("2026-05-21"), 4, sha("2026-05-12|Unklar|-74.9"), "neu", "ok", "Kategorie offen", d("2026-05-12"), d("2026-05-12"), "gebucht", "P01", "Unklare Gegenpartei", "Online Zahlung", "Kartenzahlung", "", -74.9, "", "", ""],
  ],
  umsaetzeModell: [
    ["TXN-RAW-IMP-20260518-001-000001", "RAW-IMP-20260518-001-000001", "KTO001", "", "KAT001", "P01", "", "kein_match", "Noch keine Regelzahlung bestaetigt", d("2026-05-02"), "", "", 2500, "2026-05", "Einnahme", "Ist", false, "kein_transfer", "", "", "", true, "", "offen", "Startzuordnung, spaeter pruefen"],
    ["TXN-RAW-IMP-20260518-001-000002", "RAW-IMP-20260518-001-000002", "KTO001", "", "KAT002", "HH", "", "kein_match", "Regelzahlung noch nicht bestaetigt", d("2026-05-05"), "", "", -1200, "2026-05", "Ausgabe", "Ist", false, "kein_transfer", "", "", "", true, "", "offen", "Wohnkosten als Kandidat"],
    ["TXN-RAW-IMP-20260518-001-000003", "RAW-IMP-20260518-001-000003", "KTO001", "", "KAT003", "", "", "kein_match", "Person noch offen", d("2026-05-08"), "", "", -186.42, "2026-05", "Ausgabe", "Ist", false, "kein_transfer", "", "", "", true, "", "offen", "Personenzuordnung offen"],
    ["TXN-RAW-IMP-20260518-001-000004", "RAW-IMP-20260518-001-000004", "KTO001", "", "KAT013", "", "", "kein_match", "Kategorie offen", d("2026-05-12"), "", "", -74.9, "2026-05", "Ausgabe", "Ist", false, "unklar", "", "", "", true, "Offene Kategorie erzeugt Warnung", "offen", "Thin-Slice-Beleg fuer KAT013"],
  ],
  regelzahlungen: [
    ["REG001", "Miete Kandidat", "Ausgabe", "KAT002", "HH", "KTO001", "SRC-20260518-001", "monatlich", -1200, 50, 0.05, 5, "Vermieter", "", "Miete", -1300, -1100, false, 5, 3, "kandidat", false, d("2026-05-01"), "", "offen", "S01", "Noch nicht als Regel bestaetigt"],
  ],
};

const kontoHeaders = ["Konto_ID", "Name", "Anbieter", "Kontoart", "Person_ID", "Eigentumsanteil", "Maskierte_IBAN_Depotnummer", "Aktueller_Stand", "Standdatum", "Quelle_ID", "Liquide_relevant", "Performance_relevant", "Transferfaehig", "Status", "Kommentar"];
const annahmenHeaders = ["Annahme_ID", "Name", "Bereich", "Wert", "Einheit", "Gueltig_ab", "Gueltig_bis", "Szenario_ID", "Status", "Quelle_ID", "Ersetzt_Annahme_ID", "Kommentar"];
const umsaetzeModellHeaders = ["Transaktion_ID", "Rohumsatz_ID", "Konto_ID", "Zielkonto_ID", "Kategorie_ID", "Person_ID", "Regel_ID", "Regel_Match_Status", "Regel_Match_Hinweis", "Erwartetes_Zahldatum", "Betragsabweichung", "Tage_Abweichung", "Betrag", "Buchungsmonat", "Cashflow_Wirkung", "Szenario_Wirkung", "Ist_Transfer", "Transfer_Status", "Transfer_Typ", "Gegenbuchung_Transaktion_ID", "Transfer_Regel_ID", "Lebenshaltung_Relevant", "Transfer_Pruefhinweis", "Status", "Kommentar"];
const regelzahlungHeaders = ["Regel_ID", "Name", "Typ", "Kategorie_ID", "Person_ID", "Konto_ID", "Quelle_ID", "Frequenz", "Erwarteter_Betrag", "Toleranz_Betrag", "Toleranz_Prozent", "Erwarteter_Tag", "Gegenpartei_Muster", "IBAN_Muster", "Verwendungszweck_Muster", "Betrag_Min", "Betrag_Max", "Betrag_Variabel", "Faelligkeitstag", "Faelligkeitstoleranz_Tage", "Matching_Status", "Auto_Matching_Erlaubt", "Startdatum", "Enddatum", "Status", "Szenario_Wirkung", "Kommentar"];

function rowsToObjects(headers, rows) {
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}

const calculated = {
  liquidityToday: calculateLiquidityToday(rowsToObjects(kontoHeaders, seed.konten)),
  actualMonthlyCashflow: calculateActualMonthlyCashflow({
    transactions: rowsToObjects(umsaetzeModellHeaders, seed.umsaetzeModell),
    month: "2026-05",
  }),
  expectedMonthlyCashflow: calculateExpectedMonthlyCashflow({
    regularPayments: rowsToObjects(regelzahlungHeaders, seed.regelzahlungen),
    assumptions: rowsToObjects(annahmenHeaders, seed.annahmen),
    scenarioId: "S01",
  }),
  uncategorizedExpenseShare: calculateUncategorizedExpenseShare({
    transactions: rowsToObjects(umsaetzeModellHeaders, seed.umsaetzeModell),
    month: "2026-05",
    openCategoryId: "KAT013",
  }),
};
calculated.freeLiquidity = calculateFreeLiquidity({
  liquidityToday: calculated.liquidityToday,
  assumptions: rowsToObjects(annahmenHeaders, seed.annahmen),
  scenarioId: "S01",
});
calculated.runwayMonths = calculateRunwayMonths({
  freeLiquidity: calculated.freeLiquidity,
  monthlyNetCashflow: calculated.expectedMonthlyCashflow,
});
calculated.timeline = calculateScenarioTimeline({
  startingLiquidity: calculated.liquidityToday,
  monthlyNetCashflow: calculated.expectedMonthlyCashflow,
  months: ["2026-05", "2026-06", "2026-07"],
});

const tableDefs = {
  "01_Personen": {
    sheet: "01_Personen",
    title: "Personen und Haushalt",
    purpose: "Stammdatenanker fuer Personen, Rollen und Haushalt.",
    headers: ["Person_ID", "Name_Rolle", "Typ", "Geburtsdatum", "Alter_aktuell", "Renteneintritt_alter", "Status", "Kommentar"],
    rows: seed.personen,
    pk: "Person_ID",
    idPrefix: "P/HH",
    updateMode: "manuell",
  },
  "02_Kategorien": {
    sheet: "02_Kategorien",
    title: "Kategorien",
    purpose: "Cashflow-Kategorien inklusive offener Pruefkategorie.",
    headers: ["Kategorie_ID", "Name", "Gruppe", "Cashflow_Typ", "Lebenshaltung_Relevant", "Status", "Kommentar"],
    rows: seed.kategorien,
    pk: "Kategorie_ID",
    idPrefix: "KAT",
    updateMode: "manuell_mit_audit",
  },
  "03_Konten": {
    sheet: "03_Konten",
    title: "Konten",
    purpose: "Konten, Liquiditaetsrelevanz und Quellenbezug.",
    headers: kontoHeaders,
    rows: seed.konten,
    pk: "Konto_ID",
    idPrefix: "KTO",
    updateMode: "manuell_importgestuetzt",
  },
  "04_Immobilien": {
    sheet: "04_Immobilien",
    title: "Immobilien Platzhalter",
    purpose: "Sichtbar vorbereitet; keine Wirkung auf V1-Reichweite.",
    headers: ["Objekt_ID", "Name", "Objektart", "Person_ID", "Quelle_ID", "Status", "Naechste_Aktion", "Kommentar"],
    rows: [["OBJ001", "Immobilienstatus offen", "Platzhalter", "HH", "", "offen", "Objektdaten spaeter erfassen", "Keine V1-Wirkung"]],
    pk: "Objekt_ID",
    idPrefix: "OBJ",
    updateMode: "manuell",
  },
  "05_Immobilien_Details": {
    sheet: "05_Immobilien_Details",
    title: "Immobilien Details Platzhalter",
    purpose: "Darlehen, Ertraege und Kosten spaeter strukturiert erfassen.",
    headers: ["Detail_ID", "Objekt_ID", "Detailtyp", "Wert", "Einheit", "Quelle_ID", "Status", "Kommentar"],
    rows: [["IMD001", "OBJ001", "noch_offen", "", "", "", "offen", "Keine V1-Wirkung"]],
    pk: "Detail_ID",
    idPrefix: "IMD",
    updateMode: "manuell",
  },
  "06_Versicherungen": {
    sheet: "06_Versicherungen",
    title: "Versicherungen Platzhalter",
    purpose: "Versicherungs- und Vorsorgevertraege spaeter erfassen.",
    headers: ["Vertrag_ID", "Name", "Typ", "Person_ID", "Beitrag", "Frequenz", "Quelle_ID", "Status", "Kommentar"],
    rows: [["VRS001", "Versicherungen offen", "Platzhalter", "HH", "", "", "", "offen", "Keine V1-Wirkung"]],
    pk: "Vertrag_ID",
    idPrefix: "VRS",
    updateMode: "manuell",
  },
  "07_Rente": {
    sheet: "07_Rente",
    title: "Rente Platzhalter",
    purpose: "Rentenansprueche sichtbar vorbereiten, noch ohne Wirkung.",
    headers: ["Rente_ID", "Person_ID", "Anspruchsart", "Monatswert", "Startdatum", "Quelle_ID", "Status", "Kommentar"],
    rows: [["RTE001", "P01", "offen", "", "", "", "offen", "Keine V1-Wirkung"]],
    pk: "Rente_ID",
    idPrefix: "RTE",
    updateMode: "manuell",
  },
  "10_Importlaeufe": {
    sheet: "10_Umsaetze_Roh",
    title: "Importlaeufe",
    purpose: "Importlauf-Metadaten fuer den Girokonto-Startimport.",
    headers: ["Import_ID", "Importdatei", "Quellkonto_ID", "Quelle_ID", "Zeitraum_von", "Zeitraum_bis", "Kontostand_Export", "Kontostand_Datum", "Importdatum", "Zeilen_gesamt", "Zeilen_importiert", "Duplikate", "Parse_Fehler", "Status", "Lauf_ID", "Kommentar"],
    rows: seed.importlaeufe,
    pk: "Import_ID",
    idPrefix: "IMP",
    updateMode: "parser",
  },
  "10_Umsaetze_Roh": {
    sheet: "10_Umsaetze_Roh",
    title: "Umsaetze Roh",
    purpose: "Rohbuchungen mit Hash- und Parse-Status.",
    headers: ["Rohumsatz_ID", "Import_ID", "Quellkonto_ID", "Importdatei", "Importdatum", "Zeilennummer_Import", "Zeilenhash", "Duplikat_Status", "Parse_Status", "Parse_Hinweis", "Buchungsdatum", "Wertstellung", "Status_Bank", "Zahlungspflichtiger", "Zahlungsempfaenger", "Verwendungszweck", "Umsatztyp", "IBAN", "Betrag", "Glaeubiger_ID", "Mandatsreferenz", "Kundenreferenz"],
    rows: seed.umsaetzeRoh,
    pk: "Rohumsatz_ID",
    idPrefix: "RAW",
    updateMode: "parser_append_only",
  },
  "11_Umsaetze_Modell": {
    sheet: "11_Umsaetze_Modell",
    title: "Modellumsaetze",
    purpose: "Aus Rohdaten abgeleitete, noch pruefpflichtige Modellbuchungen.",
    headers: umsaetzeModellHeaders,
    rows: seed.umsaetzeModell,
    pk: "Transaktion_ID",
    idPrefix: "TXN",
    updateMode: "parser_vorschlag_manuell",
  },
  "11_Transferregeln": {
    sheet: "11_Umsaetze_Modell",
    title: "Transferregeln",
    purpose: "Vorschlagsgetriebene Transferregeln, noch keine finale Auto-Logik.",
    headers: ["Transfer_Regel_ID", "Name", "Aktiv", "Prioritaet", "Konto_ID", "Zielkonto_ID", "Gegenpartei_Muster", "IBAN_Muster", "Verwendungszweck_Muster", "Betrag_Min", "Betrag_Max", "Datums_Toleranz_Tage", "Transfer_Typ", "Vorgeschlagene_Cashflow_Wirkung", "Lebenshaltung_Relevant_Vorschlag", "Status", "auto_person_id", "Kommentar"],
    rows: [["TRF-20260521-001", "Interner Transfer Kandidat", false, 10, "KTO001", "", "", "", "", "", "", 3, "unklar", "neutral", false, "offen", "", "Nur Vorschlag; nicht produktiv angewendet"]],
    pk: "Transfer_Regel_ID",
    idPrefix: "TRF",
    updateMode: "nur_durch_angenommenen_vorschlag",
  },
  "12_Regelzahlungen": {
    sheet: "12_Regelzahlungen",
    title: "Regelzahlungen",
    purpose: "Wiederkehrende Zahlungen; in V1 noch pruefpflichtig.",
    headers: regelzahlungHeaders,
    rows: seed.regelzahlungen,
    pk: "Regel_ID",
    idPrefix: "REG",
    updateMode: "manuell_vorschlag",
  },
  "12_Regelzahlung_Vorschlaege": {
    sheet: "12_Regelzahlungen",
    title: "Regelzahlung Vorschlaege",
    purpose: "Erkannte Muster als pruefpflichtige Vorschlaege.",
    headers: ["Vorschlag_ID", "Erkannt_am", "Lauf_ID", "Vorgeschlagener_Name", "Vorgeschlagene_Frequenz", "Treffer_Anzahl", "Erstes_Datum", "Letztes_Datum", "Median_Betrag", "Betrag_Min", "Betrag_Max", "Betrag_Variabilitaet", "Typ", "Kategorie_ID_Vorschlag", "Person_ID_Vorschlag", "Konto_ID", "Gegenpartei_Muster", "IBAN_Muster", "Verwendungszweck_Muster", "Konfidenz", "Status", "Erkennungs_Hinweis", "Kommentar"],
    rows: [["SUG-20260521-001", d("2026-05-21"), "RUN-20260521-001", "Miete monatlich", "monatlich", 1, d("2026-05-05"), d("2026-05-05"), -1200, -1200, -1200, 0, "Ausgabe", "KAT002", "HH", "KTO001", "Vermieter", "", "Miete", 0.55, "offen", "Nur ein Treffer, daher nicht automatisch bestaetigt", "Pruefen und ggf. Regelzahlung anlegen"]],
    pk: "Vorschlag_ID",
    idPrefix: "SUG",
    updateMode: "agent_vorschlag",
  },
  "20_Vermoegen": {
    sheet: "20_Vermoegen",
    title: "Vermoegen Sicht",
    purpose: "Einfache Sicht auf Vermoegensbestand; V1 ohne tiefe Bewertung.",
    headers: ["Position_ID", "Name", "Kategorie", "Wert", "Einheit", "Quelle_ID", "Status", "Kommentar"],
    rows: [["VMG001", "Liquide Mittel", "Liquiditaet", calculated.liquidityToday, "EUR", "SRC-20260518-001", "geschaetzt", "Task-3-Einstieg: Summe liquider Konten"]],
    pk: "Position_ID",
    idPrefix: "VMG",
    updateMode: "formel_ab_task3",
  },
  "30_Cashflow": {
    sheet: "30_Cashflow",
    title: "Cashflow",
    purpose: "Cashflow-Ist, Erwartung und Offen-Anteil fuer den aktuellen Startmonat.",
    headers: ["Kennzahl_ID", "Kennzahl", "Monat", "Wert", "Einheit", "Datenbasis", "Status", "Kommentar"],
    rows: [
      ["CF001", "Cashflow_Monat_ist", "2026-05", calculated.actualMonthlyCashflow, "EUR", "Umsaetze Modell", "geschaetzt", "Task-3-Einstieg: Summe nicht-transferierter Ist-Buchungen"],
      ["CF002", "Cashflow_Monat_erwartet", "2026-05", calculated.expectedMonthlyCashflow, "EUR", "Regelzahlungen + Annahmen", "teilberechnet", "Monatliche Regelzahlungen plus variable Ausgaben-Schaetzung"],
      ["CF003", "Anteil Sonstiges / zu pruefen", "2026-05", calculated.uncategorizedExpenseShare, "%", "KAT013", "teilberechnet", "Anteil offener Kategorie an nicht-transferierten Ausgaben"],
    ],
    pk: "Kennzahl_ID",
    idPrefix: "CF",
    updateMode: "formel_ab_task3",
  },
  "40_Szenarien": {
    sheet: "40_Szenarien",
    title: "Szenarien",
    purpose: "Aktives Standardszenario und vorbereitete Kopien.",
    headers: ["Szenario_ID", "Name", "Status", "Startdatum", "Enddatum", "Datenstatus", "Kommentar"],
    rows: seed.szenarien,
    pk: "Szenario_ID",
    idPrefix: "S",
    updateMode: "manuell",
  },
  "41_Ereignisse": {
    sheet: "41_Ereignisse",
    title: "Ereignisse Platzhalter",
    purpose: "Ereignisse, Erwerbsstatus und Sozialleistungen spaeter erfassen.",
    headers: ["Ereignis_ID", "Name", "Typ", "Startdatum", "Enddatum", "Szenario_ID", "Status", "Kommentar"],
    rows: [["EVT001", "Erwerbsstatus offen", "Platzhalter", "", "", "S01", "offen", "Keine V1-Wirkung"]],
    pk: "Ereignis_ID",
    idPrefix: "EVT",
    updateMode: "manuell",
  },
  "42_Annahmen": {
    sheet: "42_Annahmen",
    title: "Annahmen",
    purpose: "Modellannahmen mit Status, Quelle und Gueltigkeit.",
    headers: annahmenHeaders,
    rows: seed.annahmen,
    pk: "Annahme_ID",
    idPrefix: "ASM",
    updateMode: "append_only",
  },
  "43_Zeitachse": {
    sheet: "43_Zeitachse",
    title: "Zeitachse",
    purpose: "Monatsachse fuer spaetere Runway-Rechnung.",
    headers: ["Monat_ID", "Szenario_ID", "Monat", "Netto_M", "Kumulierte_Liquiditaet", "Status", "Kommentar"],
    rows: [
      ["MON202605", "S01", d("2026-05-01"), calculated.timeline[0].netCashflow, calculated.timeline[0].cumulativeLiquidity, "teilberechnet", "Auf Basis CF002; Monatsabschluss noch nicht final"],
      ["MON202606", "S01", d("2026-06-01"), calculated.timeline[1].netCashflow, calculated.timeline[1].cumulativeLiquidity, "teilberechnet", "Auf Basis CF002; Szenario noch nicht bestaetigt"],
      ["MON202607", "S01", d("2026-07-01"), calculated.timeline[2].netCashflow, calculated.timeline[2].cumulativeLiquidity, "teilberechnet", "Auf Basis CF002; Szenario noch nicht bestaetigt"],
    ],
    pk: "Monat_ID",
    idPrefix: "MON",
    updateMode: "formel_ab_task3",
  },
  "44_Liquiditaet": {
    sheet: "44_Liquiditaet",
    title: "Liquiditaet",
    purpose: "Zielstellen fuer liquide Mittel, Reserve und Reichweite.",
    headers: ["Kennzahl_ID", "Kennzahl", "Wert", "Einheit", "Szenario_ID", "Datenbasis", "Status", "Kommentar"],
    rows: [
      ["LIQ001", "Liquiditaet_heute", calculated.liquidityToday, "EUR", "S01", "Konten", "geschaetzt", "Task-3-Einstieg: liquide Konten"],
      ["LIQ002", "Freie Liquiditaet nach Reserve", calculated.freeLiquidity, "EUR", "S01", "LIQ001 minus Sicherheitsreserve", "geschaetzt", "Task-3-Einstieg: Liquiditaet minus ASM001"],
      ["LIQ003", "Reichweite", calculated.runwayMonths, "Monate", "S01", "LIQ002 / erwarteter Monatsverbrauch", "teilberechnet", "Auf Basis freier Liquiditaet und CF002"],
    ],
    pk: "Kennzahl_ID",
    idPrefix: "LIQ",
    updateMode: "formel_ab_task3",
  },
  "60_Warnungen_Aktuell": {
    sheet: "60_Warnungen",
    title: "Warnungen Aktuell",
    purpose: "Aktuelle Befunde, die Nacharbeit ausloesen.",
    headers: ["Warnungs_ID", "Warnungs_Fingerprint", "Check_ID", "Schweregrad", "Titel", "Betroffene_Tabelle", "Betroffene_ID", "Status", "Naechste_Aktion", "Kommentar"],
    rows: [
      ["WRN001", "CHK-BLD-01|BLD-20260521-001", "CHK-BLD-01", "Fehler", "Workbook-Verifikation noch nicht bestanden", "98_Build_Verifikation", "BLD-20260521-001", "offen", "Build/Verifier ausfuehren", "Startzustand bewusst rot"],
      ["WRN002", "CHK003|TXN-RAW-IMP-20260518-001-000004", "CHK003", "Warnung", "Buchung mit offener Kategorie", "11_Umsaetze_Modell", "TXN-RAW-IMP-20260518-001-000004", "offen", "Kategorie pruefen", "Begruendet gelbe/rote Sichtbarkeit"],
      ["WRN003", "CHK012|ASM002", "CHK012", "Warnung", "Platzhalter-Annahme fuer variable Ausgaben", "42_Annahmen", "ASM002", "offen", "Annahme belegen oder ersetzen", "Dashboardrelevant"],
      ["WRN004", "CHK015|REG001", "CHK015", "Warnung", "Prognose nutzt unbestaetigte Regelzahlung", "12_Regelzahlungen", "REG001", "offen", "Regelzahlung im Review bestaetigen oder verwerfen", "CF002 und Reichweite bleiben teilberechnet"],
      ["WRN005", "CHK016|MON202607", "CHK016", "Warnung", "Zeitachse faellt im Standardszenario unter null", "43_Zeitachse", "MON202607", "offen", "Ausgabenannahme und Liquiditaetsreserve pruefen", "Reichweite zeigt nur 0,6 Monate freie Liquiditaet"],
    ],
    pk: "Warnungs_ID",
    idPrefix: "WRN",
    updateMode: "berechnet_plus_manuell",
  },
  "60_Warnungen_Bearbeitung": {
    sheet: "60_Warnungen",
    title: "Warnungen Bearbeitung",
    purpose: "Manueller Bearbeitungsstatus zu Warnungen.",
    headers: ["Warnungs_Fingerprint", "Bearbeitungsstatus", "Owner", "Faelligkeit", "Kommentar"],
    rows: [
      ["CHK-BLD-01|BLD-20260521-001", "offen", "Nutzer", "", "Noch nicht bearbeitet"],
      ["CHK003|TXN-RAW-IMP-20260518-001-000004", "offen", "Nutzer", "", "Kategorie offen"],
      ["CHK015|REG001", "offen", "Nutzer", "", "Regelzahlung noch nicht final entschieden"],
      ["CHK016|MON202607", "offen", "Nutzer", "", "Negative Projektionszeile fachlich pruefen"],
    ],
    pk: "Warnungs_Fingerprint",
    idPrefix: "WRN",
    updateMode: "manuell",
  },
  "60_Warnungen": {
    sheet: "60_Warnungen",
    title: "Warnungen Zusammenfassung",
    purpose: "Zusammengefuehrte Sicht aus Befund und Bearbeitung.",
    headers: ["Warnungs_Fingerprint", "Titel", "Schweregrad", "Bearbeitungsstatus", "Naechste_Aktion", "Status"],
    rows: [
      ["CHK-BLD-01|BLD-20260521-001", "Workbook-Verifikation noch nicht bestanden", "Fehler", "offen", "Build/Verifier ausfuehren", "offen"],
      ["CHK003|TXN-RAW-IMP-20260518-001-000004", "Buchung mit offener Kategorie", "Warnung", "offen", "Kategorie pruefen", "offen"],
      ["CHK015|REG001", "Prognose nutzt unbestaetigte Regelzahlung", "Warnung", "offen", "Regelzahlung im Review bestaetigen oder verwerfen", "offen"],
      ["CHK016|MON202607", "Zeitachse faellt im Standardszenario unter null", "Warnung", "offen", "Ausgabenannahme und Liquiditaetsreserve pruefen", "offen"],
    ],
    pk: "Warnungs_Fingerprint",
    idPrefix: "WRN",
    updateMode: "sicht",
  },
  "73_Agent_Vorschlaege": {
    sheet: "73_Agent_Vorschlaege",
    title: "Agent Vorschlaege",
    purpose: "Nur entscheidungspflichtige Vorschlaege, keine Agentenplattform.",
    headers: ["Vorschlag_ID", "Vorschlag_Fingerprint", "Lauf_ID", "Methodik_ID", "Vorschlagstyp", "Betroffene_Tabelle", "Betroffene_ID", "Empfohlene_Aktion", "Begruendung", "Konfidenz", "Prioritaet", "Status", "Umsetzung_Eindeutig", "Umsetzungsstatus", "Kommentar"],
    rows: [["SUG-20260521-001", "regelzahlung|miete|kto001", "RUN-20260521-001", "pattern_check_v1", "Regelzahlung", "12_Regelzahlung_Vorschlaege", "SUG-20260521-001", "Miete als Regelzahlung pruefen", "Ein Treffer im Startimport; noch zu wenig fuer Auto-Regel", 0.55, "mittel", "offen", false, "nicht_beauftragt", "Sichtbarer Vorschlag, nicht umgesetzt"]],
    pk: "Vorschlag_ID",
    idPrefix: "SUG",
    updateMode: "vorschlag_manuell",
  },
  "90_Quellen": {
    sheet: "90_Quellen",
    title: "Quellen",
    purpose: "Quellen, Belege und modellkritische Werte.",
    headers: ["Quelle_ID", "Quellenart", "Eltern_Quelle_ID", "Eingangskanal", "Originaldateiname", "Dateiname_Modell", "Dateipfad", "Dateihash", "Belegtyp", "Quelle_Anbieter", "Belegdatum", "Standdatum", "Abrufdatum", "Wertname", "Wert", "Einheit", "Zeitraum", "Zeitraum_von", "Zeitraum_bis", "Seite_Abschnitt", "Zielblatt", "Ziel_ID", "Person_ID", "Objekt_ID", "Szenario_Relevanz", "Status", "Unsicherheit", "Kommentar", "Geprueft_am"],
    rows: seed.quellen,
    pk: "Quelle_ID",
    idPrefix: "SRC",
    updateMode: "append_only",
  },
  "98_Build_Verifikation": {
    sheet: "98_Kontrollspur",
    title: "Build Verifikation",
    purpose: "Minimaler Build- und Verifikationsanker.",
    headers: ["Build_ID", "Builddatum", "Spec_Version", "Workbook_Dateiname", "Workbook_Dateihash", "Builder_Version", "Verifier", "Verifier_Status", "Inspector_Pfad", "Tests_Gesamt", "Tests_Bestanden", "Tests_Fehlgeschlagen", "Offene_Befunde", "Artefakt_ID", "Kommentar"],
    rows: [["BLD-20260521-001", d("2026-05-21"), "V1-Task1-Startmappe", "Finanzmodell_V1_Startmappe.xlsx", "wird_nach_export_pruefbar", "artifact-tool-builder-v1", "artifact-tool", "nicht_ausgefuehrt", "workbook-build/outputs/finanzmodell-v1-startmappe/previews", 0, 0, 0, 1, "ART-20260521-001", "Startmappe: Struktur gebaut, fachliche Finanzformeln noch nicht implementiert"]],
    pk: "Build_ID",
    idPrefix: "BLD",
    updateMode: "builder",
  },
  "98_Agentenlaeufe": {
    sheet: "98_Kontrollspur",
    title: "Agentenlaeufe",
    purpose: "Verdichteter Laufanker; keine Rohantworten.",
    headers: ["Lauf_ID", "Laufdatum", "Agentenrolle", "Ausloeser_Typ", "Methodik_ID", "Erlaubte_Zielbereiche", "Geaenderte_Tabellen", "Erzeugte_Vorschlaege", "Erzeugte_Warnhinweise", "Ergebnis", "Compliance_Status", "Artefakt_ID", "Fehler_Hinweis", "Kommentar"],
    rows: [["RUN-20260521-001", d("2026-05-21"), "Builder", "manuell", "sparring_final_artifact_to_xlsx", "Struktur, Seeds, Kontrollspur", "alle V1-Strukturtafeln", 1, 3, "Startmappe erzeugt", "nicht_pruefbar", "ART-20260521-001", "", "Keine vollstaendige Agentenplattform"]],
    pk: "Lauf_ID",
    idPrefix: "RUN",
    updateMode: "builder_append",
  },
  "98_Artefakt_Referenzen": {
    sheet: "98_Kontrollspur",
    title: "Artefakt Referenzen",
    purpose: "Referenzen auf externe Spezifikations- und Buildartefakte.",
    headers: ["Artefakt_ID", "Artefakt_Typ", "Pfad", "Dateihash", "Erzeugt_am", "Erzeugt_durch", "Bezug_ID", "Aufbewahrung", "Status", "Kommentar"],
    rows: [["ART-20260521-001", "Sparring FINAL_ARTIFACT", "sparring/finanzmodell-excel-spezifikation/FINAL_ARTIFACT", "nicht_pruefbar", d("2026-05-21"), "Codex", "BLD-20260521-001", "Projektordner", "belegt", "Quelle fuer diese Startmappe"]],
    pk: "Artefakt_ID",
    idPrefix: "ART",
    updateMode: "builder_append",
  },
  "99_Checks": {
    sheet: "99_Checks",
    title: "Checks",
    purpose: "Live-Pruefungen, Statusbegruendung und Rueckbindung.",
    headers: ["Check_ID", "Checkgruppe", "Beschreibung", "Schweregrad", "Status", "Betroffene_Quelle_ID", "Betroffene_Annahme_ID", "Betroffener_Import_ID", "Betroffener_Kontrollspur_ID", "Betroffene_Tabelle", "Betroffene_ID", "Ausloeser", "Naechste_Aktion", "Kommentar"],
    rows: [
      ["CHK-BLD-01", "Build", "letzte Workbook-Verifikation fehlt oder ist fehlgeschlagen", "Fehler", "offen", "", "", "", "BLD-20260521-001", "98_Build_Verifikation", "BLD-20260521-001", "Verifier_Status nicht_ausgefuehrt", "Build und Verifikation ausfuehren", "Begruendet roten Startstatus"],
      ["CHK003", "Kategorisierung", "Buchungen ohne Kategorie", "Warnung", "offen", "", "", "IMP-20260518-001", "", "11_Umsaetze_Modell", "TXN-RAW-IMP-20260518-001-000004", "Kategorie_ID = KAT013", "Kategorie pruefen", "Mindestens eine offene Kategorie sichtbar"],
      ["CHK012", "Annahmen", "dashboardrelevante Platzhalter-Annahme", "Warnung", "offen", "", "ASM002", "", "", "42_Annahmen", "ASM002", "Status platzhalter", "Annahme belegen oder ersetzen", "Variable Ausgaben noch nicht belastbar"],
      ["CHK015", "Prognose", "Cashflow-Prognose nutzt unbestaetigte Regelzahlung", "Warnung", "offen", "", "", "", "", "12_Regelzahlungen", "REG001", "Status offen und Matching_Status kandidat", "Regelzahlung im Review bestaetigen oder verwerfen", "CF002 und Reichweite bleiben bis dahin teilberechnet"],
      ["CHK016", "Prognose", "Zeitachse faellt im Standardszenario unter null", "Warnung", "offen", "", "ASM002", "", "", "43_Zeitachse", "MON202607", "Kumulierte_Liquiditaet < 0", "Ausgabenannahme, Regelzahlungen und Reserve pruefen", "Reichweite von 0,6 Monaten ist ein frueher Warnhinweis"],
      ["CHK010", "Quellen", "kritischer Wert ohne pruefbare Quelle", "Warnung", "offen", "SRC-20260518-001", "", "", "", "90_Quellen", "SRC-20260518-001", "Hash nicht_pruefbar", "Fixture/Quelle pruefen", "Startquelle ist angelegt, aber noch nicht verifiziert"],
      ["CHK017", "Basisdaten", "Geburtsdatum oder Renteneintrittsalter fehlt", "Warnung", "offen", "", "", "", "", "01_Personen", "P01", "Geburtsdatum leer", "Personenstammdaten ergaenzen", "Noch keine Renten-/Zeitachsenwirkung"],
    ],
    pk: "Check_ID",
    idPrefix: "CHK",
    updateMode: "berechnet_plus_manuell",
  },
};

const workbook = Workbook.create();

function colName(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function makeTableName(name) {
  return `T_${name}`.replace(/[^A-Za-z0-9_]/g, "_");
}

function addSheet(name, first = false) {
  const sheet = first
    ? workbook.worksheets.getOrAdd(name, { renameFirstIfOnlyNewSpreadsheet: true })
    : workbook.worksheets.add(name);
  sheet.showGridLines = false;
  return sheet;
}

function setStatusBand(sheet, title, purpose, dataStatus = "Startstatus: offen / nicht pruefbar") {
  const shortPurpose = purpose.length > 46 ? `${purpose.slice(0, 43)}...` : purpose;
  sheet.getRange("A1:H1").merge();
  sheet.getRange("A1").values = [[title]];
  sheet.getRange("A1:H1").format = {
    fill: colors.navy,
    font: { color: colors.white, bold: true, size: 15 },
    horizontalAlignment: "left",
    verticalAlignment: "center",
  };
  sheet.getRange("A1:H1").format.rowHeightPx = 34;
  sheet.getRange("A2:H3").values = [
    ["Zweck", shortPurpose, "", "Datenstatus", dataStatus, "", "Naechste Aktion", "Offene Checks bearbeiten"],
    ["Primaerquelle", "Sparring FINAL_ARTIFACT", "", "Kontrollstatus", "nicht_ausgefuehrt", "", "Hinweis", "Task 3: Finanzformeln"],
  ];
  sheet.getRange("A2:H3").format = {
    fill: colors.paleBlue,
    font: { color: colors.slate, size: 10 },
    borders: { preset: "outside", style: "thin", color: colors.line },
    wrapText: true,
    verticalAlignment: "center",
  };
  sheet.getRange("A2:A3").format.font = { bold: true, color: colors.navy };
  sheet.getRange("D2:D3").format.font = { bold: true, color: colors.navy };
  sheet.getRange("G2:G3").format.font = { bold: true, color: colors.navy };
  sheet.getRange("A2:H3").format.rowHeightPx = 82;
}

function styleTable(sheet, rangeAddress, headerRows = 1) {
  const range = sheet.getRange(rangeAddress);
  range.format = {
    borders: { preset: "all", style: "thin", color: colors.line },
    font: { name: "Aptos", size: 10, color: colors.blue },
    verticalAlignment: "center",
    wrapText: true,
  };
  const header = sheet.getRange(rangeAddress).getOffsetRange(0, 0, headerRows, range.columnCount);
  header.format = {
    fill: colors.teal,
    font: { color: colors.white, bold: true, size: 10 },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
  };
  header.format.rowHeightPx = 34;
}

function addDataValidation(sheet, headers, startRow, rowCount) {
  const statusLists = {
    Status: statusValues,
    Datenstatus: statusValues,
    Verifier_Status: kontrollStatusValues,
    Kontrollstatus: kontrollStatusValues,
    Compliance_Status: kontrollStatusValues,
    Bearbeitungsstatus: ["offen", "in_arbeit", "erledigt", "verworfen"],
    Umsetzungsstatus: ["nicht_beauftragt", "auftrag_erstellt", "umgesetzt", "nicht_umsetzbar"],
  };
  headers.forEach((header, idx) => {
    let source = statusLists[header];
    if (header === "Status" && sheet.name === "42_Annahmen") source = annahmenStatusValues;
    if (header === "Status" && ["73_Agent_Vorschlaege", "12_Regelzahlungen"].includes(sheet.name)) source = vorschlagStatusValues;
    if (!source) return;
    const col = colName(idx + 1);
    sheet.getRange(`${col}${startRow}:${col}${Math.max(startRow + rowCount + 20, startRow + 50)}`).dataValidation = {
      allowBlank: true,
      list: { inCellDropDown: true, source },
    };
  });
}

function setColumnWidths(sheet, headers) {
  headers.forEach((header, idx) => {
    const col = colName(idx + 1);
    let width = 110;
    if (header.includes("Kommentar") || header.includes("Beschreibung") || header.includes("Hinweis") || header.includes("Aktion")) width = 230;
    if (header.includes("ID") || header === "Status" || header === "Typ") width = 120;
    if (header.includes("Datum") || header.includes("_am") || header.includes("_von") || header.includes("_bis")) width = 115;
    if (header.includes("Betrag") || header.includes("Wert") || header.includes("Stand")) width = 120;
    sheet.getRange(`${col}:${col}`).format.columnWidthPx = width;
  });
}

function applyNumberFormats(sheet, headers, startRow, rowCount) {
  headers.forEach((header, idx) => {
    const key = header.toLowerCase();
    const col = colName(idx + 1);
    const range = sheet.getRange(`${col}${startRow}:${col}${startRow + rowCount}`);
    const dateLike = key.includes("datum") || key.includes("_am") || key.includes("_von") || key.includes("_bis") || key === "wertstellung" || key === "monat";
    if (dateLike) {
      range.format.numberFormat = "yyyy-mm-dd";
      return;
    }
    if (key.includes("betrag") || key.includes("wert") || key.includes("stand") || key.includes("reserve")) {
      range.format.numberFormat = '#,##0.00;[Red](#,##0.00);"-"';
      range.format.horizontalAlignment = "right";
    }
    if (key.includes("prozent") || key.includes("konfidenz")) {
      range.format.numberFormat = "0.0%;[Red](0.0%);-";
      range.format.horizontalAlignment = "right";
    }
  });
}

function writeTable(sheet, def, startRow) {
  const headers = def.headers;
  const rows = def.rows.length ? def.rows : [headers.map(() => "")];
  const matrix = [headers, ...rows];
  const endRow = startRow + matrix.length - 1;
  const endCol = colName(headers.length);
  const rangeAddress = `A${startRow}:${endCol}${endRow}`;

  sheet.getRange(`A${startRow - 2}:${endCol}${startRow - 2}`).merge();
  sheet.getRange(`A${startRow - 2}`).values = [[def.title]];
  sheet.getRange(`A${startRow - 2}:${endCol}${startRow - 2}`).format = {
    fill: colors.slate,
    font: { color: colors.white, bold: true, size: 12 },
    horizontalAlignment: "left",
  };

  sheet.getRange(`A${startRow - 1}:${endCol}${startRow - 1}`).merge();
  sheet.getRange(`A${startRow - 1}`).values = [[`PK: ${def.pk} | Update: ${def.updateMode} | ID: ${def.idPrefix}`]];
  sheet.getRange(`A${startRow - 1}:${endCol}${startRow - 1}`).format = {
    fill: colors.gray,
    font: { color: colors.slate, italic: true, size: 9 },
  };

  sheet.getRange(rangeAddress).values = matrix;
  styleTable(sheet, rangeAddress);
  setColumnWidths(sheet, headers);
  applyNumberFormats(sheet, headers, startRow + 1, rows.length);
  addDataValidation(sheet, headers, startRow + 1, rows.length);
  const table = sheet.tables.add(rangeAddress, true);
  table.name = makeTableName(def.title.replaceAll(" ", "_"));
  sheet.freezePanes.freezeRows(startRow);
  return endRow + 5;
}

function statusColorFormat(sheet, rangeAddress) {
  const range = sheet.getRange(rangeAddress);
  range.conditionalFormats.add("containsText", {
    text: "Rot",
    format: { fill: colors.paleRed, font: { color: colors.red, bold: true } },
  });
  range.conditionalFormats.add("containsText", {
    text: "Gelb",
    format: { fill: colors.yellow, font: { color: colors.amber, bold: true } },
  });
  range.conditionalFormats.add("containsText", {
    text: "offen",
    format: { fill: colors.yellow, font: { color: colors.amber } },
  });
  range.conditionalFormats.add("containsText", {
    text: "nicht",
    format: { fill: colors.yellow, font: { color: colors.amber } },
  });
}

function buildDashboard(sheet) {
  sheet.showGridLines = false;
  sheet.getRange("A1:M1").merge();
  sheet.getRange("A1").values = [["Finanzmodell V1 Startmappe"]];
  sheet.getRange("A1:M1").format = {
    fill: colors.navy,
    font: { color: colors.white, bold: true, size: 18 },
    horizontalAlignment: "left",
    verticalAlignment: "center",
  };
  sheet.getRange("A1:M1").format.rowHeightPx = 42;
  sheet.getRange("A2:M2").merge();
  sheet.getRange("A2").values = [["Struktur-, Referenz- und Sichtbarkeitsnachweis nach Sparring FINAL_ARTIFACT. Liquiditaet, Cashflow-Erwartung, Offen-Anteil und Reichweite sind als Task-3-Einstieg berechnet."]];
  sheet.getRange("A2:M2").format = {
    fill: colors.paleBlue,
    font: { color: colors.slate, size: 11 },
    wrapText: true,
  };

  const cards = [
    ["Modellstatus", '=IF(COUNTIFS(\'99_Checks\'!D:D,"Fehler",\'99_Checks\'!E:E,"offen")>0,"Rot",IF(COUNTIFS(\'99_Checks\'!D:D,"Warnung",\'99_Checks\'!E:E,"offen")>0,"Gelb","Gruen"))', "Rueckgebunden an offene Build-, Kategorie- und Annahmenchecks"],
    ["Kontrollstatus", "nicht_ausgefuehrt", "Build-Verifikation ist als Startzustand nicht ausgefuehrt"],
    ["Naechste Aktion", "Review abschliessen, offene Kategorie und Platzhalterannahme pruefen", "Danach Prognose aus akzeptierten Review-Entscheidungen schaerfen"],
  ];
  sheet.getRange("A4:C6").values = cards;
  sheet.getRange("A4:C6").format = {
    borders: { preset: "all", style: "thin", color: colors.line },
    fill: colors.white,
    wrapText: true,
    verticalAlignment: "center",
  };
  sheet.getRange("A4:C6").format.rowHeightPx = 64;
  sheet.getRange("A4:A6").format = { fill: colors.slate, font: { color: colors.white, bold: true } };
  sheet.getRange("B4:B6").format.font = { bold: true, size: 12, color: colors.black };
  statusColorFormat(sheet, "B4:B6");

  const metrics = [
    ["Kennzahl", "Wert", "Status", "Warum"],
    ["Liquiditaet heute", calculated.liquidityToday, "berechnet", "Summe liquider Konten"],
    ["Freie Liquiditaet nach Reserve", calculated.freeLiquidity, "berechnet", "Liquiditaet minus Sicherheitsreserve"],
    ["Cashflow Monat gesamt", calculated.actualMonthlyCashflow, "teilberechnet", "Ist-Cashflow aus Modellbuchungen"],
    ["Reichweite Standardszenario", calculated.runwayMonths, "teilberechnet", "Freie Liquiditaet geteilt durch erwarteten Monatsverbrauch"],
    ["Offene Checks", '=COUNTIF(\'99_Checks\'!E:E,"offen")', "sichtbar", "Mindestens ein Fehler/Warnung begruendet Rot/Gelb"],
  ];
  sheet.getRange("A9:D14").values = metrics;
  styleTable(sheet, "A9:D14");
  sheet.tables.add("A9:D14", true).name = "T_00_Dashboard";
  sheet.getRange("B10:B12").format = { fill: colors.paleTeal, font: { color: colors.green, bold: true } };
  sheet.getRange("B13").format = { fill: colors.paleTeal, font: { color: colors.green, bold: true } };
  sheet.getRange("B14").format.font = { color: colors.black, bold: true };

  const topWarnings = [
    ["Top-Warnung", "Schweregrad", "Naechste Aktion"],
    ["Workbook-Verifikation noch nicht bestanden", "Fehler", "Build/Verifier ausfuehren"],
    ["Buchung mit offener Kategorie", "Warnung", "Kategorie pruefen"],
    ["Prognose nutzt unbestaetigte Regelzahlung", "Warnung", "Regelzahlung im Review entscheiden"],
  ];
  sheet.getRange("F9:H12").values = topWarnings;
  styleTable(sheet, "F9:H12");
  statusColorFormat(sheet, "G10:G12");

  const chartSource = [
    ["Schweregrad", "Offene Checks"],
    ["Fehler", '=COUNTIFS(\'99_Checks\'!D:D,"Fehler",\'99_Checks\'!E:E,"offen")'],
    ["Warnung", '=COUNTIFS(\'99_Checks\'!D:D,"Warnung",\'99_Checks\'!E:E,"offen")'],
    ["Hinweis", '=COUNTIFS(\'99_Checks\'!D:D,"Hinweis",\'99_Checks\'!E:E,"offen")'],
  ];
  sheet.getRange("J4:K7").values = chartSource;
  styleTable(sheet, "J4:K7");
  sheet.charts.add("bar", {
    title: "Offene Checks nach Schweregrad",
    categories: ["Fehler", "Warnung", "Hinweis"],
    series: [{ name: "Offene Checks", values: [1, 6, 0], fill: { type: "solid", color: colors.teal } }],
    hasLegend: false,
    barOptions: { direction: "column", grouping: "clustered", gapWidth: 120 },
    dataLabels: { showValue: true, position: "outEnd" },
    from: { row: 8, col: 9 },
    extent: { widthPx: 420, heightPx: 260 },
    yAxis: { majorGridlines: { fill: "#E5E7EB", style: "solid", width: 1 }, title: { text: "Anzahl" } },
  });

  const legend = [
    ["Format", "Bedeutung"],
    ["Blaue Schrift", "hardcodierte Startdaten / editierbare Inputs"],
    ["Schwarze Schrift", "Formeln oder berechnete Statusfelder"],
    ["Gelbe Flaeche", "offen, Platzhalter oder pruefpflichtig"],
  ];
  sheet.getRange("A17:B20").values = legend;
  styleTable(sheet, "A17:B20");
  sheet.getRange("A18:B18").format.font = { color: colors.blue };
  sheet.getRange("A19:B19").format.font = { color: colors.black };
  sheet.getRange("A20:B20").format.fill = colors.yellow;

  ["A:A", "B:B", "C:C", "D:D"].forEach((col, idx) => {
    sheet.getRange(col).format.columnWidthPx = [210, 190, 230, 330][idx];
  });
  ["F:F", "G:G", "H:H"].forEach((col, idx) => {
    sheet.getRange(col).format.columnWidthPx = [250, 110, 280][idx];
  });
  ["J:J", "K:K", "L:L", "M:M"].forEach((col) => {
    sheet.getRange(col).format.columnWidthPx = 120;
  });
  sheet.freezePanes.freezeRows(8);
}

const sheets = new Map();
sheetOrder.forEach((name, idx) => sheets.set(name, addSheet(name, idx === 0)));

buildDashboard(sheets.get("00_Dashboard"));

for (const sheetName of sheetOrder.slice(1)) {
  const sheet = sheets.get(sheetName);
  const defs = Object.entries(tableDefs)
    .filter(([, def]) => def.sheet === sheetName)
    .map(([key, def]) => [tableBuildOrder.indexOf(key), def])
    .sort((a, b) => a[0] - b[0])
    .map(([, def]) => def);
  const purpose = defs.map((def) => def.purpose).join(" ");
  setStatusBand(sheet, sheetName, purpose || "Sichtbarer V1-Platzhalter.");
  let row = 6;
  for (const def of defs) row = writeTable(sheet, def, row);
}

workbook.recalculate();

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const inspectDashboard = await workbook.inspect({
  kind: "table",
  range: "00_Dashboard!A1:M20",
  include: "values,formulas",
  tableMaxRows: 20,
  tableMaxCols: 13,
  summary: "dashboard check",
});
console.log(inspectDashboard.ndjson);

const formulaErrors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(formulaErrors.ndjson || "formula_error_scan_empty");

for (const sheetName of sheetOrder) {
  const blob = await workbook.render({ sheetName, range: "A1:M30", scale: 1.4 });
  await fs.writeFile(new URL(`${sheetName}.png`, previewDir), Buffer.from(await blob.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(`EXPORTED ${outputPath.pathname}`);
