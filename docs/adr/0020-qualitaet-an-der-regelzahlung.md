# Qualität an der Regelzahlung: Vertrag vs. Konsumplan

M6 braucht eine Unterscheidung zwischen **vertraglichen Verpflichtungen** (Miete, Mobilfunk,
Leasing — exakter Betrag, oft mit `aktiv_bis`) und **geschätzten Kategorie-Konsumplänen**
(„~500/Monat Lebensmittel" — Planwert ohne Vertrag). Beide sind Regelzahlungen und speisen
die Liquiditätsprognose, haben aber unterschiedliche Sicherheit.

**Entscheidung:** Die Regelzahlung trägt ein `qualitaet`-Feld (`belegt | geschaetzt`),
**orthogonal zum `status`** (Status = Herkunft/Bestätigung, Qualität = Sicherheit des
Betrags). `belegt` = vertragliche Verpflichtung, meist mit `aktiv_bis` und `quelle_hinweis`
(Pfad zum Vertrag / zur Jahres-Beitragsinfo). `geschaetzt` = Kategorie-Konsumplan
(`kategorie_id` gesetzt, keine `gegenpartei`) — welche Gegenpartei real bucht, ist
zukünftig offen und irrelevant; geplant wird auf **Kategorie-Granularität**.

Damit prüft der **Cash-Realismus-Guardrail** (M6) nur `geschaetzt`-Buckets gegen das
historische Kategorie-Ist; `belegt`-Fakten werden nicht plausibilisiert. Die Felder machen
Planwerte zugleich **abgleich-fähig** für den Plan-Ist-Abgleich (M8) — M6 legt die Naht,
nicht die Maschine.

## Considered Options

- **Kein Qualitätsfeld** (Status quo nach Bewertung M1–M5 §6.2): verworfen, weil der
  Treiber — Vertrag vs. Schätzung sauber trennen — jetzt konkret vorliegt. Diese ADR
  überholt jene Festlegung bewusst.
- **Eigenes `art`-Feld (`vertrag | konsumplan`):** verworfen zugunsten des bereits
  projektweit etablierten `qualitaet`-Vokabulars (Zeitwerte, Vermögenspositionen), statt
  ein zweites Vokabular einzuführen.
