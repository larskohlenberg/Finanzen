#!/usr/bin/env bash
# Geprueftes Release-Deploy (Review 1.0): bringt den Checkout auf der VM auf den
# Stand von origin/<branch>, aber erst, nachdem der neue Code gegen den
# Echtbestand geprueft ist. Ablauf:
#   1. fetch; neuen Commit als Pruefkopie auspacken (nur Code, keine Daten)
#   2. Schreibsperre des Bestands nehmen (wartet auf laufende Schreibvorgaenge);
#      bis zum Ende werden neue Schreibauftraege abgewiesen
#   3. Validator mit altem und neuem Code lesend gegen den Bestand; meldet der
#      neue Code Fehler, die der alte nicht kennt, oder scheitert der
#      Daten-Rauchtest (Kennzahlen) mit dem neuen Code: Abbruch, nichts umgeschaltet
#   4. Umschalten (Fast-Forward), app/version.json und app/sitzung.json schreiben
#      (Logout-URL und Sperrzeit aus FINANZEN_ABMELDEN_URL und
#      FINANZEN_SPERRE_MINUTEN in /etc/finanzen/app.env), Dienst neu starten
#   5. Rauchtests: Dienst aktiv, HTTP antwortet lokal (ohne Proxy-Header 403),
#      Daten-Rauchtest mit dem nun laufenden Code
#   6. Scheitert 4 oder 5: automatischer Ruecksprung auf den vorherigen Commit,
#      Neustart, Pruefung; Exitcode 1 (Ruecksprung ebenfalls gescheitert: 2)
# Daten werden dabei nie veraendert; der Ruecksprung braucht darum keine Migration.
#
# Datenort: Steht FINANZEN_DATEN=<absoluter Ordner> in der Env-Datei, liegt der
# Bestand dort (<ordner>/master, ADR 0036) und jedes Node-Werkzeug bekommt den
# Wert mit; sonst liegt er im Checkout (app/data/master). Kein getrenntes
# Release-Verzeichnis: die Pruefkopie dient als vorab gepruefter Release.
#
# Installation als root-eigene Kopie, damit der fachliche User das Skript, das
# root ausfuehrt, nicht aendern kann. Erst in eine root-eigene Datei holen,
# pruefen, dann genau diese Datei installieren (kein Austausch dazwischen):
#   sudo sh -c 'umask 077; sudo -u finanzen git -C /opt/finanzen show <commit>:ops/aktualisieren.sh > /root/aktualisieren.neu'
#   sudo diff /usr/local/sbin/finanzen-aktualisieren /root/aktualisieren.neu   (erstmals: sudo less ...)
#   sudo install -o root -g root -m 755 /root/aktualisieren.neu /usr/local/sbin/finanzen-aktualisieren
# Aufruf als Admin:  sudo finanzen-aktualisieren [branch]   (Default: main)
# Die Fassung im Repo ist nur Quelle: weicht sie ab, gibt das Skript diese
# Befehle mit dem Commit aus, kopiert aber nichts selbst.
#
# Git und Node laufen als fachlicher User, nie als root. Nur Fast-Forward: hat
# der Checkout eigene Commits oder Aenderungen, bricht das Skript ab.
set -euo pipefail

BRANCH="${1:-main}"
VERZ="${FINANZEN_VERZ:-/opt/finanzen}"
NUTZER="${FINANZEN_NUTZER:-finanzen}"
DIENST="${FINANZEN_DIENST:-finanzen-app}"
ENV_DATEI="${FINANZEN_ENV_DATEI:-/etc/finanzen/app.env}"
SPERRE_WARTEN="${FINANZEN_SPERRE_WARTEN:-120}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Bitte mit sudo aufrufen." >&2
  exit 1
fi
# Schuetzt auch das JSON unten: keine Anfuehrungszeichen, kein Backslash.
if ! [[ "$BRANCH" =~ ^[A-Za-z0-9._/-]+$ ]]; then
  echo "Ungueltiger Branch-Name: $BRANCH" >&2
  exit 1
fi
if ! [[ "$SPERRE_WARTEN" =~ ^[1-9][0-9]*$ ]]; then
  echo "FINANZEN_SPERRE_WARTEN muss eine positive ganze Zahl (Sekunden) sein." >&2
  exit 1
