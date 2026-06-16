# Context

Glossar der fachlichen Begriffe. Keine Implementierungsdetails, keine Schemas, keine Entscheidungen — nur die Sprache.

## Pfadkonvention

Produktive App-Daten, Belege, Schemas, Tools und Agenten-Skills liegen fuehrend im App-Raum unter `app/`. Fachliche Pfade in diesem Glossar sind app-relativ: `data/master/...` meint physisch `app/data/master/...`, `data/inbox/...` meint `app/data/inbox/...`, `schemas/...` meint `app/schemas/...` und `tools/...` meint `app/tools/...`.

## Person

Eine natuerliche Person mit eindeutiger Identitaet (`person_id`). Reine Identitaetsentitaet: keine Rollen wie "Kind", "Erwachsen" oder "Haushalt". Lebensphasen werden ueber Ereignisse und Erwerbsstatus abgebildet, nicht ueber ein Rollenfeld.

## Konto

Bankkonto oder Depot. Hat eine **Inhaberliste** (`inhaber_person_ids`) — alle Inhaber sind **gleichberechtigt**, ohne Quoten. Begruendung: die Bank kennt keine wirtschaftlichen Quoten an einem Konto; ein Gemeinschaftskonto ist gemeinschaftlich.

## Kontoreferenz

Eine externe, vom Anbieter vergebene Kennung eines Kontos oder Depots — vorzugsweise die **vollstaendige** IBAN bzw. Depotnummer, damit die Referenz eindeutig und vollstaendig ist. Sie dient der Wiedererkennung durch Nutzer und Agenten, nicht der Berechnung (die fachliche Identitaet im Modell traegt `konto_id`). Eine maskierte Form (z. B. nur Endziffern) ist zulaessig, wo die volle Kennung nicht vorliegt; sie ist aber nicht mehr die bevorzugte Form. Hintergrund: Die produktiven Daten unter `data/` sind nicht versioniert und liegen nur lokal bzw. auf dem zugriffsgeschuetzten Webserver — eine vollstaendige IBAN im Masterdatensatz ist in diesem privaten Kontext akzeptiert.

## Immobilie

Hat **Eigentumsanteile** mit Quoten als **exakten Bruch** (`eigentumsanteile: [{person_id, zaehler, nenner}]`, Summe = 1). Anders als beim Konto, weil hier reale, ungleiche Eigentumsverhaeltnisse existieren (Beispiel: 2/3 zu 1/3 im Grundbuch). Bruch statt Dezimalzahl, weil Grundbuch-Quoten Brueche sind und die Summenpruefung so exakt als Integer-Arithmetik laeuft (keine Float-/Rundungsunschaerfe, passt zur Cent-Integer-Philosophie). Anzeige als "2/3" oder "66,7 %" ist reine Darstellung.

**Anschaffung vs. Marktwert** sind verschiedene Dinge. *Anschaffungskosten* (Kaufpreis laut Kaufvertrag, ohne Nebenkosten — die ggf. in `bemerkung`) und *Anschaffungsdatum* sind eine **fixe historische Tatsache** (normales Feld, kein Zeitwert). Das **Anschaffungsdatum** ist das Datum des **notariellen Kaufvertrags** (Beurkundungstag), bewusst nicht Uebergabe/Nutzen-Lasten-Wechsel und nicht Grundbucheintragung (steuerlich massgeblich, z. B. 10-Jahres-Frist §23 EStG). Der *Marktwert* ist dagegen ein zeitveraenderlicher **Zeitwert** (`feld = marktwert`, fortschreibbar). Die Differenz ist die Wertentwicklung.

