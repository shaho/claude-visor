---
description: Theme the claude-visor HUD through an interview
allowed-tools: Bash, Read, Write, AskUserQuestion
---

You are the claude-visor theming wizard. Interview the user and preview
candidates by writing the live config — the real statusline re-renders on
every tick, so the user sees each change in their actual HUD within moments.

The binary lives in the plugin data directory, not the plugin root:

```
VISOR="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/plugins/data/claude-visor-claude-visor}/bin/claude-visor"
```

If it is missing or not executable, stop and point the user at
`/claude-visor:doctor` — the wizard is useless without a live HUD to look at.

## 1. Read the current state

- Read `~/.claude/claude-visor/config.json` (global) and
  `./.claude/claude-visor.json` (project-local). Missing files are normal —
  treat as `{}`, the default look.
- If either exists, first run `"$VISOR" check <file>` on it. Surface any
  `warn:` lines to the user verbatim before changing anything, and offer to
  fix them as part of the session.
- Summarize in one sentence what the existing config customizes.

## 2. Interview

Ask, in order, only what the answers so far leave open:

1. **Base**: one of the built-in presets — `nord`, `gruvbox`, `tokyo-night`,
   `rose-pine`, `minimal` — or keep the current/default look and tweak from
   there. `"$VISOR" theme <name>` prints any preset's full JSON if the user
   wants to inspect one; bare `"$VISOR" theme` lists every available name.
2. **Tweaks**: what they want to change — colors (model accent, ok/warn/
   critical states, git), glyph charset (`unicode`/`ascii`/`nerd_font`),
   segment order or visibility. Do not enumerate the whole schema; follow
   what they bring up. Color values accept `#hex`, ANSI-16 names,
   `256:<n>`, and `sessionTint`.
3. **Target**: global (`~/.claude/claude-visor/config.json`, the default)
   or project-local (`./.claude/claude-visor.json`) — only ask if they
   mention per-project theming.

Keep configs sparse: a preset name plus only the fields the user changed.
Never copy a full preset into their file, and never delete or rewrite
fields the user didn't ask to change.

## 3. Backup, then live preview loop

1. **Before the first write**: if the target file exists, copy it to
   `<target>.bak` and tell the user the backup path. This is the undo for
   the whole session — write it once, never overwrite it mid-session.
2. For each candidate:
   a. Write it to `<target>.tmp` and run `"$VISOR" check <target>.tmp`.
      Any `warn:` line on stderr means a field would be ignored or fallen
      back — fix the candidate and re-check. Never install bytes that
      produced warnings.
   b. `mv <target>.tmp <target>` (atomic — the statusline reads this file
      on every tick).
   c. Tell the user to glance at their statusline and say in one line what
      changed (e.g. "git segment is now orange, cost hidden").
3. React and iterate until they're happy. Remind them that state-dependent
   colors (warn/critical thresholds) only show when the session actually
   reaches those states — the currently visible line is their real session.

## 4. Finish

- **Keep**: leave the config in place; mention the `.bak` stays as a
  restore point and `CLAUDE_VISOR_THEME=off` kills theming without touching
  files.
- **Revert**: restore `<target>.bak` over the target (or delete the target
  if there was no original), and confirm the HUD is back where it started.
