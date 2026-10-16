// tests/belege.test.mjs
// Reine Funktionen der Dokumente-Ansicht (app/belege.mjs): Pfad-Extraktion,
// Baum, Textzwillinge, Verweis-Index, Zusammenfassung, Routen, i18n.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  belegPfadeAusText, belegTextHtml, baueBaum, ordneZwillingeZu, verweisIndex,
  fasseTransaktionenZusammen, dokumentRoute, belegPfadAusRoute, sortiereDateien,
  sucheDateien, formatGroesse, ordnerVon, vorfahren, belegSchluessel, dokumenteZuObjekt, belegOrdnerAusText,
} from "../app/belege.mjs";
import { routeFromState, parseRoute } from "../app/routing.mjs";

globalThis.window = globalThis;
await import("../app/i18n.js");

const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

// --- Pfad-Extraktion ---------------------------------------------------------

test("belegPfadeAusText: reiner Pfad, Pfad mitten im Text, Satzzeichen am Ende", () => {
  assert.deepEqual(belegPfadeAusText("Belege/Kontoauszuege/KTO-001/a.csv"), ["Belege/Kontoauszuege/KTO-001/a.csv"]);
  assert.deepEqual(belegPfadeAusText("siehe Belege/2025/Rente/Info_2025.pdf, Seite 2"), ["Belege/2025/Rente/Info_2025.pdf"]);
  assert.deepEqual(belegPfadeAusText("Quelle: Belege/2025/Rente/a.pdf."), ["Belege/2025/Rente/a.pdf"]);
  assert.deepEqual(belegPfadeAusText("(Belege/2025/Rente/a.pdf)"), ["Belege/2025/Rente/a.pdf"]);
  assert.deepEqual(belegPfadeAusText("'Belege/2025/Rente/a.pdf';"), ["Belege/2025/Rente/a.pdf"]);
  assert.deepEqual(belegPfadeAusText("Belege/x/a.pdf; Belege/x/b.XLSX"), ["Belege/x/a.pdf", "Belege/x/b.XLSX"]);
  assert.deepEqual(belegPfadeAusText("Belege/x/tabelle.xls und Belege/x/t.txt"), ["Belege/x/tabelle.xls", "Belege/x/t.txt"]);
  assert.deepEqual(belegPfadeAusText("Belege/x/a.pdf Belege/x/a.pdf"), ["Belege/x/a.pdf"], "doppelt nur einmal");
});

test("belegPfadeAusText: kein Treffer bei Freitext, data/-Pfaden und fremden Endungen", () => {
  assert.deepEqual(belegPfadeAusText("Demo-Kontoauszug"), []);
  assert.deepEqual(belegPfadeAusText("data/demo/inbox/demo-2023-07.csv"), []);
  assert.deepEqual(belegPfadeAusText("Belege/x/bild.gif"), []);
  assert.deepEqual(belegPfadeAusText("Foto: Belege/x/Quittung.JPG."), ["Belege/x/Quittung.JPG"]);
  assert.deepEqual(belegPfadeAusText(undefined), []);
  assert.deepEqual(belegPfadeAusText("Belege/x/a.pdfx"), []);
});

test("belegTextHtml: escaped Freitext, Pfade als Link auf #/dokumente", () => {
  const html = belegTextHtml("<b>Info</b> Belege/2025/Rente/a b&c.pdf.", { titel: "Quelldokument", escape: esc });
  assert.equal(html.includes("<b>"), false);
  assert.match(html, /^&lt;b&gt;Info&lt;\/b&gt; /);
  // Leerzeichen trennt: nur "c.pdf"-Teil waere kein Belege-Pfad -> kein Link.
  assert.doesNotMatch(html, /<a /);
  const link = belegTextHtml("Beleg: Belege/2025/Rente/Info&Co.pdf.", { titel: "Quelldokument \"x\"", escape: esc });
  assert.match(link, /<a class="linkish quelldokument-link" href="#\/dokumente\/2025\/Rente\/Info%26Co\.pdf" title="Quelldokument &quot;x&quot;">Belege\/2025\/Rente\/Info&amp;Co\.pdf<\/a>\.$/);
  assert.equal(belegTextHtml("", { titel: "x", escape: esc }), "");
});

// --- Routen ------------------------------------------------------------------

