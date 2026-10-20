# Buchung traegt optional, fuer wen sie ist

Status: entschieden am 2026-10-20.

## Kontext

Kinder sind im Haushalt, haben aber keine eigenen Konten. Ihre Kosten liefen
bisher ueber die Kategorie „Kinder/Familie“. Damit steckte in der Kategorie
zugleich, wofuer das Geld war und fuer wen: Der Sportverein der Kinder stand
unter „Kinder/Familie“, der der Eltern unter „Freizeit“. Weder „Was kostet uns
Sport?“ noch „Was kostet uns ein Kind?“ liess sich beantworten.

## Entscheidung

Eine Transaktion kann optional `fuer_person_id` tragen: die eine Person, der die
Buchung zugutekommt. Kinder werden dafuer gewoehnliche Personen ohne Konto; ein
Rollenfeld gibt es weiterhin nicht. Die Kategorie beantwortet nur noch „wofuer“.

- **Herkunft** `fuer_person_herkunft`: `regelzahlung`, `regel` oder `manuell`.
  Vorrang: manuell vor Regelzahlung vor Regel.
  `manuell` ohne Person heisst bewusst keine Person.
- **Ableitung** ueber `tools/personenbezug.mjs` (MCP `personenbezug`): die Person
  der Regelzahlung der Buchung, sonst die eine Person aller aktiven, passenden
  Regeln mit `fuer_person_id`. Mehrere verschiedene Personen sind ein Konflikt;
  die Buchung bleibt ohne Person und der Bericht nennt sie.
- Regeln und Regelzahlungen tragen dafuer optional `fuer_person_id`.
- Die Person aendert weder Kategorie noch Cashflow. Wer bezahlt hat, folgt
  weiter dem Konto (Cashflow-Traeger).
- In der App: Filter und Gruppe „Person“ in der Buchungsliste, die Person im
  Detail der Buchung. „Kosten je Kind“ ist Gruppe Person mit Zeitraum, oder
  Filter Person mit Gruppe Kategorie.

## Verworfene Alternativen

- **Weiter ueber die Kategorie** (z. B. „Kinder/Sport“): vermischt wofuer und
  fuer wen, verdoppelt Kategorien je Person und je Zweck.
- **Kinder als Konten ohne Bankbezug:** verfaelscht Liquiditaet und
  Kontoinhaberschaft, die nur echte Bankkonten kennen.
- **Aufteilung einer Buchung auf mehrere Personen mit Quoten:** YAGNI wie bei
  Konten (ADR 0001, Cashflow-Traeger); ein Familienbeitrag bleibt ohne Person.
- **Person nur abgeleitet, nie gespeichert:** dann ginge eine Handentscheidung
  verloren, und die App muesste Regeln selbst auswerten.
- **Ableitung in der Freigabe oder im Regelzahlungs-Matcher:** vermischt
  Zustaendigkeiten; ein eigenes, schmales Werkzeug wie beim Immobilienbezug
  (ADR 0024) bleibt nachvollziehbar.
