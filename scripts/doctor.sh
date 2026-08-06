#!/usr/bin/env bash
# /claude-visor:doctor (spec §7): name the exact cause of a blank HUD.
# Walks the check chain in order and stops at the first failure with its fix.
set -u

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/plugins/data/claude-visor-claude-visor}"
BIN="$DATA_DIR/bin/claude-visor"
SETTINGS="$HOME/.claude/settings.json"
FLOOR="2.1.214"

ok() { echo "  ✓ $1"; }
fail() {
  echo "  ✗ $1"
  echo "    fix: $2"
  exit 1
}

version_lt() {
  [ "$1" = "$2" ] && return 1
  [ "$(printf '%s\n%s\n' "$1" "$2" | sort -t. -k1,1n -k2,2n -k3,3n | head -1)" = "$1" ]
}

VERSION="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
  "$PLUGIN_ROOT/.claude-plugin/plugin.json" | head -1)"

echo "claude-visor doctor"

# 1. Claude Code version floor
CC_VERSION="$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)"
if [ -z "$CC_VERSION" ]; then
  echo "  – Claude Code version undetectable (claude not on PATH); skipping floor check"
elif version_lt "$CC_VERSION" "$FLOOR"; then
  fail "Claude Code $CC_VERSION is below the supported floor $FLOOR" \
    "update Claude Code, then re-run /claude-visor:setup"
else
  ok "Claude Code $CC_VERSION ≥ $FLOOR"
fi

# 2. Binary present and version-matched
[ -x "$BIN" ] || fail "binary missing at $BIN" "run /claude-visor:setup"
INSTALLED="$("$BIN" --version 2>/dev/null || true)"
if [ "$INSTALLED" != "$VERSION" ]; then
  fail "installed binary is $INSTALLED but the plugin is $VERSION" \
    "run /claude-visor:setup (or start a new session to let the update hook converge)"
fi
ok "binary $INSTALLED matches the plugin version"

# 3. statusLine points at the installed binary
TILDE_BIN="$BIN"
case "$TILDE_BIN" in "$HOME"/*) TILDE_BIN="~${TILDE_BIN#"$HOME"}" ;; esac
CMD="$(python3 -c 'import json,sys
try: print(json.load(open(sys.argv[1])).get("statusLine",{}).get("command",""))
except Exception: print("")' "$SETTINGS" 2>/dev/null)"
if [ "$CMD" != "$BIN" ] && [ "$CMD" != "$TILDE_BIN" ]; then
  fail "statusLine command is '${CMD:-unset}', not the installed binary" \
    "run /claude-visor:setup"
fi
ok "statusLine points at $CMD"

# 4. Workspace trust (not scriptable — hint only)
echo "  – workspace trust can't be checked from here; if the HUD is blank in one"
echo "    project only, run 'claude --debug' and look for:"
echo "    'Status line command skipped: workspace trust not accepted'"

# 5. disableAllHooks
HOOKS_OFF="$(python3 -c 'import json,sys
try: print(json.load(open(sys.argv[1])).get("disableAllHooks",False))
except Exception: print(False)' "$SETTINGS" 2>/dev/null)"
if [ "$HOOKS_OFF" = "True" ]; then
  fail "disableAllHooks is true in $SETTINGS — both HUD surfaces are disabled" \
    "remove the disableAllHooks entry"
fi
ok "disableAllHooks not set"

# 6. Kill switch
if [ "${CLAUDE_VISOR_DISABLE:-}" = "1" ]; then
  fail "CLAUDE_VISOR_DISABLE=1 is set in this environment" \
    "unset CLAUDE_VISOR_DISABLE"
fi
ok "kill switch not set"

echo "All checks passed — claude-visor is healthy."