test("dokumentRoute/belegPfadAusRoute sind invers und kodieren Segmente", () => {
  assert.equal(dokumentRoute("Belege/Kontoauszuege/KTO-001/a b#1.pdf"), "#/dokumente/Kontoauszuege/KTO-001/a%20b%231.pdf");
  assert.equal(dokumentRoute("Belege"), "#/dokumente");
  assert.equal(dokumentRoute(""), "#/dokumente");
  assert.equal(belegPfadAusRoute("Kontoauszuege/KTO-001/a b#1.pdf"), "Belege/Kontoauszuege/KTO-001/a b#1.pdf");
  assert.equal(belegPfadAusRoute(""), "");
});

test("Routen #/dokumente und #/dokumente/<pfad>", () => {
  assert.equal(routeFromState({ view: "belege" }), "#/dokumente");
  assert.equal(routeFromState({ view: "belege", selectedBeleg: "Belege/2025/Rente/ä.pdf" }), "#/dokumente/2025/Rente/%C3%A4.pdf");
  assert.deepEqual(parseRoute("#/dokumente"), { view: "belege" });
  assert.deepEqual(parseRoute("#/dokumente/2025/Rente/%C3%A4.pdf"), { view: "belege", selectedBeleg: "Belege/2025/Rente/ä.pdf" });
  assert.deepEqual(parseRoute("#/dokumente/2025/Rente"), { view: "belege", selectedBeleg: "Belege/2025/Rente" });
  // Kaputte Kodierung faellt sauber auf die Liste zurueck.
  assert.deepEqual(parseRoute("#/dokumente/%E0%A4%A"), { view: "belege" });
});

test("Route fuer den Dokument-Filter der Transaktionen", () => {
  const pfad = "Belege/Kontoauszuege/KTO-001/a 1.csv";
  assert.equal(
    routeFromState({ view: "transactions", selectedTransactionId: "", transactionFilters: { beleg: pfad } }),
    "#/transaktionen/dokument/Kontoauszuege/KTO-001/a%201.csv",
  );
  // Auswahl einer Buchung hat Vorrang (teilbares Detail).
  assert.equal(
    routeFromState({ view: "transactions", selectedTransactionId: "TXN-1", transactionFilters: { beleg: pfad } }),
    "#/transaktionen/TXN-1",
  );
  assert.deepEqual(parseRoute("#/transaktionen/dokument/Kontoauszuege/KTO-001/a%201.csv"), { view: "transactions", belegFilter: pfad });
  assert.deepEqual(parseRoute("#/transaktionen/TXN-1"), { view: "transactions", selectedTransactionId: "TXN-1" });
});

// --- Zwillinge, Baum ----------------------------------------------------------

const LISTE = [
  { pfad: "Belege/Kontoauszuege/KTO-001/a.pdf", groesse: 2048, geaendert: "2026-01-02T10:00:00.000Z", typ: "pdf" },
  { pfad: "Belege/Kontoauszuege/KTO-001/a.txt", groesse: 100, geaendert: "2026-01-02T10:00:00.000Z", typ: "txt" },
  { pfad: "Belege/Kontoauszuege/KTO-001/b.csv", groesse: 50, geaendert: "2026-01-03T10:00:00.000Z", typ: "csv" },
  { pfad: "Belege/2025/Rente/scan.pdf", groesse: 5_000_000, geaendert: "2025-05-01T10:00:00.000Z", typ: "pdf" },
  { pfad: "Belege/2025/Rente/scan.txt", groesse: 60, geaendert: "2025-05-01T10:00:00.000Z", typ: "txt", ocrAusstehend: true },
  { pfad: "Belege/2025/Rente/ohne.pdf", groesse: 10, geaendert: "2025-05-02T10:00:00.000Z", typ: "pdf" },
  { pfad: "Belege/2025/Rente/notiz.txt", groesse: 10, geaendert: "2025-05-02T10:00:00.000Z", typ: "txt" },
  { pfad: "Belege/wurzel.pdf", groesse: 1, geaendert: "2024-01-01T00:00:00.000Z", typ: "pdf" },
];

