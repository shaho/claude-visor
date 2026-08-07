import { describe, expect, test } from "bun:test";
import { main, type Deps } from "../src/index.ts";
import { renderAgentRows } from "../src/render/agent-rows.ts";
import { renderMainLine } from "../src/render/main-line.ts";
import { renderTodoLine } from "../src/render/todo-line.ts";
import { renderToolLine } from "../src/render/tool-line.ts";
import { makeStyle } from "../src/render/style.ts";
import type { MainPayload, SubagentPayload } from "../src/stdin.ts";
import { resolveTheme, type ThemeFs } from "../src/theme.ts";

const HOME = "/home/u";
const GLOBAL = `${HOME}/.claude/claude-visor/config.json`;

function themed(config: unknown, env: Record<string, string | undefined> = {}) {
  const fs: ThemeFs = {
    readFileSync(path: string) {
      if (path === GLOBAL && config !== undefined)
        return JSON.stringify(config);
      const e = new Error("ENOENT") as Error & { code: string };
      e.code = "ENOENT";
      throw e;
    },
  };
  return resolveTheme({ fs, env: { HOME, ...env } }).theme;
}

const st = makeStyle({ COLORTERM: "truecolor" });
const NOW = new Date(1_800_000_000_000);

const NORD = { model: [136, 192, 208], ok: [163, 190, 140], warn: [235, 203, 139], crit: [191, 97, 106], git: [129, 161, 193] } as const;

const payload: MainPayload = {
  model: { display_name: "Fable 5" },
  context_window: { used_percentage: 43, context_window_size: 200_000 },
  cost: { total_cost_usd: 4.12 },
  workspace: { repo: { name: "claude-visor" } },
};

describe("preset restyles all three surfaces", () => {
  const theme = themed({ theme: "nord" });

  test("main line: model, context, and git take nord colors", () => {
    const out = renderMainLine(payload, 120, NOW, "main", st, false, theme);
    expect(out).toContain(st.bold(st.fg(NORD.model, "Fable 5")));
    expect(out).toContain(st.fg(NORD.ok, "43%"));
    expect(out).toContain(st.fg(NORD.git, `${st.glyphs.branch} main claude-visor`));
  });

  test("tool line: running and completed glyphs take nord colors", () => {
    const out = renderToolLine(
      {
        running: [{ name: "Edit", label: "auth.ts" }],
        completed: [{ name: "Read", count: 3 }],
      },
      120,
      st,
      theme,
    )!;
    expect(out).toContain(st.fg(NORD.warn, st.glyphs.running));
    expect(out).toContain(st.fg(NORD.ok, st.glyphs.completed));
  });

  test("todo line: progress cells take nord ok", () => {
    const out = renderTodoLine(
      { done: 2, total: 5, current: "Fix bug" },
      120,
      st,
      theme,
    )!;
    expect(out).toContain(st.fg(NORD.ok, st.glyphs.filled.repeat(2)));
  });

  test("agent rows: status glyph and gauge take nord colors", () => {
    const rows: SubagentPayload = {
      columns: 120,
      tasks: [
        { id: "a1", name: "Explore", status: "running", contextWindowSize: 100, tokenCount: 90 },
      ],
    };
    const out = renderAgentRows(rows, st, NOW, undefined, theme);
    expect(out).toContain(JSON.stringify(st.fg(NORD.warn, st.glyphs.running)).slice(1, -1));
    expect(out).toContain(JSON.stringify(st.fg(NORD.crit, "90%")).slice(1, -1));
  });
});

describe("state slots come from the theme, not the palette", () => {
  test("critical context takes the preset's crit color", () => {
    const theme = themed({ theme: "nord" });
    const at90: MainPayload = {
      ...payload,
      context_window: { used_percentage: 90, context_window_size: 200_000 },
    };
    const out = renderMainLine(at90, 120, NOW, undefined, st, false, theme);
    expect(out).toContain(st.fg(NORD.crit, "90%"));
  });

  test("minimal clears ok/warn but keeps critical colored", () => {
    const theme = themed({ theme: "minimal" });
    const ok = renderMainLine(payload, 120, NOW, undefined, st, false, theme);
    expect(ok).toContain(" 43%"); // uncolored percentage
    expect(ok).not.toContain(st.fg([123, 216, 143], "43%"));
    const at90: MainPayload = {
      ...payload,
      context_window: { used_percentage: 90, context_window_size: 200_000 },
    };
    const crit = renderMainLine(at90, 120, NOW, undefined, st, false, theme);
    expect(crit).toContain(st.fg([244, 112, 103], "90%"));
  });
});

