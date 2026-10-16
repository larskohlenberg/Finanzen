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
  Schluessel, seit Jahren stabil, liefert immer PNG in der verlangten Groesse
  und 404, wenn er fuer die Domain nichts hat. Der Dienst sieht, welche Domains
  abgefragt werden; das ist bewusst in Kauf genommen.
- **Ablage nur im Datenbestand:** `DATENROOT/logos.json` (Muster, Domain,
  Datei, Quelle, Abrufdatum je Eintrag) und `DATENROOT/logos/<domain>.png`,
  verkleinert auf hoechstens 64 px. Nie im Repo, auch nicht in den Demodaten.
- **Zuordnung ueber ein Muster** wie bei den Kategorisierungsregeln.
  Regelzahlungen und Vorsorgevertraege erben das Logo ueber
  `Transaktion → Regelzahlung → Vorsorge`; sie bekommen kein eigenes Feld.
- **Erkennen ist Agentenurteil, Abrufen ein Tool** (ADR 0003, 0010): Der Agent
  bestimmt die Domain, `tools/logos.mjs` (MCP `logos`) ruft ab, prueft das PNG,
  verkleinert, traegt ein und protokolliert. Ohne `--schreiben` Vorschau.
- **Rueckfall ohne Logo:** ein Kuerzel in fester, aus dem Namen abgeleiteter
  Farbe. Es liegt immer unter dem Bild und bleibt sichtbar, wenn eine Datei
  fehlt.
- Die App liefert Logos ueber die statische Auslieferung aus; unter
  `data/<bestand>/logos/` nur PNG.

## Verworfene Alternativen

- **Favicon oder Logo von der Website der Gegenpartei:** Formate und Groessen
  schwanken stark (ICO, SVG, riesige Bilder, Seiten ohne Favicon), und SVG
  koennte Skripte tragen. Gewuenscht ist gleichbleibende Qualitaet.
- **DuckDuckGo-Icons:** liefert ICO, oft nur 16 px, kein sauberes 404.
- **Bezahl- oder Schluesseldienste (Brandfetch, logo.dev):** bessere Logos,
  aber ein Konto und ein Schluessel fuer ein privates Projekt; Clearbit gibt es
  nicht mehr frei.
- **Logos im Repo oder in den Demodaten:** Marken Dritter und, als
  Verzeichnis, Echtdaten.
- **Feld `logo_id` an Regelzahlung oder Vorsorge:** doppelte Pflege; die Kette
  ueber die gebuchten Transaktionen gibt es schon.
