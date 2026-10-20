# UI-Regeln

Verbindliche Gestaltungsregeln der App, die ueber einzelne Seiten hinaus gelten.
Neue oder umgebaute Ansichten uebernehmen diese Bausteine, statt eigene Varianten
zu bauen. Die aeltere Gesamt-Guideline liegt unter
`docs/archiv/runde2/UI_Guideline_Runde2.md`.

## Zahlen und Daten

Alle Zahlen, Betraege und Daten formatiert `app/format.mjs` (in Views ueber
`fmt()`, `formatMoney`, `formatGeldGanz`, `formatDate` und `tf` aus
`runtime.mjs`/`komponenten.mjs`). Keine eigenen `Intl`-Formatierer und kein
eigenes Escaping in Views; ein Test prueft das.

- **Kacheln gerundet, Details exakt.** Kennzahlen in Kacheln, Zeilen der
  Uebersicht und Achsen zeigen ganze Euro (`geldGanz`). Tabellen, Detailfelder,
  Tooltips und Checks zeigen den Betrag mit Cent (`geld`).
- Deutsch formatiert als `de-DE`, Englisch einheitlich als `en-GB` (Euro,
  Tag vor Monat).
- Texte mit Platzhaltern ueber `tf("schluessel", { name: wert })`, nicht mit
  `.replace("{name}", ...)`.

## Klappbare Detail-Kacheln

Grosse Abschnitte im Detail eines Objekts (Vertrags- und Stammdaten,
Kennzahlen-Panels, Diagramme und Tabellen, Dokumente, Bemerkung und Wertstaende)
sind immer klappbare Kacheln, gebaut mit `klappKachel` aus `app/komponenten.mjs`.

- Der Titel ist der Knopf (Pfeil plus Titel, `aria-expanded`). Rechts im Kopf darf
  ein Umschalter oder Hinweis stehen (`kopfExtra`), sichtbar nur bei offener Kachel.
- Zugeklappt rendert die Kachel keinen Inhalt.
- Jede Kachel hat eine stabile `id` (`<bereich>.<abschnitt>`, z. B.
  `vorsorge.dokumente`, `immobilie.anhang`). Der Zustand gilt je id
  seitenuebergreifend bis zum Neuladen.
- Standard: Arbeitsinhalt offen, der Anhang (**Bemerkung, Wertstaende,
  Sondertilgungen**) zu.
- Detail-Kacheln laufen ueber die volle Breite und teilen ihren Inhalt bei Bedarf in
  Spalten (`vorsorge-spalten`), statt Kacheln nebeneinander zu stellen.

Bereichsseiten (Vorsorge, Vermoegen, Liquiditaet) bauen ihre Kennzahlen aus
`kennzahlKachel` (`app/komponenten.mjs`): Wert, Notiz, flacher Verlauf
(`zeitverlaufKlein`), Aufschluesselung als Liste; je zwei nebeneinander
(`kachel-paare`). Jede Zahl steht einmal da; Tabs duerfen ihre Summe tragen.
Erklaerungen zu einer Kennzahl stehen als Infosymbol am Label (`info` bzw.
`infoTipp`). Donut-Segmente ruecken beim Hovern heraus, zeigen Betrag und Anteil
und heben die Zeile gleicher Farbe in der Liste hervor. Im Liquiditaetsverlauf
markieren Ereignisse grosse Einzelbuchungen (`grosseBuchungen`, ab 4.000 Euro).

Reihenfolge und Standard je Detailansicht:

