# Transaktionssuche nach Kategorisierungsregel-ID

**Datum:** 2026-08-12  
**Status:** Freigegeben

## Problem

Transaktionen speichern die beim Kategorisieren verwendeten Regeln im Feld
`matched_regeln`. Die Transaktionsansicht zeigt diese IDs in der Herkunft an,
nimmt sie aber nicht in ihre Freitextsuche auf. Deshalb liefert eine Suche nach
einer konkreten ID wie `REG-123` keine zugeordneten Transaktionen.

## Ziel und Umfang

Die vorhandene Transaktionssuche soll eine Transaktion finden, wenn die
vollstaendige gesuchte Regel-ID in `matched_regeln` enthalten ist.

Im Umfang:

- Suche nach Kategorisierungsregel-IDs im bestehenden Suchfeld.
- Unveraendertes Zusammenspiel mit Konto-, Status-, Kategorie-, Transfer-,
  Herkunfts- und Zeitfiltern.
- Regressionstest fuer die neue Suche und Erhalt der bestehenden Suchsemantik.

Nicht im Umfang:

- Suche nach Regelbedingung oder Regelkommentar.
- Suche nach `regelzahlung_id`.
- Ein eigener Regel-Dropdown oder sonstige UI-Aenderungen.

## Design

`transactionSearchFields(tx)` in `app/views/transaktionen.mjs` ergaenzt die
Eintraege aus `tx.matched_regeln`. Die vorhandene Funktion `matchesQuery`
normalisiert und durchsucht diese Werte zusammen mit den bisherigen
Transaktionsfeldern. Transaktionen ohne `matched_regeln` bleiben unveraendert
durchsuchbar.

Die Suche bleibt eine Freitextsuche. Eine vollstaendige ID wie `REG-123` ist im
gueltigen Datenmodell eindeutig und trifft deshalb nur Transaktionen, denen
diese Regel-ID zugeordnet ist. Alle weiteren aktiven Filter werden weiterhin
mit UND-Logik angewendet.

## Fehlerverhalten

Fehlende oder leere `matched_regeln` werden wie ein leeres Suchfeld behandelt
und verursachen keinen Fehler. Am Datenmodell, Laden und Validieren der Regeln
aendert sich nichts.

## Tests

`tests/transactions-search.test.mjs` erhaelt ein synthetisches Szenario mit
einer Transaktion, die eine eindeutige Regel-ID in `matched_regeln` traegt.

Der Test belegt:

- Die Suche nach dieser Regel-ID liefert die Transaktion.
- Eine andere Regel-ID liefert sie nicht.
- Die bisherigen Tests fuer Verwendungszweck und den ausgeschlossenen
  Kontonamen bleiben gruen.
