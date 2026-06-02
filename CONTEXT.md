# Context

Glossar der fachlichen Begriffe. Keine Implementierungsdetails, keine Schemas, keine Entscheidungen — nur die Sprache.

## Person

Eine natuerliche Person mit eindeutiger Identitaet (`person_id`). Reine Identitaetsentitaet: keine Rollen wie "Kind", "Erwachsen" oder "Haushalt". Lebensphasen werden ueber Ereignisse und Erwerbsstatus abgebildet, nicht ueber ein Rollenfeld.

## Konto

Bankkonto oder Depot. Hat eine **Inhaberliste** (`inhaber_person_ids`) — alle Inhaber sind **gleichberechtigt**, ohne Quoten. Begruendung: die Bank kennt keine wirtschaftlichen Quoten an einem Konto; ein Gemeinschaftskonto ist gemeinschaftlich.

## Kontoreferenz

Eine externe, vom Anbieter vergebene, bevorzugt maskierte Kennung eines Kontos oder Depots, z. B. IBAN-Endziffern, Depotnummer-Endziffern oder eine maskierte Depotnummer. Sie dient der Wiedererkennung durch Nutzer und Agenten, nicht der Berechnung; vollstaendige IBANs oder Depotnummern gehoeren nur in die Quelle, nicht in den Masterdatensatz.

## Immobilie

Hat **Eigentumsanteile** mit Quoten (`eigentumsanteile: [{person_id, anteil}]`, Summe = 1). Anders als beim Konto, weil hier reale, ungleiche Eigentumsverhaeltnisse existieren (Beispiel: 2/3 zu 1/3 im Grundbuch).

## Haushalt

**Kein Konzept im Modell.** Aggregation "Familie/Haushalt" entsteht ausschliesslich als View (alle Konten zusammen, gefiltert nach Kategorie), nicht als Entitaet. Begruendung: ein Ehepaar + Kinder braucht keine zusaetzliche Aggregationsentitaet; Gemeinschaftskonten erledigen das durch ihre Inhaberliste.

## Stammdaten

Relativ stabile Bezugsdaten des Finanzmodells, z. B. Personen, Konten und Kategorien. Sie werden selten geaendert und geben **Bewegungsdaten** ihren fachlichen Rahmen.

## Bewegungsdaten

Regelmaessig hinzukommende kontobezogene Ereignisdaten, z. B. **Transaktionen** und **Transfers**. Sie werden gegen **Stammdaten** referenziert und sind der primaere Gegenstand von Review und Import.

## Cashflow-Traeger

Wirtschaftlicher Traeger einer Transaktion folgt dem **Konto**, nicht der Person. Keine fiktive Quotenverteilung pro Buchung. "Wer hat das bezahlt" beantwortet sich ueber die Inhaberliste des Kontos.

## Transaktions-ID und Deduplikation

`transaktion_id` ist menschenlesbar und sequenziell: `TXN-YYYYMMDD-000001`. Zusaetzlich traegt jede Transaktion einen `dedupe_hash`. Beim Import prueft die Import-Pipeline, ob der Hash bereits existiert; wenn ja, wird der Datensatz uebersprungen.

Der Hash wird **zweistufig** gebildet (siehe ADR 0007):
- Liefert die Bank eine eindeutige Buchungsnummer (`bank_referenz`, z. B. Ende-zu-Ende-ID), basiert der Hash **nur** auf `(konto_id, bank_referenz)`. Das ist die staerkste Eindeutigkeit und ueberlebt Umformatierungen des Verwendungszwecks zwischen zwei Exports.
- Fehlt `bank_referenz`, basiert der Hash auf `(konto_id, buchungsdatum, betrag, gegenpartei, verwendungszweck)`.

Die Freitextfelder `gegenpartei` und `verwendungszweck` werden vor dem Hash **leicht normalisiert** (trim, Mehrfach-Whitespace kollabieren) — aber **nicht** lowercased oder von Sonderzeichen befreit. Begruendung: zu starke Normalisierung wuerde knapp verschiedene Buchungen verschmelzen und damit echte Buchungen still verschlucken — der schlimmste Fehlerfall.

Wenn eine Bank `bank_referenz` nicht stabil ueber Re-Exports vergibt, laesst der Agent das Feld bewusst weg, damit der Freitext-Hash greift. Das ist ein Pruefpunkt beim ersten Import einer neuen Bank.

Banken liefern Auszuege in unterschiedlichen Formaten — die Normalisierung in die Standardform ist Aufgabe des Import-Agenten, nicht des Datenmodells.

## Transaktion

 Buchung auf einem Konto. Hat immer einen `kategorisierung_status` (`offen | vorgeschlagen | bestaetigt | abgelehnt`). Die `kategorie_id` ist **optional**: nur wenn der Status `bestaetigt` ist, muss eine Kategorie gesetzt sein. Transaktionen mit offener Kategorie werden nicht ueber eine Pseudo-Kategorie versteckt — sie sind als **Kategorie offen** sichtbar.