test("ordneZwillingeZu: PDF bekommt Textstatus, .txt neben PDF ist Zwilling", () => {
  const dateien = ordneZwillingeZu(LISTE);
  const nach = new Map(dateien.map((d) => [d.pfad, d]));
  assert.equal(nach.get("Belege/Kontoauszuege/KTO-001/a.pdf").textStatus, "durchsuchbar");
  assert.equal(nach.get("Belege/Kontoauszuege/KTO-001/a.pdf").zwilling, "Belege/Kontoauszuege/KTO-001/a.txt");
  assert.equal(nach.get("Belege/Kontoauszuege/KTO-001/a.txt").istZwilling, true);
  assert.equal(nach.get("Belege/Kontoauszuege/KTO-001/a.txt").zwillingVon, "Belege/Kontoauszuege/KTO-001/a.pdf");
  assert.equal(nach.get("Belege/2025/Rente/scan.pdf").textStatus, "ocr-ausstehend");
  assert.equal(nach.get("Belege/2025/Rente/ohne.pdf").textStatus, "");
  assert.equal(nach.get("Belege/2025/Rente/notiz.txt").istZwilling, false);
  assert.equal(nach.get("Belege/Kontoauszuege/KTO-001/b.csv").textStatus, "");
  assert.equal(nach.get("Belege/2025/Rente/scan.pdf").name, "scan.pdf");
  assert.equal(nach.get("Belege/2025/Rente/scan.pdf").ordner, "Belege/2025/Rente");
  assert.equal(nach.get("Belege/wurzel.pdf").ordner, "Belege");
});

test("ordneZwillingeZu: Zwilling auch bei grossgeschriebener Endung", () => {
  const dateien = ordneZwillingeZu([
    { pfad: "Belege/x/A.PDF", groesse: 1, geaendert: "", typ: "pdf" },
    { pfad: "Belege/x/A.txt", groesse: 1, geaendert: "", typ: "txt" },
  ]);
  assert.equal(dateien[0].textStatus, "durchsuchbar");
  assert.equal(dateien[1].istZwilling, true);
});

test("baueBaum: Ordner mit Dateianzahl inkl. Unterordnern, sortiert", () => {
  const baum = baueBaum(LISTE);
  assert.equal(baum.pfad, "Belege");
  assert.equal(baum.anzahl, 8);
  assert.deepEqual(baum.dateien.map((d) => d.pfad), ["Belege/wurzel.pdf"]);
  assert.deepEqual(baum.ordner.map((o) => o.name), ["2025", "Kontoauszuege"]);
  const jahr = baum.ordner[0];
  assert.equal(jahr.pfad, "Belege/2025");
  assert.equal(jahr.anzahl, 4);
  assert.equal(jahr.ordner[0].pfad, "Belege/2025/Rente");
  assert.equal(jahr.ordner[0].dateien.length, 4);
  assert.equal(baum.ordner[1].ordner[0].anzahl, 3);
  assert.equal(baueBaum([]).anzahl, 0);
});

test("ordnerVon und vorfahren", () => {
  assert.equal(ordnerVon("Belege/a/b/c.pdf"), "Belege/a/b");
  assert.equal(ordnerVon("Belege/c.pdf"), "Belege");
  assert.deepEqual(vorfahren("Belege/a/b"), ["Belege", "Belege/a", "Belege/a/b"]);
  assert.deepEqual(vorfahren("Belege"), ["Belege"]);
});

// --- Verweis-Index -------------------------------------------------------------

