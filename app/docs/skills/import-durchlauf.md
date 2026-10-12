# Skill: Import-Durchlauf

Ein Lauf von der Rohdatei bis zum freigegebenen Bestand. Dieser Skill
**orchestriert nur** — die Urteilsarbeit liegt in Subagenten, das Rechnen in
Tools.

Alle Pfade in diesem Skill sind app-relativ: `data/...`, `tools/...` und
`docs/...` liegen unter dem App-Raum. Im Betrieb laeuft jeder Schritt ueber die
Tools des MCP-Servers `finanzen` (siehe `docs/agent-context.md`, „Betrieb ueber
MCP"); lokal auf Demodaten gehen die genannten CLIs.

## Wann diesen Skill nutzen

Nutze ihn, wenn der Nutzer

- neue Belege einspielen will („importier den Auszug", „arbeite die Inbox ab"),
- den Offen-Stapel in einem Zug abgearbeitet haben will.

Nicht nutzen fuer einzelne Korrekturen an bereits freigegebenen Buchungen —
das ist **kategorisierung-review**.

## Kontext, den du kennen musst

- `docs/agent-context.md` — gemeinsame Regeln fuer Status, Herkunft,
  Kategorisierung, Validierung und Agentenprotokoll.
- ADR 0025 (Auto-Freigabe mit Gate) und ADR 0026 (Lernschleife).

## Ablauf

1. **Lernmetriken lesen.** Tool `lernen` (Vorschau) und den Befund vor
   den Lauf stellen: gesperrte Belegstufen und stillzulegende Regeln nennen.
2. **Normalisieren und importieren.** Je Rohdatei den Subagenten
   `import-normalisierung` beauftragen. Der Lauf haelt nie an. Der Inbox-Lauf
   legt fuer PDFs und Belegfotos den Textvorlauf an, bei Scans und Fotos per
   OCR; Bild oder Scan selbst ansehen nur, wenn OCR nichts taugt. Erkannte
   Duplikate verwirft der Agent per Tool `inbox_verwerfen` (mit `grund`; die
   Datei geht in den Papierkorb, nichts wird geloescht); eine Datei aus
   `error/`, die nach einer Korrektur erneut laufen soll, holt
   `inbox_zurueckholen` in die Inbox-Wurzel.
3. **Verregeln.** Den Subagenten `regel-recherche` auf den Offen-Stapel
   ansetzen. Er legt Regeln mit `belegstufe` an, ruft `recategorize.mjs` und
   schaetzt, was ohne Beleg bleibt, als Agenten-Einzelvorschlag. Er sucht je
   Merchant nur kurz.
4. **Freigeben.** Tool `freigabe` mit `schreiben: true`. Der
   Gate-Grund `anker` heisst nicht „Regel kaputt", sondern: eine bewaehrte
   Regel reicht in ein Konto hinein, auf dem niemand ihre Kategorie je
   entschieden hat. Das ist eine Entscheidung je Paar aus Regel und Konto.
5. **Pruefen.** Tool `pruefbericht` und den Bericht
   **ungekuerzt** zeigen.
6. **Eingang aufraeumen.** Tool `belege_text` mit `schreiben: true`. Das Tool
   entfernt aus `data/inbox/processed/` und `standardized/` jede Datei, deren
   Inhalt nachweislich unter `Belege/` liegt — Abgleich ueber den Inhalts-Hash,
   nie ueber den Dateinamen. Was keinen Nachweis hat, bleibt liegen und steht
   im Bericht unter `offen`; das ist der interessante Fall, kein Fehler.
   `error/` wird nicht angefasst. Ohne `schreiben: true` ist der Lauf eine Vorschau.
   Hineinkopierte Archivexporte liegen in Unterordnern und werden vom Tool
   nicht erfasst — die von Hand abgleichen, wenn welche da sind.
7. **Protokollieren.** Die Zaehler in `DATENROOT/agent_log.jsonl` festhalten
   (`datei_schreiben` mit `anhaengen: true`).

## Zentrale Regeln

- **Keine Vorab-Zustimmung einholen.** Das Gate entscheidet, der Pruefbericht
  ist die Kontrolle. Bucket-Dialoge gehoeren nicht in diesen Skill — sie waren
  der Engpass, den er abschafft.
- **Den Pruefbericht vollstaendig zeigen**, nicht zusammenfassen. Er ist der
  einzige Ort, an dem der Nutzer sieht, was nie ein Mensch angesehen hat.
- **Textvorschlaege aus Station 2 nie selbst uebernehmen.** Sie aendern
  kuenftiges Verhalten und brauchen ein Wort des Nutzers.
- **Bei einem harten Validierungsfehler stoppen.** Der Lauf haelt nicht fuer
  Entscheidungen an, aber sehr wohl fuer kaputte Daten.

## Do's

- Den Bericht mit den groessten Betraegen und der Zahl der Agenten-Schaetzungen
  eroeffnen — dort ist die Aufmerksamkeit am wertvollsten.
- Am Gate gescheiterte Regeln als Arbeitsliste anbieten: das ist Regelarbeit an
  einer Handvoll Muster, nicht an hunderten Buchungen.
- Merchants, die nie ein Mensch bestaetigt hat, ausdruecklich benennen. Sie
  sind der blinde Fleck der Automatik.
- Die Sektion „Regeln auf Konten ohne menschlichen Anker" mitlesen, besonders
  nach einem Erstimport. Oben stehen die verliehenen Belegstufen — dort hat das
  Gate gehalten und dort liegt die Arbeit. Darunter steht, was neu erschlossen
  wurde: nicht blockiert, aber auch nie geprueft.

## Don'ts

- **Keine Regel aus einer Schaetzung.** Was ohne Beleg bleibt, schaetzt der
  Agent als Einzelvorschlag (Herkunft `agent`); `KAT-012` nur, wenn keine
  Kategorie plausibel ist. Korrigiert wird spaeter ueber den Herkunftsfilter
  der Transaktionsansicht.
- **Keinen Saldo-Anker uebernehmen, der nicht reconciliert.**
- **Keine Regel selbst anlegen** — das ist Station 3.
- **Den Pruefbericht nicht auf „alles in Ordnung" eindampfen.** Wenn er lang
  ist, ist das die Information.
- **Den Eingang nicht voll zuruecklassen.** Ein Eingang, in dem verarbeitete
  Dateien liegen bleiben, zwingt jeden naechsten Lauf zu der Frage, was davon
  schon drin ist — und die beantwortet der Bestand nicht, weil ein importierter
  Beleg im Eingang aussieht wie ein neuer.
