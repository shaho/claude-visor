---
description: Remove claude-visor's statusline wiring, then the plugin
allowed-tools: Bash
---

Run the claude-visor uninstall script and relay its output:

1. Execute with the Bash tool: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/uninstall.sh"`
2. Relay what it removed and the printed backup path.
3. Remind the user to finish with `/plugin uninstall claude-visor`, which
   removes the plugin, the installed binary, and the data directory.
