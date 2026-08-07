import { describe, expect, test } from "bun:test";
import { palette } from "../src/render/style.ts";
import {
  applyConfig,
  PRESETS,
  resolveTheme,
  type ResolvedTheme,
  type ThemeColor,
  type ThemeFs,
} from "../src/theme.ts";

const HOME = "/home/u";
const GLOBAL = `${HOME}/.claude/claude-visor/config.json`;
const PROJECT_DIR = "/repo";
const PROJECT = `${PROJECT_DIR}/.claude/claude-visor.json`;
const themePath = (name: string) =>
  `${HOME}/.claude/claude-visor/themes/${name}.json`;

function fsWith(files: Record<string, string>): ThemeFs {
  return {
    readFileSync(path: string) {
      if (path in files) return files[path]!;
      const e = new Error(`ENOENT: ${path}`) as Error & { code: string };
      e.code = "ENOENT";
      throw e;
    },
  };
}

function resolve(
  files: Record<string, string>,
  env: Record<string, string | undefined> = {},
) {
  return resolveTheme({
    fs: fsWith(files),
    env: { HOME, ...env },
    projectDir: PROJECT_DIR,
  });
}

const seg = (theme: ResolvedTheme, surface: keyof ResolvedTheme["segments"], name: string) =>
  theme.segments[surface].find((s) => s.name === name)!;

describe("defaults (the byte-identical lock's foundation)", () => {
  test("no files, {} config, and all-defaults resolve identically", () => {
    const none = resolve({});
    const empty = resolve({ [GLOBAL]: "{}" });
    const versioned = resolve({ [GLOBAL]: '{"version": 1}' });
    expect(none.warnings).toEqual([]);
    expect(empty.warnings).toEqual([]);
    expect(versioned.warnings).toEqual([]);
    expect(empty.theme).toEqual(none.theme);
    expect(versioned.theme).toEqual(none.theme);
  });

  test("defaults encode today's presentation", () => {
    const { theme } = resolve({});
    expect(theme.charset).toBe("unicode");
    expect(theme.glyphs).toEqual({});
    expect(theme.segments.main.map((s) => s.name)).toEqual([
      "model", "context", "pace5h", "pace7d", "git", "cost",
    ]);
    expect(seg(theme, "main", "model").fg).toEqual({ kind: "sessionTint" });
    expect(seg(theme, "main", "model").bold).toBe(true);
    expect(seg(theme, "main", "context").ok).toEqual({ kind: "rgb", rgb: palette.green });
    expect(seg(theme, "main", "context").critical).toEqual({ kind: "rgb", rgb: palette.red });
    expect(seg(theme, "main", "git").fg).toBeNull();
    expect(seg(theme, "tools", "running").fg).toEqual({ kind: "rgb", rgb: palette.yellow });
    // today's drop ladder: repo → cost → 7d → git, encoded as priorities
    const p = (name: string) => seg(theme, "main", name).priority;
    expect(p("cost")).toBeLessThan(p("pace7d"));
    expect(p("pace7d")).toBeLessThan(p("git"));
    expect(p("git")).toBeLessThan(p("pace5h"));
  });
});

describe("precedence", () => {
  test("preset < global < project < env, per field", () => {
    const files = {
      [GLOBAL]: JSON.stringify({
        theme: "nord",
        segments: { main: [{ name: "model", fg: "#111111" }] },
      }),
      [PROJECT]: JSON.stringify({
        segments: { main: [{ name: "model", fg: "#222222" }] },
      }),
    };
    // project beats global
    expect(seg(resolve(files).theme, "main", "model").fg).toEqual({
      kind: "rgb", rgb: [0x22, 0x22, 0x22],
    });
    // global beats preset
    const globalOnly = resolve({ [GLOBAL]: files[GLOBAL]! });
    expect(seg(globalOnly.theme, "main", "model").fg).toEqual({
      kind: "rgb", rgb: [0x11, 0x11, 0x11],
    });
    // env preset beats everything it defines
    const env = resolve(files, { CLAUDE_VISOR_THEME: "gruvbox" });
    expect(seg(env.theme, "main", "model").fg).toEqual({
      kind: "rgb", rgb: [142, 192, 124],
    });
  });

  test("sparse overrides never clobber unrelated preset fields", () => {
    const { theme, warnings } = resolve({
      [GLOBAL]: JSON.stringify({
        theme: "nord",
        segments: { main: [{ name: "model", fg: "#ffffff" }] },
      }),
    });
    expect(warnings).toEqual([]);
    // nord's context slots survive the model tweak
    expect(seg(theme, "main", "context").ok).toEqual({
      kind: "rgb", rgb: [163, 190, 140],
    });
    expect(seg(theme, "main", "git").fg).toEqual({
      kind: "rgb", rgb: [129, 161, 193],
    });
  });

  test("project config can select the theme", () => {
    const { theme } = resolve({
      [PROJECT]: JSON.stringify({ theme: "rose-pine" }),
    });
    expect(seg(theme, "main", "model").fg).toEqual({
      kind: "rgb", rgb: [156, 207, 216],
    });
  });
});

