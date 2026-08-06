# Statusline field omissions: when Claude Code withholds each field

Resolves issue #16. Which fields of the statusline JSON payload Claude Code
omits or nulls, and in which session states. Grounds the missing-data wording
decisions (issue #17) in documented states rather than guessed ones.

**Primary source:** the official statusline doc,
<https://code.claude.com/docs/en/statusline.md> (fetched 2026-08-06). Verbatim
quotes below are from that page unless noted. Cross-referenced against
`src/stdin.ts` (what visor accepts) and `tests/fixtures/*.json`.

The doc has an explicit "Fields that may be absent" list and a separate
"Fields that may be `null`" list — absence and null are distinct states and
both occur in practice.

## context_window

Subfields: `total_input_tokens`, `total_output_tokens`, `context_window_size`,
`used_percentage`, `remaining_percentage`, `current_usage.{input_tokens,
output_tokens, cache_creation_input_tokens, cache_read_input_tokens}`.

- `used_percentage` / `remaining_percentage`: "may be `null` early in the
  session" — i.e. present but null before the first API response. This is the
  state modeled by `tests/fixtures/main-early.json`.
- `current_usage`: "`null` before the first API call in a session, and again
  after `/compact` until the next API call repopulates it."
- `total_input_tokens` / `total_output_tokens`: "Both are `0` before the first
  API response."
- `context_window_size` is present from the start (200k default, 1M for
  extended-context models).
- `used_percentage` counts input-side tokens only (`input +
  cache_creation + cache_read`, excluding output) — documented formula; a
  manual calc from `current_usage` must match it.

So the "no context data yet" state is null-valued fields, not a missing
`context_window` object.

## rate_limits (five_hour / seven_day)

Verbatim: "`rate_limits`: appears only for Claude.ai subscribers (Pro/Max)
after the first API response in the session. Each window (`five_hour`,
`seven_day`) may be independently absent."

- **API-key-billed sessions: the whole `rate_limits` object is absent.** This
  is the subscription-vs-API-key split the ticket asked about.
- **Subscription sessions: absent until the first API response**, then present.
- Either window can be missing on its own (visor already has a fixture for
  five_hour-only: `tests/fixtures/main-pace-5h-only.json`).
- Per-window subfields are `used_percentage` (0–100) and `resets_at` (Unix
  epoch seconds). **No `status` subfield exists in the documented schema** —
  UNCONFIRMED as ever existing; do not design wording around it.

## cost

Subfields: `total_cost_usd`, `total_duration_ms`, `total_api_duration_ms`,
`total_lines_added`, `total_lines_removed`.

- Not listed in the "Fields that may be absent" section, so the object is
  always present; values start at 0.
- `total_cost_usd` is "Estimated session cost in USD, computed client-side.
  May differ from your actual bill. Resets to $0 when `/clear` starts a new
  session."
- UNCONFIRMED: whether `total_cost_usd` is zeroed/meaningless on subscription
  (Pro/Max) sessions — the doc makes no billing-type distinction for `cost`.
  Community observation (see `proposal/idea.md`, ccusage/ccost notes): the
  client-side estimate "may occasionally undercount because it does not always
  include subagent costs." Treat cost as always-present-but-approximate, not
  as a presence signal.

## model / effort / thinking

- `model.{id,display_name}`: always present (not in the absent list).
- `effort`: "appears only when the current model supports the reasoning effort
  parameter." Absent otherwise — object-level omission, not null. Values:
  `low`, `medium`, `high`, `xhigh`, `max`.
- `thinking.{enabled}`: shown in the schema example; no absence condition is
  documented. UNCONFIRMED whether it can be omitted — visor's optional typing
  in `src/stdin.ts` already tolerates it.

## workspace / session identity / version

Always present per the doc: `session_id`, `transcript_path`, `version`,
`cwd`, `output_style.name`, `workspace.current_dir`, `workspace.project_dir`,
`workspace.added_dirs`, `model`.

Conditionally absent subfields/objects:

- `workspace.git_worktree`: only when the current dir is inside a linked git
  worktree.
- `workspace.repo`: only inside a git repo with an `origin` remote.
- `session_name`: only once a custom name (`--name`, `/rename`) or an
  AI-generated title exists; the default display name does not populate it.
- `prompt_id`: absent until the first user input; requires v2.1.196+.
- `vim`: only when vim mode is enabled.
- `agent`: only with the `--agent` flag or agent settings configured.
- `pr`: only while an open PR exists for the branch; removed on merge/close;
  `pr.review_state` may be independently absent.
- `worktree`: only during `--worktree` sessions; `branch`/`original_branch`
  may be absent for hook-based worktrees.
- `exceeds_200k_tokens`, `fast_mode`: always present booleans.

## Fresh vs resumed sessions

- "Your script runs once when a session starts, including when you resume
  one." Then re-runs on: new assistant message, `/compact` finishing,
  permission-mode change, vim-mode toggle, `refreshInterval` timer.
- Before v2.1.216, resume ran the command twice in quick succession (flicker).
- No documented field-level difference between fresh and resumed payloads.
  UNCONFIRMED whether a resumed session's first payload already carries
  non-null `context_window` percentages; the null-early rule is stated per
  "session", so assume the first render after resume may still be null until
  the first API response of the resumed session.
- After `/compact`: `current_usage` goes back to null until the next API call,
  and known platform issue anthropics/claude-code#50688 (noted in
  `proposal/idea.md`) means context % can stay stale until the next assistant
  turn even with `refreshInterval`.

## Subagent contexts

The main `statusLine` does not run inside subagents. Subagent rows are a
separate setting, `subagentStatusLine` (same doc page): one invocation per
refresh tick receives base hook fields, `columns`, and a `tasks` array with
`id`, `name`, `type`, `status`, `description`, `label`, `startTime`, `model`,
`effort`, `contextWindowSize`, `tokenCount`, `tokenSamples`, `cwd` per task.

- Per-task `effort` requires v2.1.214+ and "is absent when the subagent
  inherits the session's effort level."
- visor's `SubagentPayload` in `src/stdin.ts` accepts a subset of these; the
  documented extras (`description`, `label`, `tokenSamples`, `cwd`) are
  currently ignored.

## Implications for missing-data wording (issue #17)

Real states to word for, in likelihood order:

1. `context_window.used_percentage === null` — session started, no API
   response yet (fresh or just-resumed). Not an error; "warming up" state.
2. `rate_limits` absent entirely — API-key-billed session; permanent for the
   session, not a loading state. Also transiently absent pre-first-response on
   subscription. The two are indistinguishable until the first response lands.
3. One rate-limit window present without the other — normal, render each
   independently.
4. `effort` absent — model doesn't support it; hide, don't placeholder.
5. `cost.total_cost_usd === 0` — early session or post-`/clear`; never absent.
