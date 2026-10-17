# Skill: Vorsorge-Erfassungs-Agent

Aktuelle Betriebsanweisung fuer beleggestuetztes Erfassen, Pruefen und
Aktualisieren von Vorsorgeanspruechen. Der Nutzer stoesst an, der Agent fuehrt.

Alle Pfade in diesem Skill sind app-relativ: `data/...`, `Belege/...`,
`schemas/...`, `tools/...` und `docs/...` liegen unter dem App-Raum.
Im Betrieb laufen Lesen, Schreiben und Tool-Laeufe ueber den MCP-Server
`finanzen` (Zuordnung CLI -> Tool in `docs/agent-context.md`, „Betrieb ueber
MCP"); die CLI-Aufrufe gelten so fuer die lokalen Demodaten.

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
- **Vertragsuebersicht ohne Kuendigungsbetrag** (z. B. Ausdruck aus einem
  Vermittlerportal): den ausgewiesenen Wert als `vertragswert` erfassen, mit
  `quelle_hinweis` auf den abgelegten Beleg. Er ist nur Anzeige und ersetzt
  keinen `rueckkaufswert`.
- **Kapitalprognose / Ablaufleistung:** `erwartete_kapitalleistung` als Zeitwert
  erfassen, wenn der Beleg eine einmalige Leistung oder ein Kapitalwahlrecht
  ausweist.
- **Absicherung (BU und Tod):** vier Werte zeigen, was bei Berufsunfaehigkeit
  oder Tod der versicherten Person (`person_id` am Vertrag) fliesst. Sie zaehlen
  nie ins Vermoegen und nie als Altersrente, sondern erscheinen nur in der
  Kachel Absicherung, in `kennzahlen` und in den Wertstaenden des Vertrags.
  Werte wie im Beleg, also brutto; keine Netto-Schaetzung.

  | Feld | Beleg | Einheit |
  | --- | --- | --- |
  | `bu_rente` | Police oder Nachtrag einer BU- oder BUZ-Versicherung: versicherte (garantierte) BU-Rente; nach Dynamik-Erhoehung der neue Wert | Euro je Monat |
  | `erwerbsminderungsrente` | Renteninformation der gesetzlichen Rente: Rente wegen voller Erwerbsminderung | Euro je Monat |
  | `todesfallleistung` | Police oder Standmitteilung: garantierte Todesfallleistung bzw. Todesfallsumme (Risiko-LV, LV, RV vor Rentenbeginn) | einmalig |
  | `hinterbliebenenrente` | Renteninformation oder Versorgungszusage: Witwen-/Witwerrente und Waisenrenten zusammen; nennt der Beleg sie nicht, nur nach Freigabe als `geschaetzt` mit Rechenweg in `quelle_hinweis` | Euro je Monat |

  Ein BU-Baustein in einer Renten- oder Lebensversicherung (BUZ) bekommt seinen
  Wert am selben Vertrag. Steht ein Wert bisher nur in der `bemerkung`, als
  Zeitwert nachtragen und die Bemerkung lassen. Wer das Geld bekommt, wird nicht
  erfasst.
- **Schutzversicherung:** kein Bilanz-Bein anlegen: kein `rueckkaufswert`, keine
  stille Kapitalleistung. Absicherungswerte (`bu_rente`, `todesfallleistung`)
  sind erlaubt, sie sind kein Vermoegen. Nur die Vorsorge-Entitaet und die Beitrags-Regelzahlung
  mit `vorsorge_id` vorbereiten, wenn der Vertrag fuer Beitraege, Status oder
  Wechsel-Checks relevant ist.
  Die Belege bleiben unter `Belege/Versicherungen/<Sparte>_<Versicherer>_<Vertragsnr>/`;
  `quelle_hinweis` nennt diesen Ordner mit `/` am Ende. Dann zeigt die App alle
  Belege darunter am Vorsorgeobjekt, auch spaeter abgelegte.

## Ablauf

1. **Datenmodus pruefen:** `DATENMODUS` und `DATENROOT` aus dem Prompt verwenden.
   Fehlt eines davon, abbrechen und nachfragen.
2. **Beleg sichten:** Police, Standmitteilung, Renteninformation,
   Versicherungsrechnung oder Kuendigungs-/Wechselbeleg lesen und den finalen
   `Belege/...`-Pfad als `quelle_hinweis` vorbereiten.

   Liegen die PDFs in `data/inbox/`, zuerst **einmal** `npm run inbox:schreiben`
   (MCP: `inbox` mit `schreiben: true`) fahren: der Lauf legt zu jedem PDF einen Textvorlauf (`pdftotext -layout`)
   unter `data/inbox/standardized/<name>.txt` ab. Danach den **Text** lesen statt
   des PDF-Binaers — bei einem Stapel Policen ist das der Unterschied zwischen
   einer Sitzung und mehreren. Der Lauf schreibt dabei **keine** Vorsorgedaten;
   er zerlegt nichts und deutet nichts. Bleibt eine Zahl im Text unklar oder
   zweideutig (Tabellen, Fussnoten, schlechter Scan), das Original-PDF oeffnen —
   der Textvorlauf ist eine Lesehilfe, kein Ersatz fuer den Beleg.

   Ist der Vorlauf **leer**, hat das PDF keine Textebene. Dann die Seiten des
   PDF selbst lesen (MCP: `datei_lesen` mit `seite`) und beim Ablegen den
   Textzwilling von Hand schreiben (per `datei_schreiben` neben die Rohdatei,
   `beleg_ablegen` nimmt ihn mit), erste
   Zeile `# Vom Agenten aus dem Bildscan gelesen, <JJJJ-MM-TT>.`

   Nach dem Ablegen des Belegs (MCP: `beleg_ablegen`) `npm run belege:text:schreiben`
   (MCP: `belege_text` mit `schreiben: true`) fahren: Das legt
   den Textzwilling neben den Beleg und raeumt `standardized/` ab.
3. **Vorsorge-Entitaet vorschlagen:** `vorsorge_id`, `art`, `name`, `person_id`,
   `status`, `kapitalbildend`, optional `kapitalwahl`, `leistung_beginn`,
   `aktiv_bis`, `ersetzt_vorsorge_id`, `quelle_standdatum` und `bemerkung`.
4. **Zeitwerte vorschlagen:** nur belegte oder nachvollziehbar geschaetzte Werte
   aus dem Beleg uebernehmen. Jeder Wert wird einzeln mit Quelle, Standdatum und
   Qualitaet gezeigt.
5. **Beitraege verknuepfen:** laufende Beitraege als Regelzahlungen mit
   `vorsorge_id` pflegen. Bestehende Regelzahlungen nicht direkt umdeuten, sondern
   im Regelzahlungs-Dialog mit Nutzerentscheidung vorbereiten.
   Bereits eindeutig geklärte Beitragsbuchungen tragen die `regelzahlung_id` der
   zugehörigen Beitrags-Regelzahlung. Keine `vorsorge_id` an Transaktionen ergänzen.
   Die Beitrags-Regelzahlung braucht dafür ihr `konto_id`; danach ordnet das Tool
   `regelzahlungen_zuordnen` die Beitragsbuchungen zu (erst Vorschau).
   Contribution bookings already clarified unambiguously carry the `regelzahlung_id`
   of their contribution recurring payment. Do not add `vorsorge_id` to transactions.
6. **Review vor Schreiben:** `geprueft_am` erst setzen, nachdem der Nutzer die
   Vorsorge-Entitaet und alle relevanten Werte fachlich gegengelesen hat.
7. **Validieren:** vor jedem Schreiben `tools/validator.mjs DATENROOT` laufen
   lassen, nach dem Schreiben erneut validieren und die verbleibenden
   Vorsorge-Checks aus `vermoegen.mjs` melden.
8. **Protokollieren:** schreibende Laeufe in `DATENROOT/agent_log.jsonl` mit
   geaenderten IDs, Zaehlern und kurzer Notiz dokumentieren.

## Kapitalwahlrecht

Riester: `kapitalbildend = false` (der Validator lehnt `true` ab). Zu Rentenbeginn
sind hoechstens 30 Prozent als Einmalzahlung waehlbar, `kapitalwahl = kapital`
bedeutet bei Riester genau diese Teilauszahlung; der Rest wird Rente. Den
Kuendigungsbetrag als `rueckkaufswert` erfassen, er erscheint als gebundenes
Kapital ausserhalb des Nettovermoegens.

`kapitalwahl` bleibt `offen`, solange der Beleg ein Wahlrecht nennt, aber keine
Nutzerentscheidung vorliegt. `monatsrente` oder `kapital` nur setzen, wenn der
Nutzer die Wahl bestaetigt oder der Vertrag eindeutig keine Wahl laesst.

Fuer Szenarien wird die spaetere Leistung nicht als bestaetigte Regelzahlung im
Bestand angelegt. Verwende bei Was-waere-wenn-Fragen eine `vorsorge-leistung`-
Annahme in `DATENROOT/szenarien.json`; `szenarien.mjs` rechnet daraus zur Laufzeit
Rente oder Kapitalleistung.

## Beitragsdynamik

Nennt ein Beleg eine planmaessige Beitragserhoehung (Dynamiknachtrag,
Erhoehungsangebot), gehoert sie strukturiert an den Vertrag, nicht nur in die
Bemerkung:

```json
"dynamik": {
  "termin": "11-01",
  "erlischt_nach": 3,
  "verlauf": [
    { "termin": "2024-11-01", "entscheidung": "angenommen" },
    { "termin": "2025-11-01", "entscheidung": "abgelehnt", "bemerkung": "Widerspruch per Brief, Bestaetigung liegt vor" }
  ]
}
```

- `termin` ist der jaehrliche Erhoehungstermin als `MM-TT`.
- `erlischt_nach` nur setzen, wenn der Beleg eine andere Zahl als drei
  Widersprueche in Folge nennt.
- Je Jahr ein Eintrag. `offen` heisst: Angebot liegt vor, noch nicht entschieden.
  Nach der Entscheidung des Nutzers auf `angenommen` oder `abgelehnt` setzen.
- Fruehere Entscheidungen ohne Beleg aus den Lastschriften ableiten: steigt der
  Beitrag zum Termin, wurde angenommen; bleibt er gleich, wurde widersprochen.
  Die Herleitung in `bemerkung` des Eintrags nennen.
- Der Vorschlag nach der Haushaltsregel ("nur jede dritte annehmen") wird
  gerechnet und in der App gezeigt; nicht speichern.
- Je Vertrag mit Dynamik eine jaehrlich wiederkehrende Frist anlegen
  (Fristenliste, `art = widerspruch`, `vorsorge_id`, `datum` = letzter Tag des
  Widerspruchs laut Beleg). Die Dynamik-Kachel ordnet sie dem naechstgelegenen
  Erhoehungstermin zu und zeigt, ob widersprochen werden muss.
- Ist der Widerspruch raus, oder wird die Erhoehung angenommen, `erledigt_bis`
  auf den Termin dieses Jahres setzen. Sonst meldet die Fristenliste ihn als
  ueberfaellig.
- Der Check `vorsorge-dynamik` meldet einen Vertrag, wenn der naechste Termin
  binnen 90 Tagen liegt oder ein Angebot `offen` ist.

## Wechsel und Nachfolge

Bei Kuendigung, Anbieterwechsel oder Tarifwechsel:

- alte Vorsorge mit `status = "gekuendigt"` oder passendem Status und
  `aktiv_bis` fuehren, wenn belegt,
- Nachfolger als eigene Vorsorge-Entitaet erfassen,
- im Nachfolger `ersetzt_vorsorge_id` auf die alte `vorsorge_id` setzen,
- Beitrags-Regelzahlungen so datieren, dass `aktiv_bis` der alten Zahlung und
  `anker_datum` der neuen Zahlung lueckenlos oder bewusst erklaert sind.

## Fristen mit anlegen

Nennt ein Beleg einen Tag, bis zu dem gehandelt werden muss, legst du ihn als
Frist in `DATENROOT/fristen.json` an (Regeln: `agent-context.md`, Abschnitt
„Fristen"), nicht nur als Satz in der `bemerkung`:

- **Dynamik-Nachtrag:** Widerspruchsfrist als `art = widerspruch`, jaehrlich
  (`rhythmus_einheit = jahr`, `rhythmus_intervall = 1`), `datum` = letzter Tag
  des Widerspruchs, `vorsorge_id` des Vertrags.
- **Police, Kuendigungshinweis:** Kuendigungsfrist als `art = kuendigung` mit
  dem letzten Kuendigungstag; bei Verlaengerung um ein Jahr jaehrlich.
- **Kapitalwahl, Optionen:** nur wenn der Beleg einen eigenen Stichtag fuer die
  Erklaerung nennt. Der Leistungsbeginn mit `kapitalwahl = offen` erscheint
  schon von selbst als Entscheidung, dafuer keine Frist anlegen.
- Beleg und Fundstelle in `bemerkung`.
- **Abhaken:** ist die Frist erledigt (Widerspruch geschickt, Entscheidung
  getroffen), `erledigt_bis` auf den erledigten Termin setzen. Bei jaehrlichen
  Fristen bleibt der naechste Termin offen. Ueberfaellige Termine meldet der
  Check `frist-ueberfaellig`.

## Do's

- Werte aus Belegen nur als Vorschlag zeigen und vor dem Schreiben bestaetigen
  lassen.
- Geld als Decimal-String mit zwei Nachkommastellen erfassen.
- `geprueft_am` nur nach Nutzer-Review setzen.
- `bemerkung` strukturiert schreiben (Kurzfassung, Abschnitte mit Ueberschrift
  und `- `-Punkten) nach „Bemerkungen“ in `app/docs/agent-context.md`. Neue
  Belege und Entscheidungen in den passenden Abschnitt einsortieren, nie als
  „NACHTRAG“ anhaengen; Erledigtes aus `Offen:` streichen.
- Reine Schutzversicherungen ueber Beitrags-Regelzahlungen sichtbar machen, nicht
  als Aktivum.
- Die Checks `vorsorge-ungeprueft`, `vorsorge-wiedervorlage`,
  `vorsorge-wechsel` und `frist-ueberfaellig` nach dem Lauf offen benennen.

### Anzeigefarbe festschreiben

Jeder neue Altersvorsorge-Vertrag (Renten und Lebensversicherungen, nicht
Schutzversicherungen) bekommt in `DATENROOT/farben.json` einen festen Farbslot
(`{ "vorsorge": { "VS-0xx": <slot> } }`, Slot 0 bis 13). Nimm den kleinsten freien
Slot; vorhandene Eintraege nie umnummerieren, sonst wechseln Vertraege in allen
Grafiken die Farbe. Die App vergibt ohne Eintrag dieselbe Farbe automatisch,
der Eintrag macht sie dauerhaft.

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
| `DATENROOT/zeitwerte.jsonl` | Rueckkaufswerte, erwartete Renten und Kapitalleistungen, Vertragswerte, Absicherungswerte (BU, Tod) |
| `DATENROOT/regelzahlungen.json` | Laufende Beitraege mit optionaler `vorsorge_id` |
| `DATENROOT/szenarien.json` | Szenario-Annahmen inkl. `vorsorge-leistung` |
| `DATENROOT/fristen.json` | Fristen und Termine, optional mit `vorsorge_id` |
| `schemas/vorsorge.schema.json` | Vorsorge-Schema |
| `schemas/zeitwerte.schema.json` | Zeitwert-Schema |
| `schemas/regelzahlungen.schema.json` | Regelzahlungs-Schema |
| `schemas/szenarien.schema.json` | Szenario-Schema |
| `tools/validator.mjs` | Validator vor und nach Schreiblaeufen |
| `vermoegen.mjs` | Nettovermoegen und Vorsorge-Checks |
| `szenarien.mjs` | Laufzeit-Aufloesung von `vorsorge-leistung` |
