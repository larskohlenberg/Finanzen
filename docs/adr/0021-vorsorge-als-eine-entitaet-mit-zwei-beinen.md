# Vorsorge als eine Entität mit zwei Beinen

M7 erfasst Versicherungen und Renten. Der Meilenstein-Wortlaut („Versicherungen und
Renten haben **eigene Schemas**") und das CONTEXT-Glossar (zwei getrennte Lebenszyklen:
Versicherung `aktiv|gekuendigt|ruhend`, Rente `geplant|laufend|beendet`) legen zwei
getrennte Entitäten nahe. Das bricht aber an einem realen Fall: ein **einzelner Vertrag**
(private Rentenversicherung, Riester) hat **heute einen Rückkaufswert** *und* zahlt **später
eine Rente** — bei zwei Entitäten müsste man ihn doppelt pflegen.

**Entscheidung:** **Eine** Entität `vorsorge` (Oberbegriff über Versicherungen *und*
Renten), mit einer beschreibenden `art` und **bis zu zwei unabhängigen Beinen** — exakt das
schon etablierte Zwei-Beine-Muster der M6-`Annahme`:

- **Bilanz-Bein** — ein heutiger **Rückkaufswert** (Zeitwert `feld = rueckkaufswert`), der
  als Aktivum ins Nettovermögen zählt. Treiber der Aufnahme ist das Klassifikations-Merkmal
  `kapitalbildend` (= **heute realisierbarer, dem Halter gehörender Kapitalwert**), **nicht**
  die `art` — das löst die bAV-Kante (Direktversicherung mit Rückkaufswert vs. Direktzusage
  ohne). `kapitalbildend` ohne Zeitwert ⇒ sichtbare Lücke; `!kapitalbildend` ⇒ nie eine
  Position.
- **Income-Bein** — eine **erwartete Leistung** (Zeitwerte `erwartete_rente`,
  `erwartete_kapitalleistung`), die **nie** ins Nettovermögen zählt (eine **Anwartschaft**
  ist kein heutiges Vermögen) und nur in Szenarien als künftige Regelzahlung/Einmalzahlung
  wirkt.

Beide Beine sind unabhängig: gesetzliche Rente = nur Income-Bein; Risikolebensversicherung =
nur Income-Bein (Todesfallsumme), `!kapitalbildend`; reine Schutzversicherung = kein Bein
(nur Beitrags-Regelzahlung). Die zwei Lebenszyklen bleiben als `status`-Wertebereiche je
`art` erhalten, unter einer Entität.

## Considered Options

- **Zwei Entitäten `versicherungen` + `renten`** (wörtliche Meilenstein-Treue): verworfen,
  weil Hybrid-Verträge (Riester, private RV) doppelte Pflege und Sync-Last erzeugen würden —
  gegen „keine Enterprise-Patterns, privates Projekt". Der Meilenstein-Wortlaut „eigene
  Schemas" wird entsprechend auf „eigenes Schema für den Vorsorge-Cluster mit
  `art`-Diskriminator" entschärft.
- **Nettovermögens-Aufnahme über eine `art`-Liste** (`KAPITAL_VORSORGE`): verworfen
  zugunsten des expliziten `kapitalbildend`-Merkmals, weil die bAV nicht einheitlich
  kapitalbildend ist und eine Art-Liste bei jedem neuen Vertragstyp nachzupflegen wäre.

## Consequences

- Beitrag und *laufende* Leistung sind **Regelzahlungen** (live in der Szenario-Basis),
  verknüpft **einseitig** über `Regelzahlung.vorsorge_id` (wie `darlehen_id`).
- *Geplante* Anwartschaften fließen über eine neue Annahme-Art `vorsorge-leistung` ein, die
  den `erwartete_*`-Zeitwert zur Rechenzeit auflöst und die Qualität nach `geprueft_am`
  deckelt.
- Bei Auszahlung (Fälligkeit oder Tod) baut eine Gegenbuchung `ziel_typ: vorsorge` den
  Rückkaufswert ab — sonst Doppelzählung.