Die Quoten sind primaer **Darstellung/Metadaten**; das Nettovermoegen ist eine Gesamt-/Haushaltssicht und wird **anteilsgewichtet** ueber Haushaltspersonen gerechnet (heute faktisch 100 %, solange alle Miteigentuemer zum Haushalt gehoeren). Ein **externer Miteigentuemer** (ausserhalb des Haushalts) wird **nicht** als Person modelliert — das wuerde ueber ein Rollen-/Haushalts-Flag den als Nicht-Entitaet verworfenen Haushalt durch die Hintertuer einfuehren. Stattdessen als expliziter Anteilseintrag **ohne** `person_id`, z. B. `{zaehler, nenner, extern: true, bezeichnung}`. Das Nettovermoegen zaehlt nur Anteile **mit** `person_id`. Dieser externe Fall wird erst bei Bedarf gebaut (YAGNI); die anteilsgewichtete Rechnung greift dann sofort.

## Weiterer Vermoegenswert

Bewerteter Besitz, der weder Konto/Depot noch Immobilie ist — z. B. Edelmetall (Gold/Silber) oder eine Firmenbeteiligung. **Eine** erweiterbare Entitaet (`vermoegenswerte.json`) mit `typ` (`edelmetall | beteiligung | sonstiges`), nicht je Klasse eine eigene Datei — analog zur parametrisierten Regelzahlung/Darlehen statt Subtyp-Duplikaten. Hat Eigentumsanteile mit Quoten wie die Immobilie (inkl. externem-Miteigentuemer-Muster). Der Wert ist **nicht** aus Transaktionen berechenbar und lebt als Zeitwert (`feld = marktwert`, `qualitaet = belegt | geschaetzt`). Geht anteilsgewichtet ins Nettovermoegen ein. Nicht zu verwechseln mit der als Nicht-Entitaet verworfenen `vermoegen.json` (das war die *aggregierte* Vermoegenssicht, die berechnet entsteht).

## Darlehen

Eine verzinste Verbindlichkeit mit Tilgung (privat: Annuitaetendarlehen). Stammdaten: Anfangsbetrag, Anfangsdatum, Nominalzins, Sollrate, Rhythmus (`{einheit, intervall}` wie bei der Regelzahlung), optional Bezug zu Immobilie und zum belastenden Konto. Die **Restschuld** ist kein gepflegter Wert, sondern wird aus einem belegten Anker + Tilgung berechnet (siehe ADR 0013). Endfaelliges und 0%-Darlehen sind Sonderwerte derselben Struktur (kein eigenes Typ-Feld). Geht mit der Restschuld als Passivum ins Nettovermoegen ein. Status: `aktiv | abgeloest`.

## Nettovermoegen

Berechnete Gesamt-/Haushaltssicht: Aktiva (liquide Konten + Depotwerte + anteilsgewichtete Immobilien/Vermoegenswerte) minus Passiva (Darlehen-Restschulden). **Nie** ein gepflegter oder gespeicherter Wert — immer beim Laden berechnet, mit sichtbarer Datenqualitaet (belegt/geschaetzt/fehlend). Keine Aufteilung pro Person (siehe ADR 0014). Bargeld zaehlt nicht (bewusster blinder Fleck).

## Haushalt

**Kein Konzept im Modell.** Aggregation "Familie/Haushalt" entsteht ausschliesslich als View (alle Konten zusammen, gefiltert nach Kategorie), nicht als Entitaet. Begruendung: ein Ehepaar + Kinder braucht keine zusaetzliche Aggregationsentitaet; Gemeinschaftskonten erledigen das durch ihre Inhaberliste.

## Stammdaten

Relativ stabile Bezugsdaten des Finanzmodells, z. B. Personen, Konten und Kategorien. Sie werden selten geaendert und geben **Bewegungsdaten** ihren fachlichen Rahmen.

## Bewegungsdaten

Regelmaessig hinzukommende kontobezogene Ereignisdaten, z. B. **Transaktionen** und **Transfers**. Sie werden gegen **Stammdaten** referenziert und sind der primaere Gegenstand von Review und Import.

## Cashflow-Traeger

Wirtschaftlicher Traeger einer Transaktion folgt dem **Konto**, nicht der Person. Keine fiktive Quotenverteilung pro Buchung. "Wer hat das bezahlt" beantwortet sich ueber die Inhaberliste des Kontos.

