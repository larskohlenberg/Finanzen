# M2 Review-Oberflaeche

Stand: 27.05.2026

## Umsetzungsstand 27.05.2026

M2 ist als statische Review-Oberflaeche in `app/` umgesetzt.

Umgesetzte Dateien:

- `app/index.html`
- `app/styles.css`
- `app/main.js`
- `app/i18n.js`
- `app/review-data.js`

Umgesetzte fachliche Oberflaechen:

- Uebersicht mit Finanzstatus im Vordergrund.
- Konten- und Depotuebersicht mit Drilldown in Transaktionen.
- Transaktionsliste mit Konto-, Status-, Kategorie- und Transferfilter.
- Pagination fuer die Transaktionsliste.
- Transfer-Gegenbuchungen als Querverlinkung.
- Stammdaten mit Subkacheln und aktiver Auswahl.
- Checks mit Links in die betroffenen Bereiche.
- Export-Seite als reiner Platzhalter fuer spaeter.
- Kompakte Sprach- und Theme-Auswahl.
- Ein- und ausklappbare Sidebar.

Aktuelle UI-Entscheidung:

- Helles Farbschema: weisser App-Hintergrund, leicht graue Navigation und Kacheln.
- Dunkelmodus bleibt vorbereitet.
- Die Gesamtsaldo-Kachel zeigt keinen doppelten Arbeitsstatus mehr.

Verifikation:

- `node --check app/main.js`
- `node --check app/review-data.js`
- `node --check app/i18n.js`
- `npm test`
- `npm run validate:m1`
- Statische UI-Pruefung fuer Datenmenge, Pagination, i18n-Labels und Farbschema.

Einschraenkung:

Die letzte gerenderte Browser-Pruefung der finalen Farb-/Pagination-Aenderung konnte in Codex nicht frisch abgeschlossen werden, weil `file://` durch die Browser-Policy blockiert wurde und lokale Ports aus der Sandbox nicht erreichbar waren. Die vorherige Browser-QA fuer Navigation, Browser-Zurueck, Breadcrumbs, Transfer-Link und Detailansicht war erfolgreich. Fuer die naechste Session sollte die Seite lokal im normalen Browser geoeffnet und kurz visuell gegengeprueft werden.

## Ziel

M2 baut eine lokale, moderne Review-Oberflaeche fuer den validierten Datenstand aus M1.5. Die App ist eine Anzeige- und Pruefflaeche, keine Import-, Pflege- oder Buchungs-App.

Die Oberflaeche soll wie ein ernstzunehmendes privates Finanz-Review-Tool wirken: Finanzstatus im Vordergrund, Datenqualitaet sichtbar daneben, klare Navigation, keine JSON-Viewer-Anmutung.

## Scope

M2 zeigt:

- Finanzstatus aus dem geladenen Review-Bundle.
- Personen, Konten, Depots und Kategorien als Stammdaten.
- Transaktionen und Transfers als Bewegungsdaten.
- Kategorien mit offenem Review-Bedarf.
- Checks, offene Punkte und naechste Aktion.
- Roadmap-Hinweise fuer spaetere Kennzahlen.

M2 schreibt keine Masterdaten und erzeugt keine fachlichen Entscheidungen.

## Datenbereitstellung

Die Weboberflaeche hat keine Import-Funktion. Daten werden agentisch vorbereitet und als Review-Bundle bereitgestellt.

Fuer M2 kann dieses Review-Bundle als `app/review-data.js` neben der statischen App liegen, damit `app/index.html` lokal ohne Webserver funktioniert. Das Review-Bundle ist Anzeigeformat, nicht Master.

## Navigation

Hauptnavigation:

- `Uebersicht`
- `Transaktionen`
- `Stammdaten`
- `Checks`
- `Export`

Die App soll Querverlinkung zwischen Bereichen unterstuetzen:

- Konto in der Uebersicht oeffnet passende Konto-/Transaktionssicht.
- `Kategorie offen` oeffnet Transaktionen mit entsprechendem Filter.
- Check oeffnet das betroffene Konto, die betroffene Kategorie oder Transaktion.
- Detailpanels duerfen Links wie `Konto oeffnen` oder `In Checks anzeigen` anbieten.

Navigation veraendert Ansichten und Filter, aber keine Daten.

## Uebersicht

Die Uebersicht fuehrt mit dem Finanzstatus.

Primaere Kennzahl:

- `Geladener Gesamtsaldo (Konten)`

