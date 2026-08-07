import { palette, type Glyphs, type Rgb } from "./render/style.ts";

// v3 theme resolution (spec §4–§7): pure functions over injected fs. Parsing
// can never throw — every unknown or invalid field falls back independently
// and records one warning. `{}` (or no files) resolves byte-identically to
// the pre-v3 presentation; renderers consume ResolvedTheme, never raw config.

export type Charset = "unicode" | "ascii" | "nerd_font";

export type ThemeColor =
  | { kind: "rgb"; rgb: Rgb }
  | { kind: "ansi16"; code: number }
  | { kind: "ansi256"; index: number }
  | { kind: "sessionTint" };

export interface SegmentTheme {
  name: string;
  enabled: boolean;
  priority: number;
  fg: ThemeColor | null;
  bg: ThemeColor | null;
  bold: boolean | null; // null = renderer's built-in weight
  ok: ThemeColor | null;
  warn: ThemeColor | null;
  critical: ThemeColor | null;
  icon: { plain: string; nerd: string } | null;
}

export type Surface = "main" | "tools" | "todo" | "agents";

export interface ResolvedTheme {
  charset: Charset;
  glyphs: Partial<Glyphs>; // overrides applied on top of the charset table
  segments: Record<Surface, SegmentTheme[]>; // array order = display order
}

export interface ThemeFs {
  readFileSync(path: string, encoding: "utf8"): string;
}

const rgb = (c: Rgb): ThemeColor => ({ kind: "rgb", rgb: c });

// Array order = display order. priority = width-pressure survival order
// (higher survives longer); the defaults encode today's ladder: repo-name →
// cost → 7d → git drop first.
type SegmentDefault = { name: string } & Partial<Omit<SegmentTheme, "name">>;

const SEGMENT_DEFAULTS: Record<Surface, SegmentDefault[]> = {
  main: [
    { name: "model", priority: 6, fg: { kind: "sessionTint" }, bold: true },
    { name: "context", priority: 5, ok: rgb(palette.green), warn: rgb(palette.yellow), critical: rgb(palette.red) },
    { name: "pace5h", priority: 4, ok: rgb(palette.green), critical: rgb(palette.red) },
    { name: "pace7d", priority: 2, ok: rgb(palette.green), critical: rgb(palette.red) },
    { name: "git", priority: 3 },
    { name: "cost", priority: 1 },
  ],
  tools: [
    { name: "running", fg: rgb(palette.yellow) },
    { name: "completed", fg: rgb(palette.green) },
  ],
  todo: [
    { name: "progress", fg: rgb(palette.green) },
    { name: "subject" },
  ],
  agents: [
    { name: "status", ok: rgb(palette.green), warn: rgb(palette.yellow), critical: rgb(palette.red) },
    { name: "name" },
    { name: "model" },
    { name: "gauge", ok: rgb(palette.green), warn: rgb(palette.yellow), critical: rgb(palette.red) },
    { name: "tokens" },
    { name: "elapsed" },
    { name: "tool", fg: rgb(palette.yellow) },
  ],
};

export function defaultTheme(): ResolvedTheme {
  const segments = {} as Record<Surface, SegmentTheme[]>;
  for (const surface of Object.keys(SEGMENT_DEFAULTS) as Surface[]) {
    segments[surface] = SEGMENT_DEFAULTS[surface].map((d) => ({
      name: d.name,
      enabled: true,
      priority: d.priority ?? 0,
      fg: d.fg ?? null,
      bg: null,
      bold: d.bold ?? null,
      ok: d.ok ?? null,
      warn: d.warn ?? null,
      critical: d.critical ?? null,
      icon: null,
    }));
  }
  return { charset: "unicode", glyphs: {}, segments };
}

// ---- embedded presets (spec §7, palettes locked in ticket 03) ----

type Slots = {
  model: Rgb | null;
  ok: Rgb | null;
  warn: Rgb | null;
  crit: Rgb | null;
  git: Rgb | null;
};