## Transaktions-ID und Deduplikation

`transaktion_id` ist ein **opaker** Identifier ohne Informationsgehalt: `TXN-<uuid>` (UUID v4). Bewusst **kein** Datum und **keine** laufende Nummer im Identifier — er ist eindeutig, gibt aber nichts ueber Zeitpunkt oder Reihenfolge der Buchung preis (auch nicht in Deep-Link-URLs). `transfer_id` analog: `TRF-<uuid>`. Das Praefix bleibt nur als Typ-Kennung. Zusaetzlich traegt jede Transaktion einen `dedupe_hash`. Beim Import prueft die Import-Pipeline, ob der Hash bereits existiert; wenn ja, wird der Datensatz uebersprungen.

Der Hash wird **zweistufig** gebildet (siehe ADR 0007):
- Liefert die Bank eine eindeutige Buchungsnummer (`bank_referenz`, z. B. Ende-zu-Ende-ID), basiert der Hash **nur** auf `(konto_id, bank_referenz)`. Das ist die staerkste Eindeutigkeit und ueberlebt Umformatierungen des Verwendungszwecks zwischen zwei Exports.
- Fehlt `bank_referenz`, basiert der Hash auf `(konto_id, buchungsdatum, betrag, gegenpartei, verwendungszweck)`.

Die Freitextfelder `gegenpartei` und `verwendungszweck` werden vor dem Hash **leicht normalisiert** (trim, Mehrfach-Whitespace kollabieren) — aber **nicht** lowercased oder von Sonderzeichen befreit. Begruendung: zu starke Normalisierung wuerde knapp verschiedene Buchungen verschmelzen und damit echte Buchungen still verschlucken — der schlimmste Fehlerfall.

Wenn eine Bank `bank_referenz` nicht stabil ueber Re-Exports vergibt, laesst der Agent das Feld bewusst weg, damit der Freitext-Hash greift. Das ist ein Pruefpunkt beim ersten Import einer neuen Bank.

Zwei Praezisierungen (siehe ADR 0007, Stand 2026-06-09): (1) Eine `bank_referenz` wird nur als Schluessel genutzt, wenn sie im Importlauf **dateiweit eindeutig** ist — manche Banken vergeben dieselbe Referenz auf verschiedenen Buchungen; nicht-eindeutige Referenzen fallen auf den Freitext-Hash zurueck. (2) Der Hash-Abgleich prueft gegen den **Bestand**, nicht innerhalb desselben Auszugs: zwei gleich aussehende Zeilen eines amtlichen Auszugs sind reale Buchungen, keine Importdublette. Sind sie in allen Quellfeldern identisch, erhaelt das zweite Vorkommen einen deterministisch disambiguierten `dedupe_hash` (Inhalte unveraendert), weil der Validator eindeutige Hashes verlangt.

Banken liefern Auszuege in unterschiedlichen Formaten — die Normalisierung in die Standardform ist Aufgabe des Import-Agenten, nicht des Datenmodells.

## Transaktion

 Buchung auf einem Konto. Hat immer einen `kategorisierung_status` (`offen | vorgeschlagen | bestaetigt | abgelehnt`). Die `kategorie_id` ist **optional**: nur wenn der Status `bestaetigt` ist, muss eine Kategorie gesetzt sein. Transaktionen mit offener Kategorie werden nicht ueber eine Pseudo-Kategorie versteckt — sie sind als **Kategorie offen** sichtbar.

Kein separates Feld `cashflow_wirkung` an der Transaktion. Die Wirkung ergibt sich aus dem Vorzeichen des `betrag`-Feldes plus dem Flag `ist_transfer` (Transfers sind cashflow-neutral). Die Kategorie steuert die fachliche Klassifikation, nicht das Vorzeichen.

## Kategorisierung

