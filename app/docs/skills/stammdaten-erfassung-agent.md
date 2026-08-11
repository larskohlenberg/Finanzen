# Skill: Stammdaten-Erfassungs-Agent

Aktuelle Betriebsanweisung fuer interviewgeführte, schema-getriebene Erfassung und Validierung von Stammdaten. Fachlich aus M5 entstanden; der Nutzer stößt an, der Agent führt.

Alle Pfade in diesem Skill sind app-relativ: `data/...`, `Belege/...`,
`schemas/...`, `tools/...` und `docs/...` liegen unter dem App-Raum.

## Zweck

Den Nutzer Schritt für Schritt durch die Erfassung beliebiger Stammdaten leiten und jeden Wert an Beleg, Schema und Datenqualitäts-Checks binden. **Schema-getrieben**, also nicht M5-spezifisch: gilt für Personen, Konten, Kategorien, Regelzahlungen, Immobilien, Darlehen, weitere Vermögenswerte und Zeitwerte (und später Versicherungen/Renten). Welche Felder Pflicht/optional sind und welche Muster gelten, kommt immer aus dem zugehörigen `schemas/*.schema.json` bzw. aus `tools/validator.mjs` — nichts auswendig annehmen.

## Modellqualität

- **Sonnet** als Default für die Erfassung.
- **Opus** für schwierige Belege: Mehrtranchen-Darlehen, schlechte Scans, verschachtelte Depotauszüge.
- **Haiku nicht** für die Wert-Übertragung — Verlese-Risiko ist zu hoch, weil die Checks plausibel-falsche Zahlen (richtige Größenordnung, falscher Wert) nicht fangen.

## Kontext, den du kennen musst

- `docs/agent-context.md` — gemeinsame Regeln fuer App-Raum, Validierung, Zeitwerte, belegte Anker, Reconciliation, Regelzahlungen und Agentenprotokoll.
- Das jeweilige `schemas/*.schema.json`.
- `tools/validator.mjs`.
- `vermoegen.mjs` fuer Nettovermoegen- und Check-Berechnung.

## Ablauf

1. **Begrüßung + Überblick:** „Welche Entität erfassen wir heute?" (Konto, Immobilie, Darlehen, Vermögenswert, Zeitwert …).
2. **Pro Entität:**
   - nach dem **Beleg** fragen (Kontoauszug, Kaufvertrag, Darlehensvertrag, Depotauszug, Gutachten …),
   - Werte aus dem Beleg **vorschlagen**,
   - `quelle_hinweis`, `standdatum`/`quelle_standdatum` und `qualitaet` (`belegt`/`geschaetzt`) setzen,
   - `tools/validator.mjs` laufen lassen (Tool prüft, Agent schreibt),
   - Nutzer bestätigt **Wert für Wert**.
3. **Nach jedem Block: Checks anzeigen** — fehlende Bewertung, Reconciliation-Drift, Σ der Eigentumsanteile, Darlehen ohne Raten-Regelzahlung.
4. **Bei einem neuen Konto: Import-Profil anschliessen** (siehe unten).
5. **Abschluss:** `agent_log.jsonl`-Eintrag schreiben und die **Nettovermögen-Aufschlüsselung** zum Gegenlesen zeigen.

## Neues Konto: das Import-Profil gehört dazu

Ein Konto anzulegen ist erst dann fertig, wenn auch der Weg steht, wie Umsätze
dieses Kontos hineinkommen. Direkt nach dem bestätigten Konto-Eintrag:

1. Fragen, ob es einen **CSV-Umsatzexport** der Bank gibt (nicht nur PDF-Auszüge).
2. Wenn ja: gemeinsam mit dem Nutzer **einmalig** ein Profil unter
   `data/import-profile/<profil_id>.json` anlegen — Vertrag ist
   `schemas/importprofil.schema.json`. Danach ist jeder weitere Export dieser Bank
   ein Tool-Aufruf (`npm run inbox`) statt Handarbeit.
3. `dateimuster` so scharf fassen, dass genau **ein** Profil auf die Datei passt;
   zwei Treffer brechen den Inbox-Lauf bewusst ab.
4. **Nie raten:** Gibt es für ein Feld keine verlässliche Spalte, bleibt es leer
   (`{"konstante": ""}`). Eine falsche Gegenpartei ist schlimmer als eine fehlende.
5. `bank_referenz` nur mappen, wenn die Bank sie je Buchung stabil und eindeutig
   vergibt — sonst weglassen, damit der Freitext-Hash greift.

Danach `npm run inbox` als **Vorschau** fahren und dem Nutzer zeigen, wie viele
Buchungen gelesen würden, bevor irgendetwas geschrieben wird. Details stehen im
Skill **import-agent**.

## Verifikation (fünf Schichten)

