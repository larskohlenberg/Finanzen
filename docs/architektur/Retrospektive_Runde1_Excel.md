# Kritische Analyse des Entwicklungsprozesses der Excel-Tabelle

Stand: 26.05.2026

## Auftrag und Bewertungsgrenze

Diese Analyse bewertet den Entwicklungsprozess der Finanzmodell-Excel-Datei kritisch. Es wurden keine Bugfixes vorgenommen. Grundlage sind die sichtbaren Projektartefakte, Prozessdokumente, Build-/Testskripte und eine lesende Plausibilitaetspruefung des aktuellen Output-Ordners.

Wichtig: Die konkrete Excel-Fehlermeldung beim Oeffnen konnte in dieser Umgebung nicht mit Microsoft Excel selbst reproduziert werden. Die aktuelle Datei ist als ZIP formal intakt und laesst sich mit `openpyxl` ohne Warnungen laden. Das widerlegt die Excel-Fehlermeldung aber nicht, weil Excel strengere und andere OpenXML-Reparaturen ausloesen kann als ZIP- und Bibliothekschecks.

## Kurzfazit

Der Eindruck "langwierig, oversized und fehleranfaellig" ist durch die Artefakte gut nachvollziehbar. Die Hauptursache liegt wahrscheinlich nicht in einem einzelnen Faktor, sondern in einer unguenstigen Kombination:

- Die V1-Anforderungen waren fachlich gross und methodisch anspruchsvoll, obwohl das Ziel als "erste baubare Mappe" formuliert war.
- Excel wurde gleichzeitig als Endnutzeroberflaeche, Mastermodell, Auditspur, Agentensteuerung und Build-Artefakt behandelt.
- Der Umsetzungsplan war formal detailliert, aber die Release-Gates haben die falschen Dinge hart geprueft.
- TDD wurde umfangreich genutzt, aber zu stark auf interne Hilfslogik und erwartete Tabellenwerte bezogen, nicht auf reale Excel-Oeffenbarkeit, Layoutqualitaet und Abnahmefaehigkeit.
- Der Prozess erzeugte viele Zwischenartefakte und "verifiziert" benannte Dateien, ohne dass jederzeit klar blieb, welche Datei wirklich fuehrend, fachlich vollstaendig und Excel-kompatibel ist.

Kurz: Es wurde viel Methodik eingesetzt, aber zu wenig davon war auf die eigentlichen Nutzerrisiken kalibriert.

## Beobachtbare Indizien

Im Projekt liegen aktuell:

- 30 `.xlsx`-Artefakte im Output-Ordner `outputs/finanzmodell-v1-startmappe`.
- 62 `.mjs`-Dateien unter `workbook-build`.
- 15 Testdateien.
- 23 Preview-PNGs.
- ca. 13.442 Zeilen in Build-Skripten, Tests und zentralen Markdown-Dokumenten.

Der Testlauf `node --test workbook-build/tests/*.test.mjs` war erfolgreich: 49 Tests bestanden, 0 fehlgeschlagen. Gleichzeitig bleiben die vom Nutzer genannten Akzeptanzprobleme bestehen: Excel meldet Fehler beim Oeffnen, Platzhalter sind sichtbar, Layoutprobleme bestehen. Das ist ein starkes Signal, dass die Tests nicht die relevanten Akzeptanzkriterien abdecken.

Die neueste sichtbare Arbeitsmappe ist nach Dateizeit:

`outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Verifiziert_Promoted_Applied_Batch1_Batch2_Batch3_Immobilien_Batch4_OBJ001_Miete.xlsx`

Der dokumentierte Pipeline-Manifeststand verweist dagegen noch auf den deutlich frueheren NoOp-Stand. Das Handover wurde spaeter zwar aktualisiert, aber nicht bis zum neuesten Batch-4-Artefakt konsistent weitergefuehrt. Damit fehlt eine robuste, eindeutige "current release artifact"-Quelle.

## Anforderungen: nicht nur unklar, sondern zu gross fuer V1

Die Anforderungen waren nicht einfach "unklar". Viele Entscheidungen sind sogar sehr detailliert dokumentiert. Das Problem ist eher, dass fuer V1 zu viele Rollen gleichzeitig in die Mappe gepackt wurden:

- Finanzmodell fuer Vermoegen, Cashflow, Liquiditaet und Szenarien.
- Importmodell fuer Girokonto-CSV.
- Agentenworkflow mit Import-, Analyse-, Recherche- und Umsetzungsagent.
- Review- und Entscheidungsworkflow fuer Vorschlaege.
- Auditspur, Quellenlogik, Checks, Warnungen und Kontrollstatus.
- Layout, Tabellenkommentare, Dashboard und Detailblaetter.

