// app/transaktionen-abfrage.mjs
// Filtern, Sortieren und Seiten der Buchungsliste als reine Funktionen ueber
// einen Bestand. Rechnet im App-Server (lese-api.mjs, GET /api/v1/transaktionen);
// der Browser bekommt nur die Zeilen der angezeigten Seite. Kein DOM, kein
// Laufzeitzustand: Filter, Sortierung und Seite kommen als Argumente.
import { matchesQuery, toCents } from "./tools/lib/text.mjs";
import { belegPfadeAusText, belegSchluessel } from "./belege.mjs";
import { buchungsKlasse, kategorienIndex } from "./klassifikation.mjs";

export const SEITENGROESSEN = Object.freeze([10, 20, 50, 100]);
export const SORTIERUNGEN = Object.freeze(["date", "account", "counterparty", "purpose", "amount", "category", "status"]);

// Leerer Filter, wie state.transactionFilters in runtime.mjs.
export const LEERER_FILTER = Object.freeze({
  account: "", status: "", category: "", transfer: "", origin: "", search: "", beleg: "", vorsorge: "",
  timeMode: "none", dateFrom: "", dateTo: "", month: "", quarterYear: "", quarter: "1", year: "",
  // Betrag ohne Vorzeichen in Euro ("500", "12.50"), Richtung einnahme|ausgabe, Regelzahlung (RZ-ID).
  betragVon: "", betragBis: "", richtung: "", regelzahlung: "",
  // Genau diese Gegenpartei (Gruppenzeile), anders als die Freitextsuche.
  gegenpartei: "",
  // Klasse der zentralen Klassifikation (klassifikation.mjs), z. B. laufend.
  klasse: "",
  // Fuer wen die Buchung ist (fuer_person_id, ADR 0039); "ohne" = keine Person.
  person: "",
});

// Kategorie-Filter fuer Buchungen ohne Kategorie.
export const OHNE_KATEGORIE = "ohne";
// Personen-Filter fuer Buchungen ohne Person (Familie, gemeinsam).
export const OHNE_PERSON = "ohne";

export const RICHTUNGEN = Object.freeze(["einnahme", "ausgabe"]);
export const GRUPPEN = Object.freeze(["kategorie", "monat", "gegenpartei", "regelzahlung", "person"]);
// Eurobetrag ohne Vorzeichen mit hoechstens zwei Nachkommastellen, Punkt oder Komma.
export const BETRAG_MUSTER = /^\d{1,9}([.,]\d{1,2})?$/;
const betragCent = (wert) => toCents(String(wert).replace(",", "."));

function suchfelder(tx) {
  return [
    tx.gegenpartei,
    tx.verwendungszweck,
    tx.bemerkung,
    tx.empfaenger,
    tx.empfaenger_iban,
    tx.transaktion_id,
    tx.betrag,
    String(tx.betrag ?? "").replace(".", ","),
    ...(tx.matched_regeln ?? []),
    tx.immobilie_id,
    // Konto und Kategorie bewusst NICHT durchsuchbar: beide haben einen eigenen
    // Dropdown-Filter. Im Freitext erzeugten sie nur Substring-Kollisionen
    // (z. B. "MusterbankA" matchte jede Buchung auf dem MusterbankA-Konto statt nur den Text).
    tx.kundenreferenz,
    tx.mandatsreferenz,
    tx.bank_referenz,
  ];
}

export function passtHerkunft(tx, herkunft) {
  if (!herkunft) return true;
  return (tx.kategorie_herkunft || "") === herkunft;
}

// Quelldokument-Filter: die rohquelle der Buchung nennt genau diesen Belegpfad.
export function passtBeleg(tx, beleg) {
  if (!beleg) return true;
  const gesucht = belegSchluessel(beleg);
  return belegPfadeAusText(tx.rohquelle).some((pfad) => belegSchluessel(pfad) === gesucht);
}

export function passtZeitraum(tx, filter) {
  const datum = tx.buchungsdatum;
  if (!datum || filter.timeMode === "none") return true;
  if (filter.timeMode === "range") {
    if (filter.dateFrom && datum < filter.dateFrom) return false;
    if (filter.dateTo && datum > filter.dateTo) return false;
    return true;
  }
  if (filter.timeMode === "month") return !filter.month || datum.startsWith(filter.month);
  if (filter.timeMode === "quarter") {
    if (!filter.quarterYear) return true;
    const quartal = Math.ceil(Number(datum.slice(5, 7)) / 3);
    return datum.startsWith(`${filter.quarterYear}-`) && String(quartal) === filter.quarter;
  }
  if (filter.timeMode === "year") return !filter.year || datum.startsWith(`${filter.year}-`);
  return true;
}