fi
# Fehlt ein Programm fuer die Rauchtests, wuerde jeder Deploy zurueckspringen.
for programm in git node tar curl comm systemctl; do
  if ! command -v "$programm" >/dev/null; then
    echo "$programm fehlt; geprueftes Deploy nicht moeglich." >&2
    exit 1
  fi
done
# Der fachliche User darf das Arbeitsverzeichnis von root evtl. nicht lesen.
cd /

# Einen Wert aus der Env-Datei lesen, ohne sie auszufuehren (letzte Zeile gilt,
# umschliessende Anfuehrungszeichen fallen weg).
env_wert() {
  local wert=""
  if [[ -f "$ENV_DATEI" ]]; then
    wert="$(sed -n "s/^[[:space:]]*$1=//p" "$ENV_DATEI" | tail -n 1)"
  fi
  wert="${wert%\"}"; wert="${wert#\"}"; wert="${wert%\'}"; wert="${wert#\'}"
  printf '%s' "$wert"
}

# Externer Datenort (leer: Daten im Checkout).
DATEN="$(env_wert FINANZEN_DATEN)"
if [[ -n "$DATEN" ]] && ! [[ "$DATEN" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
  echo "FINANZEN_DATEN in $ENV_DATEI muss ein absoluter Pfad sein (nur A-Z a-z 0-9 . _ / -)." >&2
  exit 1
fi
DATENROOT="${FINANZEN_DATENROOT:-${DATEN:+$DATEN/master}}"
DATENROOT="${DATENROOT:-$VERZ/app/data/master}"

# Vor jeder Aenderung pruefen. Die Werte landen unescaped im JSON: keine
# Anfuehrungszeichen, kein Backslash, keine Leerzeichen.
ABMELDEN_URL="$(env_wert FINANZEN_ABMELDEN_URL)"
SPERRE_MINUTEN="$(env_wert FINANZEN_SPERRE_MINUTEN)"
SPERRE_MINUTEN="${SPERRE_MINUTEN:-5}"
url_muster='^https?://[][A-Za-z0-9._~:/?#@!$&()*+,;=%-]+$'
if [[ -n "$ABMELDEN_URL" && ! "$ABMELDEN_URL" =~ $url_muster ]]; then
  echo "FINANZEN_ABMELDEN_URL in $ENV_DATEI ist keine gueltige http(s)-URL." >&2
  exit 1
fi
if ! [[ "$SPERRE_MINUTEN" =~ ^([1-9][0-9]*|0)([.][0-9]+)?$ ]] || [[ "$SPERRE_MINUTEN" =~ ^0+([.]0+)?$ ]]; then
  echo "FINANZEN_SPERRE_MINUTEN in $ENV_DATEI muss eine positive Zahl sein." >&2
  exit 1
fi
# Rauchtest-Adresse: wie der Dienst sie bekommt; 0.0.0.0/leer -> 127.0.0.1.
HTTP_HOST="$(env_wert FINANZEN_HOST)"
HTTP_PORT="$(env_wert FINANZEN_PORT)"
HTTP_PORT="${HTTP_PORT:-8000}"
if [[ -z "$HTTP_HOST" || "$HTTP_HOST" == "0.0.0.0" ]]; then HTTP_HOST=127.0.0.1; fi
if ! [[ "$HTTP_HOST" =~ ^[A-Za-z0-9.-]+$ && "$HTTP_PORT" =~ ^[1-9][0-9]*$ ]]; then
  echo "FINANZEN_HOST/FINANZEN_PORT in $ENV_DATEI ungueltig." >&2
  exit 1
fi

# sudo setzt die Umgebung zurueck: den Datenort ausdruecklich mitgeben.
als_nutzer() {
  if [[ -n "$DATEN" ]]; then
    sudo -u "$NUTZER" -H env "FINANZEN_DATEN=$DATEN" "$@"
  else
    sudo -u "$NUTZER" -H "$@"
  fi
}
g() { als_nutzer git -C "$VERZ" "$@"; }

# --- Zustand fuer Aufraeumen und Ruecksprung --------------------------------
pruefkopie=""
sperre_kennung=""
sperre_werkzeug=""
umgeschaltet=""
fertig=""

alt_commit="$(g rev-parse HEAD)"
alt_ref="$(g rev-parse --abbrev-ref HEAD)"
alt="${alt_commit:0:7} ($alt_ref)"

# version.json: Anzeige unten in der Sidebar. Alles im Checkout als fachlicher
# User: root folgt dort keinem Symlink.
schreibe_version() {
  local commit="$1" datum="$2" branch="$3" ziel="$VERZ/app/version.json" tmp
  tmp="$(als_nutzer mktemp "$VERZ/app/.version.XXXXXX")" || return 1
  printf '{"commit": "%s", "kurz": "%s", "datum": "%s", "branch": "%s"}\n' \
    "$commit" "${commit:0:7}" "$datum" "$branch" | als_nutzer tee "$tmp" >/dev/null || return 1
  als_nutzer chmod 640 "$tmp" && als_nutzer mv -f "$tmp" "$ziel"
}

# Sitzungsschutz: ohne Logout-URL keine Datei, die App sperrt dann nur und
# laedt neu. Gleiches Muster wie version.json (als fachlicher User).
schreibe_sitzung() {
  local ziel="$VERZ/app/sitzung.json" tmp
  if [[ -n "$ABMELDEN_URL" ]]; then
    tmp="$(als_nutzer mktemp "$VERZ/app/.sitzung.XXXXXX")" || return 1
    printf '{"abmelden_url": "%s", "sperre_minuten": %s}\n' "$ABMELDEN_URL" "$SPERRE_MINUTEN" \
      | als_nutzer tee "$tmp" >/dev/null || return 1
    als_nutzer chmod 640 "$tmp" && als_nutzer mv -f "$tmp" "$ziel"
  else
    als_nutzer rm -f "$ziel"
  fi
}

# Fehlerzeilen des Validators ("- ..."), sortiert. Rueckgabe 0 auch bei
# Validatorfehlern; 1 nur, wenn der Validator gar kein Ergebnis liefert (Absturz).
validator_fehler() {
  local code="$1" ausgabe
  ausgabe="$(als_nutzer node "$code/app/tools/validator.mjs" "$DATENROOT" 2>&1)" || true
  if ! grep -q -e '^Master data validation passed' -e '^Master data validation failed' <<<"$ausgabe"; then
    printf '%s\n' "$ausgabe" | tail -n 20 >&2
    return 1
  fi
  { grep '^- ' <<<"$ausgabe" || true; } | LC_ALL=C sort -u
}

# HTTP-Rauchtest: irgendeine Antwort unter 500 heisst, der Server laeuft
# (lokal ohne Proxy-Header antwortet er mit 403). Wartet bis ~15 s auf den Start.
http_rauchtest() {
  local versuch code
  for versuch in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://$HTTP_HOST:$HTTP_PORT/" || true)"
    if [[ "$code" =~ ^[1-4][0-9][0-9]$ ]]; then
      echo "HTTP-Rauchtest ok (HTTP $code)"
      return 0
    fi
    sleep 1
  done
  echo "HTTP-Rauchtest gescheitert: http://$HTTP_HOST:$HTTP_PORT/ antwortet nicht (zuletzt '${code:-}')." >&2
  return 1
}

# Neustart + Dienst aktiv + HTTP. Bewusst ohne set -e-Abhaengigkeit (wird auch
# im Ruecksprung unter set +e gerufen).
dienst_neu_starten() {
  if ! systemctl restart "$DIENST"; then
    echo "systemctl restart $DIENST gescheitert." >&2
    return 1
  fi
  sleep 2
  if ! systemctl is-active --quiet "$DIENST"; then
    echo "$DIENST laeuft nach dem Neustart nicht:" >&2
    journalctl -u "$DIENST" -n 20 --no-pager >&2 || true
    return 1
  fi
  http_rauchtest
}

ruecksprung() {
  echo "RUECKSPRUNG auf $alt ..." >&2
  local ok=1
  if [[ "$alt_ref" == "HEAD" ]]; then
    g checkout --quiet --detach "$alt_commit" || ok=""
  else
    g checkout --quiet -B "$alt_ref" "$alt_commit" || ok=""
  fi
  if [[ -n "$ok" ]]; then
    schreibe_version "$alt_commit" "$(g log -1 --format=%cs "$alt_commit")" "$alt_ref" || ok=""
    schreibe_sitzung || ok=""
    dienst_neu_starten || ok=""
  fi
  if [[ -n "$ok" ]]; then
    echo "Ruecksprung ok: wieder auf $alt, $DIENST aktiv. Das Update ist NICHT eingespielt." >&2
    return 0
  fi
  echo "RUECKSPRUNG GESCHEITERT: Checkout/Dienst von Hand pruefen (git -C $VERZ status, systemctl status $DIENST)." >&2
  return 1
}

aufraeumen() {
  local status=$?
  set +e
  if [[ -z "$fertig" && -n "$umgeschaltet" ]]; then
    ruecksprung || status=2
  fi
  if [[ -n "$sperre_kennung" ]]; then
    als_nutzer node "$sperre_werkzeug" freigeben "$DATENROOT" "$sperre_kennung"
  fi
  if [[ -n "$pruefkopie" ]]; then
    als_nutzer rm -rf "$pruefkopie"
  fi
  if [[ -z "$fertig" && $status -eq 0 ]]; then status=1; fi
  exit "$status"
}
trap aufraeumen EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

# --- 1. Neuen Stand holen und als Pruefkopie auspacken ----------------------
g fetch --quiet --prune origin
if ! g rev-parse --verify --quiet "refs/remotes/origin/$BRANCH" >/dev/null; then
  echo "origin/$BRANCH gibt es nicht." >&2
  exit 1
fi
commit="$(g rev-parse "refs/remotes/origin/$BRANCH")"
datum="$(g log -1 --format=%cs "$commit")"
# Nur Fast-Forward: vorab pruefen, damit nichts umgeschaltet wird, was danach
# scheitert. Wechselt der Branch, muss ein vorhandener lokaler Branch ebenfalls
# vorspulbar sein.
if g rev-parse --verify --quiet "refs/heads/$BRANCH" >/dev/null; then
  if ! g merge-base --is-ancestor "refs/heads/$BRANCH" "$commit"; then
    echo "Lokaler Branch $BRANCH ist nicht per Fast-Forward auf origin/$BRANCH zu bringen." >&2
    exit 1
  fi
fi
if [[ -n "$(g status --porcelain --untracked-files=no)" ]]; then
  echo "Checkout $VERZ hat lokale Aenderungen; abgebrochen." >&2
  exit 1
fi

pruefkopie="$(als_nutzer mktemp -d)"
g archive "$commit" | als_nutzer tar -x -C "$pruefkopie"
echo "Pruefe ${commit:0:7} ($BRANCH, $datum) gegen $DATENROOT ..."

# --- 2. Schreibsperre (bis zum Ende) ----------------------------------------
sperre_werkzeug="$pruefkopie/app/tools/deploy-pruefung.mjs"
if ! als_nutzer test -f "$sperre_werkzeug"; then
  echo "Neuer Stand hat kein app/tools/deploy-pruefung.mjs; geprueftes Deploy nicht moeglich." >&2
  exit 1
fi
echo "Nehme Schreibsperre (wartet bis $SPERRE_WARTEN s auf laufende Schreibvorgaenge) ..."
if ! sperre_kennung="$(als_nutzer node "$sperre_werkzeug" sperre "$DATENROOT" --pid=$$ --warten="$SPERRE_WARTEN")"; then
  sperre_kennung=""
  echo "Schreibsperre nicht erhalten; nichts umgeschaltet." >&2
  exit 1
fi

# --- 3. Neuen Code vorab pruefen --------------------------------------------
if ! fehler_alt="$(validator_fehler "$VERZ")"; then
  echo "Hinweis: Validator des laufenden Stands liefert kein Ergebnis; Vergleich gegen leeren Altstand." >&2
  fehler_alt=""
fi
if ! fehler_neu="$(validator_fehler "$pruefkopie")"; then
  echo "Validator des neuen Stands stuerzt ab; nichts umgeschaltet." >&2
  exit 1
fi
neue_fehler="$(LC_ALL=C comm -13 <(printf '%s\n' "$fehler_alt" | sed '/^$/d') <(printf '%s\n' "$fehler_neu" | sed '/^$/d'))"
if [[ -n "$neue_fehler" ]]; then
  echo "Der neue Stand meldet $(printf '%s\n' "$neue_fehler" | wc -l | tr -d ' ') neue(n) Validatorfehler; nichts umgeschaltet:" >&2
  printf '%s\n' "$neue_fehler" | head -n 20 >&2
  exit 1
fi
anzahl_alt="$(printf '%s\n' "$fehler_alt" | sed '/^$/d' | wc -l | tr -d ' ')"
echo "Validator ok: keine neuen Fehler (bestehende: $anzahl_alt)"
if ! als_nutzer node "$pruefkopie/app/tools/deploy-pruefung.mjs" rauchtest "$DATENROOT"; then
  echo "Daten-Rauchtest mit dem neuen Stand gescheitert; nichts umgeschaltet." >&2
  exit 1
fi

# --- 4. Umschalten ----------------------------------------------------------
umgeschaltet=1
if g rev-parse --verify --quiet "refs/heads/$BRANCH" >/dev/null; then
  g checkout --quiet "$BRANCH"
  g branch --quiet --set-upstream-to "origin/$BRANCH" "$BRANCH"
else
  g checkout --quiet -b "$BRANCH" --track "origin/$BRANCH"
fi
g merge --ff-only --quiet "$commit"
if [[ "$(g rev-parse HEAD)" != "$commit" ]]; then
  echo "Checkout steht nach dem Fast-Forward nicht auf ${commit:0:7}." >&2
  exit 1
fi
schreibe_version "$commit" "$datum" "$BRANCH"
schreibe_sitzung

# --- 5. Neustart und Rauchtests ---------------------------------------------
if ! dienst_neu_starten; then
  exit 1
fi
if ! als_nutzer node "$VERZ/app/tools/deploy-pruefung.mjs" rauchtest "$DATENROOT"; then
  echo "Daten-Rauchtest nach dem Neustart gescheitert." >&2
  exit 1
fi
fertig=1

# Neue Skriptfassung im Repo nur melden — root uebernimmt sie nach Pruefung.
quelle="$VERZ/ops/aktualisieren.sh"
if als_nutzer test -f "$quelle" && ! als_nutzer cmp -s "$quelle" "$(readlink -f "$0")"; then
  neu=/root/aktualisieren.neu
  {
    echo "Hinweis: Neue Skriptfassung im Repo (${commit:0:7}). Uebernehmen nur nach Sichtpruefung:"
    echo "  sudo sh -c 'umask 077; sudo -u $NUTZER git -C $VERZ show $commit:ops/aktualisieren.sh > $neu'"
    echo "  sudo diff /usr/local/sbin/finanzen-aktualisieren $neu"
    echo "  sudo install -o root -g root -m 755 $neu /usr/local/sbin/finanzen-aktualisieren && sudo rm $neu"
  } >&2
fi

# Die Unit liegt als Kopie unter /etc — geaenderte Vorlage nur melden. Mit
# externem Datenort gehoert in die Kopie ReadWritePaths=<Datenort>/inbox statt
# des Inbox-Pfads im Checkout (docs/betrieb.md); verglichen wird mit dieser Fassung.
vorlage="$VERZ/ops/systemd/$DIENST.service"
if als_nutzer test -f "$vorlage"; then
  erwartet="$(als_nutzer cat "$vorlage")"
  if [[ -n "$DATEN" ]]; then
    erwartet="${erwartet//"ReadWritePaths=$VERZ/app/data/inbox"/"ReadWritePaths=$DATEN/inbox"}"
  fi
  if ! cmp -s <(printf '%s\n' "$erwartet") "/etc/systemd/system/$DIENST.service"; then
    echo "Hinweis: $vorlage weicht von /etc/systemd/system/$DIENST.service ab (kopieren${DATEN:+, ReadWritePaths=$DATEN/inbox} + daemon-reload)." >&2
  fi
fi

echo "$alt -> ${commit:0:7} ($BRANCH, $datum), $DIENST aktiv, Rauchtests ok"
