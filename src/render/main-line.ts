import type { MainPayload, RateLimitWindow } from "../stdin.ts";
import {
  countdown,
  FIVE_HOUR_SECONDS,
  paceDelta,
  SEVEN_DAY_SECONDS,
} from "../pace.ts";
import { defaultTheme, type ResolvedTheme, type SegmentTheme } from "../theme.ts";
import { bar, emptyBar, thresholdColor } from "./bar.ts";
import { visibleLength, type Style } from "./style.ts";

const MIN_BAR_CELLS = 4;

// §4.1 degradation ladder, theme-generalized: shrink the context bar first
// (min 4 cells), then drop the repo name, then whole segments lowest
// `priority` first. The default theme's priorities encode today's ladder
// (repo → cost → 7d → git), so no config renders byte-identically.
export function renderMainLine(
  payload: MainPayload,
  columns: number,
  now: Date,
  branch: string | undefined,
  style: Style,
  updateAvailable = false,
  theme: ResolvedTheme = defaultTheme(),
): string {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const maxCells = columns >= 120 ? 14 : 8;

  type SegmentFn = (seg: SegmentTheme, cells: number, dropRepo: boolean) => string | undefined;
  const RENDERERS: Record<string, SegmentFn> = {
    model: (seg) => modelSegment(payload, style, updateAvailable, seg),
    context: (seg, cells) => contextSegment(payload, cells, style, seg),
    pace5h: (seg) =>
      rateLimitSegment("5h", payload.rate_limits?.five_hour, FIVE_HOUR_SECONDS, nowSeconds, true, style, seg),
    pace7d: (seg) =>
      rateLimitSegment("7d", payload.rate_limits?.seven_day, SEVEN_DAY_SECONDS, nowSeconds, false, style, seg),
    git: (seg, _cells, dropRepo) => gitSegment(payload, branch, dropRepo, style, seg),
    cost: (seg) => costSegment(payload, style, seg),
  };

  const active = theme.segments.main.filter((s) => s.enabled && RENDERERS[s.name]);

  // Segment isolation: one failing segment drops out, the rest still print —
  // the platform blanks the whole line on a crash, so never let one escape.
  const build = (segs: SegmentTheme[], cells: number, dropRepo: boolean): string[] =>
    segs
      .map((seg) =>
        guarded(() => {
          const text = RENDERERS[seg.name]!(seg, cells, dropRepo);
          return text !== undefined ? withIcon(text, seg, style) : undefined;
        }),
      )
      .filter((s): s is string => s !== undefined);

  const fits = (segs: string[]) =>
    visibleLength(segs.join(style.sep)) <= columns;

  for (let cells = maxCells; cells >= MIN_BAR_CELLS; cells--) {
    const segs = build(active, cells, false);
    if (fits(segs)) return segs.join(style.sep);
  }
  let kept = active;
  {
    const segs = build(kept, MIN_BAR_CELLS, true);
    if (fits(segs)) return segs.join(style.sep);
  }
  while (kept.length > 1) {
    const lowest = kept.reduce((a, b) => (b.priority < a.priority ? b : a));
    kept = kept.filter((s) => s !== lowest);
    const segs = build(kept, MIN_BAR_CELLS, true);
    if (fits(segs)) return segs.join(style.sep);
  }
  const segs = build(kept, MIN_BAR_CELLS, true);
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

function withIcon(text: string, seg: SegmentTheme, style: Style): string {
  if (!seg.icon) return text;
  return `${style.nerdIcons ? seg.icon.nerd : seg.icon.plain} ${text}`;
}

function rateLimitSegment(
  label: string,
  window: RateLimitWindow | undefined,
  windowSeconds: number,
  nowSeconds: number,
  showCountdown: boolean,
  style: Style,
  seg: SegmentTheme,
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
    segment += ` ${formatDelta(delta, style, seg)}`;
    if (showCountdown)
      segment += style.dim(
        ` ${style.glyphs.reset}${countdown(window.resets_at, nowSeconds)}`,
      );
  }
  return segment;
}

// Burning faster than the window refills = the segment's critical color;
// under pace = ok. (Today's red/green via the default theme slots.)
function formatDelta(delta: number, style: Style, seg: SegmentTheme): string {
  return delta > 0
    ? style.paint(seg.critical, `${style.glyphs.up}${delta}%`)
    : style.paint(seg.ok, `${style.glyphs.down}${Math.abs(delta)}%`);
}

function modelSegment(
  payload: MainPayload,
  style: Style,
  updateAvailable: boolean,
  seg: SegmentTheme,
): string | undefined {
  const name = payload.model?.display_name;
  if (!name) return undefined;
  const painted = style.paint(seg.fg, name);
  const effort = payload.effort?.level;
  return (
    (seg.bold === false ? painted : style.bold(painted)) +
    (effort ? style.dim(` ${effort}`) : "") +
    (payload.thinking?.enabled ? ` ${style.glyphs.thinking}` : "") +
    (updateAvailable ? ` ${style.dim(style.glyphs.update)}` : "")
  );
}

function contextSegment(
  payload: MainPayload,
  cells: number,
  style: Style,
  seg: SegmentTheme,
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
  const pctText = style.paint(thresholdColor(pct, seg), `${Math.round(pct)}%`);
  return `${bar(pct, cells, style, seg)} ${pctText}${sizeSuffix}`;
}

function gitSegment(
  payload: MainPayload,
  branch: string | undefined,
  dropRepo: boolean,
  style: Style,
  seg: SegmentTheme,
): string | undefined {
  if (!branch) return undefined;
  const repo = dropRepo ? undefined : payload.workspace?.repo?.name;
  const text = `${style.glyphs.branch} ${branch}${repo ? ` ${repo}` : ""}`;
  return seg.fg ? style.paint(seg.fg, text) : style.dim(text);
}

function costSegment(
  payload: MainPayload,
  style: Style,
  seg: SegmentTheme,
): string | undefined {
  const cost = payload.cost?.total_cost_usd;
  if (typeof cost !== "number") return undefined;
  const text = `$${cost.toFixed(2)}`;
  return seg.fg ? style.paint(seg.fg, text) : style.dim(text);
}

function humanSize(tokens: number): string {
  if (tokens >= 1_000_000) return `${tokens / 1_000_000}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
}
