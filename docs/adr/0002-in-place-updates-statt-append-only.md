# In-place Updates statt Append-only Ledger

Aenderungen an Datensaetzen (z. B. Korrektur einer Transaktions-Kategorie) erfolgen **in-place** in den JSON/JSONL-Dateien. Es gibt **kein** Append-only-Ledger, **kein** Versions-Feld und **kein** separates Audit-Log. Hartes Loeschen ist erlaubt.

Begruendung: Dies ist ein privates Familien-Finanzmodell, kein Unternehmen mit Pruefpflichten. Eine Kategorie aendern heisst: aendern. Wenn falsch, zurueckaendern. Waehrend der Entwicklung dient Git als grobe Spur. Nach Abgabe der App laeuft sie standalone ohne Git — dann gibt es bewusst keine Historie ausser dort, wo der zeitliche Verlauf fachlich notwendig ist (siehe `zeitwerte.jsonl` fuer Immobilien-Werte, Renten-Erwartungen, Versicherungs-Rueckkaufswerte).

## Verworfene Alternativen

- **Strikt append-only mit `version`-Feld pro `transaktion_id`**: maximale Auditierbarkeit, aber Overhead und Komplexitaet ohne Gegenwert im privaten Setup.
- **In-place Update plus separates `transaktion_aenderungen.jsonl`-Audit-Log**: zwei Quellen, Inkonsistenz-Risiko.

## Konsequenz

Die App liest pro `transaktion_id` genau einen Record. Wer Aenderungen historisch nachvollziehen will, kann waehrend der Entwicklung in Git schauen — danach nicht mehr. Werte mit echtem Zeitverlauf gehoeren bewusst in `zeitwerte.jsonl`, nicht in eine Update-Historie.
