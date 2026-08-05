import { dim, fg, palette, type Rgb } from "./style.ts";

export function thresholdColor(pct: number): Rgb {
  if (pct < 70) return palette.green;
  if (pct <= 85) return palette.yellow;
  return palette.red;
}

export function bar(pct: number, cells: number): string {
  const filled = Math.min(cells, Math.max(0, Math.round((pct / 100) * cells)));
  const color = thresholdColor(pct);
  const full = filled > 0 ? fg(color, "█".repeat(filled)) : "";
  const empty = filled < cells ? dim("░".repeat(cells - filled)) : "";
  return full + empty;
}

export function emptyBar(cells: number): string {
  return dim("░".repeat(cells));
}