Kein separates Feld `cashflow_wirkung` an der Transaktion. Die Wirkung ergibt sich aus dem Vorzeichen des `betrag`-Feldes plus dem Flag `ist_transfer` (Transfers sind cashflow-neutral). Die Kategorie steuert die fachliche Klassifikation, nicht das Vorzeichen.

## Kategorisierung

Zustand einer Transaktion bezueglich ihrer Kategorie. Agent schreibt seinen Tipp direkt in `kategorie_id` und setzt `kategorisierung_status = vorgeschlagen`. Im Review-Flow geht der Nutzer Buchung fuer Buchung durch — bestaetigt (`status = bestaetigt`) oder korrigiert die Kategorie. Es gibt **keine** separate `vorschlaege.jsonl`-Datei und keine zweite Kategorie-Spalte fuer Vorschlaege. Ein Feld, ein Status.

Korrekturen sind in-place Updates — eine Kategorie aendern heisst: ueberschreiben. Die Git-History ist Spur genug; kein Audit-Log, keine Versionierung.

## Daten und Zeitstempel

Reine Datumswerte (`buchungsdatum`, `standdatum`, `aktiv_bis`): ISO 8601 Date-only, `YYYY-MM-DD`. Keine Zeit, keine Zeitzone.

Zeitstempel (z. B. `zeitpunkt` im Agent-Lauf-Log): ISO 8601 mit lokalem Offset, z. B. `2026-05-27T03:15:00+02:00`. Lokale Zeit, weil im privaten Setup nur eine Zeitzone relevant ist und Lesbarkeit vor UTC-Sauberkeit geht.

## Betraege

Auf der Platte: Decimal-String mit exakt zwei Nachkommastellen, z. B. `"betrag": "-123.45"`. Schema-Pattern `^-?\d+\.\d{2}$`.

Intern in Code: Cent-Integer. Konvertierung an genau zwei Stellen (Reader, Writer); im Rest des Codes nur Integer-Arithmetik. Damit keine Float-Precision-Bugs in Summen oder Paarungs-Checks.

## Geladener Saldo und Kontostand

**Geladener Saldo** ist die Summe der aktuell geladenen Transaktionen fuer ein Konto oder eine Kontenauswahl. Er ist eine Review-Kennzahl und kein bankbestaetigter Kontostand.

**Kontostand** bezeichnet einen belegten Stand eines Kontos zu einem bestimmten Datum, typischerweise aus Bank- oder Depotunterlagen. In M2 wird der Begriff in der UI vermieden, solange nur Demo- oder Teildaten geladen sind.

## Waehrung

Alle Betraege in EUR. Kein `waehrung`-Feld an Konto oder Transaktion. Sollte spaeter ein Fremdwaehrungskonto auftauchen, wird das gezielt nachgeruestet — bis dahin: YAGNI.

## Status und Lebenszyklus

Statuswerte sind **pro Entitaet** spezifisch — kein einheitliches Vokabular ueber alle Entitaeten. Beispiele:
- Person: `aktiv | inaktiv`
- Konto: `aktiv | geschlossen`
- Kategorie: `aktiv | inaktiv`
- Immobilie: `aktiv | verkauft`
- Versicherung: `aktiv | gekuendigt | ruhend`
- Darlehen: `aktiv | abgeloest`
- Rente: `geplant | laufend | beendet`

Statuswechsel mit Zeitbezug: Feld `aktiv_bis` (optional, Datum). Wenn gesetzt und in der Vergangenheit, gilt die Entitaet fuer **neue** Zuordnungen als inaktiv; **bestehende** Verweise (z. B. Altbuchungen auf eine inaktive Kategorie) bleiben gueltig.

## Zeitwerte

Werte mit zeitlichem Bezug, die **nicht aus Transaktionen berechenbar** sind, leben in einer zentralen `data/master/zeitwerte.jsonl`:

```
{entitaet, entitaet_id, feld, wert, standdatum, qualitaet, quelle_hinweis}
```

Anwendungsfaelle: Immobilien-Marktwert, Depotwert, erwartete Rente, Rueckkaufswert Versicherung. Aktueller Wert = neuester Eintrag pro `(entitaet_id, feld)`. Verlauf entsteht durch Anhaengen, nicht durch Ueberschreiben — weil **git als Audit-Spur nicht zaehlt**: die App soll spaeter standalone ohne Git laufen.

Werte, die berechenbar sind (Konto-Saldo, Darlehen-Restschuld, Nettovermoegen), gehoeren **nicht** in `zeitwerte.jsonl` — sie werden in der App berechnet.

`qualitaet`: `belegt | geschaetzt`. Datenqualitaet ist immer am einzelnen Wert, nie an der Entitaet.

