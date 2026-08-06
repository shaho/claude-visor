import type { MainPayload, RateLimitWindow } from "../stdin.ts";
import {
  countdown,
  FIVE_HOUR_SECONDS,
  paceDelta,
  SEVEN_DAY_SECONDS,
} from "../pace.ts";
import { sessionColor } from "../session-color.ts";
import { bar, emptyBar, thresholdColor } from "./bar.ts";
import { palette, visibleLength, type Style } from "./style.ts";

const MIN_BAR_CELLS = 4;

// §4.1 degradation ladder: shrink the context bar first (min 4 cells), then
// drop repo name → cost → 7d → git. A line that still overflows after all of
// that loses trailing segments — it never wraps.
export function renderMainLine(
  payload: MainPayload,
  columns: number,
  now: Date,
  branch: string | undefined,
  style: Style,
): string {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const maxCells = columns >= 120 ? 14 : 8;

  // Segment isolation: one failing segment drops out, the rest still print —
  // the platform blanks the whole line on a crash, so never let one escape.
  const build = (cells: number, drops: number): string[] =>
    [
      guarded(() => modelSegment(payload, style)),
      guarded(() => contextSegment(payload, cells, style)),
      guarded(() =>
        rateLimitSegment(
          "5h",
          payload.rate_limits?.five_hour,
          FIVE_HOUR_SECONDS,
          nowSeconds,
          true,
          style,
        ),
      ),
      drops >= 3
        ? undefined
        : guarded(() =>
            rateLimitSegment(
              "7d",
              payload.rate_limits?.seven_day,
              SEVEN_DAY_SECONDS,
              nowSeconds,
              false,
              style,
            ),
          ),
      drops >= 4
        ? undefined
        : guarded(() => gitSegment(payload, branch, drops >= 1, style)),
      drops >= 2 ? undefined : guarded(() => costSegment(payload, style)),
    ].filter((s): s is string => s !== undefined);

  const fits = (segs: string[]) =>
    visibleLength(segs.join(style.sep)) <= columns;

  for (let cells = maxCells; cells >= MIN_BAR_CELLS; cells--) {
    const segs = build(cells, 0);
    if (fits(segs)) return segs.join(style.sep);
  }
  for (let drops = 1; drops <= 4; drops++) {
    const segs = build(MIN_BAR_CELLS, drops);
    if (fits(segs)) return segs.join(style.sep);
  }
  const segs = build(MIN_BAR_CELLS, 4);
  while (segs.length > 0 && !fits(segs)) segs.pop();
  return segs.join(style.sep);
}

function guarded(segment: () => string | undefined): string | undefined {
  try {
    return segment();
  } catch {
    return undefined;
  }
}

function rateLimitSegment(
  label: string,
  window: RateLimitWindow | undefined,
  windowSeconds: number,
  nowSeconds: number,
  showCountdown: boolean,
  style: Style,
): string | undefined {
  if (typeof window?.used_percentage !== "number") return undefined;
  let segment = `${label} ${Math.round(window.used_percentage)}%`;
  if (window.resets_at !== undefined) {
    const delta = paceDelta(
      window.used_percentage,
      window.resets_at,
      windowSeconds,
      nowSeconds,
    );
    segment += ` ${formatDelta(delta, style)}`;
    if (showCountdown)
      segment += style.dim(
        ` ${style.glyphs.reset}${countdown(window.resets_at, nowSeconds)}`,
      );
  }
  return segment;
}

function formatDelta(delta: number, style: Style): string {
  return delta > 0
    ? style.fg(palette.red, `${style.glyphs.up}${delta}%`)
    : style.fg(palette.green, `${style.glyphs.down}${Math.abs(delta)}%`);
}

function modelSegment(payload: MainPayload, style: Style): string | undefined {
  const name = payload.model?.display_name;
  if (!name) return undefined;
  const color = payload.session_id
    ? sessionColor(payload.session_id, payload.workspace?.git_worktree ?? "")
    : palette.model;
  const effort = payload.effort?.level;
  return (
    style.bold(style.fg(color, name)) +
    (effort ? style.dim(` ${effort}`) : "") +
    (payload.thinking?.enabled ? ` ${style.glyphs.thinking}` : "")
  );
}

function contextSegment(
  payload: MainPayload,
  cells: number,
  style: Style,
): string | undefined {
  const ctx = payload.context_window;
  if (!ctx) return undefined;
  const pct = ctx.used_percentage;
  const size = ctx.context_window_size;
  const sizeSuffix =
    typeof size === "number" ? style.dim(`/${humanSize(size)}`) : "";
  if (typeof pct !== "number") {
    return `${emptyBar(cells, style)} ${style.dim(style.glyphs.noPct)}${sizeSuffix}`;
  }
  const pctText = style.fg(thresholdColor(pct), `${Math.round(pct)}%`);
  return `${bar(pct, cells, style)} ${pctText}${sizeSuffix}`;
}

function gitSegment(
  payload: MainPayload,
  branch: string | undefined,
  dropRepo: boolean,
  style: Style,
): string | undefined {
  if (!branch) return undefined;
  const repo = dropRepo ? undefined : payload.workspace?.repo?.name;
  return style.dim(
    `${style.glyphs.branch} ${branch}${repo ? ` ${repo}` : ""}`,
  );
}

function costSegment(payload: MainPayload, style: Style): string | undefined {
  const cost = payload.cost?.total_cost_usd;
  if (typeof cost !== "number") return undefined;
  return style.dim(`$${cost.toFixed(2)}`);
}

function humanSize(tokens: number): string {
  if (tokens >= 1_000_000) return `${tokens / 1_000_000}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
}