export function filtereTransaktionen(daten, filter) {
  const f = { ...LEERER_FILTER, ...filter };
  // Beitragsbuchungen eines Vorsorgevertrags: ueber seine Regelzahlungen.
  const vorsorgeRz = f.vorsorge
    ? new Set((daten.regelzahlungen ?? []).filter((rz) => rz.vorsorge_id === f.vorsorge).map((rz) => rz.regelzahlung_id))
    : null;
  const typ = f.klasse ? kategorienIndex(daten) : null;
  return (daten.transaktionen ?? []).filter((tx) => {
    if (typ && buchungsKlasse(tx, typ) !== f.klasse) return false;
    if (vorsorgeRz && !vorsorgeRz.has(tx.regelzahlung_id)) return false;
    if (f.account && tx.konto_id !== f.account) return false;
    if (f.status && tx.kategorisierung_status !== f.status) return false;
    if (f.category === OHNE_KATEGORIE ? Boolean(tx.kategorie_id) : f.category && tx.kategorie_id !== f.category) return false;
    if (f.gegenpartei && String(tx.gegenpartei ?? "").trim() !== f.gegenpartei) return false;
    if (f.transfer === "only" && !tx.ist_transfer) return false;
    if (f.transfer === "without" && tx.ist_transfer) return false;
    if (!passtHerkunft(tx, f.origin)) return false;
    if (!passtBeleg(tx, f.beleg)) return false;
    if (!passtZeitraum(tx, f)) return false;
    if (f.regelzahlung && tx.regelzahlung_id !== f.regelzahlung) return false;
    if (f.person === OHNE_PERSON ? Boolean(tx.fuer_person_id) : f.person && tx.fuer_person_id !== f.person) return false;
    if (f.richtung || f.betragVon || f.betragBis) {
      const cent = toCents(tx.betrag);
      if (f.richtung === "einnahme" && cent <= 0) return false;
      if (f.richtung === "ausgabe" && cent >= 0) return false;
      if (f.betragVon && Math.abs(cent) < betragCent(f.betragVon)) return false;
      if (f.betragBis && Math.abs(cent) > betragCent(f.betragBis)) return false;
    }
    if (f.search && !matchesQuery(suchfelder(tx), f.search)) return false;
    return true;
  });
}

const RANG = { offen: 0, vorgeschlagen: 1, bestaetigt: 2, abgelehnt: 3 };
const vergleiche = (a, b) => String(a ?? "").localeCompare(String(b ?? ""), "de");

// ohneKategorie: Anzeigetext fuer Buchungen ohne Kategorie (Sortierung wie angezeigt).
export function sortiereTransaktionen(liste, daten, { key = "date", dir = "desc" } = {}, ohneKategorie = "") {
  const konten = new Map((daten.konten ?? []).map((k) => [k.konto_id, k.name]));
  const kategorien = new Map((daten.kategorien ?? []).map((k) => [k.kategorie_id, k.name]));
  const kontoName = (tx) => konten.get(tx.konto_id) || tx.konto_id || "";
  const kategorieName = (tx) => (tx.kategorie_id ? kategorien.get(tx.kategorie_id) || ohneKategorie : ohneKategorie);
  const faktor = dir === "asc" ? 1 : -1;
  return liste.slice().sort((a, b) => {
    let cmp;
    if (key === "amount") cmp = toCents(a.betrag) - toCents(b.betrag);
    else if (key === "account") cmp = vergleiche(kontoName(a), kontoName(b));
    else if (key === "counterparty") cmp = vergleiche(a.gegenpartei, b.gegenpartei);
    else if (key === "purpose") cmp = vergleiche(a.verwendungszweck, b.verwendungszweck);
    else if (key === "category") cmp = vergleiche(kategorieName(a), kategorieName(b));
    else if (key === "status") cmp = (RANG[a.kategorisierung_status] ?? 4) - (RANG[b.kategorisierung_status] ?? 4);
    else cmp = vergleiche(a.buchungsdatum, b.buchungsdatum);
    if (cmp === 0) cmp = vergleiche(a.buchungsdatum, b.buchungsdatum);
    if (cmp === 0) cmp = vergleiche(a.transaktion_id, b.transaktion_id);
    return cmp * faktor;
  });
}

