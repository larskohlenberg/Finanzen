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

Statuswerte sind entitaetsspezifisch. Fuer `kategorisierung_status` an
Transaktionen gilt:

- `offen`: keine eindeutige Kategorie aus dem Regelwerk; kein `kategorie_id`.
- `vorgeschlagen`: ein Tool oder Agentenprozess hat einen Vorschlag erzeugt; der
  Nutzer muss bestaetigen, korrigieren oder ablehnen.
- `bestaetigt`: die Kategorie ist fachlich bestaetigt.
- `abgelehnt`: ein Vorschlag wurde bewusst verworfen und bleibt unangetastet.

Fuer Regelzahlungen gilt analog:

- `vorgeschlagen`: wartet auf Nutzerentscheidung und wirkt nicht auf die Prognose.
- `bestaetigt`: wirkt auf die Liquiditaetsprognose.
- `abgelehnt`: bewusst verworfen.

## Transaktions-ID und Deduplikation

`transaktion_id` ist eine opake ID im Format `TXN-<uuid>`. Sie enthaelt keine
Datums-, Konto- oder Sequenzbedeutung.

Jede Transaktion hat einen `dedupe_hash`. Wenn die Bank eine eindeutige
`bank_referenz` liefert, basiert der Hash auf `(konto_id, bank_referenz)`. Fehlt
`bank_referenz` oder ist sie nicht verwendbar, basiert der Hash auf `(konto_id,
buchungsdatum, betrag, gegenpartei, verwendungszweck)`.

Freitextfelder werden fuer den Hash nur leicht normalisiert: trimmen und
Whitespace kollabieren. Keine Kleinschreibung, kein Entfernen von Sonderzeichen.

`bank_referenz` wird nur als Schluessel genutzt, wenn sie im Importlauf dateiweit
eindeutig ist. Andernfalls faellt der Import auf den Freitext-Hash zurueck und
persistiert keine irrefuehrenden nicht-eindeutigen Referenzen als Schluesselmaterial.

Dedupe prueft gegen den bestehenden Bestand, nicht innerhalb desselben Auszugs.
Gleich aussehende Zeilen in einem amtlichen Auszug sind reale Buchungen und
bekommen deterministisch disambiguierte Hashes.

## Kategorisierung und Herkunft

Eine Transaktion kann eine Kategorie aus drei Herkuenften haben:

- `kategorie_herkunft = regel`: Kategorie stammt aus dem deterministischen
  Regelwerk.
- `kategorie_herkunft = agent`: Kategorie stammt aus einem plausiblen
  Einzelvorschlag des Agenten ohne Regel.
- `kategorie_herkunft = manuell`: Kategorie stammt aus einer ausdruecklichen
  Nutzerentscheidung im Agentendialog.

Der Agent darf offene Einzelbuchungen eigenstaendig als `vorgeschlagen` mit
`kategorie_herkunft = agent` vorbereiten. Das ist keine finale Fachentscheidung,
sondern Review-Vorbereitung; Bestaetigung, Korrektur oder Ablehnung bleiben
Nutzerentscheidung.

Nach-Kategorisierung bewertet offene Transaktionen und regelbasierte Eintraege neu.
Agenten-Einzelvorschlaege, manuelle Kategorien und abgelehnte Vorschlaege bleiben
unangetastet. Widerspricht ein neuer Regelstand einer bestaetigten regelbasierten
Kategorie, wird die Transaktion als Wiedervorlage sichtbar gemacht statt still
ueberschrieben.

Bei Bestaetigung bleibt die Herkunft erhalten: `regel` bleibt `regel`, `agent`
bleibt `agent`. Nur wenn der Nutzer eine andere Kategorie nennt oder direkt eine
Kategorie diktiert, wird `kategorie_herkunft = manuell` gesetzt.

### matched_regeln — Provenance-Feld

Transaktionen koennen ein optionales Feld `matched_regeln: ["REG-…", …]` tragen.
Es enthaelt die IDs aller Regeln, die beim Kategorisierungslauf auf die Buchung
gepasst haben. Das Feld wird **beim Import oder bei der Nach-Kategorisierung
geschrieben**, nicht nachtraeglich aus dem aktuellen Regelwerk berechnet.

**Invariante:**

- `matched_regeln` ist **immer vorhanden** bei `kategorie_herkunft = regel`
  (eindeutiger Treffer) und bei `kategorisierung_status = offen` mit
  mindestens einem Treffer (Regelkonflikt: mehrere Regeln haben gepasst, aber
  keine eindeutige Kategorie ergab sich).
- Ein Konflikt ist **ableitbar** aus `status = offen` + nicht leerem
  `matched_regeln`.
- `matched_regeln` ist **niemals vorhanden** bei `kategorie_herkunft = manuell`,
  `kategorie_herkunft = agent` oder `kategorisierung_status = abgelehnt`.
- Die IDs in `matched_regeln` muessen in `data/master/kategorisierungsregeln.json`
  existieren; der Validator prueft dies.

Qualitaet von Agenten-Einzelvorschlaegen wird ueber strukturierte Zaehler im
`agent_log.jsonl` beobachtet, nicht ueber ein Historienfeld an der Transaktion.
Wenn ein Agenten-Vorschlag korrigiert wird, zaehlt der Review-Lauf diese
Korrektur; die Transaktion selbst traegt danach nur den fachlichen Zielzustand.

Nach-Kategorisierung laeuft ueber `tools/recategorize.mjs`. Reimport ist kein Mittel
zur Nach-Kategorisierung, weil bekannte Buchungen per Dedupe uebersprungen werden.

## Validierung und Tools

Validierung ist deterministischer Code. Agenten fuehren Validierung aus, statt
Strukturregeln frei zu interpretieren.

Wichtige Tools:

- `tools/validator.mjs`: Masterdaten pruefen.
- `tools/import.mjs`: normalisierte Buchungen importieren.
- `tools/dedupe.mjs`: Transaktions-Dedupe-Hash bilden.
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
