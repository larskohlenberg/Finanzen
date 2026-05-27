# Datenmodell Runde 2

Stand: 26.05.2026

## Leitprinzip

Das Datenmodell trennt Rohdaten, fachliche Masterdaten, Agentenvorschlaege und Auswertungen. Auswertungen werden berechnet, nicht als fuehrende Daten gepflegt.

## Vorgeschlagene Dateien

```text
data/master/personen.json
data/master/konten.json
data/master/kategorien.json
data/master/transaktionen.jsonl
data/master/regelzahlungen.json
data/master/transfers.json
data/master/vermoegen.json
data/master/verbindlichkeiten.json
data/master/immobilien.json
data/master/darlehen.json
data/master/versicherungen.json
data/master/renten.json
data/master/ereignisse.json
data/master/erwerbsstatus.json
data/master/sozialleistungen.json
data/master/annahmen.json
data/master/szenarien.json
data/master/quellen.json
data/master/agentenauftraege.jsonl
data/master/pruefregeln.json
data/master/agentenlaeufe.jsonl
data/master/vorschlaege.jsonl
data/master/checks.json
data/master/warnungen.jsonl
```

## Kernentitaeten

### Person

Pflichtfelder:

- `person_id`
- `name`
- `rolle`
- `status`

Beispiele fuer `rolle`: `P01`, `P02`, `kind`, `haushalt`.

### Konto

Pflichtfelder:

- `konto_id`
- `name`
- `kontotyp`
- `inhaber_person_ids`
- `waehrung`
- `liquiditaetsrelevant`
- `status`

### Kategorie

Pflichtfelder:

- `kategorie_id`
- `name`
- `typ`
- `cashflow_wirkung`
- `lebenshaltung_relevant`
- `status`

### Transaktion

Pflichtfelder:

- `transaktion_id`
- `rohquelle_id`
- `konto_id`
- `buchungsdatum`
- `betrag`
- `waehrung`
- `gegenpartei`
- `verwendungszweck`
- `kategorie_id`
- `kategorisierung_status`
- `cashflow_wirkung`
- `ist_transfer`

Transaktionen sind append-orientiert. Korrekturen erfolgen ueber neue Review-/Aenderungseintraege oder explizite Feldupdates mit Auditspur.

### Regelzahlung

Pflichtfelder:

- `regelzahlung_id`
- `name`
- `richtung`
- `betrag_erwartet`
- `intervall`
- `kategorie_id`
- `person_id`
- `status`

### Quelle

Pflichtfelder:

- `quelle_id`
- `quellentyp`
- `pfad_oder_hinweis`
- `standdatum`
- `erfasst_am`
- `status`

### Vorschlag

Pflichtfelder:

- `vorschlag_id`
- `typ`
- `ziel_entitaet`
- `ziel_id`
- `vorschlag`
- `evidenz`
- `status`
- `umsetzung_status`

Agenten erzeugen Vorschlaege, aber keine stillen finalen Fachentscheidungen.

### Versicherung

Pflichtfelder:

- `versicherung_id`
- `name`
- `versicherungsart`
- `person_id`
- `beitrag_regelzahlung_id`
- `quelle_id`
- `status`

Versicherungen decken Schutz-, Vorsorge- und Vertragslogik ab. Spaetere Leistungen koennen mit Renten oder Ereignissen verknuepft werden.

### Rente

Pflichtfelder:

- `rente_id`
- `person_id`
- `rentenart`
- `beginn`
- `betrag_erwartet`
- `zahlweise`
- `quelle_id`
- `status`

Unsichere Renten duerfen in Szenarien nur mit sichtbar eingeschraenkter Datenqualitaet wirken.

### Immobilie

Pflichtfelder:

- `immobilie_id`
- `name`
- `nutzung`
- `eigentuemer_person_ids`
- `wert`
- `wert_standdatum`
- `quelle_id`
- `status`

