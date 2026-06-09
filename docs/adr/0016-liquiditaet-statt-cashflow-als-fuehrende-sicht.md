# Liquiditaet statt Cashflow als fuehrende Sicht

Status: entschieden am 2026-06-09. Uebersteuert die UI-/Modul-Aussagen aus ADR 0010, ADR 0011 und ADR 0012, soweit diese die fuehrende Ansicht als Cashflow-Seite beschreiben.

## Entscheidung

Die bisherige Cashflow-Seite wird fachlich und technisch zur **Liquiditaetsseite**. Fuehrende Kennzahl ist der aktuelle Saldo aller liquiditaetsrelevanten Nicht-Depot-Konten, nicht die Summe der Bewegungen eines Zeitraums.

Liquiditaet wird berechnet als:

1. juengster belegter `kontostand`-Zeitwert je liquiditaetsrelevantem Konto,
2. plus gebuchte Transaktionen nach diesem Standdatum bis heute,
3. plus erwartete bestaetigte Regelzahlungen fuer die Zukunft.

Im Hauptbereich zeigt die Ansicht nur den laufenden Kalendermonat. Der Ist-Teil zeigt den Saldoverlauf bis heute; die Prognose schreibt den heutigen Saldo mit bestaetigten Regelzahlungen ab morgen fort. Ein Plan-Ist-Abgleich fuer faellige, aber noch nicht gebuchte Regelzahlungen bleibt ein spaeterer Meilenstein.

## Begruendung

Die bisherige Cashflow-Ist-Zahl war nach Import mehrerer Kontoauszugsmonate fachlich korrekt als Bewegungs-Summe, aber fuer die erwartete Nutzung missverstaendlich. Der Nutzer erwartete den aktuellen Stand nach Import, also einen Saldo. Eine Bewegungs-Summe ohne Anfangsbestand beantwortet diese Frage nicht.

ADR 0013 liefert bereits das robuste Fundament: Salden werden nicht aus unvollstaendiger Historie geraten, sondern aus belegten Ankern plus Bewegungen fortgeschrieben. Die Liquiditaetsseite macht dieses Modell zur fuehrenden kurzfristigen Sicht.

## Konsequenz

- Das aktive Browser-/Node-Modul heisst `app/liquiditaet.mjs`.
- Regelzahlungen bleiben die deterministische Grundlage der Zukunftsfortschreibung, wirken aber auf eine Saldo-Projektion.
- Fehlt fuer ein liquiditaetsrelevantes Konto ein belegter Kontostand-Anker, wird kein Saldo geraten; die Ansicht zeigt Datenqualitaet.
- Cashflow bleibt als fachlicher Begriff fuer Bewegungs-Summen erhalten, ist aber nicht mehr die fuehrende App-Seite.
- Historische ADRs und Plaene behalten ihre urspruengliche Sprache, erhalten aber Statushinweise, wenn sie fuer aktuelle Arbeit nicht mehr normativ sind.
