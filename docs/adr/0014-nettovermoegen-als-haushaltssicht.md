# Nettovermoegen als Haushaltssicht, anteilsgewichtet, keine pro-Person-Aufteilung

Das Nettovermoegen wird in M5 als **Gesamt-/Haushaltssicht** berechnet (alle Personen zusammen). Es gibt **keine** Aufteilung pro Person. Immobilien und weitere Vermoegenswerte gehen **anteilsgewichtet** ueber Haushaltspersonen ein; Konten/Depots zaehlen voll (sie haben bewusst keine Quoten).

## Begruendung

Zwei bestehende Modellentscheidungen kollidieren bei einer pro-Person-Sicht:

- **Konto** hat eine Inhaberliste *ohne* Quoten (ADR 0001 / `CONTEXT.md > Konto`): "ein Gemeinschaftskonto ist gemeinschaftlich". Es gibt also keine Information, wie viel eines Gemeinschaftsdepots welcher Person "gehoert".
- **Immobilie** (und weiterer Vermoegenswert) hat dagegen Quoten als exakte Brueche.

Ein Nettovermoegen pro Person muesste fuer Gemeinschaftskonten Quoten **erfinden** — genau das verbietet `CONTEXT.md`. Eine pro-Person-Zahl waere teils belegt (Immobilie), teils geraten (Konto) und damit methodisch inkonsistent. Das widerspricht der Projekt-DNA ("nichts raten, Unsicherheit sichtbar machen").

Es gibt zudem keinen fachlichen Bedarf fuer eine pro-Person-Aufteilung (kein Guetertrennungs-/Erbschaftsfall). YAGNI.

## Konsequenz

- Nettovermoegen = Summe Aktiva (liquide Konten + Depotwerte + anteilsgewichtete Immobilien-/Vermoegenswerte) minus Passiva (Darlehen-Restschulden), als Gesamtsicht.
- Immobilien/Vermoegenswerte zaehlen **anteilsgewichtet** ueber Haushaltspersonen — heute faktisch 100 %, solange alle Miteigentuemer zum Haushalt gehoeren. Ein externer Miteigentuemer wird als Anteilseintrag **ohne** `person_id` (`extern: true`) gefuehrt und faellt aus dem Nettovermoegen; gebaut wird dieser Fall erst bei Bedarf (YAGNI), die anteilsgewichtete Rechnung greift dann sofort.
- Konten/Depots zaehlen voll — konsistent mit der quotenfreien Inhaberliste (ADR 0001).
- Sollte je eine pro-Person-Sicht noetig werden, ist sie eine eigene, spaeter zu treffende Entscheidung inkl. Klaerung, wie Gemeinschaftskonten aufgeteilt wuerden (echte `CONTEXT.md`-Aenderung).
