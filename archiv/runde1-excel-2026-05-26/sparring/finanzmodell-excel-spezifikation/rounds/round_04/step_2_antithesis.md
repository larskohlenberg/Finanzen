## Annahme 1: Der Thin-Slice-Test beweist Nutzwert statt nur Anschlussfaehigkeit
**Selbstverstaendlich angenommen:** Die These setzt voraus, dass eine referenzierbare Kette aus Person, Konto, Quelle, Importlauf, Rohumsatz, Modellumsatz, Check und Dashboardstatus bereits einen Nutzwertnachweis bildet. Tatsachlich koennte diese Kette nur beweisen, dass IDs und Seeds syntaktisch zusammenpassen, nicht dass ein Nutzer danach eine bessere finanzielle Entscheidung trifft.

**Wenn das Gegenteil wahr waere:** Wenn Nutzwert erst entsteht, sobald eine echte Kennzahl aus echten Buchungen, Annahmen und Checks berechnet wird, waere der Task-1-Slice noch kein vertikaler Nutzwert-Slice, sondern ein gut beschrifteter Fixture-Slice. Dann waere Rot oder Gelb kein Beleg fuer ehrliche Unsicherheit, sondern nur ein gesetzter Zustand, der Unsicherheit behauptet.

**Alternative Struktur:** Task 1 muesste dann ehrlicher als "Struktur- und Beobachtbarkeits-Gate" benannt werden, waehrend der erste Nutzwert erst mit Task 3 beginnt. Der Test duerfte nicht behaupten, Cashflow oder Liquiditaet nutzerrelevant zu zeigen, sondern nur, dass alle spaeter benoetigten Belege, Status und Zielspalten vorhanden sind. Die Leitentscheidung muesste die Formulierung "beweist, dass die Struktur die Familienfrage tragen kann" abschwaechen: Sie beweist hoechstens, dass die Struktur eine spaetere Antwort nicht offensichtlich blockiert.

## Annahme 2: `startDashboard` ist eine Entscheidungssicht und nicht nur ein statischer Status-Seed
**Selbstverstaendlich angenommen:** Die These behandelt `startDashboard.Modellstatus`, Kontrollstatus und eine Startkennzahl als sichtbare erste Entscheidungssicht. Dabei bleibt unklar, wodurch diese Sicht mehr ist als ein fest eingetragener Statuswert mit plausibel klingender naechster Aktion.

**Wenn das Gegenteil wahr waere:** Wenn `startDashboard` nur ein Seed ist, kann der Test mit beliebigen Minimaldaten Gruen verhindern, ohne zu pruefen, ob der Status aus der Datenlage folgt. Ein roter oder gelber Status waere dann nicht belastbarer als eine Warnlampe, die immer eingeschaltet ist, solange der Builder sie so seedet.

**Alternative Struktur:** Der Slice muesste entweder eine minimale Ableitungsregel enthalten, die explizit noch keine Task-3-Formel ist, oder den Dashboard-Seed streng als "manueller Startzustand" markieren und aus dem Nutzwertversprechen herausnehmen. Sonst verwischt die These die Grenze zwischen Statusdarstellung und Statusbegruendung: Das Dashboard sieht wie Ergebnislogik aus, basiert aber auf einer gesetzten Behauptung. Eine bessere Struktur wuerde zwei getrennte Tests verlangen: erst Referenzierbarkeit der Seed-Kette, dann Nachweis, dass jeder sichtbare Dashboardstatus auf mindestens einen Check, eine Quelle oder einen offenen Status zurueckverweist.

## Annahme 3: Meta-Felder im Produktcode schuetzen vor Formelvorgriff
**Selbstverstaendlich angenommen:** `workbookSpec.task1Scope = "structure_and_seed_contract"` und `workbookSpec.formulaImplementationTask = 3` werden als saubere Grenze zwischen Strukturvertrag und Formellogik verstanden. Diese Felder koennten aber eher Prozess-Metadaten im Produktcode sein als fachlich notwendige Workbook-Spezifikation.

**Wenn das Gegenteil wahr waere:** Wenn solche Felder nur den Test beruhigen, ohne den Builder real zu begrenzen, entsteht ein falsches Sicherheitsgefuehl. Dann kann `workbookSpec.mjs` trotz deklarierter Scope-Felder Fachlogik, stille Defaults oder Dashboard-Ableitungen enthalten, solange die Meta-Felder den erwarteten Wert tragen.

**Alternative Struktur:** Die Grenze muesste ueber negative Verhaltens- und Importtests abgesichert werden, nicht ueber Selbstauskunft im Spec-Objekt. Statt `formulaImplementationTask` im Produktvertrag waere robuster: Task-1-Tests duerfen `formulas.mjs` nicht importieren, Dashboardfelder muessen als `seeded_start_state` oder `computed_later` markiert sein, und jede Kennzahl mit fachlicher Berechnung muss in Task 1 entweder leer, placeholderhaft oder explizit als Startwert gekennzeichnet sein. Die Meta-Information kann in Bauplan oder Testbeschreibung stehen; im Produktcode droht sie, den Strukturvertrag mit Projektmanagementdaten zu belasten.

## Nebenkritik
- Die Grenze zwischen "Startkennzahl" und "erste Formellogik" bleibt sprachlich zu weich: Eine "sichtbare Startkennzahl fuer Liquiditaet oder Cashflow" klingt fuer Nutzer nach Ergebnis, obwohl sie in Task 1 nur ein gesetzter Zustand sein darf.
- Der Begriff "vertikaler Nutzwert-Slice" ist riskant, weil der Slice gerade nicht vertikal durch Berechnung, Verifikation und Entscheidung laeuft, sondern vor der ersten echten Formel stoppt.
- Der Test auf `Modellstatus != Gruen` verhindert zwar Scheingenauigkeit nach oben, prueft aber noch nicht, ob Rot und Gelb unterscheidbar, begruendet und fuer die naechste Aktion relevant sind.
