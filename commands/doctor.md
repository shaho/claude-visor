---
description: Diagnose why the claude-visor HUD is blank
allowed-tools: Bash
---

Run the claude-visor doctor and relay its output:

1. Execute with the Bash tool: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.sh"`
2. Relay the check results verbatim. If a check failed, restate the named cause
   and its fix — do not improvise alternative fixes.
3. If all checks pass but the user still sees a blank HUD, point them at the
   workspace-trust hint in the output.
