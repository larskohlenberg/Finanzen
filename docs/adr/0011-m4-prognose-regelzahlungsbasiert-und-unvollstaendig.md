# M4-Prognose ist regelzahlungsbasiert und kennzeichnet ihre Unvollstaendigkeit

Die Cashflow-Prognose in M4 wird **ausschliesslich** aus bestaetigten Regelzahlungen projiziert. Bekannte einmalige Zukunfts-Ereignisse (z. B. Kapitalleistung einer Lebensversicherung) und hypothetische Szenarien gehoeren **nicht** in M4. Weil der Nutzer langfristige Entscheidungen auf der Prognose trifft, kennzeichnet die Ansicht ihre **bewusste Unvollstaendigkeit** explizit.

## Begruendung

Die fachliche Vollstaendigkeit der Zukunft ist ueber mehrere Meilensteine gestaffelt:

- **Wiederkehrende Zahlungen** → M4 (hier).
- **Einmalige Leistungen** (Kapitalleistung, Auszahlung) → M7, dort als Kapitalleistung/Ereignis modelliert.
- **Hypothesen / „was waere wenn"** → M6, als versionierte Annahmen.

Eine vollstaendige Einmaleffekt-Struktur schon in M4 einzufuehren waere Scope-Creep und wuerde M7 vorwegnehmen. Gleichzeitig verbietet die Projekt-DNA, eine real lueckenhafte Zahl als scheinbar belastbar darzustellen (vgl. M6: „keine zentrale Lebensentscheidung aus Platzhaltern als scheinbar belastbarer Wert"). Die Aufloesung ist nicht „mehr modellieren", sondern „die Luecke sichtbar machen": Die Prognose-Ansicht sagt explizit, dass sie nur wiederkehrende Zahlungen enthaelt und einmalige Ereignisse noch fehlen.

## Konsequenz

Eine bekannte **Stufenaenderung** einer wiederkehrenden Zahlung (z. B. Gehalt ab 60 halbiert) ist **kein** Einmaleffekt und **kein** Szenario — sie wird als zwei aufeinanderfolgende Regelzahlungen abgebildet (Anker + `aktiv_bis`) und ist damit bereits in M4 darstellbar.

Die Prognose-Vollstaendigkeit waechst mit M5/M7, ohne dass die M4-Ansicht je eine vollstaendige Zahl vorgetaeuscht hat. Die Kennzeichnung nutzt faktische Zaehler (N bestaetigte Regelzahlungen, M Vorschlaege nicht enthalten, Horizont, einmalige Ereignisse nicht enthalten), keinen berechneten Konfidenz-Score.
