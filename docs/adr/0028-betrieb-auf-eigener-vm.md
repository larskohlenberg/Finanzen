# Betrieb auf eigener VM: Proxy-Schutz, Upload in die Inbox, MCP ueber SSH

Statushinweis 2026-10-11: Erweitert ADR 0009 und ersetzt das NAS-Setup als
fuehrenden Betrieb, sobald der Nutzer abgenommen hat. Bis dahin bleibt alles
umkehrbar: lokaler Datenstand und NAS-Webserver bleiben unangetastet.

Die App laeuft auf einer eigenen VM im Heimnetz (Debian auf dem vorhandenen
Proxmox). Die VM ist danach die einzige Datenwahrheit; lokal bleiben nur
Demodaten. Gesichert wird ueber das Hypervisor-Backup, unverschluesselt —
bewusst akzeptiert, das Ziel liegt im selben privaten Netz. Adressen, Namen
und Schluessel stehen nicht im Repository, sondern in einer privaten Notiz
unter `archiv/`.

## Schutz

Der Schutz liegt weiter vor der App (ADR 0009), jetzt in Schichten: Der
vorhandene Reverse Proxy (Caddy) sperrt alles ausserhalb der
Heimnetz-Bereiche, der Auth-Dienst (Authelia) verlangt Passwort plus Passkey
als zweiten Faktor, die Hypervisor-Firewall laesst den App-Port nur vom Proxy
zu, und der App-Server nimmt nur Anfragen des Proxys mit `Remote-User` an.
Keine experimentellen Passkey-Login-Optionen.

Verworfen: **oeffentliche Erreichbarkeit** (Angriffsflaeche ohne
Gegenwert) und **ein Login in der App** (Scheinschutz, siehe ADR 0009).

## Upload in die Inbox

`app/server.mjs` (nur Node-Bordmittel) ersetzt `serve_app.py`. Neu ist genau
ein Schreibweg: Menuepunkt **Hochladen** legt Rohdateien nach `data/inbox/`,
eine Datei pro `PUT`, nichts wird ueberschrieben. Masterdaten und Belege
schreibt die App weiterhin nicht (ADR 0006); verarbeitet wird im
Import-Durchlauf mit dem Agenten.

Verworfen: **automatischer Import nach dem Upload** — Normalisieren und
Verregeln sind Agent-Urteil (ADR 0010) und brauchen den Dialog.

## Agentenzugang ueber MCP per SSH

Agenten erreichen die Daten der VM ueber einen MCP-Server
(`app/mcp/server.mjs`), per stdio ueber SSH. Jeder Schluessel ist auf diesen
Befehl festgelegt (Forced-Command) und traegt sein Recht (`lesen` oder
`schreiben`). Nach jedem Schreiben laeuft der Validator, bei Fehler wird
zurueckgerollt. Die Skills stehen als MCP-Prompts bereit — Claude Code, Codex
und andere stdio-Clients nutzen denselben Zugang.

Verworfen: **Claude Code auf dem Server** (Agentenschluessel auf der VM,
Bindung an einen Anbieter) und **HTTP-MCP ueber den Proxy** (OAuth und ein
schreibender Dienst hinter dem Proxy, wo SSH schon da ist).

## Abnahme

- App aus dem Heimnetz: Anmeldung mit Passwort und Passkey.
- Aus dem Gast- oder Mobilnetz und direkt auf die VM: kein Zugang.
- `data/master/` und `Belege/` direkt aufgerufen: Anmeldung verlangt.
- Datenkopie: alle Pruefsummen gleich, Validator gruen, Zahlen wie lokal.
- Hochladen: Datei erscheint in der Inbox, erneut hochgeladen → „vorhanden".
- Agenten-Sitzung ueber MCP: Import-Durchlauf bis zum Pruefbericht;
  Leseschluessel kann nicht schreiben.
- VM im Backup-Job, ein Lauf erfolgreich.
- Danach: lokale Daten archivieren, NAS-Webserver abschalten, Branch mergen.
