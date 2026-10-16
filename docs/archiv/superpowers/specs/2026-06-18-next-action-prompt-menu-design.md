# Next Action Prompt Menu

**Status:** Design freigegeben
**Datum:** 2026-06-18

## Problem

Der bisherige Next-Action-Button kopiert genau den obersten Agentenprompt. Das ist
fuer einen linearen Arbeitsstand gut, aber der Datenbestand kann gleichzeitig
mehrere sinnvolle Agentenauftraege enthalten.

Beispiel: Nach einem Import liegen 226 vorgeschlagene Kategorien zur Pruefung vor,
waehrend zusaetzlich alte offene Kategorien existieren. Die App darf dann zwar eine
Empfehlung aussprechen, soll den Nutzer aber nicht daran hindern, einen anderen
passenden Prompt zu kopieren.

## Ziel

Der Arbeitsstatus zeigt weiterhin eine empfohlene naechste Aktion. Zusaetzlich kann
der Nutzer alle aktuell aus dem Datenbestand ableitbaren Agentenprompts auswaehlen
und kopieren.

Jeder kopierte Prompt bleibt ein einzelner klarer Agentenauftrag mit passendem
Skill-Kontext. Es entsteht kein Sammelprompt fuer mehrere Aufgaben gleichzeitig.

## Entscheidung

Die App fuehrt ein Prompt-Menue ein:

- Der Hauptbutton kopiert den empfohlenen Prompt.
- Ein Menue am Button zeigt alle weiteren verfuegbaren Agentenauftraege.
- Jeder Menueeintrag zeigt Label und Zaehler, z. B.
  `226 vorgeschlagene Kategorien reviewen`.
- Ein Klick auf einen Menueeintrag kopiert genau diesen Prompt.
- Clipboard-Fallback und Erfolgsmeldung gelten fuer Hauptbutton und Menueeintraege.

## Prioritaet der Empfehlung

Die Empfehlung ist der erste Kandidat nach dieser Reihenfolge:

1. Validierungsfehler klaeren.
2. Importfehler klaeren.
3. Vorgeschlagene Kategorien reviewen.
4. Vorgeschlagene Regelzahlungen reviewen.
5. Offene Kategorien verregeln.
6. Vermoegens-/Liquiditaetschecks klaeren.

Begruendung: Reviewbare Vorschlaege sind bereits entscheidungsreif und brauchen
Nutzerfreigabe. Offene Kategorien erfordern dagegen erst einen neuen Regelpflege-
oder Analyseprozess und sollen wartende Vorschlaege nicht ueberdecken.

## Kandidaten

Die App berechnet nicht nur `buildNextAgentAction`, sondern eine geordnete Liste
aller verfuegbaren Kandidaten. Jeder Kandidat enthaelt:

- `type`: stabiler technischer Typ.
- `count`: betroffene Anzahl.
- `label`: sichtbarer Auftragstext.
- `prompt`: vollstaendiger Zwischenablage-Text.
- `skillPath`: passende Betriebsanweisung unter `app/docs/skills/`.
- optional `extraSkillPaths`.

Der erste Kandidat ist die Empfehlung. Gibt es keine Kandidaten, bleibt der
erledigte Zustand ohne kopierbaren Prompt.

## UI-Verhalten

Der Arbeitsstatus bleibt kompakt:

- Primaer sichtbar: `Agenten-Prompt kopieren · <empfohlener Auftrag>`.
- Wenn mehr als ein Kandidat existiert, erscheint am Button ein Menue-Indikator.
- Das Menue listet auch die Empfehlung, damit alle kopierbaren Prompts an einer
  Stelle sichtbar sind.
- Bestehende Status-Chips, z. B. offene Kategorien, bleiben Navigations- oder
  Lesefunktionen und werden nicht mit Prompt-Auswahl ueberladen.

## Prompt-Inhalt

Jeder Prompt enthaelt:

- `app/docs/agent-context.md`.
- die passenden `app/docs/skills/...`.
- Statuszusammenfassung des geladenen Bestands.
- genau einen obersten Auftrag.
- relevante Datenpfade im App-Raum.
- Arbeitsregel: read-only analysieren, fachliche Schreibentscheidungen bestaetigen
  lassen, Tools/Validatoren nutzen, Ergebnis mit Zaehlern zusammenfassen.

Prompts duerfen weiterhin nicht auf Entwicklungsdokumente ausserhalb des App-Raums
verweisen.

## Tests

- Unit-Test fuer neue Prioritaet: vorgeschlagene Kategorien vor offenen Kategorien.
- Unit-Test fuer Kandidatenliste mit mehreren vorhandenen Auftraegen.
- Unit-Test, dass jeder Kandidat einen Skill-Pfad im Prompt enthaelt.
- UI-Vertragstest: Hauptbutton plus Menueeintraege sind vorhanden, wenn mehrere
  Kandidaten existieren.
- Clipboard-Verhalten bleibt fuer Erfolg und Fallback abgesichert.

## Nicht-Ziele

- Keine persistente Queue.
- Kein Multi-Auftrag-Prompt.
- Kein Chat- oder Agentenfrontend in der App.
- Keine Schreibfunktion in der Weboberflaeche.
