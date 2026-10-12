# Vermoegensseite mit Tabs — Umsetzungsplan

> Ausfuehrung: nativ in der Sitzung (Nutzerfreigabe „leg los" am 2026-10-12).
> Bewusst kompakt gehalten (Projektregel: keine Enterprise-Buendel); Code steht
> im Commit, nicht im Plan.

**Ziel:** Vermoegensseite von der Positionsliste auf Kopf + Tabs je Klasse umbauen.

**Architektur:** Rechnen in reinen Funktionen (`app/vermoegen-details.mjs`,
Diagramme in `app/charts.mjs`), Darstellung in `app/views/vermoegen.mjs`,
Zustand und Routen in `runtime.mjs`/`routing.mjs`/`main.js`.

**Spec:** `docs/superpowers/specs/2026-10-12-vermoegen-tabs-design.md`

## Globale Vorgaben

- Betraege in Cent ueber `toCents`, nie Float-Summen von Strings.
- Keine Echtdaten in Tests, Demo und Doku.
- i18n: jeder neue Text in `de` und `en`.
- Ansichten ohne Datenroot-Annahmen; leere Klassen duerfen nicht brechen.

## Review-Fokus (Eingaben, die kein Spec-Satz nennt)

1. Darlehen ohne Restschuld-Anker → Karte und Detail zeigen „fehlt", kein Absturz, kein Plan.
2. Immobilie ohne Marktwert / ohne Darlehen / ohne Buchungen → Kennzahlen „—", Monatsdiagramm leer mit Hinweis.
3. Rate deckt den Zins nicht (Tilgung ≤ 0) → Plan endet an `laufzeit_bis`, keine Endlosschleife.
4. Abgeloestes Darlehen / verkaufte Immobilie → nicht in Karten, alte Deep-Links fallen auf den Tab zurueck.
5. Alte Routen `#/vermoegen/<klasse>:<id>` (Checks, Dokumente, Stammdaten) → landen im richtigen Tab.

## Tasks

### 1. Schema Immobilie: `nutzung`, `wohnflaeche`
- `app/schemas/immobilien.schema.json`: `nutzung` enum `selbstgenutzt|vermietet|teilvermietet`, `wohnflaeche` Decimal-String.
- Demo `immobilien.json` bekommt Beispielwerte.
- Test: Validator akzeptiert die Felder, lehnt falsche Werte ab.

### 2. Reine Rechnung `app/vermoegen-details.mjs`
- `darlehensplan(darlehen, zeitwerte, bis)` → `{ anker, raten: [{ datum, zins_cents, tilgung_cents, rest_cents }] } | null`; Rundung wie `restschuldHeute`, Ende bei Rest 0 oder `bis`.
- `restschuldHeute` nutzt `darlehensplan` (gleiche Ergebnisse, bestehende Tests bleiben gruen).
- `darlehenKennzahlen(darlehen, zeitwerte, today)` → Rest heute, getilgt, Zinsen seit Anker, Rest zum Zinsbindungsende, naechste Rate, Zins/Tilgung je Jahr (`ist`-Flag).
- `immobilienKennzahlen(data, id, today)` → Marktwert (Zeitwert), anteiliger Wert, zugeordnete Restschuld + Darlehen-IDs, Eigenkapital, Beleihung, Wertaenderung seit Anschaffung.
- `immobilienMonate(data, id, today, { anzahl = 12, ohneKategorien = [] })` → Monate (abgeschlossen), Kategorien mit Monatswerten, Einnahmen, Ausgaben, Saldo; Transfers raus.
- `darlehensKategorien(data, darlehenIds)` → Kategorien der Regelzahlungen dieser Darlehen (fuer „ohne Darlehensrate").
- `kontoSaldoVerlauf(data, konto, today, monate = 12)` → Monatsend-Salden rueckgerechnet vom aktuellen Stand.
- Tests: `tests/vermoegen-details.test.mjs` inkl. Review-Fokus 1–3.

### 3. Dokumente je Objekt (`app/belege.mjs`)
- `dokumenteZuObjekt({ dateien, index, ids })` → Pfade im Objektordner `Belege/<Klasse>/<ID>_…` plus Verweise aus `quelle_hinweis`; ohne Zwillinge, neueste zuerst.
- `routeFuerDatensatz` liefert die neuen Routen.
- Tests in `tests/belege.test.mjs`.

### 4. Diagramme (`app/charts.mjs`)
- `monatsBalken({ monate, einnahmen, ausgaben, saldo, formatWert, formatMonat })` → SVG: Einnahmen nach oben, Ausgaben nach unten, Saldo-Linie.
- `restschuldVerlauf({ punkte, heute, zinsbindungBis, belegte, formatWert })` → SVG: Ist durchgezogen, Plan gestrichelt, Marker.
- `jahresBalken({ jahre, formatWert })` → gestapelte Zins/Tilgung.
- Tests: Geometrie/Klassen in `tests/charts.test.mjs`.

### 5. Routing und Zustand
- Tabs `uebersicht|konten|immobilien|darlehen|sonstige`; `state.vermoegenTab`, `state.immobilieOhneRate`.
- `#/vermoegen/<tab>[/<ID>]`; Altform `<klasse>:<id>` abbilden, `vorsorge:<id>` → Vorsorge-Seite.
- `vermoegenFilters`/`vermoegenSort` und Filter-Handler entfallen.
- Tests: `tests/routing.test.mjs` angepasst und erweitert (Review-Fokus 5).

### 6. Ansicht `app/views/vermoegen.mjs`
- Kopf (Nettovermoegen-Balken, Lueckenliste), Tab-Leiste, je Tab der Inhalt laut Spec.
- Konten-Tab: `renderAccountPanels({ rowAction: "select-vermoegen-konto" })` + Rail mit `renderVermoegenDetail` und Saldoverlauf.
- Uebersicht: Klassenkarten, Vorsorge-Karte verweist auf die Vorsorge-Seite, „Alle Wertstaende" oeffnet die bestehende Rail.
- `renderVermoegenDetail` bleibt exportiert (Stammdaten nutzt es).
- i18n-Schluessel, CSS (Tabs, Karten, Kennzahlen-Raster, Diagramme), Dokumente nachladen ueber `belegeBeiBedarfLaden`.
- Tests: View-Tests (Tabs, Punkt bei Luecken, kein Vorsorge-Tab, „Sonstige" nur mit Daten, Review-Fokus 1/2/4), `ui-layout-contract` und Alt-Tests an das neue Layout anpassen.

### 7. Abschluss
- `npm test` gruen, Sichtpruefung im Browser (Demo, hell/dunkel, schmal), Diff auf Echtdaten greppen, PR.