describe("corruption drill (per-field fallback, one warning each, never throws)", () => {
  test("malformed JSON falls back whole-file with one warning", () => {
    const { theme, warnings } = resolve({ [GLOBAL]: "{nope" });
    expect(theme).toEqual(resolve({}).theme);
    expect(warnings).toEqual(["global config: not valid JSON; ignored"]);
  });

  test("each bad field warns once and falls back independently", () => {
    const { theme, warnings } = resolve({
      [GLOBAL]: JSON.stringify({
        sparkles: true,
        charset: "wingdings",
        theme: "dracula",
        glyphs: { sep: " · ", nope: "x", running: 7 },
        segments: {
          main: [
            { name: "weather" },
            { name: "model", fg: "not-a-color", bold: "yes", extra: 1 },
            { name: "context", ok: "#00ff00" },
          ],
          sides: [],
        },
      }),
    });
    expect(warnings.sort()).toEqual(
      [
        'global config: unknown key "sparkles" ignored',
        'global config: unknown charset "wingdings"; keeping "unicode"',
        'global config: unknown theme "dracula"; falling back to default',
        'global config: unknown glyph "nope" ignored',
        'global config: glyph "running" is not a string; ignored',
        'global config: unknown segment "weather" ignored',
        'global config: bad color "not-a-color" for model.fg; ignored',
        'global config: segment "model" bold is not a boolean; ignored',
        'global config: unknown field "extra" on segment "model" ignored',
        'global config: unknown surface "sides" ignored',
      ].sort(),
    );
    // the good fields still applied
    expect(theme.glyphs.sep).toBe(" · ");
    expect(seg(theme, "main", "context").ok).toEqual({
      kind: "rgb", rgb: [0, 255, 0],
    });
    // the bad ones fell back
    expect(seg(theme, "main", "model").fg).toEqual({ kind: "sessionTint" });
    expect(seg(theme, "main", "model").bold).toBe(true);
  });

  test("non-object config warns and yields defaults", () => {
    const { theme, warnings } = resolve({ [GLOBAL]: '"nord"' });
    expect(theme).toEqual(resolve({}).theme);
    expect(warnings).toEqual([
      "global config: config is not a JSON object; ignored",
    ]);
  });

  test("unreadable (non-ENOENT) file warns; missing file is silent", () => {
    const fs: ThemeFs = {
      readFileSync(path: string) {
        if (path === GLOBAL) {
          const e = new Error("EACCES") as Error & { code: string };
          e.code = "EACCES";
          throw e;
        }
        const e = new Error("ENOENT") as Error & { code: string };
        e.code = "ENOENT";
        throw e;
      },
    };
    const { warnings } = resolveTheme({ fs, env: { HOME }, projectDir: PROJECT_DIR });
    expect(warnings).toEqual(["global config: unreadable; ignored"]);
  });
});

describe("kill switch and env preset", () => {
  test("CLAUDE_VISOR_THEME=off yields defaults regardless of files", () => {
    const { theme, warnings } = resolve(
      { [GLOBAL]: JSON.stringify({ theme: "nord" }) },
      { CLAUDE_VISOR_THEME: "off" },
    );
    expect(theme).toEqual(resolve({}).theme);
    expect(warnings).toEqual([]);
  });

  test("CLAUDE_VISOR_THEME=<name> forces that preset with no files", () => {
    const { theme } = resolve({}, { CLAUDE_VISOR_THEME: "tokyo-night" });
    expect(seg(theme, "main", "model").fg).toEqual({
      kind: "rgb", rgb: [122, 162, 247],
    });
  });

  test("unknown env theme warns and falls back", () => {
    const { theme, warnings } = resolve({}, { CLAUDE_VISOR_THEME: "nope" });
    expect(theme).toEqual(resolve({}).theme);
    expect(warnings).toEqual([
      'CLAUDE_VISOR_THEME: unknown theme "nope"; falling back to default',
    ]);
  });
});