Dadurch wurde V1 nicht mehr als schmale, nutzbare erste Version behandelt, sondern als Plattformgrundlage. Die Anforderungen waren fuer eine private Excel-Arbeitsmappe methodisch sehr ambitioniert. Besonders kritisch: Platzhalter und offene Status wurden im Konzept ausdruecklich als legitimer Zustand akzeptiert. Dadurch konnte eine Datei "technisch verifiziert" sein, obwohl sie fuer den Nutzer noch unfertig wirkt.

Die Analyse spricht deshalb gegen die These "die Anforderungen waren nur zu unklar". Besser: Sie waren zu breit, zu stark formalisiert und hatten zu wenige harte Nutzer-Abnahmekriterien.

## Technikentscheidung Excel: fachlich plausibel, technisch unterschaetzt

Excel als Ziel ist nachvollziehbar: OneDrive, manuelle Pflege, Transparenz, flexible Auswertungen. Als generiertes Build-Artefakt ist Excel aber riskant, wenn viele dieser Elemente zusammenkommen:

- viele strukturierte Tabellen,
- gemergte Titelbereiche,
- Charts,
- Kommentare/Hinweise,
- Formeln,
- Validierungen,
- Audit-/Hilfsblaetter,
- inkrementelle Append- und Layout-Erweiterungen.

Die gewaehlte Technik ist also nicht "falsch", aber sie braucht strengere Kompatibilitaetsgates. Ein Workbook, das von `@oai/artifact-tool` importiert und von `openpyxl` gelesen werden kann, ist noch nicht automatisch eine Excel-kompatible, reparaturfreie Enddatei. Genau diese Luecke scheint hier durchgeschlagen zu haben.

Fuer diesen Projekttyp waere Excel als sichtbares Frontend sinnvoll gewesen, aber nicht als alleiniger Ort fuer alle Prozess-, Agenten- und Modellzustandslogiken. Ein schlankeres Datenmodell plus gezielt generierte Excel-Ansichten haette vermutlich weniger Bruchflaeche gehabt.

## Umsetzungsplan: detailliert, aber falsch gewichtet

Der Bau- und QA-Plan war nicht zu schwach im Sinne von "zu wenig Plan". Eher im Gegenteil: Er war frueh sehr umfangreich. Schon im Plan wurden TDD auf drei Ebenen, Artefakt-Verifier, Dual-Inspector, Agenten-Compliance, Subagenten-Rollentests, Fixtures und visuelle Pruefung angelegt.

Das Problem: Die spaeteren Release-Gates blieben hinter diesem Anspruch zurueck. Der reale Release-Manifestprozess deckt vor allem den Start-/NoOp-Pfad ab. Spaetere Arbeitsstaende nach Promotion, Batch-Apply, Regelzahlungen, Immobilien-Stammdaten und Batch-4-Miete erscheinen als manuell/separat erzeugte Kette, nicht als einheitlich manifestierter Release.

Besonders kritisch:

- Der Manifest-Handoff nennt einen frueheren NoOp-Stand als fuehrend.
- Das Handover nennt spaeter Batch-1/2 als fuehrend.
- Der Output-Ordner enthaelt danach weitere aktuellere Batch-3/Bach-4-Artefakte.
- Viele Dateinamen enthalten "Verifiziert", obwohl unklar ist, ob genau diese finale Datei vollstaendig gegen Excel-Oeffenbarkeit, Layout und Platzhalterfreiheit geprueft wurde.

Damit entstand ein Planungsparadox: Der Prozess war formal schwergewichtig, aber der letzte Meter zur tatsaechlichen Nutzerabnahme blieb weich.

## TDD: nicht unpassend, aber falsch angewendet

TDD war fuer einzelne Module sinnvoll: Parser-/Writer-Verhalten, ID-Regeln, Statusvalidierung, Preflight, NoOp-Verhalten und Append-only-Logik lassen sich gut testen. Die Tests haben auch Wert geliefert.

Der Fehlschluss war, aus gruenen Modultests auf ein akzeptables Excel-Produkt zu schliessen. Die Tests pruefen ueberwiegend:

- ob interne Reports erwartete Counts liefern,
- ob bestimmte IDs und Werte vorhanden sind,
- ob bekannte Formel-Fehlerstrings fehlen,
- ob einzelne XML-/Merge-Sonderfaelle nicht erneut auftreten,
- ob Entscheidungspfade formal valide sind.

