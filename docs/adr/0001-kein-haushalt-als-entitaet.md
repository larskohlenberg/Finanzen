# Kein Haushalt als Entitaet

Viele Familien-Finanztools modellieren einen "Haushalt" als aggregierende Einheit ueber Personen. Wir tun das **nicht**: ein Ehepaar mit Kindern braucht keine eigene Entitaet, um gemeinsame Cashflows zu sehen — Gemeinschaftskonten haben einfach eine Inhaberliste mit mehreren `person_ids`, und Familien-Sichten entstehen als View ueber alle Konten.

Begruendung: Eine zusaetzliche Entitaet erzeugt Aufwand (eigene Datei, eigene Referenzen, eigene Konsistenzregeln) ohne Gegenwert in einem privaten Setup mit genau einer Familie. Aggregationsfragen wie "was kostet uns als Familie Lebensmittel" sind reine Filter-/Summen-Views auf vorhandene Daten.

## Verworfene Alternativen

- **Haushalt als Entitaet, Konten verweisen auf `haushalt_id`**: sauberere Aggregation, aber Overhead ohne realen Nutzen bei nur einer Familie.
- **Haushalt als Rolle der Person**: vermischt Identitaet (Person) und Aggregations-Scope (Haushalt) — wurde aktiv aus dem Modell entfernt.

## Konsequenz

Eigentumsanteile, wo sie ungleich sind (z. B. Immobilie 2/3 zu 1/3), werden direkt am Objekt mit Quoten modelliert. Konten bleiben gleichberechtigt (Bank kennt keine Quoten).
