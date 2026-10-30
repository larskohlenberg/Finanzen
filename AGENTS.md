# AGENTS.md – Anleitung für KI-Agenten

> English: [AGENTS.en.md](AGENTS.en.md). Sprich mit dem Nutzer immer in seiner Sprache.

**Gibt es im Repo-Ordner eine Datei `AGENTS.local.md`, lies sie zuerst.** Sie enthält die Betriebsregeln dieser Installation: wo die Daten liegen, wie du darauf zugreifst, wie mit Git umgegangen wird. Wo sie von dieser Datei abweicht, gilt sie, außer bei den Regeln unter „Nicht verhandelbar“. Gibt es sie nicht, ist das hier eine neue Installation: Führe den Nutzer durch die Einrichtung (siehe „Fahrplan“).

## Worum es geht
Mit diesem Repo baut ein Mensch ohne Vorwissen sein **privates Finanzmodell** auf: alle Konten und Buchungen an einem Ort, nachvollziehbar kategorisiert, dazu Liquidität, Vermögen, Vorsorge und Szenarien in einer lokalen Web-App. Das ist keine Finanz-, Steuer- oder Anlageberatung.

Die Arbeitsteilung: **Erkennen und Vorschlagen ist dein Urteil, Matchen und Rechnen machen die Werkzeuge.** Du liest Kontoauszüge, bringst sie in das Standardformat, recherchierst Belege für Kategorien und legst Regeln an. Die Werkzeuge in `app/tools/` importieren, erkennen Dubletten, wenden Regeln an, geben frei, prüfen und rechnen. Die Web-App schreibt nie Daten, sie zeigt nur an; einzige Ausnahme ist das Hochladen von Dateien in die Inbox.

## Gesprächsführung
- **Erst der Fahrplan.** Zeig zu Beginn die Etappen als kurze nummerierte Liste und sag bei jeder Etappe, wo ihr steht („Schritt 2 von 5: Einrichten“).
- **Ein Schritt nach dem anderen.** Fasse nach jeder Etappe in zwei, drei Sätzen zusammen, was passiert ist, und frag, ob der Nutzer bereit für den nächsten Schritt ist.
- **Eine Frage auf einmal, mit Grund.** Sag bei jeder Frage, wozu du die Antwort brauchst. Frag erst, wenn die Antwort gebraucht wird.
- **Einfache Sprache.** Kurze Sätze, keine Fachbegriffe, keine Namen interner Werkzeuge oder Dateien, außer der Nutzer muss etwas damit tun.
- **Freigabe-Abfragen ankündigen.** Dein Programm fragt den Nutzer womöglich, ob du einen Befehl ausführen oder eine Datei schreiben darfst. Sag vorher, was gleich passiert und wozu.

## Nicht verhandelbar
1. **Echte Finanzdaten kommen nie ins Repo**, weder in den Stand noch in die Historie. `app/data/**` (außer `app/data/demo/`) und `app/Belege/**` sind von Git ausgeschlossen. Auch Prosa leckt: Namen, Adressen, Beträge, Orte, IBANs, Bank- und Händlernamen gehören nicht in Doku, Tests, Commit-Texte oder PR-Beschreibungen. Vor jedem Push den ausgehenden Diff darauf durchsuchen. Konkrete Werte gehören ins `agent_log.jsonl` im Datenbestand.
2. **Schreibende Werkzeuge sind ohne Flag eine Vorschau.** Erst `--schreiben` (bzw. `--anwenden`, im MCP `schreiben: true`) schreibt. Erst Vorschau ansehen, dann schreiben, am besten mit dem Fingerabdruck der Vorschau (`--fingerabdruck=...`, im MCP `fingerabdruck`).
3. **Nach jedem Schreiben läuft der Validator.** Bei einem harten Validierungsfehler anhalten und den Fehler beheben, bevor es weitergeht.
4. **Der Datenbestand ist immer ausdrücklich benannt.** Echtdaten: `data/master`. Erfundene Beispieldaten: `data/demo`. Nie raten, nie einen Default annehmen. Auf `data/demo` nie echte Daten schreiben.
5. **Beträge sind Decimal-Strings** (`"-12.34"`), gerechnet wird in Cent. Nie Gleitkomma.
6. **Regeln nur mit Beleg.** Eine Kategorisierungsregel braucht einen Beleg (Belegleiter E1–E4 in `app/docs/agent-context.md`). Was ohne Beleg bleibt, schätzt du als Einzelvorschlag; `KAT-012` „Noch zu klären“ nur, wenn keine Kategorie plausibel ist. Regeln entstehen aus dem Bestand dieses Nutzers. Übernimm sie nie aus den Demodaten oder einem anderen Bestand.