| Ansicht | Kacheln (zu = per Standard zugeklappt) |
| --- | --- |
| Vorsorgevertrag | Kennzahlen (vier, mit Beitragsdynamik fuenf), Vertragsdaten (zu), Dokumente, Gebuchte Beitraege, Bemerkung und Wertstaende (zu) |
| Immobilie | Stammdaten, Monatstabelle (Investitionen als eigene Spalte), Investitionen (nur wenn vorhanden), Dokumente, Bemerkung und Wertstaende (zu) |
| Darlehen | Kennzahlen, Restschuldverlauf, Stammdaten, Dokumente, Bemerkung/Wertstaende/Sondertilgungen (zu) |
| Vermoegen, Uebersicht | Tabs direkt unter dem Seitenkopf; im Tab: Nettovermoegen (Verlauf je Monat) und Restschuld (je Jahresende bis zur Tilgung) nebeneinander, Konten und Depots, Immobilien und weitere Werte, offene Punkte, Wertstaende (zu; ein Sprung "Alle Wertstaende" oeffnet sie) |
| Plan & Ist | Auswahl unter dem Seitenkopf (Jahr/Quartal/Monat, Zeitraum mit Gesamter Bestand und Letzte 12 Monate, Ø je Monat oder Summe); drei Kennzahlen (Einnahmen, Ausgaben, Sparquote) mit flachem Verlauf Ist gegen Plan; Verlauf als Tabelle (Zeile waehlt den Zeitraum), Einnahmen und Ausgaben je Kategorie (Zeile klappt Regelzahlungen und Einzelposten auf), Sparen, Regelzahlungen ohne Buchung (zu). Abweichungen gruen, wenn sie guenstig sind, sonst rot. Die Kacheln der Uebersicht tragen darunter die Planzeile mit Link hierher |
| Liquiditaet | Liquiditaet heute (letzte 24 Monate, dazu gestrichelt der Trend aus gleitender Regression ueber sechs Monate) und Prognose (Horizont standardmaessig zwoelf Monate) nebeneinander; darunter Einnahmen und Ausgaben im Trend nebeneinander (gleitendes 12-Monats-Mittel, blass die Monatswerte, Pfeil im Vergleich mit den zwoelf Monaten davor, darunter Stand und beide Zeitraeume, die fuenf groessten Kategorien), Kategorien im Trend (zu, Stand im Titel, Spalten mit ihren Zeitraeumen, Minikurve je Kategorie), Bewegungen im laufenden Monat (zu), Prognose-Tabelle (zu). Die Kacheln der Uebersicht tragen denselben Pfeil an der Summe und, nur bei spuerbarer Veraenderung, an der Kategorie |
| Vorsorge, Uebersicht | Tabs direkt unter dem Seitenkopf; im Tab: Alterseinkommen und Kapitalleistungen nebeneinander (je mit flachem Zeitverlauf auf derselben Jahresachse), Rueckkaufswerte und Beitraege, offene Punkte (ohne offene nur eine Zeile). Andere Tabs ohne Seitenkennzahlen |
| Vorsorge, Tab Versicherungen | Jahresbeitraege im Vergleich (zu), Vertragskarten, Vertragsdetail |
| Uebersicht, Absicherung | je Person eine Summenzeile (zu), aufgeklappt die einzelnen Leistungen |

## Dokumente eines Objekts

Dokumente erscheinen als Ausschnitt der Dokumentenansicht (`dokumenteBrowserHtml`
in `app/views/vermoegen-teile.mjs`): derselbe Ordnerbaum und dieselbe Tabelle, nur
mit den Dateien des Objekts. Zeile und Name oeffnen die Datei direkt im neuen Tab,
hinten stehen Herunterladen und "In Dokumenten zeigen". In schmalen Rails bleibt
die einfache Liste (`dokumenteHtml`).

Eine Immobilie zeigt neben ihren eigenen Dokumenten und denen der zugeordneten
Darlehen auch die Belege der Vertraege mit Bezug auf sie (Wohngebaeude, Hausrat,
Photovoltaik; Bezug ueber `vermoegensBezug`), also deren Belegordner aus
`quelle_hinweis` und deren Vorsorge-Objektordner, beendete Vertraege eingeschlossen.
Die Dokumente-Kachel zeigt nur Dokumente; der Sprung in alle Buchungen steht in
der Kachel "Ein- und Ausgaben je Monat".

## Farben in Grafiken

- Jeder Altersvorsorge-Vertrag (Renten und Lebensversicherungen) hat eine feste
  Farbe (`vertragsFarben` in `app/vorsorge-rechnung.mjs`, Klassen
  `vertrag-farbe-0..13`): dieselbe im Rentenbalken, in den Donuts, auf der
  Zeitachse, als Punkt in Listen und auf seiner Karte. Die Zuordnung steht fest in
  `DATENROOT/farben.json`; ohne Eintrag gilt die naechste freie Farbe nach ID.
  Die Palette hat 14 Toene (Slot 0-5 aus der Kategorienpalette, 6-13 mit
  maximalem Abstand dazu); bei mehr Vertraegen beginnt sie von vorn, Grau ist kein
  Sammelbecken fuer "Weitere".