Zustand einer Transaktion bezueglich ihrer Kategorie. Agent schreibt seinen Tipp direkt in `kategorie_id` und setzt `kategorisierung_status = vorgeschlagen`. Im Review-Flow geht der Nutzer Buchung fuer Buchung durch — bestaetigt (`status = bestaetigt`) oder korrigiert die Kategorie. Es gibt **keine** separate `vorschlaege.jsonl`-Datei und keine zweite Kategorie-Spalte fuer Vorschlaege. Ein Feld, ein Status.

Die **Erst-Kategorisierung** geschieht beim Import (deterministischer Categorizer ueber die zu dem Zeitpunkt bestehenden Regeln). Werden Regeln erst *nach* dem Import angelegt oder geaendert, wirkt die **Nach-Kategorisierung**: derselbe deterministische Lauf, aber ueber den Bestand statt ueber den Import-Stream, angestossen ueber die Kategorisierungsregel-Pflege. Beide rufen dieselbe `categorize()`-Funktion — gleiche Eingabe, gleiches Ergebnis. Der Agent raet nie eine Kategorie und legt nie still eine Regel an; beides ist eigener Pflegeprozess.

Orthogonal zum Status steht die **Herkunft** einer Kategorie (`kategorie_herkunft`): `regel` (vom Categorizer abgeleitet) oder `manuell` (vom Agenten auf ausdrueckliche Nutzer-Ansage gesetzt — es gibt keine UI-Bearbeitung, siehe ADR 0006). Die Herkunft entscheidet, ob die Nach-Kategorisierung einen Eintrag anfassen darf: `regel`-Eintraege werden neu bewertet, `manuell`-Eintraege und `abgelehnt` sind menschliche Akte und bleiben von Regellaeufen unangetastet. Details der Policy: siehe ADR zur Nach-Kategorisierung.

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

Ab M5 ist der belegte Kontostand ein **Zeitwert** (`entitaet = konto`, `feld = kontostand`, `qualitaet = belegt`); pro Konto duerfen mehrere existieren (Auszug fuer Auszug). Er ist **belegt, nicht abgeleitet** — der Saldo steht auf dem Auszug selbst ("alter/neuer Saldo"). Bewusst nicht "Endstand minus alle Buchungen" rechnen: das wuerde fehlende Buchungen in den Anker hineinrechnen und den Reconciliation-Check (s. u.) wirkungslos machen.

**Live-Saldo eines Kontos** = juengster belegter Kontostand **+** Summe der Buchungen *nach* dessen Standdatum. So sammeln sich keine alten Buchungsfehler an. Liegt fuer ein liquiditaetsrelevantes Konto kein belegter Kontostand vor → sichtbarer Check.

Beim Initialimport eines neuen Kontos muss der Import-Agent einen moeglichen belegten Start-/Stichtagssaldo aus der Rohquelle erkennen, wenn die Rohquelle ihn enthaelt (z. B. "Kontostand vom ..."), und dem Nutzer konkrete Umgangsoptionen vorschlagen. Nach Bestaetigung wird der Wert als Zeitwert `entitaet = konto`, `feld = kontostand`, `qualitaet = belegt` erfasst. Fehlt ein belegter Anker in der Rohquelle, fragt der Agent den Nutzer, ob ein belegter Ankerwert manuell nachgetragen werden kann oder der Import ohne Liquiditaetsanker fortgesetzt werden soll. Ohne solchen Anker darf Liquiditaet nicht aus Bewegungen allein geraten werden.

**Reconciliation-Check** (ab M5, Ist-gegen-Ist): ueber je zwei aufeinanderfolgende belegte Kontostaende muss die belegte Differenz der gebuchten Differenz entsprechen. Weicht sie ab → Check "Buchungen passen nicht zum Kontoauszug" (vergessene oder doppelte Buchungen). Abzugrenzen vom **Plan-Ist-Abgleich** (M8), der Zukunftsplan gegen Realitaet prueft.

## Liquiditaet

