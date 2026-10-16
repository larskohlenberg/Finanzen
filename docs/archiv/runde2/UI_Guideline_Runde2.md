# UI Guideline Runde 2

Stand: 2026-06-04

Diese Guideline ist der Zielstandard fuer die weitere App-Umsetzung. Sie verbindet die Stitch-Designsprache `Forest Dark Precision` mit den tatsaechlichen App-Screens und ersetzt nicht die fachlichen Meilensteinplaene.

Konkrete Masse, Tokens, States und bekannte Bugs der App-Shell und wiederkehrender Komponenten (Navigation, Panels/KPI-Cards, Tabellen, Filter, Status-Badges, Detail-Rail) stehen in `docs/runde2/UI_Handoff_Komponenten_Runde2.md`.

## 1. Leitbild

Finanzmodell ist eine lokale, browserbasierte Review- und Arbeitsoberflaeche fuer private Finanzen. Die App ist kein Marketing-Dashboard und keine dekorative Analyse-Seite.

Die UI soll ruhig, dicht, wiederholbar und pruefbar wirken. Werte, Datenstaende, Status und naechste Handlungen sind wichtiger als optische Effekte.

## 2. App Shell

- Desktop nutzt eine feste linke Navigation, einen fluiden Hauptbereich und optional eine rechte Arbeits-Rail.
- Mobile nutzt eine kompakte Top-Bar und eine Bottom-Navigation. Module, die nicht in die Bottom-Navigation passen, liegen hinter `Mehr`.
- Die Sidebar zeigt `Finanzmodell`, aber keine fachliche Unterzeile wie `Runde 2 · M2 Review`.
- Der Releasestand/Arbeitsstand gehoert in den unteren Navigationsbereich, z. B. `M5 · ad42466` und `Arbeitsstand`.
- Der Arbeitsstatus oben bleibt kompakt und muss mit Sprache/Theme/Settings sauber auf einer Achse ausgerichtet sein.
- Auf Mobile darf der Arbeitsstatus umbrechen, soll aber nicht den eigentlichen Screen dauerhaft verdraengen.

## 3. Farbe Und Typografie

- Hauptpalette: Forest Dark mit ruhigen gruen-teal Akzenten.
- Light Mode bleibt semantisch gleich, nur mit hellen Canvas-/Surface-Werten.
- Inter oder System-Sans fuer UI-Text.
- Zahlen, Geldbetraege, Datumsstaende und Prozentwerte nutzen tabellarische Ziffern.
- Keine negativen Letter-Spacings in App-Texten.
- Page-Titel sind klar, aber nicht hero-gross. Cards, Panels und Tabellen verwenden kleinere, dichte Hierarchien.

## 4. Seitenkopf

- Keine generischen Leadtexte unter `Uebersicht` und `Transaktionen`.
- Fuer Arbeitsseiten mit fachlichem Erklaerungsbedarf sind kurze Leads erlaubt: `Cashflow`, `Regelzahlungen`, `Vermoegen`, `Stammdaten`, `Checks`, `Export`.
- Leads duerfen keine Bedienungsanleitung sein. Sie klaeren nur fachlichen Scope oder Datenqualitaet.

## 5. Aktionen Und Agentik

- Die App ist im aktuellen Zielbild keine manuelle CRUD-Oberflaeche.
- Datenanlage, Aenderungen und groessere Korrekturen laufen agentisch beziehungsweise ueber den Entwicklungs-/Datenprozess, nicht ueber freie UI-Buttons.
- Screens duerfen deshalb keine primaeren Buttons wie `Neu`, `Neues Konto`, `Konto hinzufuegen`, `Bearbeiten` oder vergleichbare manuelle Edit-Aktionen zeigen.
- Erlaubt sind Review- und Navigationsaktionen: Details oeffnen/schliessen, in Checks anzeigen, Gegenbuchung oeffnen, Filter zuruecksetzen, Kontextmenue oeffnen, Exportstatus ansehen.
- `Naechste Aktion` darf eine agentische Handlung anzeigen oder starten, aber nicht wie ein klassisches Formular-/CRUD-Kommando wirken.

## 6. Icons

- Die App nutzt `lucide` als technische Icon-Bibliothek.
- Die Stitch-Icons sind die visuelle Stilreferenz: linear, ruhig, klar erkennbar, nicht dekorativ.
- Icons ersetzen provisorische Text-Glyphen wie `▲`, `?`, `•` dort, wo echte Navigation, Status, Typen oder Aktionen gemeint sind.
- Icons werden app-weit konsistent fuer Navigation, Bottom-Bar, Konto-/Depottypen, Status-Chips, Tabellenaktionen, Drei-Punkte-Menues, Filter-Clear und Detail-Schliessen verwendet.
- Icon-Buttons haben klare Hover-, Focus- und Disabled-States sowie zugängliche Labels.
- Icons duerfen keine Layoutspruenge ausloesen; Groesse und Buttonflaeche sind stabil.