- Bereiche (Tabs) haben eigene Farben (`tab-farbe-*`), die nicht mit Vertragsfarben
  kollidieren; Grau steht fuer Versicherungen ohne Vermoegensaufbau.
- Hell und Dunkel nutzen je Slot dieselbe Farbfamilie, auf die jeweilige Flaeche
  abgestimmt. Massstab ist die Unterscheidbarkeit im normalen Sehen ueber alle
  Paare; Farbfehlsichtigkeit und Kontrast sind bei 14 Toenen nachrangig. Deshalb hat
  jede farbige Markierung eine sichtbare Beschriftung daneben, Farbe ist nie die
  einzige Information.
- Donuts nur fuer Anteile am Ganzen mit wenigen Teilen; zwei fast gleich grosse
  Werte sind kein Fall fuer einen Donut.

## Logos vor Namen

Wo eine Gegenpartei, eine Regelzahlung, ein Konto oder ein Vorsorgevertrag mit
Namen erscheint, steht davor `mitLogo` bzw. `logoMarke` aus `app/komponenten.mjs`:
ein Logo aus dem Logo-Verzeichnis des Datenbestands, sonst ein Kuerzel in fester
Farbe (ADR 0030). Konten finden ihr Logo ueber den Kontonamen, der die Bank
nennt. Groesse und Platz je Ort:

- Listen und Text: 20 px vor dem Namen.
- Tabellen (Transaktionen, Regelzahlungen): 44 px ueber `{ groesse: "tabelle" }`,
  rund drei Viertel einer zweizeiligen Zeile; das Logo ragt ins Zellpolster,
  damit die Zeile nicht hoeher wird. Der Text steht vertikal zentriert zum Logo
  (`.mit-logo`), auch bei Umbruch.
- Kontentabellen (Vermoegen, Stammdaten): eigene erste Spalte
  `logo-zelle`, gleiche Groesse wie in den anderen Tabellen.
- Vergleichsliste in einer Kachel (Jahresbeitraege): 24 px ueber
  `{ groesse: "vergleich" }`.
- Vertragskarte: 36 px rechts unter dem Art-Chip, damit der Name links Platz
  hat; der Farbpunkt bleibt direkt vor dem Namen.
- Vertragsdetail: kein Logo im Titel, sondern 48 px rechts oben im Inhalt der
  Kachel Vertragsdaten (nicht im Kopf, die Kachel ist per Standard zu).

Mit Bild ist die Flaeche hinter dem Logo weiss, ohne Kuerzelfarbe; sonst scheint
die Farbe an den gerundeten Kanten durch. Logodateien sind bis 128 px gross und
werden nur verkleinert angezeigt, nie vergroessert, soweit der Logodienst so
gross liefert. Keine eigenen Bild- oder Badge-Varianten je Seite; Farben nur ueber
die Klassen `kuerzel-farbe-<n>`, keine style-Attribute.

## Uebersicht

Die Uebersicht ist ein Dashboard aus Kacheln, keine Tabellen: je Bereich
(Liquiditaet, Vermoegen, Vorsorge) eine Kachel mit Kennzahl, kleinem Diagramm und
Zeilen, darunter die Termin-Kachel ueber zwoelf Monate (Zeitleiste mit einer Spur
je Terminart, darunter die Listen). Der Kopf jeder Kachel fuehrt auf die Seite des
Bereichs, jede Zeile auf ihr Objekt oder ihren Reiter. Was eine andere Seite schon
vollstaendig zeigt (Kontentabellen, naechste Aktion im Arbeitsstatus), steht hier
nicht noch einmal. Diagramme in schmalen Kacheln kommen ohne Achsen aus.

## Kopfzeile

Die Kopfzeile bleibt einzeilig: links die Statuschips, rechts Suche, Diffusor-Auge und Zahnrad.

- Datenmodus, Sprache und Darstellung liegen im Zahnrad-Menue (Knopfreihen, Esc
  oder Klick daneben schliesst). Keine eigenen Auswahlfelder in der Kopfzeile.