## Validierung

**Das Tool prueft, der Agent schreibt.** Validierung ist deterministischer Bibliothekscode (JSON Schema + Cross-Field-Regeln), kein Agent-Verhalten. Dieselbe Bibliothek laeuft im Browser (App) und unter Node (Cron). Agenten rufen sie **vor** jedem Schreiben auf; die App ruft sie **beim Laden** auf und zeigt Status an. Defense-in-depth.

Konsequenz: Validator-Bibliothek ist Voraussetzung fuer M1 und vor M3 unabdingbar.

## Agent-Lauf-Log

Eine `data/master/agent_log.jsonl`. Pro Lauf ein strukturierter Eintrag plus Freitext-Notiz:

```
{zeitpunkt, anlass, inputs[], anzahl_importiert, anzahl_offen, anzahl_fehler, notiz, betroffene_ids[]}
```

Zweck: dem **naechsten Nutzer der App** (Mensch oder Agent in neuer Session) eine Uebergabe geben. Kein Compliance-Log. Strukturierte Zaehler fuer Dashboard, Freitext fuer Kontext.

## Inbox-Konvention

Cron-Agent verarbeitet Dateien aus `data/inbox/`. Nach erfolgreichem Import: Verschieben nach `data/inbox/processed/`. Bei Fehler: nach `data/inbox/error/` plus Begleitdatei mit Fehlermeldung. Dateisystem ist die Wahrheit darueber, was schon verarbeitet wurde — keine zweite "Schon-gelesen"-Liste.

## Quelle

Keine eigene Entitaet. Quellen leben als Felder direkt am Datensatz:
- **Transaktion**: `rohquelle` (Pfad zur Import-Datei) ist Pflicht — fuer Deduplikation und Nachvollziehbarkeit beim Import.
- **Stammdaten** (Immobilie, Darlehen, Versicherung, Rente, Sozialleistung): optionales `quelle_hinweis` (Pfad oder Freitext) plus optionales `quelle_standdatum`.

Keine `quellen.json`. Wenn dasselbe PDF an mehreren Stellen referenziert wird, steht der Pfad mehrfach — das ist akzeptiert, weil es keinen echten Pflegeaufwand erzeugt.

## Kategorisierungsregel

Stammdatensatz in `data/master/kategorisierungsregeln.json`. Ordnet eingehenden Transaktionen anhand von Mustern (z. B. Substring in `gegenpartei` oder `verwendungszweck`, optional gefiltert auf `konto_id`) eine `kategorie_id` zu. Wird beim Import von einem deterministischen Tool ausgewertet — der Agent ruft das Tool, das Tool matcht, der Agent uebernimmt das Ergebnis.

Bei Treffer setzt der Importer `kategorisierung_status = vorgeschlagen` und die `kategorie_id`. Bei Konflikt (zwei Regeln, unterschiedliche Kategorien) bleibt die Transaktion `offen` — Mehrdeutigkeit wird sichtbar gemacht, nicht stillschweigend per Reihenfolge entschieden.

## Standardisiertes Importformat

Zwischenformat zwischen Rohdatei (CSV, PDF, MT940 …) und dem finalen Transaktionseintrag. Liegt unter `data/inbox/` und enthaelt die normalisierten Felder einer Buchung in einer JSONL-Form, gegen die der Validator laeuft. Die Normalisierung aus dem Bank-Rohformat ist Aufgabe des Agenten, nicht des Modells — **es gibt keine bankspezifischen Parser im Code**, weil Bankformate sich ohne Vorwarnung aendern und der Agent gut im Normalisieren ist.

## Transfer

Geldbewegung zwischen zwei Stellen, die im Cashflow **nicht** als Ausgabe/Einnahme zaehlt. Modelliert als eigener Datensatz in `transfers.json`, der eine Bank-Transaktion mit ihrer Gegenseite verbindet.

Zwei Auspraegungen:
- **Interner Transfer**: beide Seiten sind Transaktionen im Modell (z. B. Giro → Immobilienkonto). Der Transfer-Datensatz verweist auf beide `transaktion_id`s. Betraege gegenlaeufig.
- **Externer Transfer**: nur eine Seite ist eine Transaktion (z. B. Bargeldabhebung, die einer Person ausserhalb des Modells gegeben wird). Der Transfer-Datensatz hat genau eine `transaktion_id` plus `gegenseite_typ` (z. B. `bar`, `extern_familie`) und eine **Pflicht-Begruendung**.

Pruefregel: jede Transaktion mit `ist_transfer = true` referenziert einen Transfer-Datensatz; der Transfer ist entweder paarweise vollstaendig ODER explizit als extern markiert. Bargeld-Ausgaben werden bewusst nicht als interne Transfers verfolgt — sie sind ein akzeptierter blinder Fleck.