describe("segment reorder, disable, and the priority ladder", () => {
  test("reorder and disable are respected", () => {
    const theme = themed({
      segments: {
        main: [
          { name: "cost" },
          { name: "model" },
          { name: "git", enabled: false },
        ],
      },
    });
    const out = renderMainLine(payload, 120, NOW, "main", st, false, theme);
    const cost = out.indexOf("$4.12");
    const model = out.indexOf("Fable 5");
    expect(cost).toBeGreaterThanOrEqual(0);
    expect(cost).toBeLessThan(model);
    expect(out).not.toContain(st.glyphs.branch);
  });

  test("width pressure drops by priority even when reordered", () => {
    // cost promoted above git: under pressure git goes first now
    const theme = themed({
      segments: { main: [{ name: "cost", priority: 9 }] },
    });
    const wide = renderMainLine(payload, 200, NOW, "main", st, false, theme);
    expect(wide).toContain("$4.12");
    expect(wide).toContain(st.glyphs.branch);
    const narrow = renderMainLine(payload, 34, NOW, "main", st, false, theme);
    expect(narrow).toContain("$4.12");
    expect(narrow).not.toContain(st.glyphs.branch);
  });
});

describe("charset and glyphs", () => {
  test("charset ascii reproduces CLAUDE_VISOR_ASCII=1 output", () => {
    const viaTheme = makeStyle(
      { COLORTERM: "truecolor" },
      { theme: themed({ charset: "ascii" }) },
    );
    const viaEnv = makeStyle({ COLORTERM: "truecolor", CLAUDE_VISOR_ASCII: "1" });
    expect(viaTheme.glyphs).toEqual(viaEnv.glyphs);
    const themedOut = renderMainLine(payload, 120, NOW, undefined, viaTheme, false, themed({ charset: "ascii" }));
    const envOut = renderMainLine(payload, 120, NOW, undefined, viaEnv, false, themed(undefined));
    expect(themedOut).toBe(envOut);
  });

  test("env var still wins with no theme at all", () => {
    const s = makeStyle({ CLAUDE_VISOR_ASCII: "1" });
    expect(s.glyphs.filled).toBe("#");
  });

  test("glyph overrides apply on top of the charset table", () => {
    const s = makeStyle(
      { COLORTERM: "truecolor" },
      { theme: themed({ glyphs: { sep: " · " } }) },
    );
    expect(s.sep).toBe(s.dim(" · "));
    expect(s.glyphs.filled).toBe("█"); // rest of the table untouched
  });
});

describe("sessionTint and icons", () => {
  test("sessionTint resolves to the tint wherever a slot names it", () => {
    const tint = [1, 2, 3] as const;
    const tinted = makeStyle({ COLORTERM: "truecolor" }, { tint });
    const theme = themed({
      segments: { main: [{ name: "context", ok: "sessionTint" }] },
    });
    const out = renderMainLine(payload, 120, NOW, undefined, tinted, false, theme);
    expect(out).toContain(tinted.fg(tint, "43%"));
  });

  test("icons render the plain or nerd variant by charset", () => {
    const config = {
      segments: {
        main: [{ name: "cost", icon: { plain: "$", nerd: "" } }],
      },
    };
    const plain = renderMainLine(payload, 120, NOW, undefined, st, false, themed(config));
    expect(plain).toContain(`$ ${st.dim("$4.12")}`);
    const nerdTheme = themed({ ...config, charset: "nerd_font" });
    const nerdStyle = makeStyle({ COLORTERM: "truecolor" }, { theme: nerdTheme });
    const nerd = renderMainLine(payload, 120, NOW, undefined, nerdStyle, false, nerdTheme);
    expect(nerd).toContain(` ${st.dim("$4.12")}`);
  });
});

describe("end to end through main()", () => {
  test("config file themes the main line via deps.fs", async () => {
    const files: Record<string, string> = {
      [GLOBAL]: JSON.stringify({ theme: "nord" }),
    };
    const deps: Deps = {
      readStdin: () =>
        Promise.resolve(
          JSON.stringify({
            model: { display_name: "Fable 5" },
            context_window: { used_percentage: 43, context_window_size: 200_000 },
          }),
        ),
      env: { COLORTERM: "truecolor", COLUMNS: "80", HOME },
      now: () => NOW,
      fs: Object.assign(Object.create(null), {
        readFileSync(path: string) {
          if (path in files) return files[path]!;
          const e = new Error("ENOENT") as Error & { code: string };
          e.code = "ENOENT";
          throw e;
        },
        readdirSync() {
          return [];
        },
        statSync() {
          throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        },
        openSync() {
          throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        },
        readSync() {
          return 0;
        },
        closeSync() {},
      }),
    };
    const out = await main(deps);
    expect(out).toContain(st.bold(st.fg(NORD.model, "Fable 5")));
    expect(out).toContain(st.fg(NORD.ok, "43%"));
  });
});
