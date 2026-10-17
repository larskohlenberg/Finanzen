# Immobilienbelege nach Bereichen statt nach Jahren

Status: entschieden am 2026-10-17.

## Kontext

Belege liegen beim Objekt, darunter je Jahr. Fuer Konten, Darlehen und
Vorsorge passt das: Dort kommen jedes Jahr gleichartige Auszuege dazu. Eine
Immobilie sammelt dagegen ganz verschiedene Dokumente: Kauf, Bau, Technik,
laufende Kosten und, wenn sie vermietet ist, Mietvertrag und
Nebenkostenabrechnungen. In Jahresordnern stehen Mietvertrag und
Nebenkostenabrechnungen zwischen Notar- und Bauunterlagen. Fuer die jaehrliche
Nebenkostenabrechnung muss man die Kosten eines Jahres aus mehreren Ordnern
zusammensuchen, weil die Rechnung fuer ein Jahr meist im Folgejahr kommt.
Belege zu zwei Immobilien lagen unter `Immobilien/Allgemein/` und damit bei
keiner der beiden.

## Entscheidung

- Unter `Belege/Immobilien/<IMM-ID>_<Kurzname>/` gibt es fuenf feste Bereiche:
  `Erwerb`, `Bau`, `Technik`, `Laufende-Kosten`, `Vermietung`. Ein Bereich
  entsteht erst mit seinem ersten Beleg.
- Jahresordner nur, wo jedes Jahr Belege dazukommen: Pflicht unter
  `Laufende-Kosten`, erlaubt unter `Vermietung` (fuer die Abrechnungen; der
  Mietvertrag liegt direkt im Bereich). Jahr ist das **Abrechnungsjahr**. Sonst
  steht das Datum im Dateinamen.
- Kein `Allgemein` fuer Immobilien. Ein Beleg zu mehreren Immobilien wird
  geteilt, wenn er seitenweise trennbar ist, sonst liegt er als Kopie bei jeder.
  `belege_umziehen` kann dafuer kopieren (`kopie: true`).
- `beleg_ablegen` prueft die Struktur und weist andere Ziele ab.
- Die App braucht keine Aenderung: Der Dokumentenausschnitt eines Objekts zeigt
  die Ordner so, wie sie liegen.

## Verworfene Alternativen

- **Nur einen Bereich `Vermietung` neben den Jahresordnern.** Loest das
  Vermietungsproblem, laesst aber Kauf, Bau und Technik nach Jahren verstreut.
- **Kosten der Vermietung im Bereich `Vermietung`.** Grundsteuer, Wasser und
  Abfall fallen auch bei selbst genutzten Objekten an und sollen dort am selben
  Platz liegen. Fuer die Abrechnung genuegen zwei Ordner desselben Jahres.
- **Ein Beleg, angezeigt bei allen Immobilien aus seinem Dateinamen.** Spart die
  Kopie, braucht aber eine zweite Zuordnungslogik in der App, und der Beleg
  laege physisch weiter nur bei einem Objekt.
- **Jahresordner nach Datum des Schreibens.** Haelt die bisherige Regel, verteilt
  aber die Kosten eines Abrechnungsjahres auf zwei Ordner.
