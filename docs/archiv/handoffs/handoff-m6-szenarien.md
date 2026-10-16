# Handoff: M6 — Szenarien und Arbeitsende-Fragen

**An:** Agent im Projekt „Finanzmodell Runde 2“
**Quelle:** One-Shot-Referenz `…/Projekte/Finanzen_OneShot` — dort ist M6 funktional komplett umgesetzt und getestet. Dieses Handoff liefert Datenmodell, Engine-Algorithmus, Guardrail-Formeln und Akzeptanztests. Alle M5-Grilling-Vermerke (geplante Sondertilgungen, Restschuld-Projektion, Cash-Realismus, Plan-Zusammensetzungs-Kanal, quasi-liquide Reserven) sind abgedeckt.
**Portierbare Dateien:** `shared/calc/szenarien.js` (Engine), `shared/calc/regelzahlungen.js` (Termin-Expansion), `shared/calc/darlehen.js` (Restschuld-Projektion), `tests/calc-szenarien.test.mjs`, `tests/calc-darlehen.test.mjs`, Beispiele `beispieldaten/szenarien/*.json`. Feldnamen an eure Konventionen (`snake_case`, `person_id`-Stil) anpassen.

## 1. Datenmodell

Ein Szenario = eine Datei (`szenarien/<id>.json`), Schema neu anlegen:

```json
{
  "szenario_id": "sz-arbeitsende-2031",
  "name": "…", "beschreibung": "…",
  "status": "entwurf | bestaetigt | archiviert",
  "stand": "YYYY-MM-DD",
  "reichweite": { "bis": "YYYY-MM-DD" },
  "annahmen": [ … ]
}
```

**Sechs Annahme-Arten** (jede Annahme: eigene `annahme_id`, `qualitaet`, möglichst `begruendung`):

| Art | Pflichtfelder | Bemerkung |
|---|---|---|
| `einmalzahlung` | `datum`, `betrag` (Vorzeichen!), opt. `konto_id` | Erbschaft, Versicherungsleistung, Anschaffung |
| `regelzahlung-neu` | `ab`, `betrag`, `rhythmus`, `konto_id`, opt. `bis`, `name` | ALG I, neue Stelle, Hortkosten |
| `regelzahlung-aenderung` | `regelzahlung_id`, `ab`, `aktion: beenden \| betrag-aendern` (+`betrag`) | Teilzeit, Kündigung, Beitragserhöhung |
| `sondertilgung` | `darlehen_id`, `betrag`; einmalig: `datum`; wiederkehrend: `rhythmus` + `ab` (+`bis`) | exakt der M5-Grilling-Vermerk („Februar 2031: 20.000“ / „jedes Jahr im Dezember: 500“) |
| `depot-verkauf` | `konto_id` (Depot), `datum`, `betrag`, `vorbehalt`-Text | quasi-liquide Reserve, siehe §4 |
| `lebensereignis` | `name`, `datum` | dokumentarisch; Geldwirkung über verknüpfte Annahmen |

Wichtig (Exit-Kriterium „Annahmen versioniert oder mit Gültigkeit“): Status-Trennung `entwurf`/`bestaetigt` + `stand`-Datum erfüllt das; bestätigte Szenarien werden bei Realitätsänderung nicht editiert, sondern archiviert und neu angelegt — oder bewusst mit neuem `stand` aktualisiert (Nutzerentscheidung, protokolliert).

## 2. Engine-Algorithmus (deterministisch, rein, ~200 Zeilen)

Eingabe: validierter Datenbestand + Szenario + Stichtag. Ausgabe: monatliche Punkte, Annahmen-Echo, Gesamtqualität, Warnungen. Schritte:

1. **Regelzahlungen modifizieren** (Kopie!): `beenden` → `ende = ab − 1 Tag`; `betrag-aendern` → Original endet am Vortag, Klon mit neuem Betrag ab `ab`; `regelzahlung-neu` → synthetische bestätigte Regelzahlung.
2. **Liquide Startposition** zum Stichtag: belegter Anker + Ist-Buchungen je liquidem Konto (eure M4-Logik). Depots getrennt summieren (für §4 und Nettovermögensserie).
3. **Geldereignisse sammeln:** Expansion **nur bestätigter** (modifizierter) Regelzahlungen auf liquiden Konten bis `reichweite.bis`; plus Einmalzahlungen; plus Sondertilgungs-Termine (einmalig oder per Rhythmus expandiert) als Liquiditätsabfluss; plus Depot-Verkäufe als Zufluss.
4. **Restschuld-Projektion je Darlehen** bis `reichweite.bis`: ab belegtem Anker monatlich `zins = round(rest × nominalsatz / 12)` (Ganzzahl-Arithmetik, Prozentsatz skaliert — siehe `darlehen.js`), `tilgung = rate − zins`, geplante Sondertilgungen am jeweiligen Datum abziehen, bei 0 klemmen + `abbezahlt_am` liefern. Ohne Anker: `null` + Qualität `offen` (ADR 0013). Das ist die im M5-Grilling vorgemerkte **Restschuld-Projektion auf Zukunftsdatum**.
5. **Monatliche Punkte** (Monatsende): `liquide` (kumulierte Ereignisse), `depot` (Start ± Verkäufe), `restschuld` (Projektionswert), `nettovermoegen = liquide + depot + statische Vermögenswerte/Rückkaufswerte − restschuld` (statisch = jüngste Zeitwerte zum Stichtag; bewusste Vereinfachung, dokumentieren).
6. **Qualität:** worst-of über alle Eingaben (Anker, Regelzahlungen, Annahmen) → Exit-Kriterium „Szenarioergebnisse zeigen Datenqualität“.
7. **Warnungen** (siehe §3/§4) — unverkürzt ans UI durchreichen.

