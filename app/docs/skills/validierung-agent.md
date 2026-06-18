# Skill: Validierungs-Agent

Betriebsanweisung fuer das Klaeren von Masterdaten-Validierungsfehlern. Die App
zeigt den Fehlerstatus, aber die Korrektur laeuft agentisch im App-Raum.

Alle Pfade in diesem Skill sind app-relativ: `data/...`, `schemas/...`,
`tools/...` und `docs/...` liegen unter dem App-Raum.

## Wann diesen Skill nutzen

Nutze ihn, wenn die App oder der Validator meldet, dass die Masterdaten nicht
valide sind, oder wenn der naechste Arbeitsstatus `Validierungsfehler klaeren`
lautet.

Nicht nutzen fuer:
- Neue Bankdaten importieren -> **import-agent**.
- Kategorisierungsregeln pflegen -> **kategorisierungsregel-pflege**.
- Kategorie-Vorschlaege bestaetigen oder ablehnen -> **kategorisierung-review**.
- Neue Stammdaten fachlich erfassen -> **stammdaten-erfassung-agent**.

## Kontext, den du kennen musst

1. `docs/agent-context.md` - gemeinsame Regeln fuer App-Raum, Validierung,
   Nutzerbestaetigung und Agentenprotokoll.
2. `tools/validator.mjs` - deterministischer Masterdaten-Validator.
3. `schemas/` - Datenvertraege der betroffenen Dateien.
4. Die in der Fehlermeldung genannten Dateien unter `data/master/`.

## Ablauf

1. **Validator ausfuehren.** Starte `node tools/validator.mjs data/master` aus
   dem App-Raum und uebernimm die Fehler nicht aus der UI ungeprueft.
2. **Fehler gruppieren.** Ordne Fehler nach Datei, Schemafeld und Ursache
   (Format, Pflichtfeld, Referenz, Cross-Field-Regel).
3. **Betroffene Daten read-only pruefen.** Lies nur die genannten Dateien und die
   relevanten Schemas. Keine Nebenbaustellen suchen.
4. **Kleinste valide Korrektur vorschlagen.** Erklaere Ursache und konkrete
   Aenderung. Bei fachlichen Entscheidungen (Kategorie, Konto, Person, Betrag,
   Datum, Belegbezug) erst Nutzerbestaetigung einholen.
5. **Nach Bestaetigung schreiben.** Aendere nur die betroffenen Felder oder
   Datensaetze. Keine grossflaechige Normalisierung und keine unrelated cleanup.
6. **Erneut validieren.** `node tools/validator.mjs data/master` muss nach der
   Aenderung erfolgreich laufen.
7. **Protokollieren.** Bei schreibender Korrektur einen Eintrag in
   `data/master/agent_log.jsonl` mit Fehleranzahl, betroffenen Dateien/IDs,
   Korrekturart und Validator-Ergebnis schreiben.

## Besondere Pruefregeln des Validators

Der Validator prueft neben Schema-Konformitaet auch:

- **`matched_regeln`-Invariante:** `matched_regeln` darf nur bei
  `kategorie_herkunft = regel` oder bei `kategorisierung_status = offen` mit
  Regelkonflikt vorhanden sein. Bei `kategorie_herkunft = manuell`,
  `kategorie_herkunft = agent` und `kategorisierung_status = abgelehnt` ist das
  Feld verboten. Der Validator meldet es als Fehler, wenn `matched_regeln` dort
  trotzdem gesetzt ist.
- **Referenzpruefung fuer `matched_regeln`:** Jede ID in `matched_regeln` muss
  in `data/master/kategorisierungsregeln.json` als bekannte Regel existieren.
  Unbekannte IDs sind ein Validierungsfehler.
- **`kommentar`-Pflicht fuer Kategorisierungsregeln:** Jede Regel in
  `kategorisierungsregeln.json` muss einen nicht-leeren `kommentar` haben. Regeln
  ohne Kommentar (oder mit leerem String) schlagen die Validierung fehl.

Wenn der Validator bei einer dieser drei Pruefregeln anschlaegt, erst verstehen,
welche Transaktion oder Regel betroffen ist, dann die kleinstmoegliche Korrektur
vorschlagen (Feld entfernen, ID korrigieren, Kommentar nachpflegen) und nach
Nutzerbestaetigung schreiben.

## Do's

- Validator-Befund als Quelle der Wahrheit verwenden.
- Schema und Daten zusammen lesen; Strukturregeln nicht frei aus dem Kopf
  ableiten.
- Minimal korrigieren: genau der Fehler, der die Validierung bricht.
- Vor fachlichen Schreibentscheidungen fragen.
- Nach jeder Aenderung den Validator laufen lassen.

## Don'ts

- Keine Daten raten, nur damit der Validator gruen wird.
- Keine IDs neu vergeben, wenn eine Referenz gezielt repariert werden kann.
- Keine historischen Transaktionen neu importieren oder duplizieren.
- Keine Kategorisierungsentscheidung nebenbei treffen; dafuer gibt es eigene
  Skills.
- Keine Entwicklungsdokumentation ausserhalb des App-Raums voraussetzen.

## Wo was liegt

| Pfad | Zweck |
| --- | --- |
| `data/master/` | Masterdatenbestand |
| `schemas/` | JSON-Schemas und Datenvertraege |
| `tools/validator.mjs` | Masterdaten-Validator |
| `data/master/agent_log.jsonl` | Lauf-Protokoll fuer schreibende Korrekturen |
