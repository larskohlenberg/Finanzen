# Vermoegensseite mit Tabs je Klasse

Stand: 2026-10-12 · Status: Entwurf zur Freigabe

## Ziel

Die Vermoegensseite zeigt heute drei Kacheln und darunter eine lange Liste aller
Positionen. Jede Klasse braucht aber andere Informationen: ein Darlehen seinen
Verlauf, eine Immobilie Stammdaten und Monatszahlen. Kuenftig bekommt jede Klasse
einen eigenen Tab mit passender Darstellung; oben bleibt ein schmaler Kopf mit
Nettovermoegen und Datenqualitaet.

Mock (lokal, fiktive Zahlen, nicht versioniert): Sitzungs-Scratchpad
`vermoegen-mock.html`.

## Entscheidungen

- **Tabs:** Uebersicht · Konten & Depots · Immobilien · Darlehen. „Sonstige
  Werte" (Vermoegenswerte) nur, wenn es aktive Positionen gibt.
- **Kein Vorsorge-Tab.** Vorsorge bleibt vollstaendig auf der Vorsorge-Seite.
  Die Vermoegensseite zeigt nur einen Verweis: eine Karte „Vorsorge" mit der
  Summe der Rueckkaufswerte, die ins Nettovermoegen eingehen, und Link zur
  Vorsorge-Seite. `computeNettovermoegen` bleibt unveraendert.
- **Kein Nettovermoegen-Verlauf** in dieser Runde.
- **Schema Immobilie** wird um `nutzung` und `wohnflaeche` erweitert (beide
  optional).
- **Dokumente** zu Immobilien und Darlehen erscheinen im jeweiligen Detail,
  abgeleitet aus dem bestehenden Verweisindex (`verweisIndex` in `belege.mjs`).

## Kopf (ueber allen Tabs)

- **Nettovermoegen:** Betrag, Aktiva/Passiva, ein Balken Aktiva nach Klasse und
  ein Passiva-Balken im selben Massstab. Quelle `computeNettovermoegen`.
- **Datenqualitaet:** Worst-of-Chip und Zaehler wie heute, dazu eine kurze
  Lueckenliste (fehlende Positionen und Vermoegens-Checks, gruppiert nach
  Klasse), jeder Eintrag springt in den passenden Tab bzw. zur Vorsorge-Seite.
- Die Kachel „Wertstaende" entfaellt. Die Gesamtliste aller Zeitwerte bleibt
  ueber einen Link „Alle Wertstaende" in der Uebersicht erreichbar (bestehende
  Rail).

Tab-Reiter tragen Anzahl, Summe und einen Punkt, wenn in der Klasse etwas fehlt.

## Tab Uebersicht

Eine Karte je Klasse (Konten & Depots, Immobilien, Darlehen, Vorsorge-Verweis,
ggf. Sonstige Werte): Summe, Anzahl, ein Kernsatz (z. B. „Eigenkapital in
Immobilien", „Rate je Monat"), Qualitaets-Chip. Klick wechselt den Tab bzw. oeffnet
die Vorsorge-Seite. Darunter der Link „Alle Wertstaende".

## Tab Konten & Depots

- Tabelle = bestehende `renderAccountTable` (Bloecke Konten/Depots/Weitere,
  Summen, Veraltet-Markierung). Keine zweite Kontentabelle.
- Zeilenklick oeffnet die Detail-Rail mit `renderVermoegenDetail` (Konto), wie
  heute. Ergaenzt um: Saldoverlauf der letzten 12 Monate (rueckgerechnet vom
  aktuellen Stand ueber die Buchungen, `saldoLinie`) und Links zu Buchungen und
  Stammdaten des Kontos.

## Tab Immobilien

Oben eine Karte je aktiver Immobilie: Bezeichnung, Nutzung, Marktwert (anteilig),
Eigenkapital im Objekt, Beleihungsquote, Saldo der letzten 12 Monate. Klick waehlt
das Objekt; das erste ist vorgewaehlt.

Detail des gewaehlten Objekts:

1. **Kennzahlen:** Marktwert (Stand, Qualitaet) · zugeordnete Restschuld (Summe
   der aktiven Darlehen mit dieser `immobilie_id`, Stand heute) · Eigenkapital im
   Objekt (anteiliger Marktwert − Restschuld) · je Nutzung:
   - `vermietet`: Bruttomietrendite (Einnahmen 12 M / Marktwert) und Ø Monatssaldo
   - `selbstgenutzt`: Ø Wohnkosten je Monat
   - ohne Angabe: nur Ø Monatssaldo
2. **Ein- und Ausgaben je Monat** der letzten 12 abgeschlossenen Monate:
   Balkendiagramm (Einnahmen nach oben, Ausgaben nach unten, Saldo als Linie) und
   Tabelle Monat × Kategorie mit Summenzeile. Spalten sind die Kategorien, die
   tatsaechlich vorkommen. Umschalter „ohne Darlehensrate" blendet Buchungen aus,
   die einem Darlehen dieser Immobilie zugeordnet sind (Kategorie des Darlehens
   bzw. Kreditrate), weil die Tilgung Vermoegensaufbau ist.
3. **Stammdaten:** Adresse, Nutzung, Wohnflaeche, Eigentumsanteile, Anschaffung
   (Datum, Kosten), Wertaenderung seit Anschaffung, verknuepfte Darlehen (Link in
   den Darlehen-Tab), Bemerkung.