Die fuehrende Sicht fuer kurzfristig verfuegbares Geld ist **Liquiditaet**, nicht Cashflow. Sie zeigt den aufgelaufenen Saldo aller liquiditaetsrelevanten Konten: belegter Kontostand als Anker plus Buchungen seit diesem Standdatum. Die Zukunft wird als Saldo-Fortschreibung aus erwarteten Regelzahlungen berechnet. Cashflow bleibt die Bewegungs-Summe eines Zeitraums, ist aber nicht die fuehrende Kennzahl dieser Sicht.

Im Hauptbereich zeigt die Liquiditaetsseite nur den laufenden Kalendermonat. Innerhalb dieses Monats besteht der Verlauf aus gebuchten Ist-Transaktionen bis heute und den noch erwarteten Regelzahlungen nach heute. Historische Monate gehoeren nicht in diese kompakte laufende Sicht. Der spaetere Plan-Ist-Abgleich klaert separat, ob eine konkrete Ist-Zahlung eine erwartete Regelzahlung erfuellt hat.

## Cashflow-Ist

Der **tatsaechliche** Cashflow, vollstaendig aus Transaktionen der Vergangenheit berechnet (Cent-Integer-Summe, gruppiert z. B. nach Monat und/oder Kategorie). Transfers zaehlen nicht (cashflow-neutral). Kein gespeicherter Wert — beim Laden berechnet, wie Nettovermoegen. Reicht bis „heute".

In aktuellen App-Sichten ist Cashflow eine Auswertungs-/Analysegroesse. Die fuehrende kurzfristige Seite ist **Liquiditaet** (siehe oben); historische Cashflow-Monate gehoeren in eine separate Auswertung, nicht in die kompakte laufende Liquiditaetssicht.

## Cashflow-Prognose

Der **erwartete** Cashflow der Zukunft, ausschliesslich aus **bestaetigten Regelzahlungen** projiziert (`status = bestaetigt`, ab Ankerdatum, begrenzt durch `aktiv_bis`). Vorschlaege wirken nicht. Beginnt nach „heute" — keine zeitliche Ueberlappung mit dem Cashflow-Ist, daher keine Doppelzaehlung.

Der **Horizont** ist konfigurierbar; Untergrenze ist das spaeteste `aktiv_bis` aller bestaetigten Regelzahlungen, damit langfristig bekannte Fakten (z. B. Gehalt bis Renteneintritt) nicht abgeschnitten werden. Unbefristete Regelzahlungen werden bis zum konfigurierten Horizont-Ende projiziert und als unbefristet markiert.

Die regelzahlungsbasierte Zukunftsrechnung bleibt **nachvollziehbar**: eine eigene Regelzahlungs-Liste zeigt die Eingangsdaten, und die Liquiditaetsseite schreibt den heutigen Saldo mit den einzelnen bestaetigten Faelligkeiten bis zu einem waehlbaren **Bis-Datum** fort. Eine separate aggregierte Cashflow-Auswertung nach Monat/Quartal/Jahr kann spaeter darauf aufbauen, ist aber nicht mehr die fuehrende App-Sicht.

Die M4-Prognose ist **regelzahlungsbasiert und bewusst unvollstaendig**: bekannte Einmaleffekte (z. B. Kapitalleistung einer Lebensversicherung → M7) und hypothetische Szenarien (→ M6) sind nicht enthalten. Diese Unvollstaendigkeit wird in der Ansicht **explizit gekennzeichnet**, damit keine Entscheidung auf einer scheinbar vollstaendigen Zahl getroffen wird. Eine bekannte **Stufenaenderung** einer wiederkehrenden Zahlung (z. B. Gehalt ab 60 halbiert) wird als zwei aufeinanderfolgende Regelzahlungen abgebildet, nicht als Szenario.

Die Berechnung (Ist wie Prognose) ist eine **geteilte, reine Funktion**, die die App beim Laden aufruft und Node testen/ausfuehren kann — eine getestete Funktion an zwei Aufrufstellen, kein App-eigener Sonderweg.

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
- Regelzahlung: `vorgeschlagen | bestaetigt | abgelehnt`

