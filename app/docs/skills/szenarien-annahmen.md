# Skill: Szenarien-Annahmen

Aktuelle Betriebsanweisung fuer das Anlegen und Pflegen von Szenarien und ihren Annahmen. Fachlich aus M6 entstanden, in M7 um Vorsorge-Leistungen (Renteneintritt, Kapital-/Todesfallleistung) erweitert.

Alle Pfade in diesem Skill sind app-relativ: `data/...`, `schemas/...` und `docs/...` liegen unter dem App-Raum.

## Wann diesen Skill nutzen

Nutze ihn, wenn der Nutzer

- eine Was-waere-wenn-Frage stellt (Sondertilgung, Verkauf, Kauf, Erbschaft, Schenkung, hypothetische Gehalts- oder Ausgabenaenderung),
- ein Vorsorge-Szenario durchspielt (Renteneintritt: gesetzliche Rente + Verrentung kapitalbildender Vertraege; Todesfall: Risiko-/Kapitalleistung, Witwen-/Waisenrente),
- ein bestehendes Szenario anlegen, aendern, bestaetigen oder verwerfen will,
- nach der Auswirkung einer hypothetischen Annahme auf Liquiditaet, Restschuld oder Nettovermoegen fragt.

Nicht nutzen fuer:
- Vertraglich feststehende oder bereits eingetretene wiederkehrende Zahlungen — das ist Aufgabe des Regelzahlungs-Agenten (Skill `regelzahlung-agent`).
- Einmaleffekte, die bereits Fakt sind (nicht hypothetisch) — gehoeren in `DATENROOT/regelzahlungen.json` bzw. eine kuenftige Buchung, nicht in ein Szenario.

## Kontext, den du kennen musst

Vor jeder Szenario-Aenderung lesen:

1. `docs/agent-context.md` — gemeinsame Betriebsregeln fuer App-Raum, Status, Validierung und Szenarien.
2. `DATENROOT/szenarien.json` — bestehende Szenarien.
3. `schemas/szenarien.schema.json` — formale Form von Szenario und Annahme.
4. `DATENROOT/regelzahlungen.json` — fuer `regelzahlung-aenderung`-Annahmen (Ziel muss existieren) und fuer die `qualitaet`-Konvention (`belegt|geschaetzt`).
5. `DATENROOT/vorsorge.json` — fuer `vorsorge-leistung`-Annahmen (`vorsorge_id` muss existieren) und die zugehoerigen Zeitwerte (`erwartete_rente`, `erwartete_kapitalleistung`, `rueckkaufswert`) in `DATENROOT/zeitwerte.jsonl`.
6. `tools/validator.mjs` — prueft Szenario-Annahmen inklusive `gegenbuchung` (bespoke Cross-Field-Pruefung, keine generische Schema-Validierung).

## Prozess

- **In datierte Einzelannahmen zerlegen.** Ein Nutzerwunsch wie "was, wenn ich naechstes Jahr 20.000 € sondertilge und dafuer mein Gehalt um 200 € steigt" wird zu zwei Annahmen mit je eigenem Datum, nicht einer vagen Sammelannahme.
- **Faktum vs. Hypothese trennen.** Steht die Aenderung bereits vertraglich fest (z. B. zugesagte Gehaltserhoehung mit Datum), ist sie eher eine Regelzahlungs-Aenderung im Bestand (Skill `regelzahlung-agent`) als eine Szenario-Annahme. Eine Annahme ist per Definition hypothetisch oder noch nicht final entschieden.
- **Stille Zusatzannahmen explizit machen.** "Ich verkaufe die Wohnung" heisst nicht automatisch "zum aktuellen Marktwert, am Anfang naechsten Monats, ohne Steuer" — diese Annahmen explizit mit dem Nutzer klaeren und in `begruendung` festhalten statt sie zu erraten.
- **Steuer- und Sozialversicherungseffekte nie selbst berechnen.** Frage den Nutzer nach einem Netto-Wert oder nutze eine grobe, klar als solche gekennzeichnete Schaetzung mit `begruendung` — keine eigene Steuerlogik in der Annahme verstecken.
- **`status = "bestaetigt"` nur nach ausdruecklicher Abnahme.** Ein neu angelegtes oder geaendertes Szenario startet als `"entwurf"`. Genau wie bei Regelzahlungen ist die Bestaetigung immer eine Nutzerentscheidung, nie eine stille Annahme des Agenten.
- **Engine-Warnungen unverkuerzt weitergeben.** `rechneSzenario`/`computeSzenario` (`szenarien.mjs`) liefern `warnungen` (z. B. `depot-ueberzogen`, `liquiditaet-negativ`, `kategorie-ungeplant`, `cash-realismus`, `aenderung-wirkungslos`, `annahme-vergangen`) — diese dem Nutzer vollstaendig zeigen, nicht zusammenfassen oder weglassen.
- **`gegenbuchung(depot)` nur auf ausdruecklichen Wunsch.** Ein Depot-Verkauf/-Kauf als Gegenbuchung veraendert eine zweite Bilanzposition mit eigener Unsicherheit (Kurs, Steuer) — nicht implizit unterstellen, nur wenn der Nutzer das Depot ausdruecklich als Gegenposition nennt.