4. **Marktwert-Staende** (Zeitwerte `marktwert`, neueste zuerst).
5. **Dokumente:** alle Belege, die auf die Immobilie, ihre Zeitwerte oder ihre
   Darlehen verweisen (ueber `quelle_hinweis`), plus Link „Alle Buchungen".

## Tab Darlehen

Kopf-Kennzahlen: Restschuld gesamt, Rate gesamt je Monat, getilgt seit Aufnahme,
naechstes Zinsbindungsende.

Karte je aktivem Darlehen: Restschuld heute, Tilgungsbalken (getilgt in % vom
Anfangsbetrag), Rate, Zinssatz, Zinsbindung bis, Chip „bald" bei weniger als 3
Jahren bis Zinsbindungsende.

Detail des gewaehlten Darlehens:

1. **Restschuld-Verlauf:** Ist ab Anker (wie heute `restschuldHeute().punkte`)
   durchgezogen, Plan bis `laufzeit_bis` gestrichelt, Marker „heute" und
   „Zinsbindungsende", belegte Restschuld-Zeitwerte als Punkte.
2. **Zins und Tilgung je Kalenderjahr** als gestapelte Balken (Ist + Plan).
3. **Kennzahlen:** Restschuld heute, Anker (Datum, Qualitaet), getilgt, Zinsen
   seit Anker, **Restschuld zum Zinsbindungsende**, Tilgungsanteil der naechsten
   Rate.
4. **Stammdaten** wie heute in der Rail, plus Links zu Immobilie und
   Regelzahlung; Sondertilgungen aus Szenarien (bestehender Rueckverweis).
5. **Dokumente** wie bei Immobilien (Verweise auf das Darlehen und seine Zeitwerte).

## Tab Sonstige Werte

Nur sichtbar mit aktiven Vermoegenswerten. Einfache Tabelle (Bezeichnung, Typ,
anteiliger Wert, Stand, Qualitaet) mit der bestehenden Detail-Rail.

## Neue Rechnung (reine Funktionen, `node --test`)

In `app/vermoegen.mjs` bzw. einem neuen Modul `app/vermoegen-details.mjs`:

- `darlehensplan(darlehen, zeitwerte, bis)` → Raten ab Anker bis `bis`:
  `{ datum, zins_cents, tilgung_cents, rest_cents }`. Gleiche Rechnung wie
  `restschuldHeute` (dieselbe Rundung); `restschuldHeute` nutzt sie danach selbst,
  damit es nur eine Fortschreibung gibt.
- `darlehenKennzahlen(darlehen, zeitwerte, today)` → Restschuld heute, getilgt,
  Zinsen seit Anker, Rest zum Zinsbindungsende, Zins/Tilgung je Jahr.
- `immobilienMonate(data, immobilieId, bisMonat, anzahl = 12)` → je Monat
  Einnahmen, Ausgaben je Kategorie, Saldo; Transfers ausgeschlossen. Betraege in
  Cent ueber `toCents`.
- `immobilienKennzahlen(data, immobilieId, today)` → Marktwert anteilig,
  Restschuld zugeordnet, Eigenkapital, Beleihungsquote, Rendite bzw. Wohnkosten.
- `belegeZuEntitaet(verweisIndex, entitaet, id)` (in `belege.mjs`) → Belegpfade,
  die auf die Entitaet zeigen.

## Schema

`immobilien.schema.json`, beide optional:

- `nutzung`: `"selbstgenutzt" | "vermietet" | "teilvermietet"`
- `wohnflaeche`: Decimal-String in m², Muster wie Betraege (`^(0|[1-9]\d*)\.\d{2}$`)

Demodaten bekommen Beispielwerte; Echtdaten traegt der Agent nach Angabe ein.

## Routing

- `#/vermoegen` → Uebersicht
- `#/vermoegen/konten`, `#/vermoegen/immobilien`, `#/vermoegen/darlehen`,
  `#/vermoegen/sonstige`
- `#/vermoegen/immobilien/IMM-004`, `#/vermoegen/darlehen/DAR-001`,
  `#/vermoegen/konten/KTO-001`
- Alt: `#/vermoegen/<klasse>:<id>` wird auf die neue Form abgebildet (Links aus
  Checks und Stammdaten bleiben gueltig). `vorsorge:<id>` fuehrt zur Vorsorge-Seite.

## Was entfaellt

Positionsliste mit Klassen-/Qualitaetsfilter und Sortierung, Kachel
„Wertstaende", Zustandsfelder `vermoegenFilters` und `vermoegenSort`.

## Tests

- Unit: `darlehensplan` (Annuitaet, Rundung, Ende bei Rest 0, Gleichstand mit
  `restschuldHeute`), `darlehenKennzahlen`, `immobilienMonate` (Monatsgrenzen,
  Transfers raus, Kategorien), `immobilienKennzahlen` (Anteile, ohne Darlehen,
  ohne Marktwert), `belegeZuEntitaet`, Schema-Validierung der neuen Felder.
- Routing: neue Routen und Altform.
- View-Tests im Stil von `tests/uebersicht-view.test.mjs`: Tabs, Punkt bei Luecken,
  kein Vorsorge-Tab, „Sonstige Werte" nur mit Daten.
- Sichtpruefung im Browser mit Demodaten (hell und dunkel, schmale Breite).

## Nicht in dieser Runde

Nettovermoegen-Verlauf, Zins/Tilgung-Trennung in der Immobilien-Monatstabelle
(Rate wird nur ein- oder ausgeblendet), Bearbeiten in der App.
