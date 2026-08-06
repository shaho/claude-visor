# claude-visor

A HUD for Claude Code. It renders the main status line and the subagent panel
as one product, from the JSON that Claude Code pipes to statusline commands.
It does not parse transcript files and never touches the network while
rendering.

```
Fable 5 high ☰ │ ███░░░░░ 43%/200k │ 5h 62% ⇡9% ⟳2h14m │ 7d 31% ⇣12% │ main claude-visor │ $4.12
```

## The main line

One dense line, in segments:

- Model name and reasoning effort, with ☰ when extended thinking is on. The
  name is colored by a hue derived from the session id and worktree, so
  parallel terminals are easy to tell apart.
- Context bar: green below 70% usage, yellow to 85%, red above.
- 5-hour and 7-day rate limits with a pace delta (⇡ red when you are burning
  faster than the window sustains, ⇣ green when slower) and a reset countdown
  on the 5-hour segment. These segments only exist on subscriptions where
  Claude Code reports rate limits; API-key sessions simply don't show them.
- Git branch and repository name.
- Session cost in dollars.
- A dim ↑ when a newer release is available.

Each segment renders inside its own guard. Missing or malformed data drops
that one segment and the rest still print, because Claude Code blanks the
whole line if the command crashes. When the terminal narrows, the context bar
shrinks first, then segments drop in a fixed order (repository name, cost,
7-day, git) so the line never wraps.

## The agent panel

```
◐ Explore [haiku] ██░░░░ 34% │ 12.4k │ 2m15s
◐ Bash ────── n/a │ 0.8k │ 0m41s
✓ code-reviewer [sonnet] ████░░ 71% │ 48.1k │ 6m02s
```

One row per task: status glyph, name, model, a per-task context gauge with the
same thresholds as the main bar, token count, and elapsed time. Rows cover
everything in the panel, including background bash jobs, workflows, remote
agents, and teammates. A task whose model isn't resolved yet gets an `n/a`
gauge, and an unrecognized status renders as its raw text instead of hiding
the row.

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

Setup downloads the compiled binary for your platform from the GitHub release
matching the plugin version, verifies it against checksums bundled in the
plugin, and installs it into the plugin data directory with an atomic rename.
It backs up `~/.claude/settings.json` to a timestamped file before writing the
`statusLine` entry, prints the backup path, and finishes by running the doctor
checks. Re-running it is always safe.

The agent panel needs no setup at all: the plugin ships its own
`subagentStatusLine` default, live the moment the plugin is enabled. Your own
setting wins if you have one.

## Commands

- `/claude-visor:setup` installs the binary and wires the main status line.
- `/claude-visor:doctor` walks the causes of a blank HUD in order (Claude Code
  version, binary version, settings path, workspace trust, `disableAllHooks`,
  kill switch) and names the first failure with its fix.
- `/claude-visor:uninstall` removes the `statusLine` entry (backup first),
  then tells you to finish with `/plugin uninstall claude-visor`, which
  removes the plugin, the binary, and the data directory.

## Updates

`/plugin update claude-visor` is the only update trigger. A session-start hook
compares the plugin version with the installed binary and reinstalls only on
mismatch, so the session after an update converges on the matching binary. The
same hook checks GitHub for a newer release at most once per day; when one
exists, the main line shows the dim ↑. The statusline itself only ever reads a
marker file, a rule enforced by a test that scans the source for network
calls.

## Constrained environments

The truecolor palette degrades to 256 colors and then to 16 based on
`COLORTERM` and `TERM`. `NO_COLOR` strips every escape code while keeping the
text and glyphs. ASCII mode swaps every non-ASCII glyph for a plain
equivalent:

```
Fable 5 high = | [###----] 43%/200k | 5h 62% ^7% ~2h14m | git main claude-visor | $4.12
```

| Variable                 | Effect                                                       |
| ------------------------ | ------------------------------------------------------------ |
| `CLAUDE_VISOR_DISABLE=1` | Exit silently before any input or file access, both surfaces |
| `CLAUDE_VISOR_ASCII=1`   | Plain-text glyphs: `[####----]` bars, `^`/`v` deltas         |
| `NO_COLOR`               | No color escapes; layout and glyphs unchanged                |

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

Releases are tag-driven: pushing `vX.Y.Z` builds all three platforms, signs
the macOS binaries, publishes tarballs with a `SHA256SUMS` file, and fails if
the version pins don't match the tag.

## License

MIT