## Annahme-Arten und Gegenbuchung

- `einmalzahlung`: einmaliges Cash-Ereignis an einem Datum, optional mit `gegenbuchung`.
- `regelzahlung-neu`: neue wiederkehrende Zahlung im Szenario, optional mit `gegenbuchung` (nur `ziel_typ ∈ {darlehen, depot}`, nur bestehende `ziel_id`).
- `regelzahlung-aenderung`: aendert eine bestehende Regelzahlung im Bestand nur innerhalb des Szenarios (`aktion: beenden|betrag-aendern`), keine `gegenbuchung`.
- `vorsorge-leistung`: aktiviert die Leistung einer Vorsorge (`vorsorge_id` + `arm ∈ {rente, kapital}` + `ab`-Datum), keine eigene `gegenbuchung` (die Engine erzeugt sie zur Rechenzeit). `arm: rente` wird zu einer `regelzahlung-neu` aus dem `erwartete_rente`-Zeitwert, `arm: kapital` zu einer `einmalzahlung` aus `erwartete_kapitalleistung`; bei kapitalbildender Vorsorge wird der `rueckkaufswert` per Gegenbuchung abgebaut. Fehlt `geprueft_am` auf der Vorsorge, deckelt die Engine die Qualitaet auf `offen`.
- `gegenbuchung`: koppelt das Cash-Bein an eine zweite Bilanzposition (`ziel_typ ∈ darlehen|depot|immobilie|vermoegenswert|vorsorge`), entweder bestehende `ziel_id` oder neue `neue_position {bezeichnung, wert}`. Deckt Kauf, Verkauf, Sondertilgung, Erbschaft, Schenkung und Vorsorge-Abbau ab — bei Erbschaft/Schenkung ist eines der beiden Beine `"0.00"`. Den `vorsorge`-Abbau setzt in der Regel die Engine selbst aus `vorsorge-leistung`; eine Position darf pro Szenario nur einmal abgebaut werden.

`qualitaet` ist Pflicht pro Annahme (`belegt|geschaetzt|offen`) und faengt die Unsicherheit auf Annahme-Ebene ein, getrennt von der vertraglichen `qualitaet` einer Regelzahlung.

## Do's

- Vor jedem Schreiben `tools/validator.mjs` aufrufen (Tool prueft, Agent schreibt).
- `szenario_id` sequenziell nach Konvention `SZN-\d{3}` vergeben.
- Jede Annahme einzeln mit Datum, Betrag und `qualitaet` versehen; `begruendung` fuer alles, was nicht aus den Feldern selbst hervorgeht.
- Bei Aenderung eines bestaetigten Szenarios den Nutzer auf den Statuswechsel zurueck zu `entwurf` hinweisen, falls die Aenderung inhaltlich relevant ist.

## Don'ts

- **Keine eigene Steuer-/SV-Berechnung** in einer Annahme verstecken.
- **Keine stillen Zusatzannahmen** (Datum, Betrag, Marktwert) ohne Ruecksprache.
- **Kein stilles `bestaetigt`** ohne ausdrueckliche Nutzer-Abnahme.
- **Keine `gegenbuchung(depot)`** ohne ausdruecklichen Nutzerwunsch.
- **Keine Engine-Warnung weglassen oder abschwaechen.**

## Wo was liegt

| Pfad | Zweck |
| --- | --- |
| `DATENROOT/szenarien.json` | Szenario- und Annahmen-Stammdaten |
| `DATENROOT/vorsorge.json` | Vorsorge-Stammdaten (Ziel von `vorsorge-leistung`/`gegenbuchung(vorsorge)`) |
| `schemas/szenarien.schema.json` | Schema-Referenz |
| `szenarien.mjs` | Deterministische Szenario-Engine (`rechneSzenario`/`computeSzenario`), nur Anzeige |
| `tools/validator.mjs` | Validator inkl. Szenario-Cross-Field-Pruefung (vor jedem Schreiben) |
