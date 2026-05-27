# Geldbetraege als Decimal-String, intern als Cent-Integer

Geldbetraege werden in JSON/JSONL als **Decimal-String** mit exakt zwei Nachkommastellen gespeichert, z. B. `"betrag": "-123.45"`. Schema-Pattern: `^-?\d+\.\d{2}$`. Im App-/Validator-Code wird beim Lesen einmal in einen **Cent-Integer** konvertiert, alle Berechnungen laufen auf Integer, beim Schreiben wird zurueckformatiert.

Begruendung: Lesbarkeit der Rohdateien war eine harte Anforderung des Nutzers — `"-12345"` (Cent) waere schwerer mental zu interpretieren. Gleichzeitig fuehrt direktes Rechnen mit JavaScript-Floats zu Precision-Bugs (`0.1 + 0.2 = 0.30000000000000004`), die in Summen und Paarungs-Checks (Transfer-Gegenlaeufigkeit, Cashflow-Aggregate) subtile False-Negatives verursachen koennen.

## Verworfene Alternativen

- **Float (`-123.45` als Zahl)**: lesbar, aber Precision-Bugs.
- **Integer Cent direkt in JSON (`-12345`)**: praezise, aber schlechtere Lesbarkeit beim manuellen Inspizieren.
- **Decimal-Library (Big.js o. ae.) im ganzen Code**: korrekt, aber zusaetzliche Abhaengigkeit; bei Privat-Skala unnoetig.

## Konsequenz

Genau zwei Stellen im Code konvertieren: ein zentraler Reader (`parseAmount`) und ein zentraler Writer (`formatAmount`). Im Rest des Codes nur Integer-Arithmetik. JavaScript-Number-Range deckt Cent-Integer bis ca. 90 Billionen EUR ab — irrelevant fuer privaten Gebrauch.
