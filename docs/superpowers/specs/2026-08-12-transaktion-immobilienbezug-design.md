# Optionaler Immobilienbezug fuer Transaktionen

**Datum:** 2026-08-12  
**Status:** Freigegeben

## Problem

Darlehen koennen bereits eine Immobilie referenzieren, einzelne gebuchte Kosten
und Ertraege dagegen nicht. Dadurch laesst sich nicht belastbar erkennen, welche
Transaktionen zu welchem Objekt gehoeren. Die Kategorie kann diese Beziehung
nicht ersetzen: Dieselbe Kategorie kann mehrere Immobilien und nicht
objektbezogene Buchungen enthalten.

## Ziel und Umfang

Eine Transaktion kann optional genau einer Immobilie zugeordnet werden. Der Bezug
wird validiert, in der Detailansicht gezeigt und ueber die vorhandene
Transaktionssuche anhand der Immobilien-ID gefunden. Ein eigener, enger
Schreibprozess ersetzt direkte Aenderungen an `transaktionen.jsonl`.

Im Umfang:

- Optionales Feld `immobilie_id` mit Format `^IMM-\d{3}$`.
- Referenzpruefung gegen den geladenen Immobilienbestand.
- Sicheres CLI-Tool zum Setzen, Entfernen und bewussten Ersetzen der Beziehung.
- Verpflichtender Immobiliencheck fuer alle neu importierten Transaktionen.
- Detail-Querlink zur vorhandenen Immobilienposition in der Vermoegensansicht.
- Suche nach der reinen Immobilien-ID im bestehenden Freitextfeld.
- Synthetische Validator-Fixtures und ein sinnvoll verknuepfter Demobestand.
- Live-Phase 2 ausschliesslich fuer die 16 Transaktionen auf KAT-020.

Nicht im Umfang:

- Pflichtfeld oder Migration aller 2.804 Bestandszeilen.
- Zuordnung anhand einer Kategorie, Gegenpartei oder Banklogik.
- Aenderungen an Kategorie, Regel, Kategorisierungsstatus oder Cashflowwirkung.
- Eigener Reviewstatus, Audit-, Historien- oder Versionsfelder.
- Betragssplits oder eine eigene Zuordnungsentitaet.
- Aggregierte Kosten-/Ertragssicht je Immobilie.
- Bearbeitung der KAT-021- oder KAT-002-Live-Buchungen.

## Domaenenmodell

`Transaktion.immobilie_id` ist eine optionale Viele-zu-eins-Beziehung zu
`Immobilie`: Eine Transaktion gehoert hoechstens zu einer Immobilie, eine
Immobilie kann viele Transaktionen haben. Die Beziehung ist orthogonal zu
`kategorie_id`, `regelzahlung_id`, `transfer_id` und zu Darlehensbeziehungen.

Die Zuordnung wird ausschliesslich aus einem eindeutigen Beleg oder einer
Nutzerentscheidung gesetzt. Kategorie, bekannte Gegenpartei, Adresse,
Buchungstext oder Belegpfad duerfen dem Agenten als Suchsignale dienen, begruenden
aber fuer sich keine Zuordnung. Fehlt `immobilie_id`, ist keine Beziehung
gespeichert; daraus wird kein Reviewzustand abgeleitet.

## Datenvertraege und Validierung

`app/schemas/transaktionen.schema.json` und der Inline-Vertrag in
`app/tools/validate-core.mjs` erhalten dasselbe optionale Stringfeld mit dem
Pattern `^IMM-\d{3}$`. `additionalProperties: false` bleibt unveraendert.

Die semantische Validierung baut den Immobilienindex vor der
Transaktions-Referenzpruefung auf. Ist eine gesetzte ID nicht in
`data.immobilien` vorhanden, entsteht ein Fehler der Form
`transaktionen.<TXN-ID>.immobilie_id: IMM-999 existiert nicht`.

Die versionierten Master-Fixtures erhalten ausschliesslich synthetische
Immobilien- und Transaktionsdaten. Die gueltige Fixture belegt eine vorhandene
Referenz; die ungueltige Fixture referenziert gezielt `IMM-999`.

## Schreibwerkzeug

Das neue `app/tools/transaktion-immobilie.mjs` besitzt eine reine, testbare
Zuordnungsfunktion und einen CLI-Einstieg. Der Aufruf lautet:

```text
node tools/transaktion-immobilie.mjs --ids=TXN-… --immobilie=IMM-001 data/master
node tools/transaktion-immobilie.mjs --ids=TXN-… --immobilie=IMM-001 data/master --schreiben
node tools/transaktion-immobilie.mjs --ids=TXN-… --entfernen data/master --schreiben
```

