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
