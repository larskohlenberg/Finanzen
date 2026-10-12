---
name: import-durchlauf
description: Belege importieren und den Bestand in einem Lauf bis zur Freigabe bringen — normalisieren, verregeln, freigeben, pruefen. Nutzen bei "importier den Auszug", "arbeite die Inbox ab", "die offenen Buchungen abarbeiten" oder wenn neue Kontoauszuege eingespielt werden sollen.
---

# Import-Durchlauf

Die vollstaendige Betriebsanweisung steht in `app/docs/skills/import-durchlauf.md`
(auch als MCP-Prompt `import-durchlauf`). **Lies sie zuerst und folge ihr** — dieses Dokument ist nur der Einstieg, damit
der Durchlauf per Name auffindbar ist.

Ebenfalls lesen, bevor Daten angefasst werden: `app/docs/agent-context.md`
(Resource `finanzen://docs/agent-context`).

## Der Lauf in Kurzform

Die Daten liegen auf dem Server; jeder Schritt laeuft ueber die Tools des
MCP-Servers `finanzen` (`mcp__finanzen__*`). Ohne `schreiben: true` ist jeder
Lauf eine Vorschau.

1. `lernen` — Metriken vor den Lauf stellen.
2. Je Rohdatei den Subagenten **`import-normalisierung`** beauftragen. Der
   Inbox-Lauf legt fuer PDFs und Fotos den Textvorlauf an (Scans und Fotos per
   OCR); Bild oder Scan selbst ansehen nur, wenn OCR nichts taugt. Erkannte
   Duplikate per `inbox_verwerfen` (mit `grund`) in den Papierkorb schieben.
3. Den Subagenten **`regel-recherche`** auf den Offen-Stapel ansetzen. Er
   verregelt, was belegt ist, und schaetzt den Rest als Einzelvorschlag.
4. `freigabe` mit `schreiben: true`.
5. `pruefbericht` — **ungekuerzt zeigen**.
6. `belege_text` mit `schreiben: true` — raeumt `processed/` und
   `standardized/` per Inhalts-Hash ab. Ohne Nachweis bleibt die Datei liegen
   und steht unter `offen`. `error/` bleibt unangetastet.
7. Zaehler in `DATENROOT/agent_log.jsonl` protokollieren (`datei_schreiben`
   mit `anhaengen: true`).

## Die drei Regeln, die den Unterschied machen

- **Keine Vorab-Zustimmung einholen.** Das Gate entscheidet, der Pruefbericht
  ist die Kontrolle. Bucket-Dialoge waren der Engpass, den dieser Lauf abschafft.
- **Der Lauf haelt nie an.** Was ohne Beleg bleibt, schaetzt der Agent
  (Herkunft `agent`, keine Regel); der Nutzer korrigiert spaeter. Erfunden
  wird trotzdem nichts: unbekanntes Konto wird angelegt, unlesbare Zeilen gehen
  nach `error/`, ein nicht reconcilierender Kontostand wird **nicht**
  geschrieben.
- **Textvorschlaege fuer Skill-Dokumente nie selbst uebernehmen.** Sie aendern
  kuenftiges Verhalten und brauchen ein Wort des Nutzers.
