# Logos ueber einen Logodienst, abgelegt im Datenbestand

Status: entschieden am 2026-10-16.

## Kontext

In Transaktionen, Regelzahlungen und auf der Vorsorgeseite soll man sofort
sehen, von wem eine Buchung kommt. Ein kleines Logo vor dem Namen leistet das
besser als Text. Logos sind aber zweierlei: Marken Dritter und, als Verzeichnis,
Echtdaten, weil sie verraten, bei wem der Haushalt Kunde ist. Das Repo ist
oeffentlich.

## Entscheidung

- **Quelle ist ein Logodienst, nicht die Website der Gegenpartei.** Die
  Qualitaet soll durchgaengig gleich sein. Gewaehlt ist der Google-Favicon-Dienst
  (`https://www.google.com/s2/favicons?domain=<domain>&sz=128`): frei, ohne
  Schluessel, seit Jahren stabil, liefert meist PNG in der verlangten Groesse
  und 404, wenn er fuer die Domain nichts hat. Bei manchen Domains reicht er das
  JPEG der Website durch; dafuer liest das Tool Baseline-JPEG selbst
  (`tools/lib/jpeg.mjs`, ohne Abhaengigkeiten) und legt ebenfalls PNG ab.
  Der Dienst sieht, welche Domains abgefragt werden; das ist bewusst in Kauf
  genommen.
- **Ablage nur im Datenbestand:** `DATENROOT/logos.json` (Muster, Domain,
  Datei, Quelle, Abrufdatum je Eintrag) und `DATENROOT/logos/<domain>.png`,
  so gross wie geliefert, hoechstens 128 px (bis 2026-10-16: 64 px; das war fuer
  48 px Anzeige auf Retina zu klein und wirkte unscharf). Eine Datei je Logo
  genuegt: der Browser verkleinert sauber, nur Vergroessern macht unscharf.
  Nie im Repo, auch nicht in den Demodaten.
- **Zuordnung ueber ein Muster** wie bei den Kategorisierungsregeln.
  Regelzahlungen und Vorsorgevertraege erben das Logo ueber
  `Transaktion → Regelzahlung → Vorsorge`; sie bekommen kein eigenes Feld.
  Konten finden ihr Logo ueber ihren Namen, der die Bank nennt.
- **Erkennen ist Agentenurteil, Abrufen ein Tool** (ADR 0003, 0010): Der Agent
  bestimmt die Domain, `tools/logos.mjs` (MCP `logos`) ruft ab, prueft das Bild,
  verkleinert, traegt ein und protokolliert. Ohne `--schreiben` Vorschau.
- **Rueckfall ohne Logo:** ein Kuerzel in fester, aus dem Namen abgeleiteter
  Farbe. Es liegt unter dem Bild (dort mit weisser Flaeche verdeckt, damit die
  Farbe nicht an den Ecken durchscheint) und erscheint, wenn eine Datei fehlt.
- Die App liefert Logos ueber die statische Auslieferung aus; unter
  `data/<bestand>/logos/` nur PNG.

## Grenzen

Fuer manche Domains liefert der Dienst nur 16 bis 48 px; die Websites selbst
haben dann meist auch nichts Groesseres. Solche Logos bleiben in grossen
Darstellungen weich. Das Tool meldet sie mit einem Hinweis.

## Verworfene Alternativen

- **Favicon oder Logo von der Website der Gegenpartei:** Formate und Groessen
  schwanken stark (ICO, SVG, riesige Bilder, Seiten ohne Favicon), und SVG
  koennte Skripte tragen. Gewuenscht ist gleichbleibende Qualitaet.
- **DuckDuckGo-Icons:** liefert ICO, oft nur 16 px, kein sauberes 404.
- **JPEG-Antworten anders abrufen** (anderer `sz`, `faviconV2`-Adresse): der
  Dienst reicht in jeder Groesse dasselbe JPEG durch; ein kleiner JPEG-Leser
  ist der einzige Weg ohne Abhaengigkeit.
- **Bezahl- oder Schluesseldienste (Brandfetch, logo.dev):** bessere Logos,
  aber ein Konto und ein Schluessel fuer ein privates Projekt; Clearbit gibt es
  nicht mehr frei.
- **Logos im Repo oder in den Demodaten:** Marken Dritter und, als
  Verzeichnis, Echtdaten.
- **Feld `logo_id` an Regelzahlung oder Vorsorge:** doppelte Pflege; die Kette
  ueber die gebuchten Transaktionen gibt es schon.
- **Mehrere Dateien je Logo (klein und gross, `srcset`):** spart nur Bytes; eine
  128-px-Datei hat wenige Kilobyte und reicht fuer jede Anzeigegroesse.
