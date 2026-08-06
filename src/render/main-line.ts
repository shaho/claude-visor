import type { MainPayload, RateLimitWindow } from "../stdin.ts";
import {
  countdown,
  FIVE_HOUR_SECONDS,
  paceDelta,
  SEVEN_DAY_SECONDS,
} from "../pace.ts";
import { sessionColor } from "../session-color.ts";
import { bar, emptyBar, thresholdColor } from "./bar.ts";
import { bold, dim, fg, palette, separator } from "./style.ts";

export function renderMainLine(
  payload: MainPayload,
  columns: number,
  now: Date,
  branch?: string,
): string {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  // Segment isolation: one failing segment drops out, the rest still print —
  // the platform blanks the whole line on a crash, so never let one escape.
  const segments = [
    guarded(() => modelSegment(payload)),
    guarded(() => contextSegment(payload, columns)),
    guarded(() =>
      rateLimitSegment(
        "5h",
        payload.rate_limits?.five_hour,
        FIVE_HOUR_SECONDS,
        nowSeconds,
        true,
      ),
    ),
    guarded(() =>
      rateLimitSegment(
        "7d",
        payload.rate_limits?.seven_day,
        SEVEN_DAY_SECONDS,
        nowSeconds,
        false,
      ),
    ),
    guarded(() => gitSegment(payload, branch)),
    guarded(() => costSegment(payload)),
  ];
  return segments.filter((s) => s !== undefined).join(separator);
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
    segment += ` ${formatDelta(delta)}`;
    if (showCountdown)
      segment += dim(` ⟳${countdown(window.resets_at, nowSeconds)}`);
  }
  return segment;
}

function formatDelta(delta: number): string {
  return delta > 0
    ? fg(palette.red, `⇡${delta}%`)
    : fg(palette.green, `⇣${Math.abs(delta)}%`);
}

function modelSegment(payload: MainPayload): string | undefined {
  const name = payload.model?.display_name;
  if (!name) return undefined;
  const color = payload.session_id
    ? sessionColor(payload.session_id, payload.workspace?.git_worktree ?? "")
    : palette.model;
  const effort = payload.effort?.level;
  return (
    bold(fg(color, name)) +
    (effort ? dim(` ${effort}`) : "") +
    (payload.thinking?.enabled ? " ☰" : "")
  );
}

function contextSegment(
  payload: MainPayload,
  columns: number,
): string | undefined {
  const ctx = payload.context_window;
  if (!ctx) return undefined;
  const cells = columns >= 120 ? 14 : 8;
  const pct = ctx.used_percentage;
  const size = ctx.context_window_size;
  const sizeSuffix = size !== undefined ? dim(`/${humanSize(size)}`) : "";
  if (typeof pct !== "number") {
    return `${emptyBar(cells)} ${dim("–%")}${sizeSuffix}`;
  }
  const color = thresholdColor(pct);
  return `${bar(pct, cells)} ${fg(color, `${Math.round(pct)}%`)}${sizeSuffix}`;
}

function gitSegment(
  payload: MainPayload,
  branch: string | undefined,
): string | undefined {
  if (!branch) return undefined;
  const repo = payload.workspace?.repo?.name;
  return dim(`\ue0a0 ${branch}${repo ? ` ${repo}` : ""}`);
}

function costSegment(payload: MainPayload): string | undefined {
  const cost = payload.cost?.total_cost_usd;
  if (typeof cost !== "number") return undefined;
  return dim(`$${cost.toFixed(2)}`);
}

function humanSize(tokens: number): string {
  if (tokens >= 1_000_000) return `${tokens / 1_000_000}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
}
