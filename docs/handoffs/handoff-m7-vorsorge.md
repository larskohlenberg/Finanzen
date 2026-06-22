# Handoff: M7 — Versicherungen, Renten und Vorsorge

**An:** Agent im Projekt „Finanzmodell Runde 2“
**Quelle:** One-Shot-Referenz `…/Projekte/Finanzen_OneShot` — Vorsorge ist dort komplett modelliert (Datenmodell, Nettovermögens-Einbindung, Checks, UI, Agent-Skill). Dieses Handoff überträgt das auf eure Schemas und die bereits in `app/data/inbox/` liegenden Belege.
**Portierbare Dateien:** `beispieldaten/vorsorge.json` (Modellbeispiel), `shared/calc/nettovermoegen.js` (Kapital-Vorsorge-Logik), `skills/07-vorsorge-erfassung.md`, Tests `tests/calc-nettovermoegen.test.mjs`, `tests/checks.test.mjs`.

## 1. Drei fachliche Klassen sauber trennen (wichtigste Designentscheidung)

Die Inbox enthält drei verschiedene Dinge, die NICHT in eine Entität gehören:

| Klasse | Beispiele aus eurer Inbox | Modellierung |
|---|---|---|
| **Schutzversicherungen** (reine Kosten) | KFZ-HV, RSV, HV, UV, Beitragsrechnungen | KEIN Vermögensbezug. Nur: Regelzahlung (Beitrag) + optionaler Vertragseintrag fürs Register. Niemals im Nettovermögen. |
| **Kapitalbildende Vorsorge** | MusterversicherungA Riester (Standmitteilung 01/2026), Heidelberger Leben Vertragsstand | Eigene Entität + **Rückkaufswert als Zeitwert** → zählt als Aktivum ins Nettovermögen. |
| **Rentenanwartschaften** | gesetzliche Rente (Renteninformation), bAV | Eigene Entität + **erwartete Leistung als Zeitwert** → zählt NIE ins Nettovermögen (Anwartschaft ist kein heutiges Vermögen), wirkt nur in Szenarien als künftige Regelzahlung. |

Diese Trennung erfüllt direkt das Exit-Kriterium „spätere Leistungen sind als Rente, Kapitalleistung oder Ereignis modellierbar“ und verhindert den klassischen Fehler, eine Renteninformation als „Vermögen“ zu addieren.

## 2. Schema-Vorschlag `vorsorge.schema.json`

```json
{
  "vorsorge_id": "vs-riester-…",
  "art": "lebensversicherung | rentenversicherung | gesetzliche-rente | betriebsrente | riester | ruerup | sonstig",
  "name": "…", "person_id": "…",
  "geprueft": false,
  "qualitaet": "belegt | geschaetzt | offen",
  "beitrag_regelzahlung_id": "rz-…",
  "leistung": { "art": "monatsrente | einmalzahlung", "ab": "YYYY-MM-DD" },
  "bemerkung": "…"
}
```

- **`geprueft` ist Pflichtfeld** (bool, kein Default). `false` = Anspruch existiert, wurde aber nicht aktiv verifiziert. Das ist der Hebel für das Exit-Kriterium „ungeprüfte Ansprüche wirken nicht still als sichere Zukunftswerte“: Check + UI-Badge + Qualitäts-Deckelung (§4).
- **Beitragsverknüpfung über `beitrag_regelzahlung_id`** (Exit-Kriterium „laufende Beiträge mit Regelzahlungen verknüpfbar“): der Beitrag IST eine normale Regelzahlung (Kategorie „Vorsorge-Beiträge“), die Vorsorge referenziert sie. Kein doppelt gepflegter Betrag.
- **Werte leben in `zeitwerte.jsonl`** (euer bestehendes Konzept, zwei neue `feld`-Werte): `feld: "rueckkaufswert"` und `feld: "erwartete_leistung"` mit `bezug` auf die `vorsorge_id`. Datum = **Datum der Mitteilung**, nicht „heute“. Append-only → Standmitteilungs-Historie wird automatisch zum Verlauf.