// A preset expressed as sparse schema-form config from the five palette
// slots — run through the same merge machinery as user config, so
// `theme <name>` output round-trips identically (ticket 03).
function slotConfig(s: Slots): Record<string, unknown> {
  const hex = (c: Rgb | null) =>
    c && `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  const seg = (name: string, fields: Record<string, unknown>) => ({
    name,
    ...fields,
  });
  return {
    version: 1,
    segments: {
      main: [
        seg("model", { fg: hex(s.model) }),
        seg("context", { ok: hex(s.ok), warn: hex(s.warn), critical: hex(s.crit) }),
        seg("pace5h", { ok: hex(s.ok), critical: hex(s.crit) }),
        seg("pace7d", { ok: hex(s.ok), critical: hex(s.crit) }),
        seg("git", { fg: hex(s.git) }),
      ],
      tools: [
        seg("running", { fg: hex(s.warn) }),
        seg("completed", { fg: hex(s.ok) }),
      ],
      todo: [seg("progress", { fg: hex(s.ok) })],
      agents: [
        seg("status", { ok: hex(s.ok), warn: hex(s.warn), critical: hex(s.crit) }),
        seg("gauge", { ok: hex(s.ok), warn: hex(s.warn), critical: hex(s.crit) }),
        seg("tool", { fg: hex(s.warn) }),
      ],
    },
  };
}

export const PRESETS: Record<string, Record<string, unknown>> = {
  nord: slotConfig({ model: [136, 192, 208], ok: [163, 190, 140], warn: [235, 203, 139], crit: [191, 97, 106], git: [129, 161, 193] }),
  gruvbox: slotConfig({ model: [142, 192, 124], ok: [184, 187, 38], warn: [250, 189, 47], crit: [251, 73, 52], git: [131, 165, 152] }),
  "tokyo-night": slotConfig({ model: [122, 162, 247], ok: [158, 206, 106], warn: [224, 175, 104], crit: [247, 118, 142], git: [125, 207, 255] }),
  "rose-pine": slotConfig({ model: [156, 207, 216], ok: [49, 116, 143], warn: [246, 193, 119], crit: [235, 111, 146], git: [196, 167, 231] }),
  minimal: slotConfig({ model: null, ok: null, warn: null, crit: palette.red, git: null }),
};

// ---- parsing ----

const ANSI16: Record<string, number> = {
  black: 30, red: 31, green: 32, yellow: 33, blue: 34, magenta: 35,
  cyan: 36, white: 37, "bright-black": 90, "bright-red": 91,
  "bright-green": 92, "bright-yellow": 93, "bright-blue": 94,
  "bright-magenta": 95, "bright-cyan": 96, "bright-white": 97,
};

// undefined = unparseable (caller warns and keeps the lower-layer value);
// null = explicit "no color" (a real value that clears the slot).
function parseColor(v: unknown): ThemeColor | null | undefined {
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  if (v === "sessionTint") return { kind: "sessionTint" };
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return rgb([n >> 16, (n >> 8) & 255, n & 255]);
  }
  const idx = /^256:(\d{1,3})$/.exec(v);
  if (idx) {
    const index = Number(idx[1]);
    return index <= 255 ? { kind: "ansi256", index } : undefined;
  }
  const code = ANSI16[v];
  return code === undefined ? undefined : { kind: "ansi16", code };
}

const TOP_KEYS = new Set(["version", "theme", "charset", "glyphs", "segments"]);
const SEGMENT_KEYS = new Set(["name", "enabled", "priority", "fg", "bg", "bold", "ok", "warn", "critical", "icon"]);
const COLOR_KEYS = ["fg", "bg", "ok", "warn", "critical"] as const;
const GLYPH_KEYS = new Set<string>([
  "filled", "empty", "barOpen", "barClose", "up", "down", "reset", "branch",
  "thinking", "sep", "noPct", "running", "completed", "failed", "pending",
  "paused", "killed", "naDash", "ellipsis", "update", "times",
]);
const CHARSETS = new Set<string>(["unicode", "ascii", "nerd_font"]);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Merge one raw config layer into `theme`, per-field, never throwing.
// Exported for ticket 03's `check` subcommand.
export function applyConfig(
  theme: ResolvedTheme,
  raw: unknown,
  label: string,
  warnings: string[],
): void {
  const warn = (msg: string) => warnings.push(`${label}: ${msg}`);
  if (!isObject(raw)) {
    warn("config is not a JSON object; ignored");
    return;
  }
  for (const key of Object.keys(raw)) {
    if (!TOP_KEYS.has(key)) warn(`unknown key "${key}" ignored`);
  }
  if (raw["version"] !== undefined && raw["version"] !== 1) {
    warn(`unknown version ${JSON.stringify(raw["version"])}; parsing as version 1`);
  }
  if (raw["charset"] !== undefined) {
    if (typeof raw["charset"] === "string" && CHARSETS.has(raw["charset"])) {
      theme.charset = raw["charset"] as Charset;
    } else {
      warn(`unknown charset ${JSON.stringify(raw["charset"])}; keeping "${theme.charset}"`);
    }
  }
  if (raw["glyphs"] !== undefined) {
    if (isObject(raw["glyphs"])) {
      for (const [k, v] of Object.entries(raw["glyphs"])) {
        if (!GLYPH_KEYS.has(k)) warn(`unknown glyph "${k}" ignored`);
        else if (typeof v !== "string") warn(`glyph "${k}" is not a string; ignored`);
        else (theme.glyphs as Record<string, string>)[k] = v;
      }
    } else {
      warn(`"glyphs" is not an object; ignored`);
    }
  }
  if (raw["segments"] !== undefined) {
    if (isObject(raw["segments"])) {
      for (const [surface, list] of Object.entries(raw["segments"])) {
        if (!(surface in theme.segments)) {
          warn(`unknown surface "${surface}" ignored`);
          continue;
        }
        applySegments(theme, surface as Surface, list, warn);
      }
    } else {
      warn(`"segments" is not an object; ignored`);
    }
  }
}

function applySegments(
  theme: ResolvedTheme,
  surface: Surface,
  list: unknown,
  warn: (msg: string) => void,
): void {
  if (!Array.isArray(list)) {
    warn(`segments.${surface} is not an array; ignored`);
    return;
  }
  const current = theme.segments[surface];
  const listed: SegmentTheme[] = [];
  for (const entry of list) {
    if (!isObject(entry) || typeof entry["name"] !== "string") {
      warn(`segments.${surface} entry without a name; ignored`);
      continue;
    }
    const seg = current.find((s) => s.name === entry["name"]);
    if (!seg) {
      warn(`unknown segment "${entry["name"]}" ignored`);
      continue;
    }
    for (const key of Object.keys(entry)) {
      if (!SEGMENT_KEYS.has(key))
        warn(`unknown field "${key}" on segment "${seg.name}" ignored`);
    }
    if (entry["enabled"] !== undefined) {
      if (typeof entry["enabled"] === "boolean") seg.enabled = entry["enabled"];
      else warn(`segment "${seg.name}" enabled is not a boolean; ignored`);
    }
    if (entry["priority"] !== undefined) {
      if (typeof entry["priority"] === "number") seg.priority = entry["priority"];
      else warn(`segment "${seg.name}" priority is not a number; ignored`);
    }
    if (entry["bold"] !== undefined) {
      if (typeof entry["bold"] === "boolean") seg.bold = entry["bold"];
      else warn(`segment "${seg.name}" bold is not a boolean; ignored`);
    }
    for (const key of COLOR_KEYS) {
      if (entry[key] === undefined) continue;
      const color = parseColor(entry[key]);
      if (color === undefined)
        warn(`bad color ${JSON.stringify(entry[key])} for ${seg.name}.${key}; ignored`);
      else seg[key] = color;
    }
    if (entry["icon"] !== undefined) {
      const icon = entry["icon"];
      if (icon === null) seg.icon = null;
      else if (isObject(icon) && typeof icon["plain"] === "string" && typeof icon["nerd"] === "string") {
        seg.icon = { plain: icon["plain"], nerd: icon["nerd"] };
      } else warn(`segment "${seg.name}" icon is not {plain, nerd}; ignored`);
    }
    listed.push(seg);
  }
  // Listed order wins; unlisted segments keep their relative order after.
  theme.segments[surface] = [
    ...listed,
    ...current.filter((s) => !listed.includes(s)),
  ];
}

// Load one config file through the real fallback path and report every field
// that would be ignored or fallen back — the `check` subcommand and doctor's
// config check. File problems are warnings too: config can't hard-fail.
export function checkConfig(
  fs: ThemeFs,
  path: string,
  home?: string,
): string[] {
  const warnings: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (e) {
    return (e as { code?: string })?.code === "ENOENT"
      ? [`${path}: file not found`]
      : e instanceof SyntaxError
        ? [`${path}: not valid JSON; ignored`]
        : [`${path}: unreadable; ignored`];
  }
  if (isObject(raw) && raw["theme"] !== undefined) {
    const name = raw["theme"];
    if (typeof name !== "string") {
      warnings.push(`${path}: theme name is not a string; ignored`);
    } else if (!PRESETS[name]) {
      let userTheme = false;
      try {
        if (home) {
          fs.readFileSync(`${home}/.claude/claude-visor/themes/${name}.json`, "utf8");
          userTheme = true;
        }
      } catch {
        // fall through to the warning
      }
      if (!userTheme)
        warnings.push(`${path}: unknown theme "${name}"; falling back to default`);
    }
  }
  applyConfig(defaultTheme(), raw, path, warnings);
  return warnings;
}

// ---- resolution ----

interface Layer {
  raw: unknown;
  label: string;
}

export function resolveTheme(opts: {
  fs: ThemeFs;
  env: Record<string, string | undefined>;
  projectDir?: string;
}): { theme: ResolvedTheme; warnings: string[] } {
  const theme = defaultTheme();
  const warnings: string[] = [];
  const envTheme = opts.env["CLAUDE_VISOR_THEME"];
  if (envTheme === "off") return { theme, warnings };

  const home = opts.env["HOME"];
  const readLayer = (path: string, label: string): Layer | undefined => {
    let text: string;
    try {
      text = opts.fs.readFileSync(path, "utf8");
    } catch (e) {
      // missing is normal and silent; any other read failure gets a warning
      if ((e as { code?: string })?.code !== "ENOENT")
        warnings.push(`${label}: unreadable; ignored`);
      return undefined;
    }
    try {
      return { raw: JSON.parse(text), label };
    } catch {
      warnings.push(`${label}: not valid JSON; ignored`);
      return undefined;
    }
  };

  const global = home
    ? readLayer(`${home}/.claude/claude-visor/config.json`, "global config")
    : undefined;
  const project = opts.projectDir
    ? readLayer(`${opts.projectDir}/.claude/claude-visor.json`, "project config")
    : undefined;

  // Preset layer: env name wins the *selection*; its fields also apply last
  // (env sits at the top of the precedence chain).
  const themeLayer = (name: unknown, label: string): Layer | undefined => {
    if (name === undefined) return undefined;
    if (typeof name !== "string") {
      warnings.push(`${label}: theme name is not a string; ignored`);
      return undefined;
    }
    const user = home
      ? readLayer(`${home}/.claude/claude-visor/themes/${name}.json`, `theme "${name}"`)
      : undefined;
    if (user) {
      if (isObject(user.raw) && user.raw["theme"] !== undefined) {
        warnings.push(`theme "${name}": nested "theme" ignored`);
        delete user.raw["theme"];
      }
      return user;
    }
    const preset = PRESETS[name];
    if (preset) return { raw: preset, label: `theme "${name}"` };
    warnings.push(`${label}: unknown theme "${name}"; falling back to default`);
    return undefined;
  };

  const fileTheme = [project, global].find(
    (l) => l && isObject(l.raw) && l.raw["theme"] !== undefined,
  );
  const layers = [
    fileTheme &&
      themeLayer((fileTheme.raw as Record<string, unknown>)["theme"], fileTheme.label),
    global,
    project,
    envTheme !== undefined ? themeLayer(envTheme, "CLAUDE_VISOR_THEME") : undefined,
  ];
  for (const layer of layers) {
    if (layer) applyConfig(theme, layer.raw, layer.label, warnings);
  }
  return { theme, warnings };
}
