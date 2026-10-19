// app/aktionen/transaktionen.mjs
// Aktionen (data-action) – Buchungsliste: Spruenge mit definiertem Filter, Auswahl, Seiten.
import { LEERE_FILTER, zuBuchungen, ohneZeitfilter } from "../navigation.mjs";
import { state } from "../runtime.mjs";
import { commitNavigation } from "../verlauf.mjs";

export const aktionen = {
  // Zeile der Gruppensummen: Liste auf diese Gruppe einschraenken, Summen aus.
  "gruppe-filtern": (element) => {
    const { gruppe, schluessel } = element.dataset;
    const f = { ...state.transactionFilters, gruppe: "" };
    if (gruppe === "kategorie") f.category = schluessel || "ohne";
    if (gruppe === "monat") Object.assign(f, ohneZeitfilter(f), { timeMode: "month", month: schluessel });
    if (gruppe === "gegenpartei") f.gegenpartei = schluessel;
    if (gruppe === "regelzahlung") f.regelzahlung = schluessel;
    state.transactionFilters = f;
    state.transactionPage = 1;
    commitNavigation();
  },
  "filter-open-category": () => {
    zuBuchungen(state, { filter: { status: "offen" } });
    commitNavigation();
  },
  "clear-transaction-filter": (element) => {
    const name = element.dataset.filterName;
    if (name === "zeit") state.transactionFilters = ohneZeitfilter(state.transactionFilters);
    else if (name === "betrag") Object.assign(state.transactionFilters, { betragVon: "", betragBis: "" });
    else if (Object.hasOwn(state.transactionFilters, name)) state.transactionFilters[name] = LEERE_FILTER[name];
    else return;
    state.transactionPage = 1;
    // Auch Dokument- und Vertragsfilter (Pfadteile) sind Filter: ersetzen.
    commitNavigation({ ersetzen: true });
  },
  "reset-transaction-filters": () => {
    // Die Gruppierung ist Darstellung, kein Filter: sie bleibt.
    state.transactionFilters = { ...LEERE_FILTER, gruppe: state.transactionFilters.gruppe };
    state.transactionPage = 1;
    commitNavigation();
  },
  "account-transactions": (element) => {
    zuBuchungen(state, { filter: { account: element.dataset.account } });
    commitNavigation();
  },
  "immobilie-transactions": (element) => {
    // Aus der Monatstabelle einer Immobilie oder den Einnahmen/Ausgaben der
    // Uebersicht: optional auf Monat bzw. Zeitraum und
    // Kategorie eingeschraenkt; Transfers fehlen dort, also auch hier — ausser die
    // Tabelle zeigt den Eigenanteil (data-transfer "only" bzw. "all"). Mit data-konto
    // alle Buchungen eines Kontos im Zeitraum, Umbuchungen eingeschlossen.
    const { monat = "", von = "", bis = "", kategorie = "", transfer = "", konto = "" } = element.dataset;
    const mitZeit = Boolean(monat || von);
    zuBuchungen(state, {
      filter: {
        account: konto,
        category: kategorie,
        transfer: transfer === "only" ? "only" : transfer === "all" || konto || !mitZeit ? "" : "without",
        search: element.dataset.immobilie || "",
        timeMode: monat ? "month" : von ? "range" : "none",
        dateFrom: von,
        dateTo: bis,
        month: monat,
      },
    });
    commitNavigation();
  },
  "kategorie-transactions": (element, action) => aktionen["immobilie-transactions"](element, action),
  "select-transaction": (element) => {
    // Erstes Oeffnen ist ein neuer Eintrag, der Wechsel zwischen Buchungen ersetzt ihn.
    const wechsel = Boolean(state.selectedTransactionId) && !state.detailRailClosed;
    state.selectedTransactionId = element.dataset.transaction;
    state.detailRailClosed = false;
    commitNavigation({ ersetzen: wechsel });
  },
  "open-transaction": (element) => {
    // Aus einer anderen Ansicht (z. B. Regel-Detail) eine konkrete Buchung
    // oeffnen: alle Filter leeren, damit die Zielbuchung sicher im gefilterten
    // Bestand liegt und das Detail-Rail sie zeigt.
    // Seite der Zielbuchung rechnet der Server (transactionJumpTo).
    zuBuchungen(state, { auswahl: element.dataset.transaction });
    commitNavigation();
  },
  "close-detail-rail": () => {
    state.detailRailClosed = true;
    commitNavigation();
  },
  "page-first": (element, action) => {
    state.view = "transactions";
    if (action === "page-first") state.transactionPage = 1;
    if (action === "page-prev") state.transactionPage -= 1;
    if (action === "page-next") state.transactionPage += 1;
    // Die letzte Seite kennt der Server; er begrenzt die Seitenzahl.
    if (action === "page-last") state.transactionPage = 999999;
    if (action === "page-jump") state.transactionPage = Number(element.dataset.page);
    commitNavigation();
  },
  "page-prev": (element, action) => aktionen["page-first"](element, action),
  "page-next": (element, action) => aktionen["page-first"](element, action),
  "page-last": (element, action) => aktionen["page-first"](element, action),
  "page-jump": (element, action) => aktionen["page-first"](element, action),
  "paired-transfer": (element) => {
    state.view = "transactions";
    const transactionId = element.dataset.transaction;
    // Konto der Gegenbuchung steht am Knopf (aus der Antwort der Transaktionen-API).
    const kontoId = element.dataset.account;
    if (kontoId) zuBuchungen(state, { filter: { account: kontoId }, auswahl: transactionId });
    else state.selectedTransactionId = transactionId;
    commitNavigation();
  },
  "vorsorge-transactions": (element) => {
    zuBuchungen(state, { filter: { vorsorge: element.dataset.vorsorge || "" } });
    commitNavigation();
  },
};
