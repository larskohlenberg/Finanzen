# Skill: Vorsorge-Erfassungs-Agent

Aktuelle Betriebsanweisung fuer beleggestuetztes Erfassen, Pruefen und
Aktualisieren von Vorsorgeanspruechen. Der Nutzer stoesst an, der Agent fuehrt.

Alle Pfade in diesem Skill sind app-relativ: `data/...`, `Belege/...`,
`schemas/...`, `tools/...` und `docs/...` liegen unter dem App-Raum.

## Zweck

Vorsorge aus Policen, Standmitteilungen, Renteninformationen und Beitragsbelegen
in den Masterdaten vorbereiten. Ziel ist ein validierbarer Stand aus
`DATENROOT/vorsorge.json`, passenden Zeitwerten in `DATENROOT/zeitwerte.jsonl`
und Beitrags-Regelzahlungen in `DATENROOT/regelzahlungen.json`.

## Kontext, den du kennen musst

- `docs/agent-context.md` — gemeinsame Regeln fuer App-Raum, Validierung,
  Zeitwerte, Regelzahlungen, Szenarien und Vorsorge.
- `schemas/vorsorge.schema.json`.
- `schemas/zeitwerte.schema.json`.
- `schemas/regelzahlungen.schema.json`.
- `schemas/szenarien.schema.json` fuer `vorsorge-leistung`-Annahmen.
- `tools/validator.mjs`.
- `vermoegen.mjs` fuer Nettovermoegen- und Vorsorge-Check-Berechnung.
- `szenarien.mjs` fuer die Aufloesung von `vorsorge-leistung`.

## Belegarten und Uebertragung

- **Standmitteilung / Vertragsstand:** `rueckkaufswert` als Zeitwert mit
  `entitaet = "vorsorge"`, `entitaet_id = vorsorge_id`, `feld =
  "rueckkaufswert"`, `standdatum`, `qualitaet` und `quelle_hinweis` erfassen.
- **Renteninformation / Anwartschaft:** `erwartete_rente` als monatlichen
  Netto-Wert erfassen. Wenn der Beleg nur Brutto nennt, nur nach Nutzerfreigabe
  eine Netto-Schaetzung mit `qualitaet = "geschaetzt"` und klarer `bemerkung`
  verwenden.
- **Kapitalprognose / Ablaufleistung:** `erwartete_kapitalleistung` als Zeitwert
  erfassen, wenn der Beleg eine einmalige Leistung oder ein Kapitalwahlrecht
  ausweist.
- **Schutzversicherung:** kein Bilanz-Bein anlegen: kein `rueckkaufswert`, keine
  stille Kapitalleistung. Nur die Vorsorge-Entitaet und die Beitrags-Regelzahlung
  mit `vorsorge_id` vorbereiten, wenn der Vertrag fuer Beitraege, Status oder
  Wechsel-Checks relevant ist.

## Ablauf

1. **Datenmodus pruefen:** `DATENMODUS` und `DATENROOT` aus dem Prompt verwenden.
   Fehlt eines davon, abbrechen und nachfragen.
2. **Beleg sichten:** Police, Standmitteilung, Renteninformation,
   Versicherungsrechnung oder Kuendigungs-/Wechselbeleg lesen und den finalen
   `Belege/...`-Pfad als `quelle_hinweis` vorbereiten.
3. **Vorsorge-Entitaet vorschlagen:** `vorsorge_id`, `art`, `name`, `person_id`,
   `status`, `kapitalbildend`, optional `kapitalwahl`, `leistung_beginn`,
   `aktiv_bis`, `ersetzt_vorsorge_id`, `quelle_standdatum` und `bemerkung`.
4. **Zeitwerte vorschlagen:** nur belegte oder nachvollziehbar geschaetzte Werte
   aus dem Beleg uebernehmen. Jeder Wert wird einzeln mit Quelle, Standdatum und
   Qualitaet gezeigt.
5. **Beitraege verknuepfen:** laufende Beitraege als Regelzahlungen mit
   `vorsorge_id` pflegen. Bestehende Regelzahlungen nicht direkt umdeuten, sondern
   im Regelzahlungs-Dialog mit Nutzerentscheidung vorbereiten.
