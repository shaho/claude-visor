import type { MainPayload } from "../stdin.ts";
import { bar, emptyBar, thresholdColor } from "./bar.ts";
import { bold, dim, fg, palette, separator } from "./style.ts";

export function renderMainLine(payload: MainPayload, columns: number): string {
  const segments = [modelSegment(payload), contextSegment(payload, columns)];
  return segments.filter((s) => s !== undefined).join(separator);
}

function modelSegment(payload: MainPayload): string | undefined {
  const name = payload.model?.display_name;
  if (!name) return undefined;
  const effort = payload.effort?.level;
  return bold(fg(palette.model, name)) + (effort ? dim(` ${effort}`) : "");
}

function contextSegment(payload: MainPayload, columns: number): string | undefined {
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
