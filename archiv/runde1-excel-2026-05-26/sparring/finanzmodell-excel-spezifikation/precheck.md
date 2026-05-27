# Pre-Check — finanzmodell-excel-spezifikation

**Artefakt:** `.` mit Include-Liste der fuenf `Finanzmodell_*.md`-Spezifikationsdateien
**Erkannter Sparring-Typ:** Text
**Datum:** 2026-05-20

| Dimension | Score (0-2) | Begruendung (1 Satz) |
|-----------|-------------|----------------------|
| Verbesserungs-Headroom | 2 | Die Spezifikation ist umfangreich und entscheidungsstark, steht aber noch vor der ersten baubaren Excel-Mappe, sodass Datenmodell, Bedienbarkeit und Umsetzungsplan noch produktiv angegriffen werden koennen. |
| Konfliktflaeche         | 2 | Mehrere Grundannahmen sind verhandelbar, insbesondere ob Excel zugleich Bedienoberflaeche, Auditspur, Agentensteuerung und reproduzierbares Build-Artefakt sein sollte. |
| Zielklarheit           | 2 | Zweck, naechster Umsetzungsschritt, verbindliche Dokumente und Arbeitsregeln sind in Handover, Bauplan, Datenmodell und Entscheidungsprotokoll klar dokumentiert. |
| **Summe (nach Vetos)** | **6/6** | — |

## Veto-Check

- **Headroom-Veto:** nicht ausgelöst — trotz vieler finalisierter Entscheidungen ist die Spezifikation noch nicht gegen reale Nutzung, Importdaten, Workbook-Bau und Nutzerfuehrung validiert.
- **Zielklarheit-Veto:** nicht ausgelöst — das Ziel ist eindeutig: aus den Dokumenten eine reproduzierbar baubare und pruefbare Excel-Mappe Version 1 ableiten.

## Größenklasse

**Eingeschätzt:** Groß
**Begründung:** Das Artefakt besteht aus mehreren langen Konzept- und Spezifikationsdateien mit Datenmodell, Entscheidungsverlauf, Agentenmethodik, Handover und technischem QA-Plan.

## Empfehlung

**Roher Empfehlungswert (aus Score):** 10 Runden
**Cap durch Größenklasse:** 10 Runden
**Finale Empfehlung:** 10 Runden
**Begründung:** Inhaltlich waere eine tiefe Schärfung gerechtfertigt, weil die Spezifikation viele gekoppelte Entscheidungen enthält und echte Architektur-, Usability- und Prozessrisiken tragen kann. Der User hat im Turbo-Auftrag jedoch explizit 5 Runden genannt; diese Zahl gewinnt fuer das eigentliche Setup gegen die Precheck-Empfehlung.

## Score → Runden (Mapping)

| Score | Runden |
|-------|--------|
| 0-1   | 0 (nicht empfohlen) |
| 2-3   | 3 |
| 4-5   | 5 |
| 6     | 10 |

## Größen-Cap

| Größenklasse | Cap |
|--------------|-----|
| Klein        | 3   |
| Mittel       | 5   |
| Groß         | 10  |