## Fahrplan für eine neue Installation
Diese fünf Etappen zeigst du dem Nutzer zu Beginn. Nach jeder Etappe: Zusammenfassung und „Bereit für den nächsten Schritt?“.

1. **Kennenlernen.** Erklären, was am Ende herauskommt (eine Web-App mit allen Konten, Buchungen und Auswertungen) und was der Nutzer beiträgt (Kontoauszüge oder Banking-Exporte, gelegentlich eine Entscheidung). Datenschutz ehrlich ansprechen: Die Daten bleiben auf seinem Rechner, aber was du liest, geht an dein KI-Modell. Dann nacheinander, jeweils mit Grund:
   - **Wer gehört zum Haushalt, und wem gehören welche Konten?** Grund: Konten, Vermögen und Vorsorge werden Personen zugeordnet.
   - **Welche Konten gibt es?** Girokonten, Tagesgeld, Kreditkarten, Depots, Darlehen, jeweils mit Bank. Grund: Jedes Konto wird einmal angelegt, danach laufen seine Auszüge automatisch zu.
   - **Arbeitest du mit Git weiter?** Nur lokal, ein eigener Fork oder ein Server? Grund: Davon hängen die Betriebsregeln ab, besonders der Schutz vor versehentlich veröffentlichten Daten.
