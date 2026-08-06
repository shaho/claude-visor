![claude-visor](https://shieldcn.dev/header/graph.svg?title=claude-visor&subtitle=HUD+for+Claude+Code.&logo=claude&mode=light)

![Bun](https://shieldcn.dev/badge/Bun.svg?variant=secondary&brand=bun&mode=light)

# claude-visor

HUD for Claude Code. It renders both the status line and the subagent panel as
one single product using JSON data provided by Claude Code to statusline, plus
read-only peeks at the session transcript and todo store for live activity. It
never uses the network for rendering, and anything it can't read it simply
leaves out.

```
Fable 5 high ☰ │ ███░░░░░ 43%/200k │ 5h 62% ⇡9% ⟳2h14m │ 7d 31% ⇣12% │ main claude-visor │ $4.12
```

## The main line

One dense line, in segments:

- Model name and reasoning effort, with ☰ if extended reasoning is enabled. The
  model name uses color that is a tint of the session id and worktree, which
  makes it easy to distinguish parallel terminals from each other.
- Context bar: green below 70% usage, yellow up to 85%, and red if it is over.
- 5-hour and 7-day rate limits with a pace delta (⇡ red when you reason faster
  than the period allows, ⇣ green when you reason slower) and a countdown to
  reset for the 5-hour period. 5-hour periods are only displayed on
  subscriptions where Claude Code displays rate limits; API key sessions don't
  have them at all.
- Git branch and repository name.
- Cost of the session in dollars.
- Faint ↑ if there is a new release.

Each segment renders within its own guard. Any missing or incorrect data causes
the segment to be ignored, but the rest to render anyway, since the Claude Code
will blank out the entire line if the command fails. If the terminal width
narrows, the context bar gets narrower first, followed by dropping segments in
order (repository name, cost, 7-day, git).

## Live activity

Two more lines appear below the main line while there is something to show, read
from the session transcript and the todo store — never from the network:

```
◐ Edit auth.ts │ ✓ Read ×3 │ ✓ Bash ×2
██░░░ 2/5 Fix authentication bug in session middleware
```

- The tool line shows what Claude is doing right now: running tools first
  (spinner, name, file or command description), then this turn's completed tools
  with their counts. It covers the current turn only and disappears when you
  send the next prompt.
- The todo line shows a mini progress bar, the done/total count, and the
  in-progress todo. It hides when there are no todos or all are completed.

An idle session renders exactly the single main line. If the transcript can't be
read — wrong permissions, a format change in a future Claude Code — the extra
lines silently disappear and everything else keeps rendering.
`CLAUDE_VISOR_NO_TRANSCRIPT=1` turns all of this off explicitly.

## The agent panel

```
◐ Explore [haiku] ██░░░░ 34% │ 12.4k │ 2m15s
◐ Bash ────── n/a │ 0.8k │ 0m41s
✓ code-reviewer [sonnet] ████░░ 71% │ 48.1k │ 6m02s
```

Each row for a particular task has: an icon that denotes its status, the task
title, the model used in the task, a context gauge that shows the level of
context in each task on the same scale as the main gauge, the number of tokens
in use, and the time taken. All the rows have everything found in the panel
including background bash tasks, workflows, agents that operate remotely, and
colleagues. If a particular task does not have a model at the time, it is
displayed as n/a.

While an agent is running, its row also shows the tool it is using at this
moment (`│ ◐ Read auth.ts` at the end of the row), read from that agent's own
transcript. The fragment is the first thing dropped on narrow panels, and any
finished, unreadable, or unknown agent just shows the plain row.

## Requirements

- Claude Code 2.1.214 or newer
- macOS (Apple silicon or Intel) or Linux x64
- A Nerd Font for the default glyphs; see `CLAUDE_VISOR_ASCII` below if you
  don't have one

## Install

```
/plugin marketplace add shaho/claude-visor
/plugin install claude-visor@claude-visor
/claude-visor:setup
```

The setup command downloads the binary executable file for your specific OS type
from the release page on GitHub based on the plugin version. The setup command
validates the file with the checksums in the plugin and then moves it to the
plugin data directory in an atomic move process. The command first creates a
backup of the `~/.claude/settings.json` with the timestamp and prints it out
along with the statusLine entry.

There’s no requirement for configuring the agent panel. The plug-in will come up
with its own default `agentStatusLine` after enabling the plug-in. If you use
another setting, it will take effect.

## Commands

- `/claude-visor:setup` sets up the binary and initializes the status line.
- `/claude-visor:doctor` identifies the reasons behind the blank HUD in this
  sequence: version of Claude Code, version of binary, path of the settings
  file, workspace trust, disableAllHooks, kill switch, and whether the session
  transcript is readable (the source of the tool/todo lines). It states the
  first issue and how to resolve it.
- `/claude-visor:uninstall` deletes the statusLine entry (back it up before
  that) and then informs you to complete it with
  `/plugin uninstall claude-visor`.

## Updates

Only `/plugin update claude-visor` ever triggers an update. A session-start hook
compares the plugin version to the binary that has been installed and
reinstalls, if and only if they don't match, and therefore subsequent sessions
converge on a valid binary for that plugin. At most once a day, the same hook
contacts GitHub to check for the existence of a new version of the plugin,
displaying the dim if a newer version does exist. The statusline only consults a
file with a special marker, which is guaranteed by a test for network traffic
anywhere in the sourcecode.

## Constrained environments

Truecolor palette reduces to 256 and further down to 16, based on `COLORTERM`
and `TERM`. `NO_COLOR` disables all escape sequences but preserves text and
characters. ASCII mode converts all non-ASCII characters to normal characters.

```
Fable 5 high = | [###----] 43%/200k | 5h 62% ^7% ~2h14m | git main claude-visor | $4.12
```

| Variable                       | Effect                                                       |
| ------------------------------ | ------------------------------------------------------------ |
| `CLAUDE_VISOR_DISABLE=1`       | Exit silently before any input or file access, both surfaces |
| `CLAUDE_VISOR_NO_TRANSCRIPT=1` | Pure v0 output: no tool/todo lines, no agent tool fragments  |
| `CLAUDE_VISOR_ASCII=1`         | Plain-text glyphs: `[####----]` bars, `^`/`v` deltas         |
| `NO_COLOR`                     | No color escapes; layout and glyphs unchanged                |

## Development

```
bun install
bun test
bunx tsc --noEmit
bun run build          # compiles the three release targets into dist/
```

The binary reads one JSON payload from stdin and writes one line (or one JSON
row per task) to stdout, so the whole thing is testable by piping fixtures:

```
cat tests/fixtures/main-full.json | bun src/index.ts
cat tests/fixtures/agents.json | bun src/index.ts
```

Releases are tag-driven: pushing `vX.Y.Z` builds all three platforms, signs the
macOS binaries, publishes tarballs with a `SHA256SUMS` file, and fails if the
version pins don't match the tag.

## License

MIT