Sie pruefen offenbar nicht hart genug:

- ob Microsoft Excel die Datei ohne Reparaturmeldung oeffnet,
- ob die neueste fuehrende Datei im Manifest steht,
- ob keine ungewollten Platzhalter in Nutzerbereichen verbleiben,
- ob Layout und Lesbarkeit auf allen relevanten Blaettern akzeptabel sind,
- ob "verifiziert" nur fuer vollstaendig abgenommene Endartefakte verwendet wird,
- ob ein Nutzer die Datei ohne Kenntnis der Build-Kette sinnvoll weiterpflegen kann.

Das ist kein Argument gegen TDD allgemein. Es ist ein Argument gegen zu viel innenorientiertes TDD bei einem Artefakt, dessen Hauptqualitaet an der Benutzeroberflaeche, Excel-Kompatibilitaet und fachlichen Abnahme haengt.

## Verifikation: false sense of security

Die vorhandene Verifikation erzeugt eine gefaehrliche Sicherheit:

- Interne Tests: gruen.
- Formel-/Referenzfehlerscan: 0 Treffer.
- ZIP-Test: keine komprimierungsbezogenen Fehler.
- `openpyxl`-Laden: 27 Sheets ohne Warnung.

Trotzdem kann Excel beim Oeffnen reparieren oder warnen. Die aktuelle Verifikation ist also nicht wertlos, aber unvollstaendig. Sie prueft "kann ein Tool die Datei lesen und finde ich offensichtliche Fehlerstrings?", nicht "ist dies eine reparaturfreie, professionell nutzbare Excel-Datei?".

Die Warnung aus dem Testlauf `[granola:validation] Worksheet "99_Review_Apply_Audit" already exists. Returning existing worksheet.` ist ebenfalls ein Symptom: Der Prozess toleriert toolseitige Validierungswarnungen, solange die Tests am Ende gruen sind. Solche Warnungen sollten bei einem Excel-Artefakt mindestens triagiert werden, weil sie oft auf idempotente, aber unsaubere Workbook-Manipulation hindeuten.

## Platzhalter und Layout: konzeptionell akzeptiert, operativ nicht eingegrenzt

Im aktuellen Workbook finden sich weiterhin Platzhalter-Treffer, z. B. in Immobilien-, Versicherungs-, Renten-, Ereignis- und Annahmenbereichen. Teilweise ist das fachlich beabsichtigt, weil V1 offene Daten sichtbar machen soll. Aus Nutzersicht ist das aber nur akzeptabel, wenn klar zwischen "bewusst offener fachlicher Punkt" und "versehentlich stehen gelassener Bauplatzhalter" unterschieden wird.

Diese Grenze scheint nicht hart genug gezogen worden zu sein. Das fuehrt zu einem Vertrauensproblem: Wenn Platzhalter sichtbar sind und gleichzeitig die Datei "verifiziert" heisst, weiss der Nutzer nicht, ob er ein bewusst unfertiges Modell, einen Review-Zwischenstand oder eine fehlerhafte Enddatei vor sich hat.

Layoutprobleme sind aehnlich gelagert. Der Plan fordert gerenderte visuelle Pruefung, und es existieren Preview-PNGs. Aber es ist nicht erkennbar, dass visuelle Misserfolge als harte Release-Blocker fuer die jeweils neueste Arbeitsmappe behandelt wurden. Sichtbare Previews sind kein Ersatz fuer ein Abnahmekriterium.

## Prozessdynamik: zu viele Zwischenstaende, zu wenig Produktlinie

Der Prozess entwickelte sich von "erste baubare Mappe" zu einer Pipeline aus:

- Startmappe,
- AgentDraft,
- Full Analysis,
- Review Workbook,
- Entscheidungshilfe,
- Batch-Review-Kopien,
- Entscheidungsplaenen,
- Apply-Preflights,
- Promoted Copies,
- Batch-Apply-Arbeitsstaenden,
- mehreren Auditblaettern.

Das ist fuer ein Softwareprodukt eventuell vertretbar, fuer eine Excel-Arbeitsmappe aber schnell zu viel. Die Anzahl der Zwischenartefakte erhoeht die Wahrscheinlichkeit, dass:

- auf der falschen Basis weitergearbeitet wird,
- ein Handover veraltet,
- ein Apply gegen eine Mappe laeuft, der Zieltransaktionen fehlen,
- ein "verifiziertes" Artefakt nur einen Teilpfad verifiziert,
- Nutzer und Agent unterschiedliche Vorstellungen vom aktuellen Stand haben.

