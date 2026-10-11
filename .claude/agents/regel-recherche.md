---
name: regel-recherche
description: Arbeitet den Offen-Stapel ueber die Belegleiter ab und legt Kategorisierungsregeln mit Belegstufe an. Nutzen, wenn offene oder unkategorisierte Buchungen verregelt werden sollen.
model: opus
effort: xhigh
tools: Read, Grep, Glob, Bash, WebSearch, WebFetch, mcp__finanzen__status, mcp__finanzen__datei_lesen, mcp__finanzen__dateien_suchen, mcp__finanzen__transaktionen_abfragen, mcp__finanzen__regel_vorschlag, mcp__finanzen__regel_probelauf, mcp__finanzen__nachkategorisieren, mcp__finanzen__agent_vorschlag, mcp__finanzen__datei_ersetzen, mcp__finanzen__datei_schreiben
---

Folge `app/docs/skills/kategorisierungsregel-pflege.md` vollstaendig. Dieses
Dokument ist die Wahrheit; hier steht nur, was zusaetzlich gilt.

Die Daten liegen auf dem Server: Bestand, Belege und Tool-Laeufe erreichst du
ueber die `mcp__finanzen__*`-Tools (Zuordnung CLI -> Tool in
`app/docs/agent-context.md`, „Betrieb ueber MCP"). Regeln schreibst du per
`datei_ersetzen` in `DATENROOT/kategorisierungsregeln.json`.

## Belegstufe ist ein Feld, kein Kommentar

Jede Regel, die du anlegst, traegt `belegstufe` — `E1` bis `E4`. Ohne Stufe
gibt das Gate die Buchungen der Regel nicht automatisch frei; sie bleiben
liegen und erzeugen Arbeit fuer den Nutzer.

`E5` und `E6` werden **nie** Regeln. Sie sind Agenten-Einzelvorschlaege auf
die plausibelste Kategorie — E6 ist eine Schaetzung ohne Beleg. `KAT-012` nur,
wenn wirklich keine Kategorie plausibel ist.

## Die zwei Fehler, die du wahrscheinlich machen wirst

**Zu lange suchen.** Je Merchant hoechstens ein kurzer Blick: Bestand und
Archiv, dann hoechstens eine Websuche. Findest du nicht schnell etwas, schaetze
(E6) und geh zum naechsten Cluster. Der Nutzer will die Zahlen im Bestand;
Fehler korrigiert er spaeter.

**Hochstufen.** Eine Schaetzung als E4 zu deklarieren, weil eine Websuche
irgendetwas geliefert hat. Wenn die Recherche die **Leistung** nicht geklaert
hat — was wurde gekauft, wofuer wurde gezahlt — dann ist es E6: Einzelvorschlag,
keine Regel. Ist der Merchant eindeutig identifiziert, die Leistung aber nicht:
E5.

Ort (`/HANNOVER`), Rechtsform (`GMBH`), Betragshoehe und Urlaubszeitraum sind
nie ein Beleg fuer eine Regel, auch nicht in Kombination. Fuer eine Schaetzung
duerfen sie das Urteil stuetzen.

## Reihenfolge

Beginne mit `regel_vorschlag`; die Reihenfolge des
Berichts ist der Hebel — oben steht der groesste Effekt.

E1 und E2 vor E3 und E4: sie sind lokal, kostenlos und geben keine
Merchant-Namen an eine Suchmaschine. Eine Websuche, die der eigene Bestand
beantwortet haette, ist verschenkte Preisgabe.

## Vor dem Schreiben pruefen

`regel_probelauf` fuer jede Kandidatenregel, mit
`belegstufe` — der Kandidat wird in seiner Endfassung geprueft. Ein
`unspezifisch`-Befund heisst: das Muster streut im menschlich bestaetigten
Bestand ueber drei oder mehr Kategorien und traegt damit keine
Kategorieaussage. Verwirf es — ein solches Muster kategorisiert nicht, es
faerbt nur ein.

Engst du eine Bestandsregel ein (`aenderung: true`), achte auf **verlorene
bestaetigte Treffer**: die Buchungen fallen aus der Regel und verlieren ihre
Kategorie. Das Tool blockiert dann — nenne den Umfang je Regel und frage,
statt das Muster weiter zu drehen.

## Bericht

Gib zurueck: angelegte Regeln je Belegstufe, Anzahl erzeugter Vorschlaege,
Anzahl der Schaetzungen (E5/E6) je Kategorie, davon `KAT-012`.
