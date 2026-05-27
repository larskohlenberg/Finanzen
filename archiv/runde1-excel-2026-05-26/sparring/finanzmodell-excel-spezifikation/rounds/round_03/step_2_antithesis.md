## Annahme 1: Dependency-Reihenfolge fuehrt automatisch zum ersten Nutzwert
**Selbstverständlich angenommen:** Die These setzt voraus, dass `tableBuildOrder` als dependency-orientierte Reihenfolge die erste Implementierung besser fuehrt als die sichtbare Nutzerfrage. Der Start mit Stammdaten, Szenarien, Annahmen und Quellen wirkt technisch sauber, aber er verschiebt den ersten roten/gruenen Nachweis des eigentlichen Nutzwerts hinter einen grossen Strukturblock.

**Wenn das Gegenteil wahr wäre:** Vielleicht entsteht der erste Nutzwert nicht durch vollstaendige Referenzbasis, sondern durch einen extrem schmalen vertikalen Durchstich: ein Importlauf, wenige Umsaetze, eine Liquiditaetszahl, ein Check, ein Dashboard-Befund. Dann waere die aktuelle `tableBuildOrder` nicht fuehrend, sondern eine Vorab-Architektur, die den ersten beweisbaren Finanzblick verzoegert.

**Alternative Struktur:** Die Spezifikation muesste dann nicht zuerst alle Referenztabellen in stabiler Reihenfolge definieren, sondern einen "thin slice" als erste Bauklammer festlegen: minimaler Stammdatensatz, minimaler Import, minimale Modellumsatzzeile, eine Cashflow-/Liquiditaetsformel, ein Check, ein Dashboardstatus. `tableBuildOrder` waere dann keine vollstaendige Tabellenliste fuer Task 1, sondern eine phasenweise Build-Sequenz mit einem expliziten ersten Nutzwert-Test vor dem Ausbau der restlichen Muss-Tabellen.

## Annahme 2: `98_Kontrollspur` bleibt minimal, weil Rohartefakte extern bleiben
**Selbstverständlich angenommen:** Die These behandelt `98_Kontrollspur` als minimal, weil nur drei Tabellen im Master stehen und Detailprotokolle in `workbook-build/` bleiben. Sie unterschätzt aber, dass schon die drei Tabellen eine dauerhafte Produktlogik fuer Build-Historie, Agentenlauf-Historie, Artefakt-Historie, Hashpruefung, Compliance-Status und Dashboard-Gruenlogik in die Nutzeroberflaeche ziehen.

**Wenn das Gegenteil wahr wäre:** Vielleicht ist `98_Kontrollspur` trotz Verdichtung bereits zu viel Master-Komplexitaet fuer V1. Dann wuerde sie nicht nur Vertrauen schaffen, sondern den kleinen Familien-Finanzkern wieder von Build- und Agenten-QA abhaengig machen: Ohne Verifier, Artefakt-ID, Inspector-Pfad und Compliance-Status wirkt die Mappe nicht nur technisch ungeprueft, sondern fachlich unvollstaendig.

**Alternative Struktur:** Die Kontrollspur muesste dann radikaler getrennt werden: Im Master nur ein einzelner Kontrollstatusbereich oder eine sehr kleine `Build_Nachweis`-Tabelle mit letzter Verifikation, Status, Datum und externem Manifest-Pfad; alle lauf- und artefaktbezogenen Detailtabellen blieben ausserhalb. Dashboard-Gruen duerfte fachliche Belastbarkeit und technische Verifikation anzeigen, aber nicht verlangen, dass Excel selbst zum Index ueber Build-, Agenten- und Artefaktarchive wird.

## Annahme 3: Ein neues Startreihenfolge-Dokument schaerft die Umsetzung
**Selbstverständlich angenommen:** Die These setzt voraus, dass `Finanzmodell_WorkbookSpec_Startreihenfolge.md` als separates Dokument die naechste Umsetzung fokussiert. Tatsachlich verteilt es einen zentralen Vertrag, der bereits im Datenmodell, Entscheidungsprotokoll, Bauplan und Handover auftaucht, auf eine weitere Quelle.

**Wenn das Gegenteil wahr wäre:** Vielleicht ist genau dieses neue Dokument der Punkt, an dem die Spezifikation ihre eigene Minimalitaet verliert. Dann muss die naechste Umsetzung nicht nur `workbookSpec.mjs` gegen ein Dokument bauen, sondern mehrere nahezu gleiche Aussagen synchron halten: Blattstruktur im Datenmodell, Entscheidungen 44 bis 48, Task-1-Tests im Bauplan, Handover-Schritte und die neue Startreihenfolge.

**Alternative Struktur:** Die Startreihenfolge gehoerte dann entweder direkt in das Datenmodell als einziger fachlicher Tabellenvertrag oder direkt in den Bau- und QA-Plan als Task-1-Akzeptanzvertrag, aber nicht als eigenes Dokument. Das Handover wuerde auf diese eine Quelle verweisen, und `workbookSpec.test.mjs` wuerde die Reihenfolge daraus operationalisieren, ohne eine zusaetzliche Synchronisationsflaeche zu schaffen.

## Nebenkritik
- Der Begriff "Mindestkern" bleibt angespannt: Die Liste der Muss-Tabellen ist so breit, dass sie fast die gesamte V1-Architektur umfasst, obwohl der Text rhetorisch von einem kleinen Start spricht.
- Die Platzhalterblaetter werden als "sichtbar vorbereitet" verteidigt, koennten aber fuer den ersten Build denselben Effekt haben wie die gestrichenen Agentenplattform-Blaetter: sie erzeugen Vollstaendigkeitsoptik vor Nutzwert.
- Der Bauplan schreibt sehr frueh Rollen, Kommentare, Validierungen und Seed-Struktur fuer alle Muss-Tabellen vor; das kann TDD in einen Spezifikations-Abschreibetest verwandeln, bevor Parser, Cashflow und Dashboard eine echte Verhaltensprobe liefern.
