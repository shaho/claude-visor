import type { AgentTask, SubagentPayload } from "../stdin.ts";
import { bar, thresholdColor } from "./bar.ts";
import { palette, visibleLength, type Rgb, type Style } from "./style.ts";

const ROW_BAR_CELLS = 6;
const MIN_NAME = 8;

// One {"id","content"} JSON line per task (§4.2); a task we can't render is
// skipped, which leaves Claude Code's default row for it.
export function renderAgentRows(
  payload: SubagentPayload,
  style: Style,
  now: Date,
): string {
  const columns = typeof payload.columns === "number" ? payload.columns : 80;
  return payload.tasks
    .map((task) => {
      try {
        if (typeof task?.id !== "string" || task.id === "") return undefined;
        const content = row(task, columns, style, now.getTime());
        return JSON.stringify({ id: task.id, content });
      } catch {
        return undefined;
      }
    })
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

interface RowParts {
  tokens: boolean;
  elapsed: boolean;
  model: boolean;
  gauge: boolean;
  minName: number;
}

// Width budget (§4.2): truncate the name first (to a minimum), then drop the
// tokens segment; below that, shed elapsed, model, and gauge so the row can
// never exceed `columns`.
const LEVELS: RowParts[] = [
  { tokens: true, elapsed: true, model: true, gauge: true, minName: MIN_NAME },
  { tokens: false, elapsed: true, model: true, gauge: true, minName: 1 },
  { tokens: false, elapsed: false, model: true, gauge: true, minName: 1 },
  { tokens: false, elapsed: false, model: false, gauge: true, minName: 1 },
  { tokens: false, elapsed: false, model: false, gauge: false, minName: 1 },
];

function row(
  task: AgentTask,
  columns: number,
  style: Style,
  nowMs: number,
): string {
  const name = typeof task.name === "string" ? task.name : "";
  const fits = (s: string) => visibleLength(s) <= columns;

  let last = "";
  for (const level of LEVELS) {
    for (
      let len = Math.max(name.length, level.minName);
      len >= level.minName;
      len--
    ) {
      last = build(task, truncate(name, len, style), level, style, nowMs);
      if (fits(last)) return last;
    }
  }
  return last;
}

function truncate(name: string, len: number, style: Style): string {
  if (name.length <= len) return name;
  const ellipsis = style.glyphs.ellipsis;
  return name.slice(0, Math.max(1, len - ellipsis.length)) + ellipsis;
}

function build(
  task: AgentTask,
  name: string,
  parts: RowParts,
  style: Style,
  nowMs: number,
): string {
  const model = parts.model ? shortModel(task.model) : undefined;
  const head =
    statusGlyph(task.status, style) +
    (name ? ` ${style.bold(name)}` : "") +
    (model ? ` ${style.dim(`[${model}]`)}` : "") +
    (parts.gauge ? ` ${gauge(task, style)}` : "");
  const segments = [
    head,
    parts.tokens ? humanTokens(task.tokenCount ?? 0) : undefined,
    parts.elapsed ? elapsed(task.startTime, nowMs) : undefined,
  ];
  return segments.filter((s) => s !== undefined).join(style.sep);
}

const STATUS_STYLES: Record<string, { glyph: keyof Style["glyphs"]; color?: Rgb }> = {
  running: { glyph: "running", color: palette.yellow },
  completed: { glyph: "completed", color: palette.green },
  failed: { glyph: "failed", color: palette.red },
  pending: { glyph: "pending" },
  queued: { glyph: "pending" },
  paused: { glyph: "paused" },
  killed: { glyph: "killed" },
};

function statusGlyph(status: string | undefined, style: Style): string {
  const known = STATUS_STYLES[status ?? ""];
  if (!known) return style.dim(String(status ?? "?"));
  const glyph = style.glyphs[known.glyph];
  return known.color ? style.fg(known.color, glyph) : style.dim(glyph);
}

function gauge(task: AgentTask, style: Style): string {
  const size = task.contextWindowSize;
  const tokens = task.tokenCount;
  if (typeof size !== "number" || size <= 0 || typeof tokens !== "number") {
    const dashes = style.glyphs.naDash.repeat(ROW_BAR_CELLS);
    return `${style.dim(dashes)} ${style.dim("n/a")}`;
  }
  const pct = (tokens / size) * 100;
  const pctText = style.fg(thresholdColor(pct), `${Math.round(pct)}%`);
  return `${bar(pct, ROW_BAR_CELLS, style)} ${pctText}`;
}

function shortModel(model: string | undefined): string | undefined {
  if (typeof model !== "string" || model === "") return undefined;
  return /(fable|opus|sonnet|haiku)/i.exec(model)?.[1]?.toLowerCase() ?? model;
}

function humanTokens(count: number): string {
  return count >= 1_000_000
    ? `${(count / 1_000_000).toFixed(1)}M`
    : `${(count / 1_000).toFixed(1)}k`;
}

function elapsed(
  startTime: number | string | undefined,
  nowMs: number,
): string | undefined {
  if (startTime === undefined) return undefined;
  const start = new Date(startTime).getTime();
  if (Number.isNaN(start)) return undefined;
  const seconds = Math.max(0, Math.floor((nowMs - start) / 1000));
  return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, "0")}s`;
}