Unterzeile:

- `Geladener Saldo · Kontostand noch nicht belegt`

Daneben oder darunter sichtbar:

- Validierungsstatus.
- Anzahl `Kategorie offen`.
- Naechste Aktion, z. B. `1 Kategorie pruefen`.
- Konto-/Depotliste mit geladenen Salden und Belegstatus.

Depots werden sichtbar von Konten unterschieden. Depotwerte werden in M2 nicht als Teil des geladenen Gesamtsaldos behandelt. Depotwerte gehoeren spaeter als Zeitwerte in M5.

Roadmap-Kacheln:

- `Monats-Cashflow · M4`
- `Vermoegen · M5`

Diese Kacheln zeigen keine berechneten Werte in M2.

## Transaktionen

Die Transaktionsseite ist eine Review-Liste, kein Banking-Archiv.

Sie zeigt:

- Kennzahlen zum aktuellen Filter.
- Filter fuer Konto, Status, Kategorie und Transfer.
- Eine scanbare Tabelle.
- Optional ein rechtes, read-only Detailpanel zur ausgewaehlten Transaktion.

Der UI-Begriff fuer `kategorisierung_status = offen` ist `Kategorie offen`. Das ist ein normaler Review-Zustand, kein Validierungsfehler.

`vorgeschlagen`, `bestaetigt`, `abgelehnt` und Transfermerkmale werden angezeigt und filterbar gemacht, aber in M2 nicht bearbeitet.

## Stammdaten

Stammdaten bekommen eine Einstiegsebene mit Subkacheln:

- `Personen`
- `Konten`
- `Kategorien`

Die Kacheln zeigen Anzahl und wichtigste Pruefhinweise. Detailansichten zeigen Listen/Tabellen und ein Pruefpanel. Stammdaten sind reviewbar, nicht editierbar.

Konten und Depots werden in derselben Ansicht gefuehrt, aber gruppiert.

## Checks

Checks sind ein Review- und Orientierungsbereich, kein vollstaendiges Warnungsmanagement.

M2 zeigt Check-Gruppen, z. B.:

- Validierung
- Kategorien
- Kontoreferenzen
- Transfers

Echte Validierungsfehler sind Fehlerzustaende. `Kategorie offen` ist ein Review-Zustand.

## Export

Export bleibt in der Navigation sichtbar, hat in M2 aber keine Funktion. Die Export-Seite sagt nur, dass Export fuer spaeter vorgesehen ist.

Keine Downloads, keine Excel-/CSV-/PDF-Erzeugung in M2.

## Designsystem

M2 wird designgefuehrt gebaut. Vor der Implementierung dienen Konzeptscreen und Designsystem als visuelle Leitplanke.

Designrichtung:

- ruhige, hochwertige Arbeitsoberflaeche
- Finanzstatus zuerst
- klare Tabellen und Listen
- Sidebar links, kompakter Arbeitsstatus oben
- rechte Seitenleiste fuer Checks, naechste Aktion oder Kontext
- keine Landingpage, keine Marketing-Hero-Flaeche
- keine dekorativen Hintergrund-Orbs

Sprache und Theme:

- UI-Texte kommen aus i18n-Labels, nicht hart aus dem Code.
- Deutsch ist Standardsprache.
- Englisch ist als Wechselmodus vorbereitet.
- Sprache und Darstellung werden rechts oben als dezente Dropdowns angezeigt.
- Theme-Modi: System, Hell, Dunkel.
- UI-Praeferenzen duerfen lokal gespeichert werden; Finanzdaten nicht.

## Konzeptbilder

- [Uebersicht V1](./assets/m2-konzept-uebersicht-v1.png)
- [Uebersicht V2](./assets/m2-konzept-uebersicht-v2.png)
- [Transaktionen V1](./assets/m2-konzept-transaktionen-v1.png)

V2 der Uebersicht ist die fuehrende Richtung fuer Topbar, Sprache und Theme. Die Konzeptbilder sind visuelle Leitplanken, keine pixelgenaue Spezifikation.

## Nicht-Ziele

Nicht Teil von M2:

- UI-Importfunktion.
- Masterdatenpflege in der Weboberflaeche.
- Automatische Kategorisierung.
- Kontoauszugsimport.
- Regelzahlungen.
- Cashflow-Prognose.
- Vermoegensberechnung.
- Depotwert-Verlauf.
- Agentenauftraege oder Warnungsworkflow.
- Excel-/CSV-/PDF-Export.
