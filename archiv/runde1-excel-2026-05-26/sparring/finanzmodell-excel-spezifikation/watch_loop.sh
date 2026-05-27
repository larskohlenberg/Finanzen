#!/usr/bin/env bash
# sparring/<NAME>/watch_loop.sh
#
# Pure-Bash Polling-Loop für die dialektische Challenge.
# Keine externen Abhängigkeiten außer Standard-Unix-Tools (grep, sleep).
#
# Aufruf:  bash sparring/<NAME>/watch_loop.sh "Claude"
#       (oder mit dem konkreten Agent-Namen, der in state.md steht)
#
# Das Script lokalisiert seine state.md über sein eigenes Verzeichnis —
# es muss also nicht aus dem Projektroot aufgerufen werden.
#
# Exit Codes:
#   0  — du bist wieder dran (state.md zeigt "Dran: $1")
#   1  — Challenge abgeschlossen (state.md enthält "Status: completed")
#   2  — Timeout: andere Seite hat sich seit MAX_WAIT_MIN nicht gemeldet

set -u

MY_NAME="${1:-}"
if [ -z "$MY_NAME" ]; then
  echo "ERROR: Aufruf: bash <pfad>/watch_loop.sh <AGENT_NAME>" >&2
  exit 3
fi

# Konfiguration (kann via Umgebungsvariablen überschrieben werden)
POLL_SEC="${POLL_SEC:-30}"
MAX_WAIT_MIN="${MAX_WAIT_MIN:-30}"

# state.md liegt im selben Verzeichnis wie dieses Script.
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
STATE_FILE="$SCRIPT_DIR/state.md"
if [ ! -f "$STATE_FILE" ]; then
  echo "ERROR: state.md nicht gefunden neben $0 (erwartet: $STATE_FILE)" >&2
  exit 3
fi

MAX_ITER=$(( MAX_WAIT_MIN * 60 / POLL_SEC ))

echo "WAIT: $MY_NAME wartet (alle ${POLL_SEC}s, max ${MAX_WAIT_MIN}min) ..."

for i in $(seq 1 $MAX_ITER); do
  # Challenge fertig?
  if grep -qE '^\*\*Status:\*\*[[:space:]]*completed' "$STATE_FILE"; then
    echo "DONE: Alle gewählten Runden abgeschlossen."
    cat "$STATE_FILE"
    exit 1
  fi

  # Ich dran?
  if grep -qE "^\*\*Dran:\*\*[[:space:]]*${MY_NAME}[[:space:]]*$" "$STATE_FILE"; then
    echo "WAKE: $MY_NAME ist jetzt dran (nach ${i} Polls)."
    echo "----- state.md -----"
    cat "$STATE_FILE"
    echo "--------------------"
    exit 0
  fi

  sleep "$POLL_SEC"
done

echo "TIMEOUT: ${MAX_WAIT_MIN} Min verstrichen, anderer Agent hat sich nicht gemeldet."
echo "----- state.md (aktuell) -----"
cat "$STATE_FILE"
echo "------------------------------"
exit 2