Ohne `--schreiben` wird nur eine Vorschau ausgegeben. Die ID-Liste ist immer
Pflicht; Filter nach Kategorie oder Gegenpartei gibt es bewusst nicht. Das Tool
veraendert ausschliesslich `immobilie_id` und meldet `betroffen`, `gesetzt`,
`entfernt`, `unveraendert`, `konflikte` und `nicht_gefunden`.

Eine bereits identische Zuordnung ist idempotent. Eine bereits abweichende
Zuordnung ist ein Konflikt und darf nur mit `--ersetzen` geaendert werden.
`--entfernen`, `--immobilie` und `--ersetzen` werden auf widerspruchsfreie
Kombinationen geprueft. Unbekannte Immobilien, unbekannte Transaktionen,
Konflikte ohne Ersetzfreigabe und Validierungsfehler blockieren den gesamten
Schreibvorgang; es gibt keine Teilanwendung.

Vor dem Schreiben validiert das Tool den resultierenden Gesamtbestand im
Speicher. Nach dem Schreiben laedt und validiert es den Datenroot erneut und
haengt einen Laufeintrag mit Zaehlern und betroffenen IDs an
`<DATENROOT>/agent_log.jsonl`. Der aufrufende Agent fuehrt anschliessend den
expliziten CLI-Validator fuer den aktiven Datenroot aus.

## Import-Gate

Der standardisierte Bankimport erhaelt absichtlich kein `immobilie_id`: Import
und fachliche Objektentscheidung bleiben getrennte Prozesse. `runImport()`
liefert die neu geschriebenen Transaktions-IDs bereits in `result.written`.
`inbox.mjs` nimmt diese IDs kuenftig als `geschriebene_ids` in jeden Laufbericht
auf und aggregiert sie in `agent_log.jsonl` unter `betroffene_ids`, statt sie wie
bisher zu verwerfen.

`app/docs/skills/import-agent.md` erhaelt vor dem Importabschluss einen
verpflichtenden Schritt fuer genau diese neuen IDs:

1. Alle neu geschriebenen Transaktionen auf moeglichen Immobilienbezug pruefen.
2. Bei eindeutigem Beleg die Zuordnung mit dem engen Tool setzen.
3. Bei einem blossen Hinweis die Kandidaten gruppiert dem Nutzer vorlegen.
4. Ohne belastbaren Hinweis das Feld weglassen.
5. Im Abschlussbericht `geprueft`, `zugeordnet`, `ohne_hinweis` und `ungeklaert`
   nennen.

Die gemeinsame Betriebsgrundlage `app/docs/agent-context.md` definiert dieselbe
Beleggrenze und listet das neue Tool. Verhaltenstests sichern, dass die neuen IDs
im produktiven Inbox-Bericht und Protokoll erhalten bleiben; der bestehende
CLI-Auffindbarkeitstest sichert den Werkzeughinweis. Der Wortlaut der
Betriebsanweisung wird nicht mit einem fragilen Prosa-Regex getestet.

## Benutzeroberflaeche

`immobilieForTransaction(tx)` in `app/views/transaktionen.mjs` loest eine
gesetzte ID gegen `data.immobilien` auf. Die Detailansicht zeigt nur bei
erfolgreicher Aufloesung eine lokalisierte Zeile mit
`IMM-001 · <Bezeichnung>`. Der Wert ist ein Querlink ueber die vorhandene Aktion
`open-vermoegen-entity` mit `data-vklasse="immobilie"` und der Immobilien-ID.

`transactionSearchFields(tx)` nimmt `tx.immobilie_id` auf. Damit reicht im
bestehenden Suchfeld die Eingabe `IMM-001`; alle anderen Filter bleiben per
UND-Verknuepfung aktiv. Es gibt keinen neuen Dropdown-Filter und keine Suche nach
Adresse oder Bezeichnung.

Die Labels `transactions.immobilie` werden in Deutsch und Englisch gepflegt.
Fehlende oder unbekannte optionale IDs fuehren in der View nicht zu einem
Absturz; der Validator bleibt die Stelle, die ungueltige Referenzen beanstandet.

### Ruecknavigation aus der Immobilien-Rail

Die Immobilien-Rail erhaelt fuer Immobilien einen lokalisierten Link
`Transaktionen anzeigen`. Der Link wechselt in die bestehende
Transaktionsansicht und setzt deren Freitextsuche auf die exakte Immobilien-ID,
zum Beispiel `IMM-001`. Konto-, Status-, Kategorie-, Transfer-, Herkunfts- und
Zeitraumfilter werden dabei geleert, die erste Seite wird geoeffnet und keine
einzelne Transaktion vorselektiert. Damit ist der Rueckweg reproduzierbar und
zeigt alle aktuell geladenen Buchungen mit diesem Objektbezug.

