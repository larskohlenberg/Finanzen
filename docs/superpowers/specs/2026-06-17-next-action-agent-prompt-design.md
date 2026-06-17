# Next Action Agent Prompt

**Status:** Design freigegeben
**Datum:** 2026-06-17

## Problem

Der Arbeitsstatus zeigt aktuell zwei Bedienelemente mit derselben Wirkung:

- Der Review-Chip fuer offene Kategorien navigiert in die Transaktionsliste und filtert
  `kategorisierung_status = offen`.
- Der Button `Naechste Aktion` navigiert ebenfalls in dieselbe gefilterte Liste.

Da die App im aktuellen Betriebsmodell Masterdaten nur liest und Aenderungen ueber
Agenten plus Betriebstools laufen, ist die zweite Navigation redundant. Die
nuetzlichere Funktion ist eine Uebergabe an den Agenten: ein kopierbarer Prompt,
der den aktuell wichtigsten Arbeitsauftrag aus dem geladenen Datenstand benennt.

## Ziel

`Naechste Aktion` wird genau ein berechneter Agentenauftrag. Beim Klick kopiert die
App einen Prompt in die Zwischenablage. Der Prompt enthaelt eine knappe
Statuszusammenfassung, den hoechstpriorisierten Auftrag und die passende
Betriebsanweisung im App-Raum.

Die Funktion schreibt keine Masterdaten, erzeugt keine Auftragsschlange und haengt
nicht vom letzten Agentenlauf ab.

## Nicht-Ziele

- Kein Chat-Frontend in der App.
- Keine Datei `agentenauftraege.jsonl` fuer diese Funktion.
- Keine Ableitung aus `agent_log.jsonl`.
- Keine Referenzen im Prompt auf Entwicklungsartefakte ausserhalb von `app/`.
- Keine Bearbeitung mehrerer Aufgaben in einem kopierten Prompt.

## Begriff

**Next Action** bezeichnet den einen aktuell wichtigsten Agentenauftrag, der aus dem
geladenen Datenstand abgeleitet wird. Er ist kein gespeicherter Zustand und kein
Wert, den ein Importagent setzt.

## Ableitung

Die App berechnet Kandidaten aus dem geladenen Datenstand und nimmt den ersten
Kandidaten nach dieser Prioritaet:

1. Validierungsfehler.
2. Importfehler.
3. Offene Kategorien (`transaktionen.kategorisierung_status = offen`).
4. Vorgeschlagene Kategorien (`transaktionen.kategorisierung_status = vorgeschlagen`).
5. Vorgeschlagene Regelzahlungen (`regelzahlungen.status = vorgeschlagen`).
6. Vermoegens- und Liquiditaetschecks.

Jeder Kandidat enthaelt mindestens:

- `type`: stabiler technischer Typ.
- `count`: betroffene Anzahl.
- `label`: sichtbarer Auftragstext.
- `prompt`: der vollstaendige Zwischenablage-Text.
- `skillPath`: die passende Betriebsanweisung im App-Raum, falls vorhanden.
- optionale Zielinformationen fuer vorhandene Navigationschips.

Gibt es keinen Kandidaten, zeigt `Naechste Aktion` einen erledigten Zustand und
kopiert keinen Arbeitsauftrag.

## UI-Verhalten

Der vorhandene Review-Chip fuer offene Kategorien bleibt die Navigation in die
Transaktionsliste. Er ist der schnelle Einstieg zum Lesen und Pruefen der betroffenen
Datensaetze.

Der Button `Naechste Aktion` wird umgewidmet:

- Sichtbarer Text beginnt mit der Handlung, z. B. `Agenten-Prompt kopieren`.
- Der konkrete Auftrag wird knapp daneben oder darunter genannt, z. B.
  `2664 offene Kategorien`.
- Beim Klick kopiert die App den Prompt.
- Nach erfolgreichem Kopieren zeigt der Button kurz `Prompt kopiert`.
- Wenn die Clipboard-API nicht verfuegbar oder blockiert ist, zeigt die App den
  Prompt in einem kopierbaren Fallback an.

## Prompt-Inhalt

Der kopierte Prompt enthaelt:

- Statuszusammenfassung des geladenen Bestands.
- Genau den hoechstpriorisierten Auftrag.
- Verweis auf `app/docs/agent-context.md`.
- Verweis auf den passenden Skill unter `app/docs/skills/`.
- Relevante Zaehler und Datenpfade im App-Raum.
- Sicherheitsregeln: erst analysieren, fachliche Schreibentscheidungen bestaetigen
  lassen, Validator/Tooling nutzen, Ergebnis zusammenfassen.

Der Prompt referenziert ausschliesslich deploybare App-Artefakte:

- `app/docs/agent-context.md`
- `app/docs/skills/...`
- `app/data/...`
- `app/schemas/...`
- `app/tools/...`
- `app/Belege/...`

