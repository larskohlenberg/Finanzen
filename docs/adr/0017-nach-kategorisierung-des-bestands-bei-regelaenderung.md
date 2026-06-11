# Nach-Kategorisierung des Bestands bei Regelaenderung

Werden Kategorisierungsregeln **nach** einem Import angelegt, geaendert oder geloescht, wirken sie auf den bereits importierten Bestand ueber eine eigene, deterministische **Nach-Kategorisierung** — **nicht** ueber einen erneuten Import. Reimport bleibt rein fuers Einspielen zustaendig und ueberspringt Bekanntes per Dedupe; er kann den Bestand also gar nicht nachkategorisieren.

Die Nach-Kategorisierung ist herkunfts-bewusst und ueberschreibt nie still eine menschliche Entscheidung.

## Begruendung

Beim Cold-Start (und allgemein, wenn Regeln erst nach dem Import entstehen) sind alle Buchungen zunaechst `offen`, weil die Erst-Kategorisierung beim Import ueber ein leeres oder unvollstaendiges Regelwerk lief. Die fruehere Betriebsanweisung „Regeln aendern → danach Import erneut laufen lassen" greift hier faktisch nicht: `import.mjs` prueft den `dedupe_hash` gegen den Bestand und ueberspringt alles Bekannte. Ein Reimport derselben Belege kategorisiert die schon importierten Buchungen also nicht nach.

Deshalb gibt es einen eigenen Lauf:

- **Deterministisch, kein Agent-Urteil.** Das Matchen und Schreiben uebernimmt dasselbe `categorize()` wie beim Import (ADR 0010: Erkennen/Vorschlagen ist Agent-Urteil, Matchen/Rechnen ist deterministisches Tool; ADR 0003: das Tool prueft/rechnet, der Agent ruft es). Erst- und Nach-Kategorisierung rufen dieselbe Funktion — gleiche Eingabe, gleiches Ergebnis.
- **Zustandslos, voller Recompute.** Das Tool rechnet die infrage kommende Menge (`offen` plus `herkunft = regel`) gegen das **volle aktuelle Regelwerk** neu. Weil das Ergebnis nur vom aktuellen Regelwerk abhaengt, liefert „alles neu rechnen" dasselbe Endergebnis wie ein eng auf das Regel-Delta gescopter Lauf — Einträge, die die Aenderung nicht beruehrt, aendern sich nicht. Das Tool muss die geaenderte Regel also nicht kennen; die Schnittstelle bleibt trivial.
- **Herkunfts-bewusst.** Eine Kategorie traegt eine **Herkunft** (`kategorie_herkunft`): `regel` (vom Categorizer abgeleitet) oder `manuell` (vom Agenten auf ausdrueckliche Nutzer-Ansage gesetzt — es gibt keine UI-Bearbeitung, ADR 0006). Nur `regel`-Eintraege werden neu bewertet. `manuell`-Eintraege und `abgelehnt` sind menschliche Akte und bleiben unangetastet.
- **Wiedervorlage statt stillem Ueberschreiben.** Liefert der Recompute fuer einen `bestaetigt`-Eintrag (`herkunft = regel`) eine **andere konkrete** Kategorie, wird er nicht ueberschrieben, sondern auf `vorgeschlagen` zurueckgestuft und im Review erneut vorgelegt. Gleiches Ergebnis → unveraendert; kein eindeutiges Ergebnis (kein Treffer oder Konflikt) → unveraendert. So geht nie eine menschliche Entscheidung still verloren, aber stale Bestaetigungen nach einem Regel-Tuning entstehen auch nicht.

Das verfeinert ADR 0002: „eine bestaetigte Kategorie ist Fakt" gilt weiter gegen **Massenlaeufe** — ein Regellauf darf eine Bestaetigung nicht still kippen. Ein echter Widerspruch zwischen Regel und Bestaetigung wird aber **sichtbar gemacht** (Wiedervorlage), nicht verschwiegen.

## Verworfene Alternativen

- **Reset → Reimport.** Bestand (oder Konto) leeren und neu einspielen. Einfach, aber destruktiv: zerstoert bestaetigte Kategorien, Transfer-Paarungen und Zeitwert-Bezuege — widerspricht ADR 0002, weil bestaetigte Entscheidungen echte Daten sind.
- **`bestaetigt`/`abgelehnt` strikt tabu.** Maximal schuetzend, aber nach einem Regel-Tuning bleiben widersprechende Bestaetigungen stale, ohne dass es jemand merkt.
- **Stilles Ueberschreiben auch von `bestaetigt`/`abgelehnt`.** Macht den Review-Status bedeutungslos (waere nicht mehr als `vorgeschlagen`) und vernichtet diktierte Ausnahmen ohne Nachfrage. Verletzt ADR 0006 („der Agent fragt explizit") und ADR 0002.
- **Regel-Provenienz pro Buchung (`matched_regeln`) speichern.** Wuerde „welche Regel war es" exakt nachverfolgen, fuehrt aber neuen Zustand und Konsistenzpflege ein. Unnoetig: der zustandslose Recompute gegen das volle Regelwerk plus der Vergleich „aktuelle vs. neu berechnete Kategorie" reicht; nur ein **Bit Herkunft** (`regel | manuell`) ist noetig, nicht die volle Regel-Historie.
- **Eng gescopter Lauf ueber das Regel-Delta.** Korrekt, aber er zwingt den Pflege-Skill, Vorher/Nachher der Regel zu uebergeben, ohne anderes Endergebnis als der volle Recompute.

## Konsequenz

- Neues Feld `kategorie_herkunft` (`regel | manuell`) an der Transaktion, gesetzt sobald eine Kategorie vergeben wird. Orthogonal zum `kategorisierung_status` (Review-Lebenszyklus) und zu `ist_transfer`.
- Neues deterministisches Tool `app/tools/recategorize.mjs` (reine Funktion + CLI + `node --test`), das den vollen Recompute fahrt, `transaktionen.jsonl` in-place schreibt, danach den Validator ruft und Zaehler berichtet (neu `vorgeschlagen`, Wiedervorlagen, unveraendert, uebersprungen `manuell`/`abgelehnt`).
- Die Nach-Kategorisierung wird vom Skill **kategorisierungsregel-pflege** angestossen (Vorschlag → Bestaetigung → Regeln schreiben → Tool rufen → Bericht); das Bestaetigen der erzeugten Vorschlaege ist Sache des getrennten Skills **kategorisierung-review** (Bucket-Granularitaet mit Stichprobe und Drill-down).
- Diese ADR supersedet die Formulierung „danach Import erneut laufen lassen" in `app/docs/skills/import-agent.md` und praezisiert den CONTEXT-Abschnitt *Kategorisierungsregel* („wird beim Import ausgewertet" → zusaetzlich Nach-Kategorisierung ueber den Bestand).