## 7. Karten Und Panels

- Cards haben maximal 8px Radius, 1px Border, keine dekorativen Schatten als Hauptstruktur.
- Keine Cards in Cards.
- Karten zeigen echte Arbeitsinformation: KPI, Status, Auswahl, Detail, Liste oder Empty State.
- Empty States sind ruhig und konkret, z. B. `Keine offene Aktion`, `Keine offenen Checks`.
- Keine erfundenen Kennzahlen, keine dekorativen Charts.

## 8. Tabellen

- Tabellen liegen immer in einem eigenen horizontal scrollbaren Wrapper.
- Die Seite selbst darf auf Mobile nicht horizontal scrollen.
- Zeilen mit Navigation oder Auswahl haben Hover- und Focus-States.
- Werte sind rechtsbuendig, Datums-/Standwerte sichtbar.
- Sortierbare Tabellen zeigen Richtung und aktiven Sortierschluessel.
- Lange Konten-, Kategorie- oder Gegenpartei-Namen duerfen Layouts nicht sprengen; sie werden kontrolliert umbrochen oder im Control gekuerzt.

## 9. Filter

- Filter ueber Tabellen folgen app-weit demselben Muster: optionaler Panel-Titel, darunter ein stabiles Feldraster, rechts beziehungsweise unten eine feste Action-Zone.
- Filter-Gitter: Desktop bis vier Spalten, Tablet zwei Spalten, Mobile eine Spalte.
- Filterfelder haben `min-width: 0`; lange Werte truncaten innerhalb des Felds.
- Select-Filter zeigen app-weit dasselbe Dropdown-Icon rechts im Feld.
- Textsuche ist ein eigenes Suchfeld mit Such-Icon links und einheitlichem Placeholder; sie erscheint nur, wenn die Seite fachlich eine freie Suche braucht.
- Aktive Filter erhalten eine kleine inline Clear-Aktion.
- Clear-Aktionen duerfen niemals oberhalb eines Filterfelds schweben, das Feld nach unten druecken oder das Filterraster veraendern.
- Clear-Aktionen sitzen entweder innerhalb der bestehenden Feldflaeche oder in einer festen Action-Zone des Filterpanels.
- Globales `Filter zuruecksetzen` erscheint nur bei aktiven Filtern.
- Drei-Punkte-Menues stehen fuer Kontext-/Mehr-Aktionen in Tabellenzeilen oder in der festen Action-Zone, nicht als wechselnder Ersatz fuer Filterbedienung.
- Keine Mischung aus zufaelligen Leading-Icons, Suchfeldern, Dropdown-Pfeilen und Drei-Punkte-Menues pro Screen; die Filter-Komponente ist systemweit identisch.
- Keine Filterleiste darf breiter werden als ihr Container.

## 10. Rails Und Details

- Rechte Rails sind Arbeitsbereiche, keine dekorativen Sidebars.
- Overview-Rail: `Naechste Aktion` oben, `Checks im Blick` darunter. Die obere Karte richtet sich an der KPI-Zeile aus, die Checks starten auf Hoehe von `Konten und Depots`.
- Overview-Rail darf horizontal einklappen. Klick auf eingeklappte Bereiche oeffnet die Rail wieder.
- Transaktions-Details haben ein Schliessen-Icon. Schliessen gibt der Tabelle mehr Raum.
- Mobile Rails werden zu Bottom Sheets oder untergeordneten Detailsektionen mit klarer Schliessen-Aktion.

## 11. Responsive Standard

- Zielgeraet: normaler Smartphone-Browser ist bedienbar.
- Desktop: 1280px und groesser.
- Tablet/Narrow: 768px bis 1024px.
- Mobile: 390px als Standardpruefung, zusaetzlich 360px als harte Grenze.
- Touch Targets mindestens 44px.
- Keine festen `body min-width` fuer mobile Layouts.
- Desktop-Dichte darf nicht 1:1 auf Mobile uebertragen werden; Tabellen duerfen horizontal scrollen, Cards und Detaildaten stapeln.

## 12. Screen-Vertraege

### Uebersicht