// Gegenbuchung eines gepaarten Transfers (Id), sonst null.
export function gegenbuchungId(tx, transfersById) {
  const transfer = tx.transfer_id ? transfersById.get(tx.transfer_id) : undefined;
  if (!transfer) return null;
  return (transfer.abgang_transaktion_id === tx.transaktion_id ? transfer.zugang_transaktion_id : transfer.abgang_transaktion_id) || null;
}

function datumsteile(transaktionen, ende) {
  return [...new Set(transaktionen.map((tx) => String(tx.buchungsdatum ?? "").slice(0, ende)).filter((wert) => wert.length === ende))]
    .sort((a, b) => b.localeCompare(a));
}

// Eine Seite der gefilterten, sortierten Liste plus Kennzahlen des Filters.
// seite wird auf den gueltigen Bereich begrenzt; mit zeige (Buchungs-Id)
// springt sie auf die Seite dieser Buchung. auswahl (Id) liefert die Buchung
// samt Bezuegen fuer das Detail, aber nur, wenn sie im Filter liegt.
// Summen je Gruppe ueber alle Treffer des Filters (nicht nur die Seite), mit
// dem Datum der letzten Buchung: Kategorie, Gegenpartei und Regelzahlung nach
// Betrag ohne Vorzeichen absteigend, Monate neueste zuerst.
export function gruppenSummen(daten, treffer, gruppe, ohneKategorie = "") {
  if (!GRUPPEN.includes(gruppe)) return null;
  const kategorien = new Map((daten.kategorien ?? []).map((k) => [k.kategorie_id, k.name]));
  const regelzahlungen = new Map((daten.regelzahlungen ?? []).map((rz) => [rz.regelzahlung_id, rz.bezeichnung]));
  const personen = new Map((daten.personen ?? []).map((p) => [p.person_id, p.name]));
  const je = new Map();
  for (const tx of treffer) {
    const schluessel = gruppe === "kategorie" ? tx.kategorie_id || ""
      : gruppe === "monat" ? String(tx.buchungsdatum ?? "").slice(0, 7)
        : gruppe === "regelzahlung" ? tx.regelzahlung_id || ""
          : gruppe === "person" ? tx.fuer_person_id || ""
            : String(tx.gegenpartei ?? "").trim();
    const eintrag = je.get(schluessel) ?? { schluessel, name: "", anzahl: 0, summe_cent: 0, letzte: "" };
    eintrag.anzahl += 1;
    eintrag.summe_cent += toCents(tx.betrag);
    if (String(tx.buchungsdatum ?? "") > eintrag.letzte) eintrag.letzte = tx.buchungsdatum;
    je.set(schluessel, eintrag);
  }
  const liste = [...je.values()].map((g) => ({
    ...g,
    name: gruppe === "kategorie" ? (g.schluessel ? kategorien.get(g.schluessel) || g.schluessel : ohneKategorie)
      : gruppe === "regelzahlung" ? (g.schluessel ? regelzahlungen.get(g.schluessel) || g.schluessel : "")
        : gruppe === "person" ? (g.schluessel ? personen.get(g.schluessel) || g.schluessel : "")
          : g.schluessel,
  }));
  return gruppe === "monat"
    ? liste.sort((a, b) => b.schluessel.localeCompare(a.schluessel))
    : liste.sort((a, b) => Math.abs(b.summe_cent) - Math.abs(a.summe_cent) || a.name.localeCompare(b.name, "de"));
}

// Importstand je Konto: letzte Buchung oder letzter Kontostand, je spaeter.
// Grundlage fuer "ueberfaellig" bei Regelzahlungen (termine-modell.mjs).
export function importstandJeKonto(daten) {
  const stand = {};
  const merke = (id, datum) => { if (id && datum && !(stand[id] >= datum)) stand[id] = datum; };
  for (const tx of daten.transaktionen ?? []) merke(tx.konto_id, tx.buchungsdatum);
  for (const zw of daten.zeitwerte ?? []) if (zw.entitaet === "konto" && zw.feld === "kontostand") merke(zw.entitaet_id, zw.standdatum);
  return stand;
}