Statuswechsel mit Zeitbezug: Feld `aktiv_bis` (optional, Datum). Wenn gesetzt und in der Vergangenheit, gilt die Entitaet fuer **neue** Zuordnungen als inaktiv; **bestehende** Verweise (z. B. Altbuchungen auf eine inaktive Kategorie) bleiben gueltig.

## Zeitwerte

Werte mit zeitlichem Bezug, die **nicht aus Transaktionen berechenbar** sind, leben in einer zentralen `data/master/zeitwerte.jsonl`:

```
{entitaet, entitaet_id, feld, wert, standdatum, qualitaet, quelle_hinweis}
```

Anwendungsfaelle: Immobilien-Marktwert, Depotwert, erwartete Rente, Rueckkaufswert Versicherung. Aktueller Wert = neuester Eintrag pro `(entitaet_id, feld)`. Verlauf entsteht durch Anhaengen, nicht durch Ueberschreiben — weil **git als Audit-Spur nicht zaehlt**: die App soll spaeter standalone ohne Git laufen.

Werte, die aus den Bewegungsdaten **vollstaendig** berechenbar sind (Nettovermoegen als Aggregat, sowie laufende Veraenderungen), gehoeren **nicht** in `zeitwerte.jsonl` — sie werden in der App berechnet.

Praezisierung (M5): Konto-Saldo und Darlehen-Restschuld sind nur dann rein berechenbar, wenn die Historie **vollstaendig** vorliegt. Da das in der Praxis nicht garantiert ist, braucht beides einen belegten **Ankerpunkt** als Zeitwert (`feld = kontostand` bzw. `feld = restschuld`, `qualitaet = belegt`); der laufende Wert wird daraus + Bewegungen berechnet, und weitere belegte Staende dienen dem Reconciliation-Check. Das Nettovermoegen selbst bleibt rein berechnet (Aggregat) und nie ein Zeitwert.

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

Stammdatensatz in `data/master/kategorisierungsregeln.json`. Ordnet eingehenden Transaktionen anhand von Mustern (z. B. Substring in `gegenpartei` oder `verwendungszweck`, optional gefiltert auf `konto_id`) eine `kategorie_id` zu. Wird beim Import (Erst-Kategorisierung) und bei Regelaenderungen ueber den Bestand (Nach-Kategorisierung, siehe ADR 0017) von einem deterministischen Tool ausgewertet — der Agent ruft das Tool, das Tool matcht, der Agent uebernimmt das Ergebnis.

Bei Treffer setzt der Importer `kategorisierung_status = vorgeschlagen` und die `kategorie_id`. Bei Konflikt (zwei Regeln, unterschiedliche Kategorien) bleibt die Transaktion `offen` — Mehrdeutigkeit wird sichtbar gemacht, nicht stillschweigend per Reihenfolge entschieden.

## Standardisiertes Importformat

Zwischenformat zwischen Rohdatei (CSV, PDF, MT940 …) und dem finalen Transaktionseintrag. Liegt unter `data/inbox/` und enthaelt die normalisierten Felder einer Buchung in einer JSONL-Form, gegen die der Validator laeuft. Die Normalisierung aus dem Bank-Rohformat ist Aufgabe des Agenten, nicht des Modells — **es gibt keine bankspezifischen Parser im Code**, weil Bankformate sich ohne Vorwarnung aendern und der Agent gut im Normalisieren ist.

## Regelzahlung

Eine wiederkehrend erwartete Zahlung mit Rhythmus und erwarteter Hoehe (z. B. Miete monatlich, Gehalt monatlich, Versicherungsbeitrag jaehrlich). Eigener Stammdatensatz, **orthogonal zur Kategorie**: eine Regelzahlung kann in jeder Kategorie vorkommen, und eine Kategorie enthaelt sowohl Regelzahlungen als auch einmalige Betraege.

