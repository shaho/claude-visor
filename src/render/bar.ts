import { palette, type Rgb, type Style } from "./style.ts";

export function thresholdColor(pct: number): Rgb {
  if (pct < 70) return palette.green;
  if (pct <= 85) return palette.yellow;
  return palette.red;
}

export function bar(pct: number, cells: number, style: Style): string {
  const g = style.glyphs;
  const filled = Math.min(cells, Math.max(0, Math.round((pct / 100) * cells)));
  const full =
    filled > 0 ? style.fg(thresholdColor(pct), g.filled.repeat(filled)) : "";
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
