#!/usr/bin/env bash
# SessionStart hook (spec §6): keep the installed binary at the plugin's
# pinned version, and refresh the newer-release marker at most once per 24h.
# Never blocks or complains — every failure path exits 0 silently.
set -u
exec >/dev/null 2>&1

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/plugins/data/claude-visor-claude-visor}"
BIN="$DATA_DIR/bin/claude-visor"
REPO="shaho/claude-visor"
MARKER="$DATA_DIR/update-available"
STAMP="$DATA_DIR/last-release-check"
TTL_SECONDS=86400

VERSION="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
  "$PLUGIN_ROOT/.claude-plugin/plugin.json" | head -1)"
[ -n "$VERSION" ] || exit 0

# --- binary ⇄ plugin version sync (fast no-op when equal) -----------------
INSTALLED="$("$BIN" --version 2>/dev/null || true)"
if [ "$INSTALLED" != "$VERSION" ]; then
  bash "$PLUGIN_ROOT/scripts/install.sh" || true
fi

# --- newer-release marker, 24h TTL ----------------------------------------
NOW="$(date +%s)"
LAST="$(cat "$STAMP" 2>/dev/null || echo 0)"
[ $((NOW - LAST)) -lt "$TTL_SECONDS" ] && exit 0
mkdir -p "$DATA_DIR"
# Stamp before the network call: an offline session won't retry until the TTL
# passes, and the marker keeps its last known state.
echo "$NOW" >"$STAMP"

LATEST="$(curl -fsSL --max-time 5 "https://api.github.com/repos/$REPO/releases?per_page=1" |
  sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"v\([^"]*\)".*/\1/p' | head -1)"
[ -n "$LATEST" ] || exit 0

# A plugin pin can never be ahead of the newest published release, so any
# difference means an update exists. Only the marker's existence is read.
if [ "$LATEST" != "$VERSION" ]; then
  printf '%s\n' "$LATEST" >"$MARKER"
else
  rm -f "$MARKER"
fi
exit 0
