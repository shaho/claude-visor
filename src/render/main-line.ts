import type { MainPayload, RateLimitWindow } from "../stdin.ts";
import {
  countdown,
  FIVE_HOUR_SECONDS,
  paceDelta,
  SEVEN_DAY_SECONDS,
} from "../pace.ts";
import { bar, emptyBar, thresholdColor } from "./bar.ts";
import { bold, dim, fg, palette, separator } from "./style.ts";

export function renderMainLine(
  payload: MainPayload,
  columns: number,
  now: Date,
): string {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const segments = [
    modelSegment(payload),
    contextSegment(payload, columns),
    rateLimitSegment(
      "5h",
      payload.rate_limits?.five_hour,
      FIVE_HOUR_SECONDS,
      nowSeconds,
      true,
    ),
    rateLimitSegment(
      "7d",
      payload.rate_limits?.seven_day,
      SEVEN_DAY_SECONDS,
      nowSeconds,
      false,
    ),
  ];
  return segments.filter((s) => s !== undefined).join(separator);
}

function rateLimitSegment(
  label: string,
  window: RateLimitWindow | undefined,
  windowSeconds: number,
  nowSeconds: number,
  showCountdown: boolean,
): string | undefined {
  if (!window) return undefined;
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
  const effort = payload.effort?.level;
  return bold(fg(palette.model, name)) + (effort ? dim(` ${effort}`) : "");
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
  if (pct === null || pct === undefined) {
    return `${emptyBar(cells)} ${dim("–%")}${sizeSuffix}`;
  }
  const color = thresholdColor(pct);
  return `${bar(pct, cells)} ${fg(color, `${Math.round(pct)}%`)}${sizeSuffix}`;
}

function humanSize(tokens: number): string {
  if (tokens >= 1_000_000) return `${tokens / 1_000_000}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
}