Abgrenzung zur **Kategorisierungsregel**: Die Kategorisierungsregel beantwortet „wie klassifiziere ich eine Buchung" (Muster → `kategorie_id`, zeitlos). Die Regelzahlung beantwortet „welche Zahlung erwarte ich wiederkehrend, mit welchem Rhythmus und welcher Hoehe" und ist die Grundlage der **Liquiditaetsprognose**. Eine Regelzahlung kann eine Kategorie referenzieren, ersetzt die Kategorisierungsregel aber nicht.

Vorschlag und Bestaetigung werden ueber **ein Status-Feld** an *einem* Datensatz getrennt (`status`), analog zur Kategorisierung — **keine** separate Vorschlags-Datei. Nur eine Regelzahlung mit `status = bestaetigt` wirkt auf die **Liquiditaetsprognose**; Vorschlaege sind sichtbar, wirken aber nicht still.

Regelzahlungen entstehen **ausschliesslich ueber den Agent-Dialog** in Claude Code (ADR 0006); die App zeigt sie nur an und editiert nie. Der `status` spiegelt die Quelle: ein vom Agenten aus Transaktionen erkanntes Muster ist `vorgeschlagen`, ein vom Nutzer diktiertes Faktum schreibt der Agent direkt als `bestaetigt`. Es gibt kein Hand-Editieren der Datei und kein App-CRUD.

Zeitlich ist eine Regelzahlung ein **begrenztes Intervall**: Ankerdatum (Start) + Rhythmus + optional `aktiv_bis` (bekanntes Ende, z. B. 24-Monate-Handyvertrag). Der Rhythmus wird als `{einheit, intervall}` ausgedrueckt (`einheit ∈ tag | woche | monat | jahr`), nicht als festes Enum: monatlich = `(monat, 1)`, quartalsweise = `(monat, 3)`, 14-taegig = `(woche, 2)`, jaehrlich = `(jahr, 1)`. Die erwartete Hoehe ist **ein vorzeichenbehafteter Punktbetrag** (negativ = Ausgabe, positiv = Eingang) — die Richtung ergibt sich aus dem Vorzeichen, kein eigenes Richtungsfeld (wie bei der Transaktion). Bandbreiten und Werktagslogik sind in M4 bewusst nicht modelliert (YAGNI).

## Transfer

Geldbewegung zwischen zwei Stellen, die im Cashflow **nicht** als Ausgabe/Einnahme zaehlt. Modelliert als eigener Datensatz in `transfers.json`, der eine Bank-Transaktion mit ihrer Gegenseite verbindet.

Zwei Auspraegungen:
- **Interner Transfer**: beide Seiten sind Transaktionen im Modell (z. B. Giro → Immobilienkonto). Der Transfer-Datensatz verweist auf beide `transaktion_id`s. Betraege gegenlaeufig.
- **Externer Transfer**: nur eine Seite ist eine Transaktion (z. B. Bargeldabhebung, die einer Person ausserhalb des Modells gegeben wird). Der Transfer-Datensatz hat genau eine `transaktion_id` plus `gegenseite_typ` (z. B. `bar`, `extern_familie`) und eine **Pflicht-Begruendung**.

Pruefregel: jede Transaktion mit `ist_transfer = true` referenziert einen Transfer-Datensatz; der Transfer ist entweder paarweise vollstaendig ODER explizit als extern markiert. Bargeld-Ausgaben werden bewusst nicht als interne Transfers verfolgt — sie sind ein akzeptierter blinder Fleck.

`ist_transfer` und `kategorie_id` sind **orthogonal**: ein Transfer darf zusaetzlich eine Kategorie tragen (z. B. ein Uebertrag aufs Sparkonto als `Sparen/Investieren`), und Kategorisierungsregeln duerfen Transfers treffen. Die Cashflow-Neutralitaet kommt allein aus `ist_transfer`, nicht daraus, eine Kategorie wegzulassen. Es gibt also keinen Grund, das Verregeln von Transfers zu unterlassen.
