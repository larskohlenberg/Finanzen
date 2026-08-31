# Skill: Kategorisierungsregel-Pflege

Betriebsanweisung fuer das datengetriebene Anlegen, Aendern und Stilllegen von Kategorisierungsregeln und die anschliessende Nach-Kategorisierung des Bestands.

**Der Agent arbeitet den Offen-Stapel eigenstaendig ab.** Er fragt nicht Regel fuer Regel um Erlaubnis — er recherchiert, belegt, prueft mechanisch und schreibt. Das Review der erzeugten Vorschlaege ist der Ort, an dem der Nutzer entscheidet.

Alle Pfade in diesem Skill sind app-relativ: `data/...`, `schemas/...`,
`tools/...` und `docs/...` liegen unter dem App-Raum.

## Wann diesen Skill nutzen

Nutze ihn, wenn der Nutzer

- den **Offen-Stapel** abarbeiten will („verregele meine offenen Buchungen", „warum ist das alles offen?"),
- eine konkrete Regel anlegen oder anpassen moechte („alles von MusterladenA ist Lebensmittel"),
- nach einem Regel-Tuning den **Bestand** nachziehen will.

Nicht nutzen fuer:
- Neue Belege einspielen → **import-agent** (der macht die Erst-Kategorisierung).
- Vorschlaege bestaetigen/ablehnen → **kategorisierung-review** (dieser Skill *endet* bei `vorgeschlagen`).
- Stammdaten (Personen, Konten, Kategorien) → **stammdaten-erfassung-agent**.

## Kontext, den du kennen musst

1. `docs/agent-context.md` — gemeinsame Regeln fuer App-Raum, Kategorisierung, Herkunft, Nach-Kategorisierung und Validierung.
2. `schemas/kategorisierungsregeln.schema.json` — verbindliche Struktur einer Regel.
3. `DATENROOT/kategorisierungsregeln.json` — der Regelbestand.
4. `DATENROOT/kategorien.json` — gueltige `kategorie_id` (Ziel jeder Regel).
5. `tools/categorizer.mjs` (Matching), `tools/regel-probelauf.mjs` (Vorpruefung) und `tools/recategorize.mjs` (Nach-Kategorisierung).

## Der Grundsatz: recherchieren, nicht raten

Am Ende eines Laufs hat **jede** offene Buchung einen Vorschlag. Es bleibt nichts
auf `offen` liegen, nur weil der Agent den Merchant nicht kennt — er hat die
Pflicht, es herauszufinden.

Zugleich gilt unveraendert: **nichts erfinden.** Der Unterschied zwischen
Recherche und Fantasie ist nicht der Aufwand, sondern der **Beleg**. Jeder
Vorschlag traegt seine Belegstufe; ohne Beleg gibt es keine Sachkategorie.

### Belegleiter

Von oben nach unten durchgehen. Die erste Stufe, die traegt, gewinnt.

| Stufe | Quelle | Ergebnis |
| --- | --- | --- |
| **E1** | **Beleg im Archiv.** Rechnung oder Quittung unter `Belege/`, die ueber **Datum und Betrag** zur Buchung passt. Jedes PDF hat einen Textzwilling — das Archiv ist durchsuchbar, ohne PDFs zu oeffnen. | Regel |
| **E2** | **Identischer Merchant im Bestand.** Dieselbe lose normalisierte `gegenpartei` ist anderswo schon entschieden. | Regel |
| **E3** | **Merchant-Identitaet steht im Buchungstext.** Bekannte Kette, Gattungsbegriff, oder der Verwendungszweck nennt die Leistung. | Regel |
| **E4** | **Web-Recherche zum Merchant-Namen** klaert, was das Unternehmen betreibt. | Regel |
| **E5** | **Merchant identifiziert, Leistung mehrdeutig.** Wer die Zahlung bekommen hat, ist klar; wofuer, nicht. Beispiel: eine Stadtverwaltung kann Parkschein, Amtsgebuehr oder Museumseintritt sein. | Agenten-Einzelvorschlag, **keine** Regel |
| **E6** | **E1 bis E5 ergebnislos.** | Agenten-Einzelvorschlag auf **`KAT-012` „Noch zu klaeren"** |

**E2 ist an das Konto gebunden, auf dem es verdient wurde.** „Identischer
Merchant im Bestand" heisst: irgendwo im Bestand hat jemand entschieden — wo,
haelt die Regel nicht fest. Trifft sie spaeter ein Konto, auf dem niemand ihre
Kategorie je entschieden hat, haelt das Gate sie dort mit dem Grund `anker`
zurueck (ADR 0027). Ein reines `gegenpartei_pattern` ohne
`verwendungszweck_pattern` ist dafuer besonders anfaellig: derselbe Zahler kann
auf einem anderen Konto etwas voellig anderes leisten. Im Zweifel das zweite
Feld setzen.

### Was ausdruecklich kein Beleg ist

Diese Signale begruenden **nie** eine Kategorie — auch nicht in Kombination:

- **Ort** (`/HANNOVER`, `/SALZGITTER`, `/TEULADA`) und **Rechtsform** (`GMBH`, `AG`, `B.V.`).
- **Betragshoehe.** „8 EUR in einer Innenstadt, also Parken" ist Fantasie, nicht Recherche. Ist die Betragshoehe das einzige Signal, ist der Fall E6.
- **Datum oder Urlaubszeitraum.** „War im Juli in Spanien, also Urlaub" ordnet den Anlass zu, nicht die Leistung.
- **Token-Ueberlappung mit dem uebrigen Bestand.** E2 verlangt denselben *Merchant*, nicht ein gemeinsames Wort. Am echten Bestand gemessen liefert naive Token-Suche fuer `Deutsche.Post.AG` 650 „aehnliche" Buchungen quer ueber elf Kategorien — der gemeinsame Token ist `salzgitter`. So laesst sich jede beliebige Kategorie scheinbar belegen. Genau das ist der Fehlermodus, den dieser Abschnitt verhindert.

### E4: was ins Netz gehen darf

Web-Recherche schickt Merchant-Namen aus Kontoauszuegen an eine Suchmaschine.
Darum gilt eng begrenzt:

- **Erlaubt:** Merchant-Name und Ort, so wie sie in der Buchung stehen.
- **Nie:** Betrag, Datum, Kontobezug, IBAN, Namen von Personen aus dem Modell.
- **Reihenfolge:** E1 und E2 zuerst. Sie sind lokal und kostenlos; eine Websuche, die der eigene Bestand schon beantwortet haette, ist verschenkte Preisgabe.

## Ablauf

1. **Read-only-Analyse des Offen-Stapels — mit dem Tool, nicht von Hand.**

   ```
   node tools/regel-vorschlag.mjs DATENROOT
   ```

   `regel-vorschlag.mjs` buendelt alle `offen`-Buchungen nach lose normalisierter
   `gegenpartei`, sortiert nach Abdeckung und liefert je Cluster Trefferzahl,
   Summe und drei Beispiele mit Verwendungszweck. Das **ersetzt** das manuelle
   Gruppieren: den Bestand nicht zeilenweise in den Kontext laden, nur um zu
   zaehlen. `--min=` setzt die Cluster-Mindestgroesse, `--json` gibt die
   Rohstruktur, `--limit=` verlaengert den Bericht.

   Zwei Dinge aus dem Bericht sind fuer dich entscheidend:
   - **Reihenfolge = Hebel.** Oben steht der groesste Effekt. Genau so vorgehen.
   - **`[Regelkonflikt]`-Marker.** Dieser Cluster ist nicht offen, weil eine Regel
     fehlt, sondern weil **mehrere** Regeln mit verschiedenen Kategorien passen.
     Das braucht **Reparatur** einer bestehenden Regel (Muster schaerfen, eine
     stilllegen), **keine** zusaetzliche Regel — eine weitere Regel verschaerft
     den Konflikt nur.

   Das Tool schlaegt bewusst **keine Kategorie** vor; es liefert Muster und
   Abdeckung. Nichts schreiben in diesem Schritt.

2. **Je Cluster die Belegleiter durchgehen.** Ergebnis ist fuer jeden Cluster
   entweder eine Regel (E1–E4), ein Agenten-Einzelvorschlag (E5) oder ein
   Agenten-Einzelvorschlag auf `KAT-012` (E6). Kein Cluster bleibt unbearbeitet.

   Muster moeglichst **thematisch buendeln**: `categorizer.mjs` unterstuetzt in
   `gegenpartei_pattern` und `verwendungszweck_pattern` eine **Pipe-Alternation**
   (`"a|b|c"` — schlichte Alternation lose normalisierter Substrings, **kein**
   regulaerer Ausdruck). Ein Buendel „alle Parkhaeuser" ist eine Regel mit einer
   Erklaerung statt sieben Einzelsaetzen — und im Review eine Entscheidung statt
   sieben. Buendle nur, was **dieselbe Kategorie und denselben Belegstand** teilt.

3. **Regelkandidaten mechanisch pruefen — vor jedem Schreiben, ohne Ausnahme.**

   Kandidaten als JSON-Array in eine Arbeitsdatei schreiben (nicht unter
   `DATENROOT`), dann:

   ```
   node tools/regel-probelauf.mjs DATENROOT <kandidaten.json>
   ```

   Das Tool rechnet die Kandidaten gegen den **gesamten** Bestand und blockiert
   mit Exit-Code 2 bei:

   - **Strukturfehlern** — Pflichtfeld fehlt, `regel_id` schon vergeben, Kategorie unbekannt.
   - **Neuen Regelkonflikten** — zwei Regeln mit verschiedenen Kategorien treffen dieselbe Buchung. Ergebnis ist `offen`, nicht `vorgeschlagen`; **das Review sieht solche Buchungen nie**, der Schaden bliebe unsichtbar. Muster schaerfen, nicht umgehen.
   - **Wiedervorlagen** — der Kandidat widerspricht einer bereits `bestaetigt`-en Regel-Kategorie. Das ist Nacharbeit an einer getroffenen Nutzerentscheidung: **hier ausdruecklich nachfragen**, bevor irgendetwas geschrieben wird.
   - **Verlorenen bestaetigten Treffern** — eine **Einengung** (schaerferes Muster, zusaetzliches `konto_id`, Stilllegung) laesst bereits `bestaetigt`-e Buchungen aus der Regel fallen. Sie verlieren ihre Kategorie und landen wieder auf `offen`. Das ist derselbe Eingriff in eine Nutzerentscheidung wie eine Wiedervorlage, nur von der anderen Seite: dort widerspricht die Regel, hier verschwindet sie. **Hier ausdruecklich nachfragen** — mit Umfang je Regel, den der Bericht nennt.

   Der Kandidat wird **in seiner Endfassung** geprueft, `belegstufe` eingeschlossen
   (gueltig ist E1 bis E4). Nichts nach der Pruefung nachtragen: was das Tool nicht
   gesehen hat, ist ungeprueft.

   Die Trefferzahlen gelten fuer den **Gesamtbestand**, nicht nur fuer den
   Offen-Stapel. Eine Regel, die ausschliesslich bestaetigte Buchungen traegt,
   zeigt ihre Wirkung also trotzdem. Ein Kandidat **ohne aktuellen Treffer**
   blockiert nicht — eine Regel darf wissensbasiert fuer kuenftige Buchungen
   angelegt werden.

   Bei einer beabsichtigten **Aenderung** einer Bestandsregel `--aenderung`
   setzen; sonst gilt die bekannte `regel_id` als Versehen.

4. **Schreiben.** Neue `regel_id` als naechste freie `REG-NNN` (Bestand scannen, es gibt keinen ID-Helfer), `status = "aktiv"`, `erstellt_am` = heutiges Datum.

   `kommentar` ist **Pflichtfeld** und muss zweierlei leisten: erklaeren, **was**
   der Merchant ist, und nennen, **woher** das bekannt ist (Belegstufe). „Monatlicher
   Dauerauftrag Sparen auf Tagesgeldkonto" ist korrekt; „Muster: TAGESGELD" ist
   nicht ausreichend. Bei E4: die Rechercheerkenntnis in einem Halbsatz festhalten,
   damit sie im Review nachvollziehbar ist und spaeter nicht erneut gesucht wird.

   Eine Regel **aendern** = denselben Satz ueberschreiben; dabei `kommentar`
   pruefen und aktualisieren, falls das Muster sich aendert. Eine Regel
   **stilllegen** = `status = "inaktiv"` (nicht loeschen, der Categorizer
   ignoriert Inaktive ohnehin).

5. **Nach-Kategorisierung anstossen.** `node tools/recategorize.mjs DATENROOT` aufrufen. Das Tool rechnet den vollen Recompute (offen + `herkunft = regel`) gegen das aktuelle Regelwerk, schreibt `transaktionen.jsonl` in-place, ruft danach den Validator fuer `DATENROOT` und gibt den Zaehlerbericht aus. Du uebergibst dem Tool **kein** Regel-Delta — der volle Recompute ist die verbindliche Nach-Kategorisierung. `recategorize.mjs` schreibt dabei auch `matched_regeln` neu: bei eindeutigem Treffer mit der treffenden Regel-ID, bei Konflikt mit allen passenden IDs.

6. **E5- und E6-Faelle als Einzelvorschlaege setzen.**

   ```
   node tools/agent-vorschlag.mjs --ids=TXN-a,TXN-b --kategorie=KAT-012 DATENROOT --schreiben
   ```

   Was keine Regel bekommen hat, wird ueber `tools/agent-vorschlag.mjs` auf
   `vorgeschlagen` mit `kategorie_herkunft = agent` gestellt. **Nicht**
   `confirm.mjs` nehmen — das ist der menschliche Entscheidungskanal und
   schreibt immer `bestaetigt`; ein Agentenvorschlag ist das Gegenteil davon.

   Diese Buchungen tragen nie `matched_regeln`, und Regellaeufe fassen sie
   spaeter nicht an. Ohne `--schreiben` ist der Lauf eine Vorschau.

7. **Bericht + Uebergabe an das Review.** Den Zaehlerbericht zusammenfassen (`neu_vorgeschlagen`, `wiedervorlage`, `zurueckgesetzt`, `unveraendert`, `uebersprungen`) und in `DATENROOT/agent_log.jsonl` protokollieren.

   Die Uebergabe erfolgt **regelweise** als Tabelle: Regel → Muster → Kategorie →
   Treffer → **Belegstufe**. Dazu die E5- und E6-Buckets. Das ist die Grundlage,
   auf der **kategorisierung-review** entscheidet — dieser Skill **endet bei
   `vorgeschlagen`**.

## Do's

- **Read-only zuerst** — erst analysieren und belegen, dann pruefen, dann schreiben.
- **Nach Hebel priorisieren** — das groesste offene Bucket zuerst, nicht alphabetisch.
- **Thematisch buendeln** — Pipe-Alternation nutzen, solange Kategorie und Belegstand gleich sind. Eine Entscheidung im Review statt sieben.
- **Belegstufe in den Kommentar** — sie ist die Skimming-Hilfe im Review und verhindert, dass dieselbe Recherche zweimal laeuft.
- **Transfers ruhig verregeln** — `ist_transfer` und `kategorie_id` sind orthogonal; ein Sparuebertrag darf zusaetzlich `Sparen/Investieren` tragen.
- **Validator vertrauen, aber pruefen** — `recategorize.mjs` ruft ihn; schlaegt er an, den Fehler klaeren, nicht uebergehen.
- **Idempotenz nutzen** — der Lauf ist wiederholbar; ein zweiter Lauf ohne Regelaenderung aendert nichts.

## Don'ts

- **Keine Kategorie raten.** Die Belegleiter ist der Test, nicht das Bauchgefuehl. Kein Beleg heisst `KAT-012`, nicht „wird schon Parken sein".
- **Ort, Rechtsform, Betrag und Zeitraum sind keine Belege.** Auch nicht zu dritt.
- **Nie am blockierenden Probelauf vorbei schreiben.** Exit-Code 2 heisst: Muster schaerfen (Konflikt) oder nachfragen (Wiedervorlage). Nicht das Tool ueberstimmen.
- **Nicht reimportieren, um nachzukategorisieren.** Der Reimport ueberspringt Bekanntes per Dedupe und ruehrt den Bestand nicht an. Nach-Kategorisierung laeuft ausschliesslich ueber `recategorize.mjs`.
- **Bestaetigt/manuell/abgelehnt nicht umbiegen.** Das Tool fasst sie nicht an, und du auch nicht.
- **Regel deckt eine `manuell`-Buchung mit gleicher Kategorie?** Dann ist die `manuell`-Markierung die Altlast (jemand hat Regel **und** `manuell` zugleich gesetzt). `recategorize.mjs` heilt das nicht (es laesst `manuell` in Ruhe). Solche Buchungen gezielt auf `kategorie_herkunft = regel` zuruecksetzen und `matched_regeln` stempeln — **nur**, wenn die treffende Regel **dieselbe** Kategorie liefert. Weicht die Nutzer-Kategorie ab, ist es eine bewusste Uebersteuerung und bleibt `manuell`.
- **Keine Kategorie direkt an Transaktionen schreiben.** Kategorien entstehen ueber Regeln (deterministisch) oder ueber `confirm.mjs`, nicht per Hand-Edit an `transaktionen.jsonl`.
- **Aus einer Vermutung nie eine Regel machen.** E5 und E6 sind Einzelvorschlaege. Eine Regel ist dauerhaft und feuert auf kuenftige Importe — eine Vermutung darf das nicht.

## Wann fragen, wann handeln

**Fragen, bevor du handelst:**

- Der Probelauf meldet **Wiedervorlagen** oder **verlorene bestaetigte Treffer**. Umfang je Regel nennen und Entscheidung einholen.
- Eine geplante Regelaenderung wuerde viele `bestaetigt`-Eintraege betreffen.
- Der Nutzer hat eine Kategorie zuvor ausdruecklich anders entschieden und die Recherche widerspricht ihr.

**Selbstaendig handeln — ohne Rueckfrage:**

- Analyse, Recherche ueber alle Belegstufen inklusive Websuche im erlaubten Rahmen.
- Regeln anlegen, aendern und stilllegen, sofern der Probelauf frei gibt.
- E5-/E6-Faelle als Agenten-Einzelvorschlaege setzen.
- `recategorize.mjs` und den anschliessenden Validator-Lauf.

## Wo was liegt

| Pfad | Zweck |
| --- | --- |
| `DATENROOT/kategorisierungsregeln.json` | Regelbestand (dieser Skill pflegt ihn) |
| `DATENROOT/transaktionen.jsonl` | Bestand, den die Nach-Kategorisierung neu bewertet |
| `DATENROOT/kategorien.json` | Gueltige Ziel-`kategorie_id` |
| `DATENROOT/agent_log.jsonl` | Lauf-Protokoll fuer die Uebergabe |
| `Belege/` | Belegarchiv fuer E1, per Textzwilling durchsuchbar |
| `schemas/kategorisierungsregeln.schema.json` | Struktur-Referenz einer Regel |
| `tools/regel-vorschlag.mjs` | Offen-Stapel zu Regelkandidaten buendeln (Schritt 1) |
| `tools/regel-probelauf.mjs` | Kandidaten gegen den Gesamtbestand pruefen (Schritt 3) |
| `tools/categorizer.mjs` | Deterministisches Matching (Probelauf + Recompute) |
| `tools/recategorize.mjs` | Nach-Kategorisierung (Recompute + Validator + Bericht) |
| `tools/agent-vorschlag.mjs` | E5-/E6-Einzelvorschlaege setzen (Schritt 6) |
| `tools/validator.mjs` | Validator (von `recategorize.mjs` gerufen) |

## Verwandte Skills und Anschlussprozesse

- **kategorisierung-review** — bestaetigt/korrigiert/lehnt die hier erzeugten `vorgeschlagen`-Eintraege ab und kann eine Regel als Ganzes verwerfen. Direkter Anschluss.
- **import-agent** — Erst-Kategorisierung beim Einspielen neuer Belege.
- **stammdaten-erfassung-agent** — legt fehlende Kategorien an, bevor eine Regel auf sie zeigen kann.