Der Prompt referenziert nicht:

- `CONTEXT.md`
- `docs/adr/...`
- `docs/superpowers/...`
- sonstige Root- oder Entwicklungsdokumentation.

## Skill-Mapping

| Auftrag | Betriebsanweisung |
| --- | --- |
| Validierungsfehler | kein eigener Skill; Prompt verweist auf `app/tools/validator.mjs` und relevante `app/schemas/*` |
| Importfehler | `app/docs/skills/import-agent.md` |
| Offene Kategorien | `app/docs/skills/kategorisierungsregel-pflege.md` |
| Vorgeschlagene Kategorien | `app/docs/skills/kategorisierung-review.md` |
| Vorgeschlagene Regelzahlungen | `app/docs/skills/regelzahlung-agent.md` |
| Vermoegens-/Liquiditaetschecks | `app/docs/skills/stammdaten-erfassung-agent.md`, bei Darlehen-ohne-Rate zusaetzlich `app/docs/skills/regelzahlung-agent.md` |

## Betriebskontext

Damit die App-Skills im Betrieb ohne Entwicklungsdokumente funktionieren, entsteht
eine zentrale Datei:

`app/docs/agent-context.md`

Sie enthaelt die gemeinsamen Regeln fuer Agentenarbeit im deploybaren App-Raum:

- App-Datenpfade sind app-relativ.
- Die App schreibt keine Masterdaten.
- Agenten schreiben nur gegen Schemas und nach Validierung.
- Tools rechnen deterministisch; Agenten rufen Tools auf.
- Keine stillen finalen Fachentscheidungen.
- Nutzerentscheidungen und Agentenvorschlaege bleiben getrennt.
- Statuslogik fuer offene, vorgeschlagene, bestaetigte und abgelehnte Zustaende.
- Herkunftslogik `regel` vs. `manuell`.
- Nach-Kategorisierung laeuft ueber das Tool, nicht ueber Reimport.
- Zeitwerte, belegte Anker und Reconciliation-Grundsaetze.
- Laufprotokoll und Uebergabeerwartungen.

Die einzelnen Skills bleiben workflow-spezifisch. Sie verweisen auf
`app/docs/agent-context.md`, ihre konkreten Schemas, Tools und Datenpfade, enthalten
aber ihren Ablauf, ihre Do's/Don'ts und ihre Schreibgrenzen selbst.

## Zukunftssicherung fuer M6 bis M9

Jeder zukuenftige Meilenstein, der neue Datenzustaende, Checks, Vorschlaege oder
Agentenprozesse einfuehrt, muss als Definition of Done pruefen:

- Muss `app/docs/agent-context.md` erweitert werden?
- Muss ein vorhandener Skill angepasst oder ein neuer Skill unter `app/docs/skills/`
  angelegt werden?
- Muss das Next-Action-Mapping erweitert werden?
- Muss die Prioritaet der Next Actions angepasst werden?
- Gibt es neue Schemas oder Tools, die der Skill referenzieren muss?
- Sind App-Skills weiterhin frei von Verweisen auf Root-Doku und ADRs?

Zusaetzlich soll ein Guard-Test oder Script `app/docs/skills/*.md` und
`app/docs/agent-context.md` auf verbotene Betriebsverweise pruefen, insbesondere:

- `CONTEXT.md`
- `docs/adr`
- `docs/superpowers`
- `Repo-Root`
- `Projektroot`

## Fehlerbehandlung

Clipboard-Fehler duerfen die App nicht blockieren. Bei Fehlern zeigt die App den
Prompt sichtbar und markierbar an. Die Statuszusammenfassung bleibt rein lesend und
darf auch bei Validierungsfehlern erzeugt werden; gerade dann ist sie Teil des
Arbeitsauftrags.

## Teststrategie

- Unit-Test fuer die reine Next-Action-Ableitung mit mehreren Datenstaenden:
  Validierungsfehler vor Importfehlern, Importfehler vor offenen Kategorien, offene
  Kategorien vor vorgeschlagenen Kategorien, vorgeschlagene Kategorien vor
  vorgeschlagenen Regelzahlungen, vorgeschlagene Regelzahlungen vor Checks.
- Unit-Test fuer Prompt-Inhalte: genau ein Auftrag, Statuszusammenfassung,
  korrekter Skill-Pfad, keine verbotenen Root-Verweise.
- Browser-Test oder DOM-naher Test fuer Button-Verhalten: erfolgreicher Clipboard-
  Pfad und Fallback-Pfad.
- Guard-Test fuer App-Skills und Agent-Kontext ohne Root-Doku-Verweise.

## Offene Entscheidung

Keine. Der aktuelle Scope ist bewusst auf Top-1-Agentenauftrag, Prompt-Kopie,
App-Betriebskontext, Skill-Bereinigung und Guard-Test begrenzt.