1. **Quellenbindung** pro Wert (`quelle_hinweis` + `standdatum` + `qualitaet`).
2. **Validator** (Struktur, Muster, Referenzen).
3. **Reconciliation- und Datenqualitäts-Checks** (Semantik).
4. **Review-Tabelle Wert-für-Wert vor dem Schreiben** — fängt plausibel-falsche Zahlen.
5. **`agent_log.jsonl` + App-Aufschlüsselung** (Vermögen-Ansicht) zum Gegenlesen.

## Do's

- **Belegter, unabhängiger Anker** statt „Endstand minus Buchungen" (belegter Anker und Reconciliation). Konto-Saldo und Darlehen-Restschuld werden aus belegtem Anker + Bewegungen berechnet, der Anker wird belegt, nicht abgeleitet.
- **Brüche** für Eigentumsanteile (`{person_id, zaehler, nenner}`), Summe je Entität exakt 1.
- **Geld als Decimal-String** mit zwei Nachkommastellen (`^-?\d+\.\d{2}$`), Zinssatz als `^\d+\.\d{2,4}$`.
- Bei **neuem Darlehen aktiv die passende Raten-Regelzahlung vorschlagen** (`darlehen_id` setzen) — nur über den Regelzahlungs-Dialog (App schreibt keine Masterdaten; Regelzahlungen laufen ueber Agenten-Dialog).
- Bei **Darlehen Vertragsdaten erfassen**, wenn belegt vorhanden: `zinsbindung_bis`, `laufzeit_bis`, `restschuld_laufzeitende`. Diese Felder ersetzen keinen belegten Restschuld-Anker in `zeitwerte.jsonl`.
- Depot als `kontotyp = depot` unter Konto, Wert über `depotwert`-Zeitwert (kein Anker+Buchungen). Bargeld zählt nicht.

## Don'ts

- **Keine pro-Person-Aufteilung** des Nettovermögens (Nettovermoegen ist Haushaltssicht) — Haushaltssicht, anteilsgewichtet.
- **Keine geplanten Sondertilgungen / Zukunftsprojektion** (→ M6).
- **Keine Werte raten** — Unsicherheit als `geschaetzt` kennzeichnen oder offen lassen.
- **Regelzahlungen nie hand-editieren**, nur via Agent-Dialog (App schreibt keine Masterdaten; Regelzahlungen laufen ueber Agenten-Dialog).
- **Haiku nicht** für die Wert-Übertragung einsetzen.

## Belege benennen und ablegen

Gilt fuer **alle** Belege (Kontoauszuege, Vertraege, Policen, Gutachten, Informationsbriefe). Eingescannte Briefe und Mail-Anhaenge haben unklare oder immer gleiche Namen — beim Wegsortieren **immer** sprechend umbenennen, sodass der Beleg ohne Oeffnen verstaendlich ist. **Nie** den Original-Scan-/Mail-Namen behalten.

Schema: `<Entitaet/Konto>_<Quelle/Gesellschaft>_<Belegart>_<Datum oder Zeitraum>.<ext>` — z. B. `TESTREF-062.csv`, `Riester_MusterversicherungA_Vertragsstand_2026-01-01.pdf`.

Ablage in `Belege/`: Kontoauszuege unter `Belege/Kontoauszuege/<Konto>/`; sonstige Belege nach bestehender `Belege/<Jahr>/<Kategorie>`-Struktur. `quelle_hinweis`/`rohquelle` zeigen auf den finalen Beleg-Pfad.

Nach dem Ablegen `npm run belege:text:schreiben` fahren — jedes PDF unter
`Belege/` braucht seinen Textzwilling. Hat der Beleg keine Textebene (leerer
Textvorlauf), die Seiten selbst lesen und den Zwilling von Hand schreiben,
erste Zeile `# Vom Agenten aus dem Bildscan gelesen, <JJJJ-MM-TT>.`

## Wo was liegt

| Pfad | Zweck |
| --- | --- |
| `schemas/*.schema.json` | Referenz-Schemas je Entität |
| `tools/validator.mjs` | Ausführbare Validierung (Struktur + Cross-Field) |
| `DATENROOT/*.json` / `*.jsonl` | Stammdaten (inkl. `zeitwerte.jsonl`) |
| `vermoegen.mjs` | Nettovermögen- und Check-Berechnung |
| `schemas/importprofil.schema.json` | Vertrag für das Import-Profil eines neuen Kontos |
| `data/import-profile/` | Bank-Profile (nicht versioniert; README erklärt die Regeln) |

## Verwandte Skills und Anschlussprozesse

- **import-agent** — spielt Umsätze des neu angelegten Kontos ein; braucht das
  Import-Profil aus Schritt 4.
- **kategorisierungsregel-pflege** — legt fehlende Kategorien-Regeln an, nachdem
  die ersten Buchungen des neuen Kontos offen hereingekommen sind.
- **vorsorge-erfassung-agent** — für Policen, Standmitteilungen und Renteninfos.
