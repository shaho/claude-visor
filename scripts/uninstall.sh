#!/usr/bin/env bash
# /claude-visor:uninstall (spec §7): remove the statusLine entry (backup
# first), then hand off to /plugin uninstall for the plugin, binary, and data
# dir. Settings surgery happens while the plugin's commands still exist.
set -euo pipefail

DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/plugins/data/claude-visor-claude-visor}"
SETTINGS="$HOME/.claude/settings.json"

if [ -f "$SETTINGS" ]; then
  BACKUP="$DATA_DIR/backups/settings-$(date -u +%Y-%m-%dT%H-%M-%SZ).json"
  mkdir -p "$DATA_DIR/backups"
  cp "$SETTINGS" "$BACKUP"
  echo "Backed up settings to $BACKUP"
  REMOVED="$(python3 - "$SETTINGS" <<'PY'
import json, sys

path = sys.argv[1]
with open(path) as f:
    settings = json.load(f)
removed = settings.pop("statusLine", None)
with open(path, "w") as f:
    json.dump(settings, f, indent=2)
    f.write("\n")
print(json.dumps(removed) if removed else "")
PY
)"
  if [ -n "$REMOVED" ]; then
    echo "Removed statusLine entry: $REMOVED"
  else
    echo "No statusLine entry found — nothing to remove"
  fi
else
  echo "No $SETTINGS — nothing to remove"
fi

echo "Now run: /plugin uninstall claude-visor"
echo "(that removes the plugin, the binary, and the data dir — including these backups)"