const DATEN = {
  transaktionen: [
    { transaktion_id: "TXN-1", konto_id: "KTO-001", buchungsdatum: "2026-01-05", rohquelle: "Belege/Kontoauszuege/KTO-001/b.csv" },
    { transaktion_id: "TXN-2", konto_id: "KTO-001", buchungsdatum: "2026-01-02", rohquelle: "Belege/Kontoauszuege/KTO-001/b.csv" },
    { transaktion_id: "TXN-3", konto_id: "KTO-002", buchungsdatum: "2026-02-10", rohquelle: "Belege/Kontoauszuege/KTO-001/b.csv" },
    { transaktion_id: "TXN-4", konto_id: "KTO-002", buchungsdatum: "2026-02-10", rohquelle: "data/demo/inbox/x.csv" },
  ],
  zeitwerte: [
    { entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "1.00", standdatum: "2026-01-31", qualitaet: "belegt", quelle_hinweis: "Jahresauszug Belege/Kontoauszuege/KTO-001/a.pdf, S. 3" },
    { entitaet: "vorsorge", entitaet_id: "VS-001", feld: "rueckkaufswert", wert: "1.00", standdatum: "2025-12-31", qualitaet: "belegt", quelle_hinweis: "Belege/2025/Rente/scan.pdf" },
  ],
  vorsorge: [{ vorsorge_id: "VS-001", name: "Rentenvertrag", quelle_hinweis: "Belege/2025/Rente/scan.pdf" }],
  darlehen: [{ darlehen_id: "DAR-001", bezeichnung: "Kredit", quelle_hinweis: "Belege/2025/Rente/scan.pdf" }],
  vermoegenswerte: [{ vermoegenswert_id: "VMW-001", bezeichnung: "Auto", quelle_hinweis: "Schaetzung" }],
  immobilien: [{ immobilie_id: "IMM-001", bezeichnung: "Wohnung", quelle_hinweis: "Belege/2025/Rente/scan.pdf" }],
  regelzahlungen: [{ regelzahlung_id: "RZ-001", bezeichnung: "Beitrag", quelle_hinweis: "Belege/2025/Rente/scan.pdf" }],
};

test("verweisIndex: Transaktionen per rohquelle, andere Entitaeten per quelle_hinweis", () => {
  const index = verweisIndex(DATEN);
  const csv = index.get("Belege/Kontoauszuege/KTO-001/b.csv");
  assert.deepEqual(csv.transaktionen, ["TXN-1", "TXN-2", "TXN-3"]);
  assert.deepEqual(csv.andere, []);
  const auszug = index.get("Belege/Kontoauszuege/KTO-001/a.pdf");
  assert.deepEqual(auszug.transaktionen, []);
  assert.equal(auszug.andere.length, 1);
  assert.equal(auszug.andere[0].entitaet, "zeitwert");
  assert.equal(auszug.andere[0].route, "#/vermoegen/konten/KTO-001");
  const scan = index.get("Belege/2025/Rente/scan.pdf");
  assert.deepEqual(scan.andere.map((v) => [v.entitaet, v.id, v.route]), [
    ["zeitwert", "VS-001", "#/vorsorge/VS-001"],
    ["vorsorge", "VS-001", "#/vorsorge/VS-001"],
    ["darlehen", "DAR-001", "#/vermoegen/darlehen/DAR-001"],
    ["immobilie", "IMM-001", "#/vermoegen/immobilien/IMM-001"],
    ["regelzahlung", "RZ-001", "#/regelzahlungen/RZ-001"],
  ]);
  assert.equal(scan.andere[1].label, "VS-001 · Rentenvertrag");
  assert.equal(index.has("data/demo/inbox/x.csv"), false);
  assert.equal(index.size, 3);
});

test("verweisIndex und belegSchluessel vergleichen Unicode-normalisiert", () => {
  const nfd = "Belege/x/Änderung.pdf"; // A + kombinierendes Trema
  const nfc = "Belege/x/Änderung.pdf";
  const index = verweisIndex({ transaktionen: [{ transaktion_id: "T", konto_id: "K", buchungsdatum: "2026-01-01", rohquelle: nfc }] });
  assert.ok(index.get(belegSchluessel(nfd)));
});

test("verweisIndex: fehlende Sammlungen sind kein Fehler", () => {
  assert.equal(verweisIndex({}).size, 0);
});

test("fasseTransaktionenZusammen: Konten, Zeitraum, Anzahl", () => {
  assert.deepEqual(fasseTransaktionenZusammen(DATEN.transaktionen.slice(0, 3)), {
    anzahl: 3, konten: ["KTO-001", "KTO-002"], von: "2026-01-02", bis: "2026-02-10",
  });
  assert.deepEqual(fasseTransaktionenZusammen([]), { anzahl: 0, konten: [], von: "", bis: "" });
});

// --- Sortierung, Suche, Groesse --------------------------------------------------

