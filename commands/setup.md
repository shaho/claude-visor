---
description: Install the claude-visor binary and wire up the main statusline
allowed-tools: Bash
---

Run the claude-visor setup script and relay its output:

1. Execute with the Bash tool: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/setup.sh"`
2. If it succeeds, tell the user the statusline is wired and will render on the
   next refresh, and mention the printed settings-backup path.
3. If it refuses because the Claude Code version is below the floor, relay the
   message verbatim — do not attempt any workaround or manual settings edit.
4. If it fails for any other reason (network, checksum), show the error and
   suggest re-running `/claude-visor:setup` — the script is safe to re-run and
   always converges.