export function transaktionenSeite(daten, {
  filter = {}, sort = {}, seite = 1, groesse = 10, auswahl = "", zeige = "", ohneKategorie = "", gruppe = "",
} = {}) {
  const proSeite = SEITENGROESSEN.includes(groesse) ? groesse : 10;
  const treffer = sortiereTransaktionen(filtereTransaktionen(daten, filter), daten, sort, ohneKategorie);
  const seiten = Math.max(1, Math.ceil(treffer.length / proSeite));
  let aktuelleSeite = Number.isInteger(seite) ? seite : 1;
  if (zeige) {
    const index = treffer.findIndex((tx) => tx.transaktion_id === zeige);
    aktuelleSeite = index >= 0 ? Math.floor(index / proSeite) + 1 : 1;
  }
  aktuelleSeite = Math.min(Math.max(1, aktuelleSeite), seiten);
  const start = (aktuelleSeite - 1) * proSeite;
  const transfersById = new Map((daten.transfers ?? []).map((t) => [t.transfer_id, t]));
  const kontoVon = new Map((daten.transaktionen ?? []).map((tx) => [tx.transaktion_id, tx.konto_id]));
  const mitGegenbuchung = (tx) => {
    const id = gegenbuchungId(tx, transfersById);
    return { ...tx, gegenbuchung: id && kontoVon.has(id) ? { transaktion_id: id, konto_id: kontoVon.get(id) } : null };
  };
  const gewaehlt = auswahl ? treffer.find((tx) => tx.transaktion_id === auswahl) : undefined;
  return {
    treffer: treffer.length,
    gesamt: (daten.transaktionen ?? []).length,
    saldo_cent: treffer.reduce((summe, tx) => summe + toCents(tx.betrag), 0),
    offen: treffer.filter((tx) => tx.kategorisierung_status === "offen").length,
    seite: aktuelleSeite,
    seiten,
    groesse: proSeite,
    zeilen: treffer.slice(start, start + proSeite).map(mitGegenbuchung),
    auswahl: gewaehlt ? transaktionDetail(daten, mitGegenbuchung(gewaehlt)) : null,
    monate: datumsteile(daten.transaktionen ?? [], 7),
    jahre: datumsteile(daten.transaktionen ?? [], 4),
    gruppen: gruppenSummen(daten, treffer, gruppe, ohneKategorie),
    ...(gruppe === "regelzahlung" ? { importstand: importstandJeKonto(daten) } : {}),
  };
}

// Buchung mit ihren Bezuegen fuer das Detail: Regelzahlung, Vorsorge (nur ueber
// die Regelzahlung, agent-context: Transaktion -> Regelzahlung -> Vorsorge), Immobilie,
// Person (fuer wen die Buchung ist).
export function transaktionDetail(daten, tx) {
  const regelzahlung = tx.regelzahlung_id ? (daten.regelzahlungen ?? []).find((rz) => rz.regelzahlung_id === tx.regelzahlung_id) : undefined;
  const vorsorge = regelzahlung?.vorsorge_id ? (daten.vorsorge ?? []).find((vs) => vs.vorsorge_id === regelzahlung.vorsorge_id) : undefined;
  const immobilie = tx.immobilie_id ? (daten.immobilien ?? []).find((im) => im.immobilie_id === tx.immobilie_id) : undefined;
  const person = tx.fuer_person_id ? (daten.personen ?? []).find((p) => p.person_id === tx.fuer_person_id) : undefined;
  return {
    transaktion: tx,
    regelzahlung: regelzahlung ? { regelzahlung_id: regelzahlung.regelzahlung_id, bezeichnung: regelzahlung.bezeichnung } : null,
    vorsorge: vorsorge ? { vorsorge_id: vorsorge.vorsorge_id, name: vorsorge.name } : null,
    immobilie: immobilie ? { immobilie_id: immobilie.immobilie_id, bezeichnung: immobilie.bezeichnung } : null,
    person: person ? { person_id: person.person_id, name: person.name, herkunft: tx.fuer_person_herkunft ?? null } : null,
  };
}

// Regelwirkung: Treffer je Regel (matched_regeln), fuer eine Regel auch die
// ersten Buchungen und Beispiel-Gegenparteien.
export function regelWirkungAntwort(daten, { regel = "", zeilen = 50 } = {}) {
  const anzahl = {};
  const trefferDerRegel = [];
  for (const tx of daten.transaktionen ?? []) {
    for (const id of tx.matched_regeln ?? []) {
      anzahl[id] = (anzahl[id] ?? 0) + 1;
      if (id === regel) trefferDerRegel.push(tx);
    }
  }
  return {
    anzahl,
    regel: regel ? {
      regel_id: regel,
      anzahl: trefferDerRegel.length,
      beispiele: [...new Set(trefferDerRegel.map((tx) => tx.gegenpartei).filter(Boolean))].slice(0, 5),
      zeilen: trefferDerRegel.slice(0, zeilen).map((tx) => ({ transaktion_id: tx.transaktion_id, buchungsdatum: tx.buchungsdatum, gegenpartei: tx.gegenpartei })),
    } : null,
  };
}