test("sortiereDateien nach Name, Groesse, Geaendert, Typ und Verknuepfungen", () => {
  const dateien = ordneZwillingeZu(LISTE).filter((d) => !d.istZwilling);
  const name = sortiereDateien(dateien, { key: "name", dir: "asc" }).map((d) => d.name);
  assert.deepEqual(name, ["a.pdf", "b.csv", "notiz.txt", "ohne.pdf", "scan.pdf", "wurzel.pdf"]);
  assert.equal(sortiereDateien(dateien, { key: "groesse", dir: "desc" })[0].name, "scan.pdf");
  assert.equal(sortiereDateien(dateien, { key: "geaendert", dir: "asc" })[0].name, "wurzel.pdf");
  assert.equal(sortiereDateien(dateien, { key: "typ", dir: "asc" })[0].typ, "csv");
  const verknuepft = sortiereDateien(dateien, { key: "verknuepft", dir: "desc" }, (d) => (d.name === "ohne.pdf" ? 5 : 0));
  assert.equal(verknuepft[0].name, "ohne.pdf");
  assert.notEqual(sortiereDateien(dateien, { key: "name", dir: "asc" }), dateien, "sortiert eine Kopie");
});

test("sucheDateien filtert Dateinamen ueber alle Ordner, ohne Gross-/Kleinschreibung", () => {
  const dateien = ordneZwillingeZu(LISTE);
  assert.deepEqual(sucheDateien(dateien, "SCAN").map((d) => d.name), ["scan.pdf", "scan.txt"]);
  assert.deepEqual(sucheDateien(dateien, "rente").map((d) => d.name), [], "Ordnername ist kein Treffer");
  assert.equal(sucheDateien(dateien, "  ").length, dateien.length);
});

test("formatGroesse ist lesbar", () => {
  assert.equal(formatGroesse(512, "de-DE"), "512 B");
  assert.equal(formatGroesse(2048, "de-DE"), "2 KB");
  assert.equal(formatGroesse(5_000_000, "de-DE"), "4,8 MB");
  assert.equal(formatGroesse(5_000_000, "en-GB"), "4.8 MB");
});

// --- i18n ------------------------------------------------------------------------

function tr(lang, path) {
  let current = window.FINANCE_I18N[lang];
  for (const part of path.split(".")) current = current?.[part];
  return typeof current === "string" ? current : undefined;
}

test("Dokumente-Texte existieren in de und en, ohne 'Beleg' in der Oberflaeche", () => {
  const schluessel = [
    "nav.belege",
    "dokumente.title", "dokumente.lead", "dokumente.ordner", "dokumente.suche", "dokumente.suchePlatzhalter",
    "dokumente.zwillingeZeigen", "dokumente.spalteName", "dokumente.spalteTyp", "dokumente.spalteGroesse",
    "dokumente.spalteGeaendert", "dokumente.spalteVerknuepft", "dokumente.spalteText",
    "dokumente.textDurchsuchbar", "dokumente.textOcrAusstehend", "dokumente.textzwilling",
    "dokumente.oeffnen", "dokumente.herunterladen", "dokumente.details", "dokumente.schliessen",
    "dokumente.quelleFuerBuchungen", "dokumente.quelleFuerBuchung", "dokumente.konten", "dokumente.zeitraum",
    "dokumente.inTransaktionenAnzeigen", "dokumente.verknuepfteDatensaetze", "dokumente.nichtVerknuepft",
    "dokumente.leer", "dokumente.ordnerLeer", "dokumente.keineTreffer", "dokumente.laedt", "dokumente.apiFehlt",
    "dokumente.aktualisieren", "dokumente.treffer", "dokumente.ordnerSpalte", "dokumente.ordnerTyp", "dokumente.dateienAnzahl", "dokumente.aufklappen", "dokumente.zuklappen",
    "dokumente.quelldokument", "dokumente.filterChip", "dokumente.filterEntfernen",
    "dokumente.entitaet.zeitwert", "dokumente.entitaet.vorsorge", "dokumente.entitaet.darlehen",
    "dokumente.entitaet.vermoegenswert", "dokumente.entitaet.immobilie", "dokumente.entitaet.regelzahlung",
  ];
  for (const lang of ["de", "en"]) {
    for (const key of schluessel) {
      const text = tr(lang, key);
      assert.ok(text, `${key} fehlt in ${lang}`);
      assert.doesNotMatch(text, /beleg/i, `${key} (${lang}) nennt "Beleg"`);
    }
  }
  assert.equal(tr("de", "nav.belege"), "Dokumente");
  assert.equal(tr("en", "nav.belege"), "Documents");
  assert.equal(tr("de", "dokumente.quelldokument"), "Quelldokument");
  assert.equal(tr("en", "dokumente.quelldokument"), "Source document");
});

