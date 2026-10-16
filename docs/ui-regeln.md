# UI-Regeln

Verbindliche Gestaltungsregeln der App, die ueber einzelne Seiten hinaus gelten.
Neue oder umgebaute Ansichten uebernehmen diese Bausteine, statt eigene Varianten
zu bauen. Die aeltere Gesamt-Guideline liegt unter
`docs/archiv/runde2/UI_Guideline_Runde2.md`.

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

Reihenfolge und Standard je Detailansicht:

| Ansicht | Kacheln (zu = per Standard zugeklappt) |
| --- | --- |
| Vorsorgevertrag | Vertragsdaten (zu), Dokumente, Gebuchte Beitraege, Bemerkung und Wertstaende (zu) |
| Immobilie | Stammdaten, Monatstabelle, Dokumente, Bemerkung und Wertstaende (zu) |
| Darlehen | Kennzahlen, Restschuldverlauf, Stammdaten, Dokumente, Bemerkung/Wertstaende/Sondertilgungen (zu) |
| Vermoegen, Uebersicht | Klassenkarten, Wertstaende (zu; ein Sprung "Alle Wertstaende" oeffnet sie) |

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
- Kontentabellen (Uebersicht, Vermoegen, Stammdaten): eigene erste Spalte
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