- Hauptbereich oben: `Summe geladener Bewegungen` und `Nettovermoegen` als gleich prominente KPI-Karten.
- Rechte Rail separat mit `Naechste Aktion` und `Checks im Blick`.
- Darunter `Konten und Depots` mit `Stand`-Spalte, sortierbaren Headern und Hover-State.
- Default-Sortierung: Girokonten, Tagesgeld, Depots; innerhalb der Gruppe neuester `Stand` zuerst, dann Name.
- Keine Roadmap-Kachel im normalen Overview.

### Transaktionen

- Summary-Karten, Filterpanel, Tabelle, Details.
- Kein Leadtext.
- Filter muessen bei langen Kontonamen containment-sicher sein.
- Das Konto-Filterfeld darf durch ein Clear-X nicht aus dem Raster springen oder vertikal versetzt werden.
- Details-Rail auf Desktop schliessbar, auf Mobile als Bottom Sheet.
- Tabelle scrollt horizontal im Wrapper.

### Cashflow

- Zwei KPI-Karten: Ist und Prognose.
- Qualitaetschips bleiben sichtbar, aber kompakt.
- Fachlicher Lead ist erlaubt, weil die Seite Scope und Unvollstaendigkeit erklaert.
- Prognose-Steuerung (`Monat`, `Quartal`, `Jahr`, `Prognose bis`) gehoert als Toolbar direkt ueber die Prognosetabelle.
- Tabellen bleiben horizontal scrollbar.

### Regelzahlungen

- Primaer eine dichte Tabelle wiederkehrender Zahlungen.
- Keine Rail erforderlich.
- Mobile darf eine reduzierte Spaltenauswahl zeigen; vollstaendige Tabelle bleibt horizontal scrollbar oder wird als kompakte Liste abgebildet.
- Status und Gueltigkeit muessen sichtbar bleiben.

### Vermoegen

- KPI-Karten: `Nettovermoegen` und `Datenqualitaet`.
- Filter fuer Klasse und Qualitaet unter den KPIs.
- Tabelle mit Klasse, Position, Wert, Stand, Qualitaet.
- Detailbereich rechts auf Desktop; Mobile als Bottom Sheet oder unterhalb der Tabelle.
- Werte nie ohne Stand-/Qualitaetskontext.

### Stammdaten

- Segment-/Tile-Auswahl fuer Personen, Konten, Kategorien.
- Aktive Auswahl visuell klar, aber nicht ueberdimensioniert.
- Darunter die jeweilige Tabelle.
- Konto- und Depotdarstellungen sollen dieselben Tabellenregeln wie Overview verwenden.

### Checks

- Oben kompakte Status-Kacheln nach Check-Gruppen.
- Darunter eine scanbare Check-Liste.
- Wenn alles gruen ist: resolved state statt leerer Liste.
- Checks bleiben Arbeits-/Pruefhinweise, kein Bearbeitungsworkflow.

### Export

- Platzhalter ist erlaubt, solange Export noch nicht umgesetzt ist.
- Der Platzhalter soll ruhig und klein bleiben, nicht heroartig.
- Wenn Export umgesetzt wird: Form/Optionen zuerst, Erklaertext nachrangig.

## 13. Verifizierte Ausgangslage

Am 2026-06-04 wurden folgende bestehende App-Screens visuell geprueft:

- Desktop 1280px: Uebersicht, Transaktionen, Cashflow, Regelzahlungen, Vermoegen, Stammdaten, Checks, Export.
- Mobile 390px: Uebersicht, Transaktionen, Cashflow, Regelzahlungen, Vermoegen, Stammdaten, Checks, Export.

Gefundene Zielabweichungen fuer spaetere Umsetzung:

- Sidebar-Subtitle `Runde 2 · M2 Review` ist noch vorhanden.
- Generische Leadtexte sind noch breiter im Einsatz als gewuenscht.
- Uebersicht enthaelt noch Roadmap statt `Nettovermoegen`-KPI neben `Summe geladener Bewegungen`.
- Uebersicht zeigt noch keinen `Stand` in `Konten und Depots`.
- Transaktionen zeigt noch Leadtext und die Detail-Rail ist nicht als explizit schliessbarer Arbeitsbereich umgesetzt.
- Detail-Rails sind auf Mobile noch nicht durchgaengig als Bottom Sheet umgesetzt.
- Status/Topbar ist auf Mobile sehr dominant und sollte kompakter werden.
- Export-Platzhalter wirkt auf Mobile zu gross und zu heroartig.

## 14. Screen Audit Matrix

