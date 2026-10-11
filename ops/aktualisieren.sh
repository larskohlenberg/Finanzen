#!/usr/bin/env bash
# Bringt den Checkout auf der VM auf den Stand von origin/<branch>, schreibt
# app/version.json (Anzeige unten in der Sidebar) und startet die App neu.
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
# Git laeuft als fachlicher User, nie als root. Nur Fast-Forward: hat der
# Checkout eigene Commits oder Aenderungen, bricht das Skript ab.
set -euo pipefail

BRANCH="${1:-main}"
VERZ="${FINANZEN_VERZ:-/opt/finanzen}"
NUTZER="${FINANZEN_NUTZER:-finanzen}"
DIENST="${FINANZEN_DIENST:-finanzen-app}"

if [[ $EUID -ne 0 ]]; then
  echo "Bitte mit sudo aufrufen." >&2
  exit 1
fi
# Schuetzt auch das JSON unten: keine Anfuehrungszeichen, kein Backslash.
if ! [[ "$BRANCH" =~ ^[A-Za-z0-9._/-]+$ ]]; then
  echo "Ungueltiger Branch-Name: $BRANCH" >&2
  exit 1
fi

als_nutzer() { sudo -u "$NUTZER" -H "$@"; }
g() { als_nutzer git -C "$VERZ" "$@"; }

alt="$(g rev-parse --short=7 HEAD) ($(g rev-parse --abbrev-ref HEAD))"

g fetch --quiet --prune origin
if ! g rev-parse --verify --quiet "refs/remotes/origin/$BRANCH" >/dev/null; then
  echo "origin/$BRANCH gibt es nicht." >&2
  exit 1
fi
if g rev-parse --verify --quiet "refs/heads/$BRANCH" >/dev/null; then
  g checkout --quiet "$BRANCH"
  g branch --quiet --set-upstream-to "origin/$BRANCH" "$BRANCH"
else
  g checkout --quiet -b "$BRANCH" --track "origin/$BRANCH"
fi
g merge --ff-only --quiet "origin/$BRANCH"

commit="$(g log -1 --format=%H)"
datum="$(g log -1 --format=%cs)"
# Alles im Checkout als fachlicher User: root folgt dort keinem Symlink.
ziel="$VERZ/app/version.json"
tmp="$(als_nutzer mktemp "$VERZ/app/.version.XXXXXX")"
printf '{"commit": "%s", "kurz": "%s", "datum": "%s", "branch": "%s"}\n' \
  "$commit" "${commit:0:7}" "$datum" "$BRANCH" | als_nutzer tee "$tmp" >/dev/null
als_nutzer chmod 640 "$tmp"
als_nutzer mv -f "$tmp" "$ziel"

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

# Die Unit liegt als Kopie unter /etc — geaenderte Vorlage nur melden.
vorlage="$VERZ/ops/systemd/$DIENST.service"
if als_nutzer test -f "$vorlage" && ! als_nutzer cmp -s "$vorlage" "/etc/systemd/system/$DIENST.service"; then
  echo "Hinweis: $vorlage weicht von /etc/systemd/system/$DIENST.service ab (kopieren + daemon-reload)." >&2
fi

systemctl restart "$DIENST"
sleep 2
if ! systemctl is-active --quiet "$DIENST"; then
  echo "$DIENST laeuft nach dem Neustart nicht:" >&2
  journalctl -u "$DIENST" -n 20 --no-pager >&2 || true
  exit 1
fi

echo "$alt -> ${commit:0:7} ($BRANCH, $datum), $DIENST aktiv"
