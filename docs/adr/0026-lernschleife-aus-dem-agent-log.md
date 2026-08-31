# Lernschleife aus dem Agent-Log

Jeder Durchlauf misst sein eigenes Ergebnis gegen die Korrekturen des Nutzers
und zieht Konsequenzen. Zahlen wirken automatisch; Anweisungstext nur nach
Zustimmung.

## Begruendung

`agent_log.jsonl` fuehrte 106 Eintraege mit Qualitaetsdaten — `agent_bestaetigt`,
`agent_korrigiert`, `anzahl_fehler`, `neue_regeln` — und wurde von keinem Lauf
je gelesen. `kategorisierung-review.md` nennt ihn woertlich "die Qualitaetsspur".
Die Luecke war also nie ein fehlender Speicher, sondern ein fehlender
Rueckkanal. Deshalb entsteht hier kein neuer Log; der vorhandene wird
auswertbar.

Korrekturen lassen sich **nicht** nachtraeglich rekonstruieren: `app/data/**`
ist gitignored, es gibt keine History der Transaktionsdatei. Sie werden im
Moment der Korrektur von `confirm.mjs` erfasst, das `matched_regeln` und
`bestaetigt_durch` der ueberschriebenen Buchung ohnehin zur Hand hat.

## Die Trennlinie

**Zahlen sind Daten und wirken automatisch.** Eine Regel mit einer
Korrekturquote ueber 30 % bei mindestens 10 Freigaben legt sich selbst still;
eine Belegstufe ueber 25 % bei mindestens 20 Freigaben verliert die
Auto-Freigabe. Beides ist reversibel, steht im Pruefbericht und aendert nur
einen Datenwert.

**Anweisungstext braucht Zustimmung.** Erkenntnisse ueber die Normalisierung
eines Bankformats sind Anweisungen an kuenftige Laeufe. Sie werden automatisch
als Textvorschlag formuliert, aber nie selbst uebernommen — ein still
veraenderter Anweisungstext waere der einzige Teil des Systems, dessen Fehler
der Nutzer nicht mehr bemerken kann. Eine falsche Kategorie betrifft eine
Buchung; eine falsche Selbstanweisung jeden kuenftigen Lauf.

## Nur Korrekturen an Auto-Freigaben zaehlen

Eine Korrektur an einer menschlich bestaetigten Buchung sagt nichts ueber die
Regelqualitaet aus — dort hat schon jemand hingeschaut und entschieden. Nur das
Ueberschreiben einer Auto-Freigabe ist ein Urteil ueber die Automatik.

## Kein gespeicherter Sperrzustand

Ob eine Belegstufe gesperrt ist, wird bei jedem Lauf neu gerechnet. Der vorige
Zustand kommt aus dem juengsten Freigabe-Eintrag und dient allein der
**Hysterese**: eine gesperrte Stufe faellt erst unter 15 % zurueck, damit sie
nicht bei jedem Lauf zwischen offen und gesperrt springt. Dieselbe Begruendung,
mit der ADR 0018 den persistierten Hit-Count verworfen hat.

## Zu den Schwellenwerten

30/25/15 sind Startwerte. Anders als eine risikobasierte Freigabeschwelle
(verworfen in ADR 0025) messen sie kein Urteil darueber, was eine Buchung
bedeutet, sondern beobachtetes Verhalten gegen eine Grundwahrheit — und sie
steuern eine reversible, sichtbare Aktion. Sobald genug Laeufe vorliegen, sind
sie selbst Gegenstand der Messung.

## Verworfene Alternativen

- **Freitext-Lessons, die der Agent sich selbst schreibt.** Unbegrenztes
  Wachstum, und ein falsch gezogener Schluss verfestigt sich, weil er in jedem
  Folgelauf wieder gelesen wird.
- **Persistierter Zaehler an der Regel.** Muesste bei jedem Eingriff aktuell
  gehalten werden; Aggregation bei Lesezugriff ist deterministisch und aktuell
  (ADR 0018).
- **Maschinenlesbare Importprofile aus den Formaterkenntnissen.** Bereits
  gescheitert: Datumsformate wie `DD.MM.YY` und richtungsabhaengige
  Gegenparteien sind im Profilformat nicht abbildbar, und ADR 0005 verbietet
  bankspezifische Parser ohnehin.

## Konsequenz

- Neues Tool `lernen.mjs` (Bericht; mit `--anwenden` Stilllegung).
- Neue Felder im `agent_log.jsonl`: `freigaben`, `gate_durchfall`,
  `korrekturen`, `normalisierung`.
- `freigabe.mjs` liest die gesperrten Belegstufen und protokolliert sie.
- `pruefbericht.mjs` zeigt die Metriken; der Nutzer sieht sie dort, wo er
  ohnehin hinsieht.
