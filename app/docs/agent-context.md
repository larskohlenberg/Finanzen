# Agent Context

Gemeinsame Betriebsgrundlage fuer Agentenarbeit im deploybaren App-Raum.

## App-Raum

Der fuehrende Betriebsraum ist `app/`. Alle produktiven Pfade in Agenten-Skills
sind app-relativ:

- `data/master/...` fuer Masterdaten.
- `data/inbox/...` fuer Import-Eingang, Zwischenstaende, verarbeitete Dateien und Fehler.
- `schemas/...` fuer Datenvertraege.
- `tools/...` fuer deterministische Betriebstools.
- `Belege/...` fuer abgelegte Quellen und Rohdokumente.
- `docs/skills/...` fuer workflow-spezifische Betriebsanweisungen.

Die App liest Daten, validiert und zeigt Arbeitsstaende. Sie schreibt keine
Masterdaten. Schreibende Aenderungen laufen ueber Agenten und Betriebstools.

## Arbeitsprinzipien

- Agenten schreiben nur gegen Schemas und nach Validierung.
- Tools rechnen deterministisch; Agenten rufen Tools auf und interpretieren deren
  Bericht.
- Keine stille finale Fachentscheidung: unsichere Fakten bleiben offen oder werden
  dem Nutzer als Vorschlag vorgelegt.
- Nutzerentscheidungen und Agentenvorschlaege bleiben getrennt.
- Nach jedem schreibenden Lauf wird der Validator ausgefuehrt.
- Jeder schreibende Lauf wird in `data/master/agent_log.jsonl` mit Zaehlern,
  betroffenen IDs und kurzer Notiz protokolliert.

## Statuslogik

Statuswerte sind entitaetsspezifisch. Fuer Transaktionen gilt:

- `offen`: keine eindeutige Kategorie aus dem Regelwerk; kein `kategorie_id`.
- `vorgeschlagen`: ein Tool oder Agentenprozess hat einen Vorschlag erzeugt; der
  Nutzer muss bestaetigen, korrigieren oder ablehnen.
- `bestaetigt`: die Kategorie ist fachlich bestaetigt.
- `abgelehnt`: ein Vorschlag wurde bewusst verworfen und bleibt unangetastet.

Fuer Regelzahlungen gilt analog:

- `vorgeschlagen`: wartet auf Nutzerentscheidung und wirkt nicht auf die Prognose.
- `bestaetigt`: wirkt auf die Liquiditaetsprognose.
- `abgelehnt`: bewusst verworfen.

## Kategorisierung und Herkunft

Eine Transaktion kann eine Kategorie aus zwei Herkuenften haben:

- `kategorie_herkunft = regel`: Kategorie stammt aus dem deterministischen
  Regelwerk.
- `kategorie_herkunft = manuell`: Kategorie stammt aus einer ausdruecklichen
  Nutzerentscheidung im Agentendialog.

Nach-Kategorisierung bewertet offene Transaktionen und regelbasierte Eintraege neu.
Manuelle Kategorien und abgelehnte Vorschlaege bleiben unangetastet. Widerspricht ein
neuer Regelstand einer bestaetigten regelbasierten Kategorie, wird die Transaktion
als Wiedervorlage sichtbar gemacht statt still ueberschrieben.

Nach-Kategorisierung laeuft ueber `tools/recategorize.mjs`. Reimport ist kein Mittel
zur Nach-Kategorisierung, weil bekannte Buchungen per Dedupe uebersprungen werden.

## Validierung und Tools

Validierung ist deterministischer Code. Agenten fuehren Validierung aus, statt
Strukturregeln frei zu interpretieren.

Wichtige Tools:

- `tools/validator.mjs`: Masterdaten pruefen.
- `tools/import.mjs`: normalisierte Buchungen importieren.
- `tools/categorizer.mjs`: Kategorisierungsregeln anwenden.
- `tools/recategorize.mjs`: Bestand nach Regelaenderungen neu bewerten.
- `tools/transfer-matcher.mjs`: interne Transfers paaren.

## Zeitwerte, Anker und Reconciliation

Zeitveraenderliche, beleg- oder schaetzbasierte Werte leben in
`data/master/zeitwerte.jsonl`. Beispiele sind Kontostand, Depotwert, Marktwert und
Restschuld.

Konto-Salden und Darlehen-Restschulden brauchen belegte Ankerpunkte, wenn die
Historie nicht vollstaendig garantiert ist. Laufende Werte werden aus Anker plus
Bewegungen oder Tilgung berechnet. Aufeinanderfolgende belegte Staende werden
reconciled; Abweichungen werden als Checks sichtbar und nicht still korrigiert.

## Regelzahlungen und Prognose

Regelzahlungen beschreiben wiederkehrende erwartete Zahlungen. Nur bestaetigte
Regelzahlungen wirken auf die Liquiditaetsprognose. Einmaleffekte und hypothetische
Szenarien werden nicht als bestaetigte Regelzahlungen modelliert.

Bekannte Stufenaenderungen werden als zwei Regelzahlungen modelliert: die alte mit
`aktiv_bis`, die neue mit eigenem `anker_datum`.

## Belege

Belege werden sprechend benannt und unter `Belege/` abgelegt. Datenfelder wie
`rohquelle` und `quelle_hinweis` zeigen auf den finalen App-relativen Belegpfad.
