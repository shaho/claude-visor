#!/usr/bin/env bash
# /claude-visor:setup workhorse (spec §7): version floor → binary install →
# settings backup → statusLine write. Safe to re-run; every path converges.
set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/plugins/data/claude-visor-claude-visor}"
SETTINGS="$HOME/.claude/settings.json"
FLOOR="2.1.214"

# --- Claude Code version floor -------------------------------------------
version_lt() { # $1 < $2, numeric per dot-part
  [ "$1" = "$2" ] && return 1
  [ "$(printf '%s\n%s\n' "$1" "$2" | sort -t. -k1,1n -k2,2n -k3,3n | head -1)" = "$1" ]
}

CC_VERSION="$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)"
if [ -z "$CC_VERSION" ]; then
  echo "claude-visor: could not detect the Claude Code version (claude not on PATH?); continuing" >&2
elif version_lt "$CC_VERSION" "$FLOOR"; then
  echo "claude-visor: Claude Code $CC_VERSION is below the supported floor $FLOOR." >&2
  echo "Please update Claude Code, then re-run /claude-visor:setup. Nothing was changed." >&2
  exit 1
fi

# --- Binary install (idempotent, checksum-verified) ----------------------
bash "$PLUGIN_ROOT/scripts/install.sh"

# --- Backup, then write statusLine ---------------------------------------
mkdir -p "$(dirname "$SETTINGS")"
if [ -f "$SETTINGS" ]; then
  BACKUP="$DATA_DIR/backups/settings-$(date -u +%Y-%m-%dT%H-%M-%SZ).json"
  mkdir -p "$DATA_DIR/backups"
  cp "$SETTINGS" "$BACKUP"
  echo "Backed up settings to $BACKUP"
else
  echo "No existing $SETTINGS — starting fresh"
fi

# The stable data-dir path (survives plugin updates), never a cache path.
BIN_PATH="$DATA_DIR/bin/claude-visor"
case "$BIN_PATH" in
  "$HOME"/*) BIN_PATH="~${BIN_PATH#"$HOME"}" ;;
esac

python3 - "$SETTINGS" "$BIN_PATH" <<'PY'
import json, os, sys

path, cmd = sys.argv[1], sys.argv[2]
settings = {}
if os.path.exists(path):
    with open(path) as f:
        settings = json.load(f)
settings["statusLine"] = {"type": "command", "command": cmd, "padding": 0}
with open(path, "w") as f:
    json.dump(settings, f, indent=2)
    f.write("\n")
PY

echo "statusLine now points at $BIN_PATH"
bash "$PLUGIN_ROOT/scripts/doctor.sh"
echo "claude-visor setup complete — the main line renders on the next statusline refresh."