2. **Einrichten.**
   - Node.js prüfen (`node --version`, 22 oder neuer; sonst von nodejs.org installieren lassen), dann `npm install` (lädt Playwright für die Browsertests) und `npm test` als Funktionsprobe.
   - Die App starten (`node app/server.mjs`, dann http://127.0.0.1:8000 öffnen) und oben rechts in der Auswahl auf **Demo** stellen. So sieht der Nutzer, wohin die Reise geht.
   - Den eigenen Datenbestand anlegen: `node app/tools/neuer-bestand.mjs data/master` als Vorschau, dann mit `--schreiben`. Danach `npm run validate:master`. Der Bestand startet mit Grundkategorien und ohne Regeln. In der App wieder auf **Echt** stellen.
   - **MCP-Server einbinden**, wenn dein Programm das kann: `node app/mcp/server.mjs data/master --recht=schreiben` als stdio-Server namens `finanzen`. Für Claude Code `.mcp.json.beispiel` nach `.mcp.json` kopieren; andere Programme haben eigene Einstellungen dafür. Danach laufen alle Schritte über die Tools `finanzen` (Zuordnung CLI → Tool in `app/docs/agent-context.md`). Ohne MCP nutzt du die CLIs.
   - **`AGENTS.local.md` anlegen** nach der Vorlage unten, mit den Antworten aus Etappe 1. Dem Nutzer kurz zeigen, was drinsteht.
3. **Stammdaten.** Personen, Konten und, falls gewünscht, eigene Kategorien nach `app/docs/skills/stammdaten-erfassung-agent.md`. Kontostände nur mit Beleg als Anker übernehmen (Auszug mit Datum).
4. **Erster Import.** Der Nutzer legt Exporte nach `app/data/inbox/` (oder lädt sie in der App hoch). Dann der Durchlauf nach `app/docs/skills/import-durchlauf.md`: normalisieren, verregeln, freigeben, prüfen. Den Prüfbericht vollständig zeigen und mit dem Nutzer durchgehen. Beim ersten Import entstehen die meisten Regeln; das dauert eine Weile.
5. **Ausbauen.** Fragen, was den Nutzer interessiert, und nur das angehen:
   - Regelzahlungen (Miete, Gehalt, Abos): `app/docs/skills/regelzahlung-agent.md`
   - Immobilien, Darlehen, weitere Vermögenswerte: `app/docs/skills/stammdaten-erfassung-agent.md`
   - Versicherungen und Altersvorsorge: `app/docs/skills/vorsorge-erfassung-agent.md`
   - Szenarien („Was, wenn …“): `app/docs/skills/szenarien-annahmen.md`

Neue Auszüge später: wieder Etappe 4. Korrekturen an bereits freigegebenen Buchungen: `app/docs/skills/kategorisierung-review.md`.

## Vorlage für `AGENTS.local.md`
Die Datei ist von Git ausgeschlossen und gehört nur dieser Installation. Halte sie kurz und aktuell; ändert der Nutzer seine Arbeitsweise, passt du sie an.

```markdown
# Betriebsregeln dieser Installation

## Daten
- Datenbestand: data/master (Echtdaten). Demodaten nur zum Ausprobieren.
- Zugriff: <lokal per CLI | lokaler MCP-Server "finanzen" | MCP-Server per SSH auf <Server>>
- Belege werden nach dem Import unter app/Belege/<Bereich>/ abgelegt und sprechend benannt.

## Git
- Umgang: <nur lokal, nie pushen | eigener Fork, öffentlich/privat | ...>
- Vor jedem Push: Diff auf echte Daten durchsuchen (Namen, Beträge, IBANs, Banken, Händler).
- Wer committet, wer merged: <...>

## Server (falls vorhanden)
- Wie aktualisiert wird: <...>

## Arbeitsweise
- Kategorisieren ohne Vorab-Bestätigung; der Prüfbericht ist die Kontrolle. <oder: vor jeder Freigabe fragen>
- Weitere Vorlieben des Nutzers: <...>
```

## Landkarte
| Datei | Inhalt |
|---|---|
| `app/mcp/vertrag.mjs` | Agentenvertrag: Pflicht in Kuerze (MCP-Anleitung und Kopf von agent-context) und Werkzeuge nach Aufgaben. Aendern, dann `node app/mcp/vertrag.mjs --schreiben`. |
| `app/docs/agent-context.md` | **Operative Wahrheit**: Status, Herkunft, Kategorisierung, Belegleiter, Validierung, Agentenprotokoll, Zuordnung CLI → MCP-Tool. Vor jeder Datenarbeit lesen; für reine Auswertungen nicht nötig. |
| `app/docs/skills/import-durchlauf.md` | **Der Standardweg**: Rohdatei bis freigegebener Bestand in einem Lauf. |
| `app/docs/skills/import-agent.md` | Normalisierung einer Rohdatei (Station 1 des Durchlaufs). |
| `app/docs/skills/kategorisierungsregel-pflege.md` | Offene Buchungen über die Belegleiter verregeln (Station 2). |
| `app/docs/skills/kategorisierung-review.md` | Korrekturen an freigegebenen Buchungen. |
| `app/docs/skills/stammdaten-erfassung-agent.md` | Personen, Konten, Kategorien, Immobilien, Darlehen, Zeitwerte. |
| `app/docs/skills/vorsorge-erfassung-agent.md` | Versicherungen und Vorsorgeverträge. |
| `app/docs/skills/regelzahlung-agent.md` | Regelzahlungen. |
| `app/docs/skills/szenarien-annahmen.md` | Szenarien. |
| `app/docs/skills/validierung-agent.md` | Validierung. |
| `CONTEXT.md` | Fachliches Glossar. |
| `docs/adr/` | Entscheidungen samt Begründung und verworfenen Alternativen. |
| `docs/betrieb.md` | Betrieb auf einem Server: Datenort außerhalb des Checkouts, Umzug, Sicherung. |
| `docs/archiv/` | Frühere Anforderungen, Pläne und Übergaben. Nur Geschichte, keine Anleitung. |

Für reine Auswertungen („Wie stehen wir?“) brauchst du keine Vorlektüre: Werkzeug `kennzahlen`, `status`, `transaktionen_abfragen` oder `pruefbericht`.

## Werkzeuge
Alle unter `app/tools/`, jeweils mit dem Datenbestand als Argument. Die wichtigsten:

| Aufruf | Wozu |
|---|---|
| `node app/tools/neuer-bestand.mjs data/master [--schreiben]` | Leeren, gültigen Datenbestand anlegen |
| `node app/tools/validator.mjs data/master` | Bestand gegen Schemas und Regeln prüfen |
| `node app/tools/inbox.mjs data/master [--schreiben]` | Inbox sichten und einspielen |
| `node app/tools/regel-vorschlag.mjs data/master` | Offene Buchungen nach Gegenpartei bündeln |
| `node app/tools/freigabe.mjs data/master [--schreiben]` | Freigabe mit Gate |
| `node app/tools/pruefbericht.mjs data/master` | Prüfbericht nach einem Durchlauf |

Die vollständige Liste samt MCP-Gegenstück steht in `app/docs/agent-context.md`, die Kurzbefehle in `package.json`.

## Kosten sparen
Kannst du Unteragenten mit eigener Modellwahl starten, gib klar umrissene Aufgaben ab und behalte die Nutzerführung selbst:

| Aufgabe | Modell |
|---|---|
| Nutzerführung, Freigabe, Prüfbericht, Korrekturen | du selbst |
| Rohdatei normalisieren und importieren | stark; eine falsche Spaltenzuordnung verdirbt still tausende Zeilen |
| Offene Buchungen verregeln (Recherche mit Websuche) | stark, mit Websuche |
| Belege lesen und Werte übertragen | mittel; nicht das kleinste Modell, Verlesen fällt hier nicht auf |

Für Claude Code liegen die ersten beiden fertig in `.claude/agents/` (`import-normalisierung`, `regel-recherche`); sie brauchen den MCP-Server. Anderen Unteragenten gibst du die passende Anleitung aus `app/docs/skills/` und genau die Dateien, die sie brauchen. Prüfe ihre Ergebnisse, bevor du weitermachst.

## Am Code arbeiten
- `npm test` muss grün sein. Werkzeuge sind eine reine Funktion plus CLI, getestet mit `node --test`.
- `npm run typen` prüft die JSDoc-Typen der Kerngrenzen (Dateien mit `// @ts-check`, Liste in `tsconfig.json`); TypeScript wird dafür nur als Dev-Werkzeug nach `.typpruefung/` geladen.
- Gemergt wird erst, wenn die CI grün ist (GitHub Actions: Tests auf Node 22 und 24, Validator auf Demodaten und Fixtures, PII-Scan): `gh pr checks <nr> --watch`, dann `gh pr merge <nr> --merge`. Läuft die App auf einem Server, folgt direkt danach das Update dort (`sudo finanzen-aktualisieren`, siehe `docs/betrieb.md`), ohne dass der Nutzer es eigens anfordert. Den PII-Scan vor dem Push auch lokal laufen lassen: `node app/tools/pii-scan.mjs origin/main`. Fehler (echte IBAN, Kartennummer) blockieren, Warnungen ansehen.
- Keine Build-Pipeline. Server und Werkzeuge brauchen nur Node.js, keine Laufzeitabhängigkeiten. Einzige Entwicklungsabhängigkeit ist Playwright (`playwright-core`, feste Version) für die Browsertests (ADR 0038). Im Browser läuft als einzige Fremdbibliothek Vanilla Calendar Pro für die Datumsauswahl, als unveränderte Kopie in `app/vendor/` (ADR 0039). Weitere Pakete oder Bibliotheken nur nach Rückfrage beim Nutzer.
- Der Datenbestand ist immer ein Argument (`dataRootFromArg` aus `app/tools/data-root.mjs`), nie fest im Code.
- Beträge über `toCents` aus `app/tools/lib/text.mjs`.
- Privates Projekt, **keine Enterprise-Muster**: keine Audit-Logs, kein Append-Only, keine Versionsfelder. Die Git-Historie ist Spur genug.
- Testdaten sind erfunden. Nie echte IBANs, Namen oder Beträge in `tests/`.
- Commit-Texte auf Deutsch, ohne Umlaute (`ue`, `ae`, `oe`, `ss`).
- Größere Entscheidungen als ADR in `docs/adr/`, mit verworfenen Alternativen.
- Oberfläche: vorhandene Bausteine wiederverwenden statt je Seite neu bauen. Große Detail-Abschnitte sind klappbare Kacheln (`klappKachel` in `app/komponenten.mjs`), Dokumente eines Objekts der Ausschnitt der Dokumentenansicht. Was standardmäßig offen und zu ist, steht in `docs/ui-regeln.md`.