## 3. Cash-Realismus-Guardrail (Formel)

Deckt den Grilling-Vermerk inkl. Bar-Anteil-Beispiel ab:

- **Ist:** Summe aller Ausgaben (Betrag < 0, **ohne Transfers** — Bargeldabhebungen zählen so automatisch als Abfluss mit, solange sie nicht als Transfer auf ein Bargeld-Konto modelliert sind) der letzten **3 vollen Kalendermonate** vor dem Stichtag, ÷ 3.
- **Plan:** Summe der Ausgaben-Termine aller bestätigten (modifizierten) Regelzahlungen der nächsten **12 Monate**, ÷ 12.
- **Warnung `cash-realismus`**, wenn `plan < 0.9 × ist`, mit beiden Beträgen im Text („Geplante Ausgaben X/Monat liegen deutlich unter dem historischen Ist Y/Monat — mögliche unsichtbare Ausgaben, Prognose eher zu rosig“).
- Zusätzlich **`liquiditaet-negativ`**: erster Monatspunkt < 0 mit Datum und Betrag.

**Kanal für Plan-Zusammensetzung an den Agenten** (Grilling-Vermerk): pro Regelzahlung ein freies Feld `zusammensetzung` (z. B. „MusterladenB ~280 + Lidl ~100 + bar ~120“), vom Agenten im Dialog gefüllt; der Plan-Ist-Abgleich (M8) und der Guardrail-Text referenzieren es. Unsichtbarer Bar-Anteil kann alternativ als geschätzte Bargeld-Transaktion (Qualität `geschaetzt`) erfasst werden — dann stimmt das Ist statt des Plans.

## 4. Quasi-liquide Reserven (ADR-0016-konform)

Depot-Verkäufe niemals in den M4-Liquiditätssaldo mischen. Im Szenario: Verkauf ist ein datiertes Ereignis, das Liquidität erhöht und den Depotwert senkt, und erzeugt IMMER die Warnung `depot-vorbehalt` („… quasi-liquide Reserve mit Kurs- und Verfügbarkeitsvorbehalt — kein sicheres Geld“). Annahme nur auf ausdrücklichen Nutzerwunsch aufnehmen (Skill!). Damit ist der vorgemerkte Punkt „Settlement, Kursrisiko“ sichtbar statt stillschweigend.

## 5. UI-Muster

- Szenario-Liste: Name, Status-Badge, Annahmen-Zahl, Reichweite, Liquidität am Ende (rot wenn negativ), Qualitäts-Badge.
- Detail: KPI-Zeile **Szenario vs. Basis** (Basis = Engine mit leerer Annahmenliste — gleicher Code, kein Sonderfall), Warnungs-Boxen, zwei Liniendiagramme (liquide, Nettovermögen; Szenario durchgezogen, Basis gestrichelt), Annahmen-Tabelle mit Art/Inhalt/Qualität/Begründung.
- Exit-Kriterium „keine zentrale Lebensentscheidung aus Platzhaltern“: jede Annahme zeigt ihre Qualität; Gesamtbadge = worst-of; Warnungen nicht wegklickbar zusammenfassen.

## 6. Akzeptanztests (aus `tests/calc-szenarien.test.mjs`, Zahlen nachrechenbar)

1. Basisszenario ohne Annahmen schreibt nur bestätigte Regelzahlungen fort (Start 1.000, Miete −500/Monat, 6 Monate → Ende −2.000).
2. Einmalzahlung + `beenden` wirken ab ihrem Datum (1.000 − 500 − 500 + 2.000 = 2.000).
3. `regelzahlung-neu` + `betrag-aendern` (Splitting am Stichtag) korrekt.
4. Depot-Verkauf: Liquidität +Betrag, Depot −Betrag, Warnung `depot-vorbehalt` vorhanden.
5. Sondertilgung: Liquidität −Betrag UND Restschuld −Betrag am richtigen Termin; wiederkehrende Sondertilgung expandiert.
6. Restschuld klemmt bei 0, `abbezahlt_am` korrekt (Rest 250, Rate 100 → 3. Termin).
7. Guardrail: Historie 2.000/Monat Ist, Plan 500/Monat → Warnung `cash-realismus`.
8. Vorgeschlagene (unbestätigte) Regelzahlungen wirken NICHT.

## 7. Agent-Playbook

`skills/06-szenarien-annahmen.md` aus der One-Shot-Referenz übernehmen (Struktur an eure `app/docs/skills/` angleichen). Kernregeln: Nutzerwunsch in datierte Einzelannahmen zerlegen, stille Zusatzannahmen explizit machen, Steuer-/SV-Effekte nie selbst „berechnen“ (Nutzerwert oder grobe Schätzung mit Begründung), `bestaetigt` nur nach ausdrücklicher Abnahme, Engine-Warnungen unverkürzt weitergeben.