Der dokumentierte Preflight-Blocker, bei dem 21/21 Zieltransaktionen in der verifizierten Master-Mappe fehlten, ist ein klares Warnsignal: Die Architektur hatte mehrere parallele Wahrheiten ueber den Stand der Daten.

## Bewertung der Ursachenhypothesen

### Waren die Anforderungen zu unklar?

Teilweise, aber nicht hauptsaechlich. Es gab viele Entscheidungen. Das groessere Problem war Scope-Dichte: zu viele fachliche, technische und methodische Ziele fuer V1. Unklar blieb vor allem, was "fertig", "verifiziert" und "ok fuer Excel-Nutzung" konkret bedeutet.

### War Excel die falsche Technik?

Nicht grundsaetzlich. Excel ist fuer das Ziel plausibel. Aber die gewaehlte Excel-Architektur war zu komplex fuer den ersten Wurf. Excel braucht bei generierten Dateien einen echten Excel-Oeffnungs- und Reparaturcheck als Gate. Ohne diesen Check ist die Technik riskant.

### War der Umsetzungsplan zu schwach?

Der Plan war nicht schwach, sondern ueberdimensioniert und auf den falschen Ebenen stark. Er baute viele Sicherheitsmechanismen, aber der fuehrende Endzustand, Excel-Kompatibilitaet und Nutzerabnahme waren nicht konsequent genug als harte End-to-End-Gates verankert.

### Passte TDD nicht zum Projekt?

TDD passte fuer einzelne Kernfunktionen, aber nicht als dominierende Prozesslogik fuer die gesamte Excel-Artefaktentwicklung. Fuer dieses Projekt waeren kurze vertikale Nutzerschnitte besser gewesen: eine kleine Mappe, real in Excel oeffnen, layoutpruefen, fachlich abnehmen, dann erweitern. Die aktuelle TDD-Nutzung hat zu viel interne Sicherheit und zu wenig Artefaktwahrheit erzeugt.

## Was rueckblickend besser gewesen waere

1. Eine harte Definition von "fertig":
   - Excel oeffnet ohne Reparaturmeldung.
   - Keine unbeabsichtigten Platzhalter in Nutzerbereichen.
   - Ein einziges fuehrendes Artefakt im Manifest.
   - Dashboard und Kernblaetter visuell abgenommen.

2. Eine kleinere V1:
   - Dashboard,
   - Konten,
   - Rohumsatzimport,
   - Kategorien,
   - Cashflow-Basis,
   - wenige Checks.

3. Agentenworkflow erst nach stabiler Mappe:
   - Import- und Review-Agentik nicht gleichzeitig mit dem Grundmodell aufbauen.

4. Excel-Kompatibilitaet als erster Buerger:
   - Microsoft-Excel-Open-Canary oder zumindest ein gesonderter OpenXML-/LibreOffice-/openpyxl-Gate.
   - Toolwarnungen als triagepflichtig behandeln.

5. Weniger Artefaktnamen mit Qualitaetsversprechen:
   - "Verifiziert" nur, wenn das konkrete Artefakt alle Endabnahmekriterien erfuellt.
   - Zwischenstaende neutral benennen.

6. TDD anders zuschneiden:
   - Modultests fuer Writer/Parser ja.
   - End-to-End-Akzeptanztests fuer das Workbook als Release-Gate.
   - Visuelle und Excel-Oeffnungspruefung nicht als optionale Nacharbeit.

## Schlussbewertung

Der Entwicklungsprozess war nicht deshalb schlecht, weil "zu wenig Engineering" angewandt wurde. Eher wurde zu viel Engineering auf die falschen Risikoflaechen gelegt. Die eigentliche Produktqualitaet einer Excel-Datei entsteht nicht nur aus Datenmodell, Tests und internen Verifiern, sondern aus reparaturfreiem Oeffnen, lesbarem Layout, klarer Fuehrung des aktuellen Artefakts und eindeutiger Abgrenzung zwischen offenem Fachpunkt und unfertigem Bauplatzhalter.

Die naechste sinnvolle Prozessentscheidung waere daher nicht sofort "mehr Tests" oder "mehr Agentenlogik", sondern eine Reduktion: ein fuehrendes Artefakt, ein minimaler Abnahmekatalog, ein echter Excel-Kompatibilitaetscheck und erst danach neue fachliche Ausbaustufen.
