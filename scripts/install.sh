#!/usr/bin/env bash
# Install the claude-visor binary matching the plugin version (spec §6).
# Reads the version pin from the plugin manifest, downloads the release
# tarball, verifies it against the SHA256SUMS bundled in the plugin, and
# atomically installs into ${CLAUDE_PLUGIN_DATA}/bin. Writes nowhere else.
set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/plugins/data/claude-visor-claude-visor}"
BIN="$DATA_DIR/bin/claude-visor"
REPO="shaho/claude-visor"

VERSION="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
  "$PLUGIN_ROOT/.claude-plugin/plugin.json" | head -1)"
[ -n "$VERSION" ] || { echo "claude-visor: no version in plugin.json" >&2; exit 1; }

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) PLATFORM="darwin-arm64" ;;
  Darwin-x86_64) PLATFORM="darwin-x64" ;;
  Linux-x86_64) PLATFORM="linux-x64" ;;
  *) echo "claude-visor: unsupported platform $(uname -sm)" >&2; exit 1 ;;
esac

if [ -x "$BIN" ] && [ "$("$BIN" --version 2>/dev/null || true)" = "$VERSION" ]; then
  echo "claude-visor $VERSION already installed"
  exit 0
fi

TARBALL="claude-visor-$PLATFORM.tar.gz"
URL="https://github.com/$REPO/releases/download/v$VERSION/$TARBALL"

# Temp dir inside the data dir: same filesystem (rename stays atomic) and the
# script never touches anything outside ${CLAUDE_PLUGIN_DATA}.
mkdir -p "$DATA_DIR/bin"
TMP="$(mktemp -d "$DATA_DIR/tmp.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

curl -fsSL "$URL" -o "$TMP/$TARBALL"

EXPECTED="$(awk -v f="$TARBALL" '$2 == f { print $1 }' "$PLUGIN_ROOT/checksums/SHA256SUMS")"
[ -n "$EXPECTED" ] || { echo "claude-visor: no checksum for $TARBALL in bundled SHA256SUMS" >&2; exit 1; }
if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL="$(sha256sum "$TMP/$TARBALL" | awk '{ print $1 }')"
else
  ACTUAL="$(shasum -a 256 "$TMP/$TARBALL" | awk '{ print $1 }')"
fi
if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "claude-visor: checksum mismatch for $TARBALL (expected $EXPECTED, got $ACTUAL) — aborting" >&2
  exit 1
fi

tar -xzf "$TMP/$TARBALL" -C "$TMP" claude-visor
chmod +x "$TMP/claude-visor"
mv -f "$TMP/claude-visor" "$BIN"
echo "claude-visor $VERSION installed at $BIN"