Der empfohlene Weg nutzt bewusst den bestehenden Suchindex: Er ist kleiner und
bleibt konsistent mit der bereits freigegebenen Suche nach `immobilie_id`.
Verworfen sind ein eigener Immobilien-Dropdown in der Transaktionsansicht
(zusaetzliche Filteroberflaeche ohne weiteren Nutzen) und eine eingebettete
Transaktionsliste in der Immobilien-Rail (waere der Einstieg in die nicht
beauftragte aggregierte Objektsicht). Die Klickaktion wird separat benannt und
enthaelt die Immobilien-ID als Datenattribut; dadurch bleibt sie gezielt
testbar und verwechselt den Bezug nicht mit einem Konto- oder Kategorie-Filter.

## Demodaten

Die Demodaten enthalten genau eine Immobilie (`IMM-001`) und zwei vollstaendige,
eindeutige objektbezogene Serien ueber 36 Monate. Alle 36 Buchungen der
Wohnungsdarlehensrate und alle 36 Hausgeld-/Ruecklagenbuchungen werden `IMM-001`
zugeordnet. So lassen sich Detail-Querlink und Suche ohne Live-Daten pruefen.

Die Demo-Aenderung wird erst mit dem fertig getesteten Schreibwerkzeug erzeugt
und anschliessend mit dem Demo-Daten-Test sowie dem Validator geprueft.

## Fehlerverhalten

- Falsches ID-Format wird von beiden Datenvertraegen abgelehnt.
- Eine formal gueltige, aber unbekannte Immobilien-ID wird referenziell
  abgelehnt.
- Ein Schreibaufruf mit unbekannten Transaktions-IDs oder unfreigegebenem
  Ersetzkonflikt schreibt weder Transaktionen noch Protokoll.
- Eine unbekannte ID in der View wird nicht angezeigt und verursacht keinen
  Laufzeitfehler.
- Das Import-Gate darf Kandidaten gruppieren, aber keine Zuordnung aus einem
  Suchsignal automatisieren.

## Teststrategie

Die Umsetzung folgt Red-Green-Refactor. Geplante Nachweise:

- Validator: gueltige Fixture mit `IMM-001`; ungueltige Fixture mit `IMM-999`
  und exakter Referenzfehlermeldung.
- JSON-Vertrag und Inline-Vertrag: Formatannahme und -ablehnung.
- Werkzeug: Setzen, unveraenderter Zweitlauf, Entfernen, geschuetztes Ersetzen,
  unbekannte Immobilien-/Transaktions-ID, atomarer Abbruch und unveraenderte
  fachfremde Felder.
- Import: geschriebene IDs bleiben in Inbox-Bericht und Protokoll erhalten.
- Agentendokumentation: neues Tool ist ueber den bestehenden CLI-Test auffindbar;
  das Import-Gate ist verpflichtend beschrieben und sein ID-Datenfluss wird ueber
  produktives Verhalten statt ueber einen Prosa-Regex getestet.
- UI: Aufloesung, Detail-Querlink, Weglassen ohne Bezug sowie deutsche und
  englische i18n-Schluessel.
- Suche: `IMM-001` findet nur die zugeordnete Transaktion; eine andere ID nicht.
- Ruecknavigation: Die Immobilien-Rail rendert den lokalisierten Link; der Klick
  oeffnet die Transaktionsansicht mit `search = IMM-001`, leert konkurrierende
  Filter und setzt Seitennummer sowie Detailauswahl zurueck.
- Demo: 72 eindeutig objektbezogene Buchungen tragen `IMM-001`, und der gesamte
  Demobestand bleibt valide.
- Abschluss: `npm test`, `npm run validate:fixtures` und
  `npm run validate:master` sind gruen; der negative Referenztest ist sichtbar
  ausgefuehrt.

## Phasentrennung fuer Live-Daten

Phase 1 umfasst Modell, Validator, Werkzeug, Import-Gate, Detailansicht, Suche,
Dokumentation, Fixtures und Demo. Sie schreibt keine Live-Transaktion.

Erst nach separater Abnahme von Phase 1 beginnt Phase 2. Sie betrachtet genau die
16 Live-Transaktionen auf KAT-020. Vier bereits am 2026-08-12 entschiedene
Buchungen werden den beiden benannten Immobilien zugeordnet. Die uebrigen zwoelf
werden gruppiert zur Nutzerentscheidung vorgelegt; ohne Beleg oder Aussage bleibt
`immobilie_id` weg. KAT-021 und KAT-002 werden in diesem Auftrag nicht geaendert.
