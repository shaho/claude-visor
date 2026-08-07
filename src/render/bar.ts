import type { SegmentTheme, ThemeColor } from "../theme.ts";
import type { Style } from "./style.ts";

// Threshold state → the segment's theme slot (defaults encode today's
// green/yellow/red palette; a null slot means "no color" per the theme).
export function thresholdColor(
  pct: number,
  seg: SegmentTheme,
): ThemeColor | null {
  if (pct < 70) return seg.ok;
  if (pct <= 85) return seg.warn;
  return seg.critical;
}

export function bar(
  pct: number,
  cells: number,
  style: Style,
  seg: SegmentTheme,
): string {
  const g = style.glyphs;
  const filled = Math.min(cells, Math.max(0, Math.round((pct / 100) * cells)));
  const full =
    filled > 0
      ? style.paint(thresholdColor(pct, seg), g.filled.repeat(filled))
      : "";
  const empty =
    filled < cells ? style.dim(g.empty.repeat(cells - filled)) : "";
  return style.dim(g.barOpen) + full + empty + style.dim(g.barClose);
}

export function emptyBar(cells: number, style: Style): string {
  const g = style.glyphs;
  return (
    style.dim(g.barOpen) + style.dim(g.empty.repeat(cells)) + style.dim(g.barClose)
  );
}