6. **Review vor Schreiben:** `geprueft_am` erst setzen, nachdem der Nutzer die
   Vorsorge-Entitaet und alle relevanten Werte fachlich gegengelesen hat.
7. **Validieren:** vor jedem Schreiben `tools/validator.mjs DATENROOT` laufen
   lassen, nach dem Schreiben erneut validieren und die verbleibenden
   Vorsorge-Checks aus `vermoegen.mjs` melden.
8. **Protokollieren:** schreibende Laeufe in `DATENROOT/agent_log.jsonl` mit
   geaenderten IDs, Zaehlern und kurzer Notiz dokumentieren.

## Kapitalwahlrecht

`kapitalwahl` bleibt `offen`, solange der Beleg ein Wahlrecht nennt, aber keine
Nutzerentscheidung vorliegt. `monatsrente` oder `kapital` nur setzen, wenn der
Nutzer die Wahl bestaetigt oder der Vertrag eindeutig keine Wahl laesst.

Fuer Szenarien wird die spaetere Leistung nicht als bestaetigte Regelzahlung im
Bestand angelegt. Verwende bei Was-waere-wenn-Fragen eine `vorsorge-leistung`-
Annahme in `DATENROOT/szenarien.json`; `szenarien.mjs` rechnet daraus zur Laufzeit
Rente oder Kapitalleistung.

## Wechsel und Nachfolge

Bei Kuendigung, Anbieterwechsel oder Tarifwechsel:

- alte Vorsorge mit `status = "gekuendigt"` oder passendem Status und
  `aktiv_bis` fuehren, wenn belegt,
- Nachfolger als eigene Vorsorge-Entitaet erfassen,
- im Nachfolger `ersetzt_vorsorge_id` auf die alte `vorsorge_id` setzen,
- Beitrags-Regelzahlungen so datieren, dass `aktiv_bis` der alten Zahlung und
  `anker_datum` der neuen Zahlung lueckenlos oder bewusst erklaert sind.

## Do's

- Werte aus Belegen nur als Vorschlag zeigen und vor dem Schreiben bestaetigen
  lassen.
- Geld als Decimal-String mit zwei Nachkommastellen erfassen.
- `geprueft_am` nur nach Nutzer-Review setzen.
- Reine Schutzversicherungen ueber Beitrags-Regelzahlungen sichtbar machen, nicht
  als Aktivum.
- Die Checks `vorsorge-ungeprueft`, `vorsorge-wiedervorlage` und
  `vorsorge-wechsel` nach dem Lauf offen benennen.

## Don'ts

- **Keine eigene Steuer-/SV-Berechnung** fuer Rentenwerte. Netto nur vom Nutzer
  uebernehmen oder als klar markierte Schaetzung nach Freigabe speichern.
- **Kein stilles `geprueft_am`** aus blossem Belegfund setzen.
- **Keine Bilanzposition fuer Schutzversicherungen** anlegen.
- **Keine Kapitalwahl unterstellen** ohne Beleg oder Nutzerentscheidung.
- **Keine externen Betriebsquellen** heranziehen; dieser Skill arbeitet
  ausschliesslich im App-Raum.

## Wo was liegt

| Pfad | Zweck |
| --- | --- |
| `DATENROOT/vorsorge.json` | Vorsorge-Stammdaten |
| `DATENROOT/zeitwerte.jsonl` | Rueckkaufswerte, erwartete Renten und erwartete Kapitalleistungen |
| `DATENROOT/regelzahlungen.json` | Laufende Beitraege mit optionaler `vorsorge_id` |
| `DATENROOT/szenarien.json` | Szenario-Annahmen inkl. `vorsorge-leistung` |
| `schemas/vorsorge.schema.json` | Vorsorge-Schema |
| `schemas/zeitwerte.schema.json` | Zeitwert-Schema |
| `schemas/regelzahlungen.schema.json` | Regelzahlungs-Schema |
| `schemas/szenarien.schema.json` | Szenario-Schema |
| `tools/validator.mjs` | Validator vor und nach Schreiblaeufen |
| `vermoegen.mjs` | Nettovermoegen und Vorsorge-Checks |
| `szenarien.mjs` | Laufzeit-Aufloesung von `vorsorge-leistung` |