## 3. Nettovermögens-Einbindung (eine Regel, ein Test)

In `vermoegen.mjs`: Positionen für Vorsorge-Einträge mit Kapitalcharakter (`lebensversicherung, rentenversicherung, riester, ruerup, betriebsrente`) = jüngster `rueckkaufswert`-Zeitwert; ohne Zeitwert → Wert `null`, Qualität `offen` (Lücke sichtbar, Gesamt-KPI wird `offen`). `gesetzliche-rente` erzeugt NIE eine Nettovermögensposition. Referenzlogik: `nettovermoegen.js` (One-Shot), Konstante `KAPITAL_VORSORGE`.

## 4. Ungeprüfte Ansprüche: drei Sicherungen

1. **Check `vorsorge-ungeprueft`** (Warnung) für jede Vorsorge mit `geprueft: false` oder Qualität `offen` — Text: „Anspruch darf nicht als sicher gelten“.
2. **UI-Badge** „ungeprüft“ in der Vorsorge-Ansicht + Hinweisbox „Ungeprüfte Ansprüche werden nicht als sichere Zukunftswerte gerechnet“.
3. **Szenario-Kopplung (M6):** Wenn eine erwartete Leistung in ein Szenario einfließt (z. B. Rente ab 2049 als `regelzahlung-neu`), erbt die Annahme höchstens Qualität `geschaetzt`, nie `belegt`, solange `geprueft: false`.

## 5. Onboarding-Reihenfolge für die vorhandenen Inbox-Belege

1. **MusterversicherungA Riester** (`260101_MusterversicherungA_Riester.pdf`, Standmitteilung): Vorsorge-Eintrag `riester`, Rückkaufswert als Zeitwert (Datum der Mitteilung, `belegt`), Beitrag als Regelzahlung verknüpfen, `geprueft: true` nach Nutzer-Review.
2. **Heidelberger Leben** (`2025_Vertragsstand_…`): analog (`lebensversicherung` oder `rentenversicherung` je Vertragstyp).
3. **Renteninformationen** (sobald vorhanden): `gesetzliche-rente` je Person, erwartete Leistung als Zeitwert `geschaetzt` (Hochrechnungs-Annahme in `bemerkung`), `geprueft` erst nach Nutzerprüfung.
4. **Schutzversicherungen** (KFZ/HV/RSV/UV-Beitragsrechnungen): NUR Regelzahlungen (Rhythmus aus Rechnung: jährlich/halbjährlich!) — kein Vorsorge-Eintrag, außer der Nutzer will ein Vertragsregister (dann separate, bewusst schlanke Entität).
5. Fehlende Werte (z. B. bAV ohne Standmitteilung) als offene Punkte erfassen, nicht raten.

## 6. Lebensphasen als Nebenprodukt mitnehmen

CONTEXT.md sagt: „Lebensphasen werden über Ereignisse und Erwerbsstatus abgebildet“. M7 ist der natürliche Zeitpunkt, das Datenmodell anzulegen (One-Shot-Referenz: `beispieldaten/lebensphasen.json` — `erwerbsphasen` je Person mit Verweis auf Einkommens-Regelzahlung, `ereignisse`, `sozialleistungen` mit Verweis auf Regelzahlung). Arbeitsende-Szenarien (M6) und Plan-Ist (M8) brauchen genau diese Bausteine.

## 7. Akzeptanztests

1. Vorsorge mit Rückkaufswert-Zeitwert erscheint im Nettovermögen mit Wert + Qualität; ohne Zeitwert als `null`/`offen`, Gesamt-KPI wird `offen`.
2. `gesetzliche-rente` erzeugt keine Nettovermögensposition, auch mit `erwartete_leistung`-Zeitwert.
3. Check `vorsorge-ungeprueft` feuert bei `geprueft: false`, verschwindet bei `true`.
4. Beitrags-Regelzahlung referenzierbar; Validator meldet kaputte `beitrag_regelzahlung_id`/`person_id`-Referenzen.
5. Zwei Standmitteilungen (2025, 2026) → beide Zeitwerte bleiben erhalten, der jüngere zählt.
