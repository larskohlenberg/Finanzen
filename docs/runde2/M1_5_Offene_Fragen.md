# M1.5 Offene Fragen

Stand: 27.05.2026

Statushinweis 2026-06-09: Historisches Arbeitsdokument aus M1.5. Pfade wie `data/master/...` sind nach ADR 0015 app-relativ zu lesen; physisch liegt der Master heute unter `app/data/master/...`.

Diese Datei enthaelt nur Fragen, die nach der dialogischen M1.5-Erarbeitung offen bleiben oder bewusst vertagt werden.

## Geklaert

- Personen: `PER-001` Person A und `PER-002` Person B sind die einzigen natuerlichen Personen fuer M1.5. Es gibt keine Haushalts-, Familien- oder Rollen-Person.
- Konten: sieben synthetische Beispielkonten/-depots sind fuer M1.5 bestaetigt. `KTO-003` Hauskonto MusterbankB gehoert Person A, nicht beiden Personen. MusterdepotA und MusterdepotB sind liquiditaetsrelevant.
- Kategorien: M1.5 nutzt eine kleine echte Grobkategorienliste mit Gehalt, Wohnen, Lebensmittel, Mobilitaet, Versicherung, Gesundheit, Freizeit, Kinder/Familie, Steuern/Abgaben, Sparen/Investieren, Transfer und Sonstiges / zu pruefen.
- Demo-Transaktionen: bleiben vorerst in `data/master/transaktionen.jsonl` als M2-Anzeigedaten, sind aber ueber `data/demo/...` und Demo-Texte klar markiert.

## Offen

Diese Kontoreferenzen duerfen fuer M1.5 offen bleiben, muessen aber vor M3 geklaert werden, damit Importzuordnung nicht geraten werden muss.

- Kontoreferenz fuer `KTO-002` Girokonto Person B MusterbankD.
- Kontoreferenz fuer `KTO-003` Hauskonto MusterbankB.
- Kontoreferenz fuer `KTO-004` Tagesgeld Person A MusterbankC.
- Kontoreferenz fuer `KTO-005` Tagesgeld Person B MusterbankC.
- Kontoreferenz fuer `KTO-006` MusterdepotA Person A.
- Kontoreferenz fuer `KTO-007` Gemeinsames Depot MusterdepotB.
