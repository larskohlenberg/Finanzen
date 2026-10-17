# Fristen als eigene Liste

Status: entschieden am 2026-10-17.

## Kontext

Fristen wie Dynamik-Widerspruch, Kuendigungsfrist oder eine anstehende
Entscheidung standen nur als Fliesstext in den Bemerkungen der Vertraege. Die
App konnte sie nicht auswerten: keine Erinnerung, kein Check, kein Termin in
der Uebersicht. Manche Fristen haengen an keinem Objekt (Steuererklaerung),
manche kehren jaehrlich wieder.

## Entscheidung

- Fristen liegen als eigene Liste in `fristen.json` im Datenbestand, nach dem
  Muster der Regelzahlungen: `datum` (letzter Handlungstag) als Anker,
  optional `rhythmus_einheit` + `rhythmus_intervall` fuer wiederkehrende
  Fristen, hoechstens ein Bezug (Vorsorge, Darlehen, Immobilie, Konto,
  Vermoegenswert, Regelzahlung) oder keiner.
- Abgehakt wird ueber `erledigt_bis`: Termine bis einschliesslich diesem Datum
  sind erledigt. Kein Status-Feld, keine Historie; die Git-Historie des
  Bestands genuegt.
- Was schon aus vorhandenen Feldern folgt (Zinsbindungs- und Laufzeitende,
  Leistungsbeginn, Vertrags- und Zahlungsende), wird nicht erfasst, sondern
  von `anstehendeFristen` in `app/fristen.mjs` abgeleitet.
- Ein ueberfaelliger, nicht abgehakter Termin ist ein Check
  (`frist-ueberfaellig`). Die Objekte zeigen ihre naechsten Termine, das
  MCP-Tool `kennzahlen` listet sie mit.
- Geschrieben wird ueber die vorhandenen Datei-Tools; ein eigenes Tool lohnt
  sich bei einer Handvoll Eintraege nicht.

## Verworfene Alternativen

- **Fristen direkt an den Objekten** (ein Feld oder eine Liste an Vorsorge,
  Darlehen, Immobilie). Fristen ohne Objekt haetten keinen Platz, jedes Objekt
  braeuchte dieselben Felder samt Validierung, und wer alle Termine sehen will,
  muesste jede Datei durchsuchen. Die eigene Liste folgt dem bekannten Muster
  der Regelzahlungen und ist an einer Stelle zu pflegen.
- **Fristen nur ableiten, nie erfassen.** Deckt Zinsbindung und Leistungsbeginn
  ab, aber nicht Widerspruchs- und Kuendigungsfristen, die nur im Brief stehen.
