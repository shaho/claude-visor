import type { AgentTask, SubagentPayload } from "../stdin.ts";
import type { RunningTool } from "../transcript.ts";
import { defaultTheme, type ResolvedTheme, type SegmentTheme } from "../theme.ts";
import { bar, thresholdColor } from "./bar.ts";
import { visibleLength, type Style } from "./style.ts";

const ROW_BAR_CELLS = 6;
const MIN_NAME = 8;

// One {"id","content"} JSON line per task (§4.2); a task we can't render is
// skipped, which leaves Claude Code's default row for it. `agentTool` is the
// v2 sidecar join (§5.3) — absent (kill switch, no transcript_path) or
// returning null, every row renders exactly as v0.
export function renderAgentRows(
  payload: SubagentPayload,
  style: Style,
  now: Date,
  agentTool?: (id: string) => RunningTool | null,
  theme: ResolvedTheme = defaultTheme(),
): string {
  const columns = typeof payload.columns === "number" ? payload.columns : 80;
  return payload.tasks
    .map((task) => {
      try {
        if (!task?.id || typeof task.id !== "string") return undefined;
        // Fragment only while the official status is running — append-only
        // sidecars can never show stale activity for finished tasks.
        const tool =
          task.status === "running" && agentTool ? agentTool(task.id) : null;
        const content = row(task, columns, style, now.getTime(), tool, theme);
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
  tool: RunningTool | null = null,
  theme: ResolvedTheme = defaultTheme(),
): string {
  const name = typeof task.name === "string" ? task.name : "";
  const fits = (s: string) => visibleLength(s) <= columns;
  const agentSeg = (segName: string) =>
    theme.segments.agents.find((s) => s.name === segName);

  // §5.3: the fragment is the last segment and drops before any v0 segment.
  if (tool) {
    const g = style.glyphs;
    const fragment =
      style.paint(agentSeg("tool")?.fg ?? null, g.running) +
      ` ${style.bold(tool.name)}` +
      (tool.label ? style.dim(` ${tool.label}`) : "");
    const full =
      build(task, name, LEVELS[0]!, style, nowMs, theme) + style.sep + fragment;
    if (fits(full)) return full;
  }

  for (const level of LEVELS) {
    const full = build(task, name, level, style, nowMs, theme);
    if (fits(full)) return full;
    const len = name.length - (visibleLength(full) - columns);
    if (len >= level.minName) {
      const s = build(task, truncate(name, len, style), level, style, nowMs, theme);
      if (fits(s)) return s;
    }
  }
  return build(task, truncate(name, 1, style), LEVELS.at(-1)!, style, nowMs, theme);
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
  theme: ResolvedTheme,
): string {
  const model = parts.model ? shortModel(task.model) : undefined;
  const statusSeg = theme.segments.agents.find((s) => s.name === "status");
  const gaugeSeg = theme.segments.agents.find((s) => s.name === "gauge");
  const head =
    statusGlyph(task.status, style, statusSeg) +
    (name ? ` ${style.bold(name)}` : "") +
    (model ? ` ${style.dim(`[${model}]`)}` : "") +
    (parts.gauge ? ` ${gauge(task, style, gaugeSeg)}` : "");
  const segments = [
    head,
    parts.tokens ? humanTokens(task.tokenCount ?? 0) : undefined,
    parts.elapsed ? elapsed(task.startTime, nowMs) : undefined,
  ];
  return segments.filter((s) => s !== undefined).join(style.sep);
}

function statusGlyph(
  status: string | undefined,
  style: Style,
  seg: SegmentTheme | undefined,
): string {
  const g = style.glyphs;
  const known: Record<string, string> = {
    running: style.paint(seg?.warn ?? null, g.running),
    completed: style.paint(seg?.ok ?? null, g.completed),
    failed: style.paint(seg?.critical ?? null, g.failed),
    pending: style.dim(g.pending),
    queued: style.dim(g.pending),
    paused: style.dim(g.paused),
    killed: style.dim(g.killed),
  };
  return known[status ?? ""] ?? style.dim(status ?? "?");
}

function gauge(
  task: AgentTask,
  style: Style,
  seg: SegmentTheme | undefined,
): string {
  const size = task.contextWindowSize;
  const tokens = task.tokenCount;
  if (typeof size !== "number" || size <= 0 || typeof tokens !== "number") {
    const dashes = style.glyphs.naDash.repeat(ROW_BAR_CELLS);
    return `${style.dim(dashes)} ${style.dim("n/a")}`;
  }
  const themeSeg = seg ?? defaultTheme().segments.agents.find((s) => s.name === "gauge")!;
  const pct = (tokens / size) * 100;
  const pctText = style.paint(thresholdColor(pct, themeSeg), `${Math.round(pct)}%`);
  return `${bar(pct, ROW_BAR_CELLS, style, themeSeg)} ${pctText}`;
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
