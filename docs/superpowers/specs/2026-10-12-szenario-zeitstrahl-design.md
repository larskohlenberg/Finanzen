# Szenarien als Zeitstrahl mit Phasen

Stand: 2026-10-12 · Status: Entwurf zur Freigabe

## Ziel

Szenarien sind Lebensverlaeufe: mehrere Phasen hintereinander (arbeiten,
arbeitslos, ueberbruecken, Rente), dazwischen Einzelereignisse (Hausverkauf,
Erbschaft). Die heutige Detailseite zeigt dagegen eine flache Annahmenliste und
zwei Kurven gegen die annahmenfreie Basis. Weil der Basis typischerweise das
kuenftige Einkommen fehlt, faellt sie steil ab, bestimmt die Y-Skala und macht
die interessanten Unterschiede unsichtbar. Dazu kommen ~150 Monatspunkte ohne
Gitter und ein Weg Liste → Rail → Vollansicht.

Kuenftig beantwortet jede Detailseite dieselben drei Fragen fuer jedes Szenario:
**Wie lange reicht die Liquiditaet? Wie kommen wir in jeder Phase aus? Wo steht
das Vermoegen am Ende?** — und vergleicht wahlweise gegen die Basis oder ein
anderes Szenario.

Lieferung in einem PR.

## Entscheidungen

- **Phasen sind benannt und kommen vom Agenten** (`phasen`), nicht automatisch
  aus Annahme-Terminen abgeleitet (die waeren unbenannt und zu fein).
  Reine Beschriftung: die Rechnung aendert sich nicht.
- **Keine Leitfrage je Szenario.** Ein Szenario stellt mehrere Fragen zugleich;
  die Seite hat eine feste Struktur.
- **Vergleichsbasis waehlbar:** Basis (Default) oder ein anderes Szenario.
  Nur UI-Zustand (Route `.../gegen/SZN-yyy`), kein Datenfeld.
- **Rail und „Vollansicht oeffnen" entfallen.** Klick in der Liste oeffnet das
  Detail.
- **Nicht dabei:** Alter in Jahren (kein Geburtsdatum im Bestand), Rueckwaerts-
  rechnung „was kann ich mir leisten", Mindestreserve als Schwelle (nur Null),
  Anlegen/Bearbeiten in der App (bleibt beim Agenten, ADR 0006).

## Datenmodell

Szenario bekommt optional:

```json
"phasen": [{ "name": "Arbeit", "ab": "2030-01-01" }, { "name": "Rente", "ab": "2045-01-01" }]
```

- `name` nicht leer, `ab` ISO-Datum. Aufsteigend sortiert, keine doppelten
  `ab`, alle `ab` ≤ `reichweite_bis`. Jede Phase laeuft bis zum Tag vor der
  naechsten, die letzte bis `reichweite_bis`.
- Liegt das erste `ab` nach dem Rechenstart, gilt der Zeitraum davor als
  unbenannte Phase „Vorlauf". Liegen Phasen ganz vor dem Rechenstart, werden sie
  abgeschnitten (nicht gezeigt).
- Ohne `phasen` gibt es genau eine Phase „Gesamt".
- Pruefung im Schema (`szenarien.schema.json`) und im Validator
  (`validateSzenarien`).
- CONTEXT.md bekommt den Begriff **Phase** beim Szenario.

## Engine (`app/szenarien.mjs`, reine Funktionen, `node --test`)

`rechneSzenario` liefert je Monatspunkt zusaetzlich die Bewegungen des Monats,
aufgeteilt nach Herkunft:

- `ein_cents` — regelmaessige Zufluesse (Regelzahlungen, deren Kategorie nicht
  `typ: neutral` ist),
- `aus_cents` — regelmaessige Abfluesse (dito, negativ),
- `einmal_cents` — Einmalzahlungen inkl. Gegenbuchungs-Cash (Verkauf, Erbschaft,
  Sondertilgung, Kapitalleistung),
- `umbuchung_cents` — der Rest (neutrale Kategorien, z. B. Sparen aufs Tagesgeld).

Invariante: `liquide[m] − liquide[m−1] = ein + aus + einmal + umbuchung`.

Neue Auswertungen, alle ueber das Ergebnis von `rechneSzenario`:

