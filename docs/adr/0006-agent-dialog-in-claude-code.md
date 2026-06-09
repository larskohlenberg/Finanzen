# Agent-Dialog in Claude Code, App ist nur Anzeige

Statushinweis 2026-06-09: Der Grundsatz gilt weiter, aber die Begruendung "ohne Webserver" ist durch ADR 0012/0015 ueberholt. Praezise Lesart heute: Die App ist eine Web-App, schreibt aber keine Masterdaten; Aenderungen laufen ueber Agenten und Betriebstools.

Der interaktive Dialog zwischen Nutzer und Agent — Importauftraege, Kategoriefragen, Fehlerklaerung — findet in **Claude Code** statt, nicht in der lokalen App. Die App (`app/index.html`) bleibt eine **rein anzeigende Oberflaeche**: sie liest Daten, validiert beim Laden, zeigt offene Punkte und Importfehler an. Schreiben, Normalisieren und Klaeren passiert ausserhalb der App, durch den Agenten im Dialog.

Begruendung: Ein App-internes Chat-Frontend wuerde einen Backend-Service, WebSocket-Plumbing und neue Sicherheitsfragen einfuehren. Claude Code ist der natuerliche Ort fuer den Dialog: der Nutzer arbeitet dort ohnehin (Dateien ablegen, Rohbelege benennen, Regeln pflegen). Die App profitiert davon, schlank zu bleiben.

## Verworfene Alternativen

- **Chat-Bereich in der App mit lokalem Agent-Backend**: bricht die Architektur, hoher Aufwand.
- **Hybrid: App zeigt Fehler mit Copy-Paste-Prompts fuer Claude Code**: charmante UX-Idee, gehoert aber nicht in M3 — als spaetere Verbesserung vorgemerkt (Stichwort: vor M9 evaluieren).

## Konsequenz

Die App zeigt die **Fehler-Inbox** als sichtbaren Bereich an (offene `data/inbox/error/`-Eintraege mit Begleitinfo), aber bietet keinen Knopf „Fehler beheben". Der Nutzer wechselt zu Claude Code, fixt im Dialog, laed die App neu — der Stand ist aktuell. Das gilt analog fuer alle Folgemilestones, solange die Architekturentscheidung „App schreibt keine Masterdaten" gehalten wird.