test("dokumenteZuObjekt: Objektordner plus Verweise, ohne Zwillinge, neueste zuerst", () => {
  const dateien = [
    { pfad: "Belege/Darlehen/DAR-001_Bank-Bau/2024/Jahresauszug_2024.pdf", typ: "pdf" },
    { pfad: "Belege/Darlehen/DAR-001_Bank-Bau/2024/Jahresauszug_2024.txt", typ: "txt" },
    { pfad: "Belege/Darlehen/DAR-001_Bank-Bau/2025/Jahresauszug_2025.pdf", typ: "pdf" },
    { pfad: "Belege/Darlehen/DAR-0011_Andere/2025/x.pdf", typ: "pdf" },
    { pfad: "Belege/Immobilien/IMM-001_Haus/2019/Kaufvertrag.pdf", typ: "pdf" },
    { pfad: "Belege/Sonstiges/2026/Gutachten.pdf", typ: "pdf" },
  ];
  const index = verweisIndex({ immobilien: [{ immobilie_id: "IMM-001", bezeichnung: "Haus", quelle_hinweis: "Belege/Sonstiges/2026/Gutachten.pdf" }] });
  assert.deepEqual(dokumenteZuObjekt({ dateien, index, ids: ["DAR-001"] }).map((d) => d.pfad), [
    "Belege/Darlehen/DAR-001_Bank-Bau/2025/Jahresauszug_2025.pdf",
    "Belege/Darlehen/DAR-001_Bank-Bau/2024/Jahresauszug_2024.pdf",
  ]);
  assert.deepEqual(dokumenteZuObjekt({ dateien, index, ids: ["IMM-001"] }).map((d) => d.name), ["Gutachten.pdf", "Kaufvertrag.pdf"]);
  assert.deepEqual(dokumenteZuObjekt({ index, ids: ["IMM-001"] }).map((d) => d.pfad), ["Belege/Sonstiges/2026/Gutachten.pdf"]);
  assert.deepEqual(dokumenteZuObjekt({ dateien, index, ids: [] }), []);
});

test("belegOrdnerAusText: nur Objektordner mit Schraegstrich am Ende, keine Dateipfade", () => {
  assert.deepEqual(belegOrdnerAusText("Belege/Versicherungen/KFZ_X_1/ sowie Lastschrift"), ["Belege/Versicherungen/KFZ_X_1/"]);
  assert.deepEqual(belegOrdnerAusText("(Belege/Versicherungen/KFZ_X_1/2026/)"), ["Belege/Versicherungen/KFZ_X_1/2026/"]);
  assert.deepEqual(belegOrdnerAusText("Belege/Versicherungen/KFZ_X_1/2026/a.pdf"), []);
  assert.deepEqual(belegOrdnerAusText("Belege/Versicherungen/ und Belege/"), [], "Klassenordner allein ist zu grob");
  assert.deepEqual(belegOrdnerAusText(undefined), []);
});

test("dokumenteZuObjekt: genannte Ordner liefern alle Dateien darunter", () => {
  const dateien = [
    { pfad: "Belege/Versicherungen/KFZ_X_1/2025/Rechnung_2025.pdf", typ: "pdf" },
    { pfad: "Belege/Versicherungen/KFZ_X_1/2025/Rechnung_2025.txt", typ: "txt" },
    { pfad: "Belege/Versicherungen/KFZ_X_1/2026/Rechnung_2026.pdf", typ: "pdf" },
    { pfad: "Belege/Versicherungen/KFZ_X_10/2026/fremd.pdf", typ: "pdf" },
  ];
  assert.deepEqual(dokumenteZuObjekt({ dateien, ids: ["VS-001"], ordner: ["Belege/Versicherungen/KFZ_X_1/"] }).map((d) => d.pfad), [
    "Belege/Versicherungen/KFZ_X_1/2026/Rechnung_2026.pdf",
    "Belege/Versicherungen/KFZ_X_1/2025/Rechnung_2025.pdf",
  ]);
  assert.deepEqual(dokumenteZuObjekt({ dateien, ids: ["VS-001"] }), []);
});
