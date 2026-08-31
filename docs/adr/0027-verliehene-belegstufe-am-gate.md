# Verliehene Belegstufe: das Gate prueft Regel und Konto

`belegstufe` bewertet die Beleglage **zum Zeitpunkt der Regelanlage**. Sie sagt
nichts darueber, ob dieser Beleg noch deckt, was die Regel **heute** erreicht.
Ein neu importiertes Konto aendert die Reichweite einer unveraenderten Regel.
Das Gate prueft darum nicht mehr die Regel allein, sondern das Paar aus Regel
und Konto.

## Der Fall

Eine Regel mit ausschliesslich `gegenpartei_pattern`, ohne weitere
Einschraenkung, `belegstufe = E2`. Die Stufe war sauber verdient: 32 menschlich
bestaetigte Buchungen auf einem Konto, alle mit identischem Verwendungszweck,
alle in derselben Kategorie. Homogener geht es nicht.

Dann wurde ein zweites Konto erstimportiert. Derselbe Zahler leistet dort
Zahlungen ganz anderer Art. Die Regel traf sie alle — 57 Buchungen — und haette
sie bei E2 als `bestaetigt_durch = "auto"` in die falsche Kategorie geschrieben:
nie von einem Menschen gesehen, in einer Groessenordnung, die die Kategorie
unbrauchbar macht. Zwei weitere Regeln trugen dieselbe Fehlerart.

Die Regel hat sich nicht geaendert. Ihre Welt hat sich geaendert.

## Warum das Gate und nicht nur der Pruefbericht

**Reihenfolge.** Der Pruefbericht ist Station 5 des Durchlaufs, die Freigabe
Station 4 — und die schreibt. Ein Bericht kann diese Fehlerart nur noch
melden, nachdem sie im Bestand steht.

**Der Bericht haette sie auch nicht gemeldet.** Keine seiner Sektionen trifft
diesen Fall, und zwar nicht aus Nachlaessigkeit, sondern nach Konstruktion:

- *Groesste Auto-Freigaben* — die Einzelbetraege sind unauffaellig; gefaehrlich
  ist die Summe.
- *Merchants, die nie ein Mensch bestaetigt hat* — die Gegenpartei **hat**
  menschliche Bestaetigungen, nur auf dem anderen Konto. Genau dieser Filter
  schliesst den Fall aus.
- *Kategorie-Ausreisser* — vergleicht den juengsten Monat gegen den Median der
  sechs davor. Ein Erstimport bringt Jahre auf einmal; die Zusatzbuchungen
  verteilen sich ueber alle Monate und bleiben je Monat unter dem Faktor.

Eine Fehlerart, die drei Berichtssektionen strukturell unterlaufen kann, ist
kein Berichtsfall.

**ADR 0025 argumentiert selbst so:** „Der Schaden materialisiert sich als
sichtbare Arbeit, nicht als stille Korruption im Bestand." Ein Gate-Grund ist
sichtbare Arbeit. Ein Berichtseintrag nach dem Schreiben ist Korruption **und**
Arbeit.

**Der Bericht kommt beim Gate gratis mit.** `gate_durchfall` steht bereits im
Logeintrag, wird vom Pruefbericht bereits gerendert und von `lernen.mjs`
bereits nach Grund gezaehlt. Das Kriterium ins Gate zu legen liefert den
Berichtseintrag mit; es in den Bericht zu legen liefert kein Gate.

## Warum trotzdem ein eigener Abschnitt im Pruefbericht

Das Gate haelt nur die **verliehene** Stufe. Regeln, die nirgends einen Anker
haben, laufen weiter durch (siehe unten) — und niemand sieht sie. Der Bericht
bekommt darum eine rein lesende Sektion ueber die ganze Flaeche: jedes Konto,
auf dem eine Regel wirkt, ohne dass dort je ein Mensch ihre Kategorie
entschieden hat, getrennt nach verliehen und neu erschlossen. Das ist genau der
blinde Fleck, fuer den es den Bericht gibt. Er bleibt rein lesend und blockiert
nie.

## Warum nicht jedes ankerlose Konto blockiert

Naheliegend waere: „kein menschlicher Anker auf diesem Konto → keine
Auto-Freigabe". Am Bestand gemessen ist das unbrauchbar. Die drei zuletzt
erstimportierten Konten tragen 0, 0 und 1 menschlich bestaetigte Buchung. Ein
solches Kriterium haelt dort **alle** Regeln und ueber 300 Buchungen — und
diese Regeln wurden gerade **fuer** diese Konten angelegt, mit Beleg im Archiv
oder Recherche. Das waere der Bucket-Dialog je neuem Konto, also genau die
Zeremonie, die ADR 0025 abgeschafft hat.

Der Unterschied ist inhaltlich, nicht kosmetisch. Eine Regel ohne jeden Anker
stuetzt sich auf E1, E3 oder E4 — Beleg, Buchungstext, Recherche. Diese Belege
sind **kontounabhaengig**; es ist nichts gewandert. Nur E2 heisst laut
Belegleiter „identischer Merchant **im Bestand** schon entschieden" — die
einzige Stufe, deren Beleg aus dem Bestand selbst stammt und damit
stillschweigend an die Konten gebunden ist, auf denen dieser Bestand lag.

Die Messung bestaetigt das: von den 13 Paaren, die das Kriterium heute haelt,
tragen 12 Regeln E2 und eine gar keine Stufe. Der Ankertest trifft die
verwundbare Sprosse, ohne `belegstufe` je zu lesen.

