---
name: import-durchlauf
description: Belege importieren und den Bestand in einem Lauf bis zur Freigabe bringen — normalisieren, verregeln, freigeben, pruefen. Nutzen bei "importier den Auszug", "arbeite die Inbox ab", "die offenen Buchungen abarbeiten" oder wenn neue Kontoauszuege eingespielt werden sollen.
---

# Import-Durchlauf

Die vollstaendige Betriebsanweisung steht in `app/docs/skills/import-durchlauf.md`.
**Lies sie zuerst und folge ihr** — dieses Dokument ist nur der Einstieg, damit
der Durchlauf per Name auffindbar ist.

Ebenfalls lesen, bevor Daten angefasst werden: `app/docs/agent-context.md`.

## Der Lauf in Kurzform

1. `node app/tools/lernen.mjs app/data/master` — Metriken vor den Lauf stellen.
2. Je Rohdatei den Subagenten **`import-normalisierung`** beauftragen.
3. Den Subagenten **`regel-recherche`** auf den Offen-Stapel ansetzen.
4. `node app/tools/freigabe.mjs app/data/master --schreiben`
5. `node app/tools/pruefbericht.mjs app/data/master` — **ungekuerzt zeigen**.
6. Eingang aufraeumen: verarbeitete Rohdateien aus `app/data/inbox/processed/`
   entfernen, sobald der Beleg unter `Belege/` per Inhalts-Hash nachgewiesen ist.
   `error/` bleibt liegen.
7. Zaehler in `app/data/master/agent_log.jsonl` protokollieren.

## Die drei Regeln, die den Unterschied machen

- **Keine Vorab-Zustimmung einholen.** Das Gate entscheidet, der Pruefbericht
  ist die Kontrolle. Bucket-Dialoge waren der Engpass, den dieser Lauf abschafft.
- **Der Lauf haelt nie an, erfindet aber nichts.** Unbekanntes Konto wird
  angelegt, unlesbare Zeilen gehen nach `error/`, ein nicht reconcilierender
  Kontostand wird **nicht** geschrieben.
- **Textvorschlaege fuer Skill-Dokumente nie selbst uebernehmen.** Sie aendern
  kuenftiges Verhalten und brauchen ein Wort des Nutzers.