Immobilienwerte wirken im Nettovermoegen. Liquiditaetswirkung entsteht nur ueber Ertraege, Kosten, Darlehen und explizite Szenarioannahmen.

### Darlehen

Pflichtfelder:

- `darlehen_id`
- `immobilie_id`
- `schuldner_person_ids`
- `restschuld`
- `zinsbindung_bis`
- `rate_regelzahlung_id`
- `quelle_id`
- `status`

Tilgung und Zinswirkung sollen getrennt auswertbar bleiben.

### Ereignis

Pflichtfelder:

- `ereignis_id`
- `name`
- `person_id`
- `datum_oder_zeitraum`
- `wirkung`
- `quelle_id`
- `status`

Ereignisse bilden z. B. Arbeitsende, Vertragsende, Einmalzahlungen, Auszahlungen oder relevante Familienereignisse ab.

### Erwerbsstatus

Pflichtfelder:

- `erwerbsstatus_id`
- `person_id`
- `gueltig_von`
- `gueltig_bis`
- `einkommensfaktor`
- `szenario_id`
- `status`

Ueberlappende oder fehlende Erwerbsstatus-Zeitraeume muessen Checks erzeugen.

### Sozialleistung

Pflichtfelder:

- `sozialleistung_id`
- `person_id`
- `leistungsart`
- `betrag_erwartet`
- `gueltig_von`
- `gueltig_bis`
- `quelle_id`
- `status`

Sozialleistungen wirken wie regelmaessige oder zeitlich begrenzte Cashflow-Bestandteile.

### Agentenauftrag

Pflichtfelder:

- `auftrag_id`
- `typ`
- `agentenrolle`
- `ziel_entitaet`
- `ziel_id`
- `status`
- `prioritaet`

Agentenauftraege sind Aufgaben, nicht Datenersatz.

### Pruefregel

Pflichtfelder:

- `pruefregel_id`
- `name`
- `ausloeser`
- `agentenrolle`
- `ziel_entitaet`
- `aktiv`
- `status`

Pruefregeln beschreiben wiederholbare Ausloeser fuer Agentenarbeit und Checks.

### Warnung

Pflichtfelder:

- `warnung_id`
- `check_id`
- `betroffene_entitaet`
- `betroffene_id`
- `schweregrad`
- `status`
- `erstellt_am`

Warnungen sind konkrete Befunde aus Checks. Bearbeitungsstatus bleibt getrennt von der Checkdefinition.

## Statuswerte

Fachliche Daten:

- `offen`
- `belegt`
- `geprueft`
- `geschaetzt`
- `inaktiv`

Kategorisierung:

- `offen`
- `vorgeschlagen`
- `bestaetigt`
- `abgelehnt`

Vorschlaege:

- `offen`
- `angenommen`
- `abgelehnt`
- `zurueckgestellt`
- `umgesetzt`

## ID-Konventionen

```text
PER-001
KTO-001
KAT-001
TXN-YYYYMMDD-000001
SRC-YYYYMMDD-001
REG-001
TRF-YYYYMMDD-001
SUG-YYYYMMDD-001
RUN-YYYYMMDD-001
CHK-001
```

## Pruefregeln fuer Runde 2

Mindestens diese Checks gehoeren in die erste Validierung:

- Jede Transaktion referenziert ein vorhandenes Konto.
- Jede Transaktion hat eine Kategorie oder `kategorisierung_status = offen`.
- Jede nicht-neutrale Transaktion hat eine Cashflow-Wirkung.
- Transfers muessen paarweise oder bewusst ungeklaert markiert sein.
- Jede Quelle mit Datei verweist auf einen existierenden Pfad oder ist als extern/manuell markiert.
- Dashboard-Kennzahlen duerfen nur aus validierten Masterdaten berechnet werden.
- Kritische Versicherungen, Renten, Darlehen, Immobilienwerte und Vermoegenswerte brauchen Quelle oder bewusst sichtbaren Schaetzstatus.
- Szenarioergebnisse muessen Datenqualitaet und offene Annahmen anzeigen.