## Das Kriterium

Eine Regel gibt auf einem Konto **nicht** automatisch frei, wenn sie

- auf einem **anderen** von ihr getroffenen Konto einen menschlich
  bestaetigten Anker fuer ihre Kategorie hat, **und**
- auf **diesem** Konto keinen.

Anker ist eine Buchung mit `bestaetigt_durch = "mensch"` oder
`kategorie_herkunft = "manuell"` und der Kategorie der Regel. Dieselbe
Definition von „menschlich" wie die Referenzmenge der Spezifitaetspruefung: eine
Auto-Freigabe belegt nichts, sie ist das, was hier geprueft wird.

Getroffene Konten kommen aus `matched_regeln`, nicht aus einem erneuten
Matching-Lauf — das Feld haelt fest, was der Kategorisierungslauf tatsaechlich
getan hat (ADR 0018).

Die Ankermenge wird **einmal vor dem Lauf** gebildet, aus demselben Grund wie
die Referenzmenge: sonst legitimierte die erste durchgerutschte Buchung die
Stufe fuer alle folgenden.

Der Grund heisst `anker` und wird **zuletzt** geprueft. Alle Gruende davor
gelten der Regel selbst und fallen auf jedem Konto gleich aus; nur dieser gilt
dem Paar. Eine strukturell kaputte Regel soll als kaputt gemeldet werden, nicht
als Ausweitung. Entsprechend traegt der `gate_durchfall`-Eintrag nur bei diesem
Grund zusaetzlich `konto_id`.

## Nebenbefund: das Feldformat der Reconciliation-Differenz

Im selben Lauf fiel auf, dass der Abschnitt „Nicht reconciliierte
Kontostaende" `undefined: Differenz [object Object]` ausgab. Das Rendering
erwartete ein `quelle` und einen skalaren Betrag; der Import-Agent schreibt ein
Objekt und kein `quelle`. Eine reale, ausfuehrlich erklaerte Differenz war damit
unlesbar — in dem Abschnitt, den es allein dafuer gibt.

`normalisierung.reconciliation_differenz` ist jetzt als
`{ konto_id, betrag, grund }` festgeschrieben (`app/docs/agent-context.md`).
Eine Differenz gehoert zu einem **Konto**, nicht zu einer Datei;
`normalisierung.dateien` ist eine Anzahl, kein Name, und taugte nie als
Quellenangabe. Das Rendering liest die aelteren Formen weiter, weil der Log
nicht umgeschrieben wird.

## Verworfene Alternativen

- **Nur im Pruefbericht.** Zu spaet, und der Bericht haette den Fall nach
  Konstruktion nicht gezeigt. Siehe oben.
- **`konto_id` an jeder Regel verpflichtend.** Verhindert die Ausweitung
  bauartbedingt, zerstoert aber den legitimen Fall: ein Merchant, der wirklich
  auf mehreren Konten auftaucht, braeuchte eine Regel je Konto, und der
  Regelbestand waechst mit der Kontozahl. Ausserdem waeren alle Bestandsregeln
  auf einen Schlag unvollstaendig — dieselbe Falle, die ADR 0025 beim globalen
  `required` auf `belegstufe` vermieden hat.
- **Auf `belegstufe = E2` einschraenken.** Traefe heute dieselben Regeln, aber
  ueber einen Stellvertreter. Der Fehlermechanismus ist der geliehene Anker,
  nicht die Sprosse; eine E1-Regel, deren Beleg nur einen Vertrag auf einem
  Konto deckt, hat denselben Defekt.
- **Die Regel bei Ausweitung automatisch stilllegen** (analog ADR 0026). Auf
  ihrem Heimatkonto ist sie richtig; stilllegen wuerfe korrekte Arbeit weg. Das
  Zurueckhalten ist eng und reversibel, die Stilllegung nicht.
- **Belegdeckung statt Kontoanker.** Die schaerfere Diagnose: die Regel schraenkt
  nur `gegenpartei` ein, waehrend ihr Beleg auch im `verwendungszweck` homogen
  war — die Reichweite war von Anfang an breiter als der Beleg. Das setzt
  voraus, zu wissen, in welchen Feldern der Beleg homogen war; das haelt heute
  kein Feld fest. Das Konto ist der grobe, aber protokollierte Stellvertreter.
  Zurueckgestellt, nicht verworfen.

## Konsequenz

- Neue Bibliothek `app/tools/lib/kontoanker.mjs`, geteilt von `freigabe.mjs`
  und `pruefbericht.mjs` — dieselbe Aufteilung wie `lib/spezifitaet.mjs`.
- Neuer Gate-Grund `anker` in `freigabe.mjs`, als letzter geprueft.
  `gate_durchfall` traegt bei diesem Grund zusaetzlich `konto_id`.
- Neue rein lesende Sektion „Regeln auf Konten ohne menschlichen Anker" im
  Pruefbericht, getrennt nach verliehen und neu erschlossen.
- `normalisierung.reconciliation_differenz` als `{ konto_id, betrag, grund }`
  festgeschrieben; das Rendering vertraegt die aelteren Formen.
- Praezisiert ADR 0025 im Gate und nutzt die Provenance aus ADR 0018 fuer eine
  zweite Frage: nicht nur „welche Regel hat entschieden", sondern „wie weit
  reicht sie".
