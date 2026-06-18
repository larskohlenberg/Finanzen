# Regel-Provenance und Erklaerbarkeit

Transaktionen, die durch das Kategorisierungsregelwerk klassifiziert wurden,
tragen ab sofort das Feld `matched_regeln` — eine Liste der Regel-IDs, die beim
Kategorisierungslauf auf die Buchung gepasst haben. Ergaenzend ist `kommentar`
an jeder Kategorisierungsregel Pflichtfeld und muss eine verstaendliche
Erklaerung in normaler Sprache enthalten.

## Begruendung

### Problem: Fehlende Nachvollziehbarkeit

Bisher war aus einer kategorisierten Transaktion nicht ablesbar, *welche* Regel
sie klassifiziert hat. Bei einem Regelkonflikt (mehrere Regeln passen, keine
eindeutige Kategorie) war auch die Konfliktursache nicht direkt sichtbar —
Buchungen blieben `offen`, ohne Hinweis darauf, welche Regeln betroffen waren.

Fuer die Erklaerbarkeit in der App (deterministische Klartextbeschreibung
`regelKlartext`, Beispiel-Gegenparteien, Kommentar) braucht die App den Bezug
Buchung → Regel. Dieser Bezug sollte nicht live aus dem aktuellen Regelwerk
re-abgeleitet werden, weil:

1. Regeln koennen inzwischen geaendert oder deaktiviert worden sein.
2. Nach-Kategorisierung und manuelle Korrekturen koennen den urspruenglichen
   Kategorisierungsgrund ueberschrieben haben.
3. Live-Re-Ableitung skaliert schlechter als ein gespeichertes Feld.

### Entscheidung: Provenance beim Schreiben speichern

`matched_regeln` wird **beim Kategorisierungslauf** (Import via `import.mjs`
oder Nach-Kategorisierung via `recategorize.mjs`) in die Transaktion geschrieben
und nicht nachtraeglich aus dem Regelwerk abgeleitet.

**Invariante:**

- `matched_regeln` ist vorhanden bei `kategorie_herkunft = regel` (eindeutiger
  Treffer) und bei `kategorisierung_status = offen` mit Regelkonflikt (mehrere
  Regeln haben gepasst).
- Ein Konflikt ist ableitbar aus `status = offen` + nicht leerem
  `matched_regeln`.
- `matched_regeln` ist **nicht vorhanden** bei `kategorie_herkunft = manuell`,
  `kategorie_herkunft = agent` oder `kategorisierung_status = abgelehnt`.
  `agent`-Kategorien entstehen ohne Regelwerk; manuelle und abgelehnte
  Entscheidungen sind menschliche Akte und tragen keine Regelherkunft.

Der Validator prueft diese Invariante sowie, dass alle IDs in `matched_regeln`
im Regelbestand existieren.

### Hit-Count und Erklaerbarkeit

Die Haeufigkeit, mit der eine Regel Buchungen getroffen hat (*Hit-Count*), wird
aus `matched_regeln` aggregiert — im App-Speicher zur Laufzeit. Sie wird **nicht**
als eigenes Feld an Regeln persistiert, weil:

- Aggregation bei Lesezugriff ist deterministisch und aktuell.
- Persistierter Zaehler muesste bei jeder Nach-Kategorisierung und jedem
  manuellen Eingriff aktuell gehalten werden — unnoetige Zustandspflege.

Die App zeigt pro Regel: deterministischen Klartext (`regelKlartext`), typische
Gegenparteien aus gematchten Buchungen und den `kommentar`. Damit ist jede Regel
erklaerbar, ohne dass der Nutzer das Suchmuster lesen muss.

`kommentar` ist Pflichtfeld: ein nicht-leerer Text, der erklaert, *warum* die
Regel existiert und was sie semantisch erfasst — **nicht** nur eine Wiederholung
des Musters. Der Validator erzwingt dies; Regeln ohne Kommentar schlagen fehl.

### Beziehung zu ADR 0017

ADR 0017 hat die verworfene Alternative „Regel-Provenienz pro Buchung speichern"
mit dem Argument abgelehnt, dass nur ein *Bit* Herkunft noetig sei. Diese ADR
revidiert diesen Punkt: mit der Anforderung Erklaerbarkeit (Konflikt-Sichtbarkeit,
Hit-Count-Aggregation, App-seitige Regelanzeige) ist das Feld `matched_regeln`
der kleinste ausreichende Zustand. Das Herkunfts-*Bit* (`regel | manuell`) aus
ADR 0017 bleibt erhalten; `matched_regeln` ergaenzt es.

### Backfill

Bestehende Buchungen ohne `matched_regeln` erhalten das Feld beim naechsten
`recategorize.mjs`-Lauf. Buchungen mit `kategorie_herkunft = manuell`, `agent`
oder `kategorisierung_status = abgelehnt` werden vom Tool nicht angefasst und
erhalten das Feld nicht.

## Konsequenzen

- Neues optionales Feld `matched_regeln: string[]` am Transaktions-Schema; der
  Validator prueft die Invariante und die Referenzintegritaet.
- `import.mjs` und `recategorize.mjs` schreiben `matched_regeln` bei jedem
  Kategorisierungslauf.
- Manuelle Korrekturen und Ablehnungen im Review-Skill entfernen `matched_regeln`.
- `kommentar` wird Pflichtfeld in `schemas/kategorisierungsregeln.schema.json`;
  der Validator schlaegt an, wenn eine Regel keinen Kommentar hat.
- Regeln werden ausschliesslich ueber den Skill **kategorisierungsregel-pflege**
  angelegt und bearbeitet; Import- und Review-Skills delegieren dorthin.
- Die App aggregiert Hit-Counts zur Laufzeit aus `matched_regeln`; kein
  persistierter Zaehler an Regeln.