describe("presets", () => {
  const slotOf = (name: string) => {
    const { theme } = resolve({}, { CLAUDE_VISOR_THEME: name });
    const asRgb = (c: ThemeColor | null) =>
      c && c.kind === "rgb" ? [...c.rgb] : null;
    return {
      model: asRgb(seg(theme, "main", "model").fg),
      ok: asRgb(seg(theme, "main", "context").ok),
      warn: asRgb(seg(theme, "main", "context").warn),
      crit: asRgb(seg(theme, "main", "context").critical),
      git: asRgb(seg(theme, "main", "git").fg),
    };
  };

  test("all five embedded presets match the spec §7 palette table", () => {
    expect(slotOf("nord")).toEqual({ model: [136, 192, 208], ok: [163, 190, 140], warn: [235, 203, 139], crit: [191, 97, 106], git: [129, 161, 193] });
    expect(slotOf("gruvbox")).toEqual({ model: [142, 192, 124], ok: [184, 187, 38], warn: [250, 189, 47], crit: [251, 73, 52], git: [131, 165, 152] });
    expect(slotOf("tokyo-night")).toEqual({ model: [122, 162, 247], ok: [158, 206, 106], warn: [224, 175, 104], crit: [247, 118, 142], git: [125, 207, 255] });
    expect(slotOf("rose-pine")).toEqual({ model: [156, 207, 216], ok: [49, 116, 143], warn: [246, 193, 119], crit: [235, 111, 146], git: [196, 167, 231] });
    expect(slotOf("minimal")).toEqual({ model: null, ok: null, warn: null, crit: [244, 112, 103], git: null });
  });

  test("presets restyle all surfaces, not just the main line", () => {
    const { theme } = resolve({}, { CLAUDE_VISOR_THEME: "nord" });
    expect(seg(theme, "tools", "running").fg).toEqual({ kind: "rgb", rgb: [235, 203, 139] });
    expect(seg(theme, "todo", "progress").fg).toEqual({ kind: "rgb", rgb: [163, 190, 140] });
    expect(seg(theme, "agents", "gauge").critical).toEqual({ kind: "rgb", rgb: [191, 97, 106] });
  });

  test("preset JSON applied as a user theme file resolves identically (round-trip)", () => {
    const viaEmbedded = resolve({}, { CLAUDE_VISOR_THEME: "gruvbox" });
    const viaFile = resolve(
      { [themePath("gruvbox")]: JSON.stringify(PRESETS["gruvbox"]) },
      { CLAUDE_VISOR_THEME: "gruvbox" },
    );
    expect(viaFile.theme).toEqual(viaEmbedded.theme);
    expect(viaFile.warnings).toEqual([]);
  });

  test("user theme shadows the embedded preset of the same name", () => {
    const { theme } = resolve(
      {
        [themePath("nord")]: JSON.stringify({
          segments: { main: [{ name: "model", fg: "#000001" }] },
        }),
        [GLOBAL]: JSON.stringify({ theme: "nord" }),
      },
    );
    expect(seg(theme, "main", "model").fg).toEqual({ kind: "rgb", rgb: [0, 0, 1] });
  });
});

describe("layout", () => {
  test("segment reorder and disable", () => {
    const { theme, warnings } = resolve({
      [GLOBAL]: JSON.stringify({
        segments: {
          main: [
            { name: "git", priority: 9 },
            { name: "model" },
            { name: "cost", enabled: false },
          ],
        },
      }),
    });
    expect(warnings).toEqual([]);
    // stable reorder: listed segments swap among their existing positions
    // (0, 4, 5 here), unlisted segments stay exactly where they were
    expect(theme.segments.main.map((s) => s.name)).toEqual([
      "git", "context", "pace5h", "pace7d", "model", "cost",
    ]);
    expect(seg(theme, "main", "cost").enabled).toBe(false);
    expect(seg(theme, "main", "git").priority).toBe(9);
  });

  test("a sparse color tweak never moves the segment", () => {
    const { theme, warnings } = resolve({
      [GLOBAL]: JSON.stringify({
        segments: { main: [{ name: "cost", fg: "#ff9e64" }] },
      }),
    });
    expect(warnings).toEqual([]);
    expect(theme.segments.main.map((s) => s.name)).toEqual([
      "model", "context", "pace5h", "pace7d", "git", "cost",
    ]);
  });

  test("color value forms: ansi16 names, 256:<n>, sessionTint, explicit null", () => {
    const { theme, warnings } = resolve({
      [GLOBAL]: JSON.stringify({
        segments: {
          main: [
            { name: "git", fg: "bright-blue" },
            { name: "cost", fg: "256:245" },
            { name: "context", ok: "sessionTint" },
            { name: "model", fg: null },
          ],
        },
      }),
    });
    expect(warnings).toEqual([]);
    expect(seg(theme, "main", "git").fg).toEqual({ kind: "ansi16", code: 94 });
    expect(seg(theme, "main", "cost").fg).toEqual({ kind: "ansi256", index: 245 });
    expect(seg(theme, "main", "context").ok).toEqual({ kind: "sessionTint" });
    expect(seg(theme, "main", "model").fg).toBeNull();
  });
});

describe("hot path", () => {
  test("resolution with two files and a preset stays well under budget", () => {
    const files = {
      [GLOBAL]: JSON.stringify({ theme: "nord", segments: { main: [{ name: "model", fg: "#abcdef" }] } }),
      [PROJECT]: JSON.stringify({ charset: "ascii" }),
    };
    resolve(files); // warm-up
    const start = performance.now();
    for (let i = 0; i < 100; i++) resolve(files);
    const perCall = (performance.now() - start) / 100;
    // ~50 ms total budget; resolution must be a rounding error within it
    expect(perCall).toBeLessThan(2);
  });
});

describe("applyConfig is exported for ticket 03's check", () => {
  test("collects warnings without touching fs", () => {
    const { theme } = resolve({});
    const warnings: string[] = [];
    applyConfig(theme, { unknown: 1 }, "check", warnings);
    expect(warnings).toEqual(['check: unknown key "unknown" ignored']);
  });
});
