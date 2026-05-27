# Sparring Artifact

**Typ:** directory
**Original-Pfad:** `.`
**Sparring-Typ:** Auto
**Erkannter Sparring-Typ:** Text
**Initiale Kopie:** `rounds/round_01/artifact/`

## Boundary

Bei `Typ: file` leer lassen. Bei `Typ: directory` festhalten, was tatsächlich kopiert wurde — als Ausschluss- oder Include-Liste:

**Excluded-Pfade:** 
**Included-Pfade:** 
- `Finanzmodell_Datenmodell.md`
- `Finanzmodell_Excel_Bau_und_QA_Plan.md`
- `Finanzmodell_Entscheidungsprotokoll.md`
- `Finanzmodell_Handover.md`
- `Finanzmodell_Agentenworkflow.md`

Genau eines der beiden Felder ist gefüllt. Default ist `Excluded-Pfade` mit der Standardliste aus dem Skill. `Included-Pfade` wird nur dann gesetzt, wenn das Artefakt ein Projekt-Root mit vielen Top-Level-Einträgen ist und der User eine konkrete Auswahl benannt hat.

## Projektkontext

Referenzierte Dokumente im umliegenden Projekt, die für dieses Sparring relevante Constraints, Stil, Tonalität, Zielgruppe oder Längenvorgaben enthalten. **Nicht kopiert** — alle aufgeführten Pfade werden zur Step-Laufzeit live gelesen, damit Updates an diesen Dokumenten auch laufende Sparrings erreichen.

(keine)

Jeder Agent (These, Antithese, Synthese) MUSS diese Dateien vor seinem Schritt lesen und Constraints daraus auf seine Rolle anwenden — auch wenn sie nicht in `CHALLENGE.md` stehen. Stehen `(keine)` da, ist Projektkontext bewusst leer und das Sparring stützt sich nur auf das Artefakt selbst.

---

Das Sparring bearbeitet nur dieses Artefakt. Der übrige Projektkontext darf zur Orientierung genutzt werden, wird aber nicht als Output-Bereich behandelt.
