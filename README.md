# Finanzen

**Mit deinem KI-Agenten ein privates Finanzmodell aufbauen**: Kontoauszüge einlesen, Buchungen nachvollziehbar kategorisieren und Liquidität, Vermögen, Vorsorge und Szenarien in einer lokalen Web-App sehen.

## So startest du
Öffne einen KI-Agenten, der Dateien lesen und Befehle ausführen kann (z. B. Claude Code, Codex, Gemini CLI), und schreib:

```
Lade dir https://github.com/larskohlenberg/Finanzen herunter, lies AGENTS.md und führe mich durch.
```

Der Agent zeigt dir erst die App mit erfundenen Beispieldaten, legt dann deinen eigenen, leeren Datenbestand an und führt dich Schritt für Schritt durch Konten, ersten Import und Auswertung. Am besten funktioniert es mit einem starken Modell.

## Was am Ende herauskommt
- eine Web-App im Browser mit Übersicht, Buchungen, Liquidität, Regelzahlungen, Vermögen, Vorsorge, Szenarien, Belegen und Checks
- alle Buchungen deiner Konten an einem Ort, ohne Dubletten, mit Kategorie und der Begründung, warum sie diese Kategorie hat
- Kategorisierungsregeln, die aus deinen eigenen Buchungen und Belegen entstehen und bei jedem Import mitlernen
- ein Prüfbericht nach jedem Import: was automatisch freigegeben wurde, was noch zu klären ist, wo Kontostände nicht aufgehen

## Was du brauchst
- Rechner mit macOS, Windows oder Linux und [Node.js](https://nodejs.org) 22 oder neuer; sonst nichts zu installieren
- Kontoauszüge oder Banking-Exporte (CSV oder PDF) deiner Konten. Bankspezifische Einleser gibt es bewusst nicht, das Umformen übernimmt der Agent
- optional für gescannte Belege: `pdftotext` (Poppler) und `tesseract`

## Wie es funktioniert
1. Du legst Exporte und Belege in die Inbox, per Ordner oder über „Hochladen“ in der App.
2. Der Agent bringt jede Datei in ein einheitliches Format und spielt sie ein. Dubletten erkennt das System selbst.
3. Für offene Buchungen sucht der Agent Belege (Rechnung, Vertrag, Webseite des Händlers) und legt Regeln an, z. B. „Gegenpartei X → Lebensmittel“.
4. Eine Freigabe-Prüfung entscheidet, was ohne Rückfrage durchgeht. Den Rest siehst du im Prüfbericht.
5. Die App rechnet alles Weitere: Salden, Liquiditätsvorschau, Vermögen, Vorsorge, Szenarien.

Daten liegen als einfache JSON-Dateien vor, die gegen Schemas geprüft werden. Jedes schreibende Werkzeug zeigt ohne ausdrückliche Freigabe nur eine Vorschau, nach jedem Schreiben läuft der Validator.

## Datenschutz
- Deine Daten liegen in `app/data/master/` und `app/Belege/` auf deinem Rechner. Beide Ordner sind von Git ausgeschlossen.
- Was der Agent liest, um Buchungen und Belege zu verstehen, geht an das KI-Modell deines Agenten.
- Arbeitest du mit einem eigenen Fork: Prüfe vor jedem Push, dass keine echten Daten im Diff stehen, auch nicht in Doku, Tests oder Commit-Texten.

## Betrieb auf eigenem Server
Die App kann auch dauerhaft auf einem eigenen Server laufen, hinter Reverse Proxy und Anmeldung; Agenten greifen dann über einen MCP-Server per SSH auf die Daten zu. Siehe [app/README.md](app/README.md) und [ADR 0028](docs/adr/0028-betrieb-auf-eigener-vm.md).

## Für Entwickler
Keine Build-Pipeline, keine Abhängigkeiten außer Node.js.

```bash
npm test
node app/server.mjs
```

Fachbegriffe stehen in [CONTEXT.md](CONTEXT.md), Entscheidungen samt verworfener Alternativen in [docs/adr/](docs/adr/), die Betriebsanweisungen für Agenten in [app/docs/](app/docs/).

## Haftung
Keine Finanz-, Steuer- oder Anlageberatung. Kategorien, Prognosen und Szenarien sind Rechenmodelle auf Basis deiner Eingaben; prüfe die Ergebnisse selbst.