- Text bekommt nur, was Aufmerksamkeit braucht: Demodaten, Validierungsfehler,
  offene Kategorien und Checks (nur bei mehr als null), Importfehler. Bestandene
  Validierung und Neu laden sind reine Symbole mit Tooltip.
- Der Prompt-Chip kuerzt seinen Text mit "…", statt die Zeile umbrechen zu lassen.

## Diffusor-Modus
Sichtschutz fuer Bildschirmfreigabe und Screenshots: das Auge in der Kopfzeile
oder Alt+Umschalt+D. Der Browser merkt sich den Schalter.
- Betraege werden zu unlesbaren Zeichen (gespiegelte und gedrehte Glyphen), immer
  gleich viele, damit die Laenge die Groessenordnung nicht verraet. Vorzeichen
  und Waehrung bleiben. Die Zeichen haengen von einem Salz je Seitenaufruf ab.
- Namen aus dem Bestand (Personen, Konten, Vertraege, Immobilien, Darlehen,
  Regelzahlungen, Logo-Namen) werden zu Platzhaltern wie "Giro A", "Person 1",
  "Riester 1". Gegenparteien werden "Gegenpartei N"; Umbuchungen auf eigene
  Konten zeigen deren Platzhalter.
- Freitext (Verwendungszweck, Bemerkung, IBAN, Versicherungsnummer, Adresse,
  Dokumentnamen) wird Wort fuer Wort zu Zeichen. Neue Freitextfelder markieren:
  `vertraulich()` aus `app/komponenten.mjs` oder `data-diffus="text"`.
- Logos werden zu neutralen Flaechen. Diagramme, Prozente, Daten, Anzahlen und
  Kategorien bleiben lesbar.
- Eingaben (Suchfelder, Betrag ab/bis, Schnellsuche) erscheinen als Zeichen:
  der echte Text im Feld ist durchsichtig, eine Decke darueber zeigt ihn
  verdeckt. Suchen und Filtern funktionieren unveraendert; wer zuschaut, sieht
  nicht, wonach gefiltert wird. Datumsfelder bleiben offen.
- Adresszeile und Fenstertitel tragen im Modus weder Betrag, Gegenpartei noch
  Dokumentpfad; der Filter gilt trotzdem (geht nur beim Neuladen verloren).
- Beim Umschalten rollen die sichtbaren Stellen wie eine Walze
  (`app/diffusor-anzeige.mjs`); bei "Bewegung reduzieren" ohne Animation.
- Grenze: reine Anzeige. Die Daten bleiben im Browser geladen, der Server
  aendert sich nicht. Texte vom Server (Pruefbefunde, Regeltexte) verdeckt nur
  die Namens- und Betragserkennung, nicht jeden Haendlernamen.

## Drilldowns

Jede Zahl fuehrt in die Positionen oder Buchungen, aus denen sie entsteht, mit
demselben Zeitraum und derselben Auswahl; die Auswahl steht als Filter-Chips
ueber der Liste.

- Monatsspalten der Verlaufsdiagramme sind Links (auch per Tastatur): ein Monat
  der Einnahmen-/Ausgabenkurve oeffnet seine laufenden Buchungen, nach Kategorie
  summiert (`klasse=laufend`, `gruppe=kategorie`). Bekannte Grenze: der Trend
  ordnet eine Kategorie nach ihrem Saldo ueber zwoelf Monate einer Seite zu und
  teilt Brutto-Kategorien nach Vorzeichen; die Liste zeigt je Kategorie den
  Monatssaldo beider Seiten zusammen.
- Kategorien (Administration) zeigen Anzahl und Summe der letzten zwoelf
  abgeschlossenen Monate;
  der Name oeffnet genau diese Buchungen.
- Regelzahlungen (Termine) zeigen letzte Buchung und naechste Faelligkeit und
  sind sortier- und filterbar. **Ueberfaellig**: bestaetigt, noch laufend, mit
  mindestens einer zugeordneten Buchung, und die naechste erwartete Buchung
  (letzte plus ein Rhythmus) liegt mehr als zehn Tage zurueck
  (`app/termine-modell.mjs`). Ohne zugeordnete Buchung keine Aussage.
- Ein Konto hat genau ein Detail: Vermoegen -> Konten. Die Administration listet
  die Konten nur; alte Links `#/konten/<ID>` fuehren dorthin.
