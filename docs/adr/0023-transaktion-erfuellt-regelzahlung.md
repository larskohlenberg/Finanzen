# Transaktion erfüllt Regelzahlung statt direktem Vorsorgeverweis

Status: entschieden am 2026-08-11.

## Entscheidung

Eine Transaktion kann optional über `regelzahlung_id` genau eine erwartete
Regelzahlung erfüllen; eine Regelzahlung kann über die Zeit von vielen
Transaktionen erfüllt werden. Der Vorsorgebezug einer gebuchten Beitragszahlung
wird ausschließlich über `Transaktion → Regelzahlung → Vorsorge` abgeleitet.
Eine zusätzliche `vorsorge_id` an der Transaktion wird nicht eingeführt, weil sie
dieselbe Beziehung doppelt und potenziell widersprüchlich speichern würde.

Die Verknüpfung ist explizit und wird nicht automatisch aus Betrag,
Gegenpartei oder Rhythmus abgeleitet. Eine einzelne Kontobuchung darf höchstens
einem Vorsorgevertrag zugeordnet sein; gebündelte oder aufgeteilte Buchungen sind
bis zu einem konkreten Bedarf nicht Teil des Modells.

## Considered Options

- **Direkte `vorsorge_id` an der Transaktion:** verworfen, weil eine bereits über
  `Regelzahlung.vorsorge_id` ausgedrückte Beziehung dupliziert würde und bei
  Vertrags- oder Regelzahlungswechseln auseinanderlaufen könnte.
- **Eigene Zuordnungsentität mit Betragssplits:** verworfen als YAGNI, weil im
  aktuellen Haushalt eine Kontobuchung jeweils genau einen Vorsorgevertrag
  betrifft.

## Konsequenzen

- `regelzahlung_id` ist optional, referenziell validiert und verändert weder
  Kategorisierung noch Cashflowwirkung einer Transaktion.
- Vorsorgeansichten können gebuchte Beiträge eindeutig ableiten und mehrere
  aufeinanderfolgende Beitrags-Regelzahlungen eines Vertrags zusammenführen.
- Bestehende Buchungen bleiben gültig, werden aber erst nach expliziter
  Verknüpfung als Erfüllung einer Regelzahlung ausgewiesen.
- Die Beziehung bildet eine belastbare Naht für einen späteren Plan-Ist-Abgleich,
  implementiert dessen Toleranz- und Statuslogik jedoch noch nicht.