| Screen | Desktop Ist | Mobile Ist | Zielstatus |
| --- | --- | --- | --- |
| Uebersicht | Laedt stabil, aber noch alter Lead, Roadmap, keine Nettovermoegen-KPI, Sidebar-Subtitle vorhanden. | Kein Page-Overflow, aber alter Lead/Roadmap und Statusbereich sehr dominant. | Hohe Prioritaet: an Stitch-Zielbild anpassen. |
| Transaktionen | Laedt stabil, Filter/Tabelle/Detail vorhanden, aber Leadtext und keine echte Close-Rail. | Kein Page-Overflow, Filter stapeln, Detailpanel noch nicht als Bottom Sheet. | Hohe Prioritaet: Filter-Clear, Detail-Schliessen, Mobile Bottom Sheet. |
| Cashflow | Inhaltlich brauchbares Raster mit Ist/Prognose und Tabellen. | Kein Page-Overflow, Tabelle nutzbar, Topbar sehr dominant. | Mittlere Prioritaet: Shell/Topbar/Typografie angleichen. |
| Regelzahlungen | Dichte Tabelle funktioniert. | Kein Page-Overflow, reduzierte Sicht wirkt brauchbar. | Mittlere Prioritaet: Shell angleichen, Tabellenstandard uebernehmen. |
| Vermoegen | Fachlich nah am Ziel mit KPI, Filter, Tabelle, Detailrail. | Kein Page-Overflow, Detailbereich muss als Bottom Sheet/Detailsektion gefuehrt werden. | Hohe bis mittlere Prioritaet, weil M5-nahe. |
| Stammdaten | Tile-Auswahl plus Tabelle funktioniert. | Kein Page-Overflow, Tiles sind zu gross und Topbar dominant. | Mittlere Prioritaet: kompaktere Mobile-Dichte. |
| Checks | Statuskacheln und Listen funktionieren. | Kein Page-Overflow, Kacheln sind gross, resolved state noch definieren. | Mittlere Prioritaet: Empty/resolved state und Dichte. |
| Export | Platzhalter funktioniert. | Kein Page-Overflow, Platzhalter ist zu heroartig. | Niedrige Prioritaet: ruhigeren Placeholder definieren. |

## 15. Stitch Referenz

Stitch-Projekt: `8681403844979806155`

Design-System: `Forest Dark Precision`, Asset `a857f65c8d56467f9a561fc48d2330cc`

Light-Mode-Referenzsystem: `Calm High-Contrast Financial`, Asset `340c51aabb6d46f1afbe26b34643e4cf`

Kanonische Stitch-Screens:

- Uebersicht Desktop: `3f58bd58dcb24235afc5b0e668c83e01`
- Uebersicht Mobile: `c0009bb045454c9095ead573cad59c42`
- Transaktionen Desktop: `d65d7d6d6a9b4292be6a6ddf67e24b5b`
- Transaktionen Mobile: `d8695ad5ad4943a7b1befaa23075df55`
- Vermoegen Desktop: `282dec29843b42ceb7c08a4cb51def5d`
- Vermoegen Mobile: `b6e479d1d1504236931f69530086f491`
- Cashflow Desktop: `55bbfb9d1e294af08154788aeaf33fe8`
- Cashflow Mobile: `c7be994eb3164c8493b8ab0e8a7b0f0d`
- Regelzahlungen Desktop: `8a68fa671b2e4cb593e3b8733c6988ce`
- Regelzahlungen Mobile: `732994027c7d4860b4f10dc9f7b0038c`
- Stammdaten Desktop: `ec6ff68109cd4dab919eb7a3b0c32edd`
- Stammdaten Mobile: `6fdca30a1f5b480c86d0db2c1d1385e0`
- Checks Desktop: `bebccb819b07429bb9e8495c06a3b25b`
- Checks Mobile: `c2e25826e8ac4ae3bcbe166a24406b08`
- Export Desktop: `1230254283984b86a66aedebdb3d7a45`
- Export Mobile: `8dae7eca60634402b672c02595d3876a`
- Uebersicht Desktop Light Mode: `ced7f8d48d824e878f9e1493dc465798`
- Uebersicht Mobile Light Mode: `cb463708d8364ad1968fac95a1835808`
- Uebersicht Mobile Light Mode Preferred: `9b4ea3a1f8b74278890a122bfea6db8d`

Empfohlene Review-Reihenfolge:

1. Uebersicht Desktop
2. Uebersicht Mobile
3. Transaktionen Desktop
4. Transaktionen Mobile
5. Vermoegen Desktop
6. Vermoegen Mobile
7. Cashflow Desktop
8. Cashflow Mobile
9. Regelzahlungen Desktop
10. Regelzahlungen Mobile
11. Stammdaten Desktop
12. Stammdaten Mobile
13. Checks Desktop
14. Checks Mobile
15. Export Desktop
16. Export Mobile
