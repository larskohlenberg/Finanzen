# Szenarien als bestätigbare Annahmenbündel mit Gültigkeit statt Versionierung

M6 führt **Szenarien** als eigene Entität ein: ein benanntes Bündel expliziter
**Annahmen** über die Zukunft, das auf dem validierten Ist-Bestand eine
Was-wäre-wenn-Rechnung erlaubt (Liquidität, Restschuld, Nettovermögen über die Zeit).
Der Bestand bleibt dabei unberührt — die Engine rechnet nur darauf, als geteilte reine
Funktion (wie `liquiditaet`/`vermoegen`); die Basis ist dieselbe Engine mit leerer
Annahmenliste, kein Sonderfall.

**Entscheidung:** Das M6-Exit-Kriterium „Annahmen versioniert **oder** mit Gültigkeit"
wird über den **Gültigkeits-Arm** erfüllt, nicht über Versionierung. Status ist
`entwurf | bestaetigt | verworfen`; `verworfen` ist ein Lebenszyklus-Zustand, **kein**
Archiv-/Versionsmechanismus. Gültigkeit trägt jedes Szenario über `stand` (Stichtag der
Annahmen) + `reichweite_bis` (Horizont). Änderungen sind **in-place** Updates mit
hochgezogenem `stand` (ADR 0002) — kein automatisches Archivieren-und-Klonen, keine
Versionsketten. Einen bewussten Vorher-/Nachher-Vergleich legt der Nutzer als zweites
benanntes Szenario an.

**Annahmen sind eingebettet** (Value Objects im Aggregat Szenario, eine `szenarien.json`),
analog zu `eigentumsanteile` in der Immobilie — kein separates `annahmen.json`. **Alles
Zukunftsgerichtete ist szenario-gebunden**: es gibt keine zweite, objektgebundene
Planwert-Entität (geplante Sondertilgungen leben als Annahme, nicht als Top-Level-Faktum).

Statt enumerierter Annahme-Sonderfälle (Handoff: `sondertilgung`, `depot-verkauf`, …) gibt
es **drei Arten** (`einmalzahlung`, `regelzahlung-neu`, `regelzahlung-aenderung`), und jede
Annahme hat **zwei unabhängige Beine**: ein **Cash-Bein** (`betrag`, darf 0 sein) und optional
ein **Bilanz-Bein** (`gegenbuchung`, `ziel_typ ∈ darlehen | depot | immobilie | vermoegenswert`,
entweder bestehende `ziel_id` oder neue `neue_position {bezeichnung, wert}`). Der
Nettovermögens-Effekt ist die Summe beider Beine: heben sie sich auf, ist es eine
**Umschichtung** (Kauf/Verkauf/Sondertilgung, neutral); ist ein Bein null, ein **echter
Zu-/Abgang** (Bar- oder Sachwert-Erbschaft/-Schenkung, Konsum). Das deckt Kauf/Verkauf aller
Bilanzpositionen **und** unentgeltliche Zu-/Abgänge über **einen** Mechanismus ab
(parametrisierter `typ` statt Subtyp-Duplikate — dieselbe DNA wie der *Weitere Vermögenswert*)
und schließt die Lücke der enumerierten Arten (Immobilien/Edelmetall/Erbschaft fehlten). Die
Engine hat hinter der gemeinsamen Datenform typisierte Handler je `ziel_typ`.

## Considered Options

- **One-Shot-Handoff:** `status = …|archiviert`, bei Realitätsänderung archivieren + neu
  anlegen, ein File pro Szenario, getrenntes `annahmen.json`. Abgelehnt: das ist genau das
  Audit-/Versionierungs-Muster, das dieses private Projekt vermeidet (vgl. ADR 0002), und
  das File-pro-Szenario war v. a. durch das Archivieren motiviert.

## Consequences

- Eine „sichere" geplante Sondertilgung erscheint **nicht** in der normalen
  Restschuld-Sicht (die rechnet nur mit der Sollrate), sondern lebt in einem
  `bestaetigt`-Szenario. Die Darlehenssicht darf solche Annahmen rein informativ und ohne
  Rechenwirkung ausweisen (Rückverweis, kein Rechenpfad).