- `kippMonat(punkte)` — erster Monat mit `liquide_cents < 0`, sonst `null`
  („reicht ueber den Horizont").
- `tiefpunkt(punkte)` — kleinster `liquide_cents` mit Monat.
- `phasenKennzahlen(szenario, punkte, today)` — je Phase: Name, von, bis,
  Ø Einnahmen/Monat, Ø Ausgaben/Monat, Saldo/Monat (ohne Einmalzahlungen),
  Summe Einmalzahlungen, Liquide am Phasenende, zugehoerige Annahmen (Startdatum
  der Annahme liegt in der Phase).
- `ereignisWirkung(data, szenario, today)` — fuer jede Annahme vom Typ
  `einmalzahlung` (bzw. aus `vorsorge-leistung` mit Arm `kapital`) wird das
  Szenario ohne diese eine Annahme neu gerechnet; gemeldet werden Annahmen,
  deren Weglassen den Kipp-Monat um mehr als 12 Monate verschiebt (oder einen
  Kipp-Monat erst erzeugt).

## Ansicht

### Liste `#/szenarien`

Spalten: Auswahl-Haekchen · Name · Status · Phasen (Anzahl) · Liquiditaet reicht
bis · Tiefpunkt (Betrag, Monat) · Nettovermoegen am Horizont · Qualitaet.
Zeilenklick oeffnet das Detail. Ab zwei Haekchen wird „Vergleichen" aktiv
(Obergrenze 7).

### Detail `#/szenarien/SZN-xxx[/gegen/SZN-yyy]`

1. **Kopf:** Name, Status, Qualitaet, Stand, Horizont. Beschreibung gekuerzt auf
   den ersten Satz, Rest aufklappbar. Rechts „Vergleich mit" (Basis oder jedes
   andere Szenario). Staleness-Hinweis wie bisher.
2. **Warnungen** kompakt unter dem Kopf (Chips mit Klartext, Details aufklappbar).
3. **Antwortzeile** (drei Kacheln), jeweils mit Δ zur Vergleichsbasis:
   - *Liquiditaet reicht bis* Monat bzw. „ueber den Horizont"; darunter je
     relevantem Ereignis „ohne ‹Annahme›: ‹Monat›".
   - *Tiefpunkt* Betrag und Monat.
   - *Nettovermoegen am Horizont*, darunter „heute ‹Betrag›".
4. **Zeitstrahl:** Phasenbaender, darunter Ereignismarker (Einmalzahlungen mit
   Kurzlabel und Betrag), darunter das Liquiditaetsdiagramm auf derselben
   x-Achse. Jahresaufloesung (Jahresendwerte) als Standard, Umschalter Monat.
   Horizontale Gitterlinien mit k-€-Beschriftung, betonte Nulllinie, Flaeche
   unter Null rot getoent. Vergleichslinie gestrichelt. Umschalter
   **Absolut / Differenz** (Differenz = Szenario − Vergleich je Punkt).
5. **Phasentabelle:** Phase · Zeitraum · Ø Einnahmen · Ø Ausgaben · Saldo/Monat ·
   Liquide am Phasenende. Zeile klappt die Annahmen der Phase auf: vorher →
   nachher, Δ/Monat, ab, Qualitaet, Begruendung. Querlinks auf Regelzahlungen
   bleiben.
6. **Nettovermoegen** (eingeklappt): gestapelte Jahresbalken Liquide, Depot,
   Sachwerte (als „eingefroren" gekennzeichnet), Restschuld negativ, dazu die
   Netto-Linie; Umschalter auf Jahrestabelle.
7. **Rechengrundlage** (eingeklappt): Objektwirkungen und Basis-Regelzahlungen
   wie bisher, Prognosebasis-Hinweis mit Link zu Checks.

### Vergleich `#/szenarien/vergleich/SZN-a,SZN-b,…`

Ein Liquiditaetsdiagramm (Jahresaufloesung, eine Linie je Szenario, feste
Reihenfolge der Farben, gleiche Gitter-/Nullliniengestaltung) und darunter eine
Tabelle: Szenarien als Spalten, Zeilen = Kennzahlen der Antwortzeile plus
Phasenanzahl und Qualitaet. Spaltenkopf verlinkt ins Detail.

## Diagramme (`app/charts.mjs`)

`linienDiagramm` bekommt im Zeit-Modus: Gitterlinien mit 4–6 „runden"
Y-Ticks, mehrere Serien (Vergleich), optionale Baender (`phasen`) und Marker
(`ereignisse`), Jahresaggregation durch den Aufrufer. Neu `stapelDiagramm` fuer
die Nettovermoegens-Zusammensetzung. Hover wie bisher ueber `diagramm-hover.mjs`.
CSP: keine `style`-Attribute, Farben ueber Klassen.

## Agent

`app/docs/skills/szenarien-annahmen.md`: beim Anlegen eines Szenarios Phasen
mitschreiben; fuer Fragen der Art „wie lange reicht es" den Horizont weit genug
setzen. Bestehende Szenarien auf dem Server bekommen ihre Phasen nachgetragen
(Datenpflege, nicht Teil des Code-PRs).

## Tests

- Engine: Invariante der Monatsbewegungen, `kippMonat`, `tiefpunkt`,
  `phasenKennzahlen` (Vorlauf, ohne Phasen, Phasen vor Rechenstart),
  `ereignisWirkung`.
- Validator: Sortierung, Duplikate, Datum nach Horizont.
- Routing: Detail mit `vergleich`, Vergleichsroute, Ruecksprung.
- Views: Render-Smoke-Tests fuer Liste, Detail (mit/ohne Phasen), Vergleich.
- Browser-Check mit Demodaten im Worktree.
