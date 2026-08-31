# Auto-Freigabe mit Gate statt Vorab-Review

Vorgeschlagene Kategorien werden nicht mehr einzeln vom Nutzer bestaetigt,
sondern von einem deterministischen Gate automatisch freigegeben. Die Kontrolle
verschiebt sich von einer Zustimmung vorab auf einen Pruefbericht danach.

## Begruendung

Der Engpass war nie das Rechnen. `confirm.mjs --regel_id=` erledigt ein Bucket
in einem Aufruf. Was Zeit frisst, ist die Vorschrift, pro Bucket eine
Stichprobe zu zeigen und auf eine Entscheidung zu warten: 38 Buckets sind 38
Dialogrunden, und dieser Aufwand faellt bei jedem Import erneut an.

Das Gate ist **modellunabhaengig**. Ein schwaecheres Urteil bei der Regelanlage
erzeugt nicht mehr falsche Daten, sondern mehr durchgefallene Regeln — der
Schaden materialisiert sich als sichtbare Arbeit, nicht als stille Korruption
im Bestand. Das ist der Grund, warum die Zustimmungszeremonie ersatzlos
entfallen kann.

Eine Auto-Freigabe traegt `bestaetigt_durch = "auto"` und ist damit **kein
menschlicher Akt**: `recategorize.mjs` darf sie neu bewerten. Ein
auto-freigegebener `KAT-012`-Eintrag wird von jeder spaeter angelegten
passenden Regel eingesammelt. Der blinde Fleck schrumpft mit jedem
Regel-Tuning von selbst, ohne dass jemand danach sucht.

## Das Gate

Eine Regel gibt automatisch frei, wenn sie **aktiv** ist, einen **Kommentar**
traegt, eine **`belegstufe` in E1-E4** hat, deren Stufe **nicht gesperrt** ist,
und ihr Muster die **Spezifitaetspruefung** besteht.

**Kein Konfliktkriterium.** `categorize()` liefert bei mehreren Regeln mit
verschiedenen Kategorien `status = "offen"`, nie `"vorgeschlagen"` — eine
konfliktbehaftete Buchung erreicht das Gate nicht. Eine Konfliktpruefung dort
waere toter Code. Der Probelauf bleibt, wo er wirkt: beim Anlegen einer Regel.

### Spezifitaetspruefung

Fuer jeden Alternationszweig eines Musters wird gezaehlt, ueber wie viele
verschiedene Kategorien er in der Referenzmenge streut. Ab drei Kategorien
traegt der Zweig keine Kategorieaussage mehr.

Innerhalb eines Feldes ist die Alternation ein ODER — ein generischer Zweig ist
ein Leck, also muessen **alle** Zweige tragen. Zwischen `gegenpartei_pattern`
und `verwendungszweck_pattern` gilt UND — ein spezifisches Feld genuegt.

Die Referenzmenge sind ausschliesslich **menschlich entschiedene** Buchungen
(`bestaetigt_durch = "mensch"` oder `kategorie_herkunft = "manuell"`). Gegen den
Gesamtbestand gerechnet wuerde eine schlechte Regel, die soeben Hunderte
Buchungen auf eine Kategorie gesetzt hat, Streuung 1 erreichen und sich selbst
als spezifisch beweisen.

Die Pruefung ist ein **Veto**, kein Beweis. Bei duenner Referenzmenge kommt
eine Regel durch; sie kann nichts durchwinken, was sonst gestoppt worden waere.
Am Bestand gemessen fallen 3 von 295 aktiven Regeln durch.

## `belegstufe`: Wertebereich im Validator, Anwesenheit im Gate

Ein globales `required` haette die 295 Bestandsregeln sofort ungueltig gemacht.
Stattdessen erzwingt der Validator nur E1-E4, und das Gate erzwingt die
Anwesenheit: fehlt die Stufe, gibt die Regel nichts automatisch frei. Das
erzeugt den Druck, sie nachzutragen, ohne den Bestand zu blockieren — und setzt
"E5/E6 werden nie Regeln" dort durch, wo es wirkt.

Fuer Bestandsregeln laesst sich E2 **beweisen** statt schaetzen: trifft das
Muster menschlich bestaetigte Buchungen, und tragen alle davon die Kategorie
der Regel, ist genau die E2-Bedingung der Belegleiter erfuellt. So sind 245 der
295 Regeln belegt. Neun Regeln widersprechen menschlichen Entscheidungen und
bleiben bewusst ohne Stufe.

## Verworfene Alternativen

- **Freigabe nach Risikoschwelle** (Betrag, Neuheit des Merchants). Die
  Schwellen waeren erfundene Zahlen ohne Beleg — genau das, was die Belegleiter
  in `kategorisierungsregel-pflege` verbietet.
- **Freigabe im Import-Lauf statt als Bestands-Tool.** Erreicht die vorhandenen
  Vorschlaege nie, weil der Dedupe-Hash Bekanntes ueberspringt, und liesse nach
  einem Regel-Tuning keine erneute Freigabe zu.
- **Nur Regel-Buckets automatisch freigeben, Agentenvorschlaege im Dialog.**
  Haette den Rueckstand um 84 % gesenkt, aber den Dialog als Pflichtstation
  erhalten. Der Nutzer hat sich am 2026-08-31 bewusst fuer die vollstaendige
  Automatisierung entschieden.
- **Belegstufe fuer Bestandsregeln schaetzen.** Waere genau die
  Selbstueberschaetzung, gegen die das Feld eingefuehrt wurde.

## Konsequenz

- Neues Feld `bestaetigt_durch` (`auto | mensch`) an der Transaktion, vom
  Validator in beide Richtungen erzwungen.
- Neues Feld `belegstufe` (`E1`-`E4`) an der Kategorisierungsregel.
- Neue Tools `freigabe.mjs` und `pruefbericht.mjs`, dazu die Migrationen
  `migrate-bestaetigt-durch.mjs` und `migrate-belegstufe.mjs`.
- `istKandidat()` in `recategorize.mjs` behandelt `auto` als Kandidat.
- `regel-probelauf.mjs` meldet unspezifische Muster und blockiert.
- `kategorisierung-review` ist nicht mehr Pflichtstation, sondern
  Korrekturkanal.
- Diese ADR praezisiert ADR 0017 in der Kandidatendefinition und erweitert
  ADR 0018 um `belegstufe`.
