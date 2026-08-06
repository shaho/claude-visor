import type { CompletedTool, RunningTool, ToolActivity } from "../transcript.ts";
import { palette, visibleLength, type Style } from "./style.ts";

// §5.1 tool-activity line: running first, then completed ×N, main-line segment
// language. Width pressure drops completed segments oldest-first, then clips
// running labels; running glyph+name drop last, oldest-first. Never wraps.
export function renderToolLine(
  activity: ToolActivity,
  columns: number,
  style: Style,
): string | undefined {
  const { running, completed } = activity;
  if (running.length === 0 && completed.length === 0) return undefined;

  const fits = (line: string) => visibleLength(line) <= columns;
  // completed is most-recent-first, so dropping oldest = trimming the tail
  for (let keep = completed.length; keep >= 0; keep--) {
    const line = build(running, completed.slice(0, keep), Infinity, style);
    if (fits(line)) return line;
  }
  for (let maxLabel = 16; maxLabel >= 0; maxLabel--) {
    const line = build(running, [], maxLabel, style);
    if (fits(line)) return line;
  }
  for (let skip = 1; skip < running.length; skip++) {
    const line = build(running.slice(skip), [], 0, style);
    if (fits(line)) return line;
  }
  return build(running.slice(-1), [], 0, style);
}

function build(
  running: RunningTool[],
  completed: CompletedTool[],
  maxLabel: number,
  style: Style,
): string {
  const g = style.glyphs;
  const segments = [
    ...running.map((t) => {
      const label = clip(t.label, maxLabel, g.ellipsis);
      return (
        style.fg(palette.yellow, g.running) +
        ` ${style.bold(t.name)}` +
        (label ? style.dim(` ${label}`) : "")
      );
    }),
    ...completed.map(
      (t) =>
        style.fg(palette.green, g.completed) +
        ` ${t.name}` +
        (t.count > 1 ? style.dim(` ${g.times}${t.count}`) : ""),
    ),
  ];
  return segments.join(style.sep);
}

function clip(label: string, maxLabel: number, ellipsis: string): string {
  if (label.length <= maxLabel) return label;
  if (maxLabel <= ellipsis.length) return "";
  return label.slice(0, maxLabel - ellipsis.length) + ellipsis;
}
