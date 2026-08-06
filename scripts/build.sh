#!/usr/bin/env bash
# Compile the three v0 targets (spec §6). Artifacts land in dist/ (gitignored).
set -euo pipefail
cd "$(dirname "$0")/.."

for target in bun-darwin-arm64 bun-darwin-x64 bun-linux-x64-musl-baseline; do
  bun build --compile --minify --sourcemap --bytecode \
    --target="$target" src/index.ts \
    --outfile "dist/claude-visor-${target#bun-}"
done
