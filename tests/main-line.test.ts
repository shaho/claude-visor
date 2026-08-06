import { describe, expect, test } from "bun:test";
import { main, type Deps } from "../src/index.ts";
import { renderMainLine } from "../src/render/main-line.ts";
import { sessionColor } from "../src/session-color.ts";
import type { MainPayload } from "../src/stdin.ts";
import { bar, emptyBar } from "../src/render/bar.ts";
import { makeStyle, palette } from "../src/render/style.ts";

const fixture = (name: string) =>
  Bun.file(new URL(`fixtures/${name}.json`, import.meta.url)).text();

const NOW = 1_800_000_000;

const st = makeStyle({ COLORTERM: "truecolor" });

function deps(
  stdin: string | Promise<string>,
  env: Deps["env"] = {},
  exec?: Deps["exec"],
): Deps {
  return {
    readStdin: () => Promise.resolve(stdin),
    env: { COLORTERM: "truecolor", ...env },
    exec,
    now: () => new Date(NOW * 1000),
  };
}

describe("main line end to end", () => {
  test("43% renders green bar with model and effort", async () => {
    const out = await main(deps(await fixture("main-43"), { COLUMNS: "80" }));
    const expected =
      st.bold(st.fg(sessionColor("abc123", ""), "Fable 5")) +
      st.dim(" high") +
      st.sep +
      `${bar(43, 8, st)} ${st.fg(palette.green, "43%")}${st.dim("/200k")}`;
    expect(out).toBe(expected);
  });

  test("75% uses yellow, 90% uses red with 1M window", async () => {
    const at75 = await main(deps(await fixture("main-75"), { COLUMNS: "80" }));
    expect(at75).toContain(st.fg(palette.yellow, "75%"));
    const at90 = await main(deps(await fixture("main-90"), { COLUMNS: "80" }));
    expect(at90).toContain(st.fg(palette.red, "90%"));
    expect(at90).toContain(st.dim("/1M"));
  });

  test("wide terminal grows the bar to 14 cells", async () => {
    const out = await main(deps(await fixture("main-43"), { COLUMNS: "120" }));
    expect(out).toContain(bar(43, 14, st));
  });

  test("null used_percentage renders empty bar and –%", async () => {
    const out = await main(
      deps(await fixture("main-early"), { COLUMNS: "80" }),
    );
    expect(out).toContain(
      `${emptyBar(8, st)} ${st.dim(st.glyphs.noPct)}${st.dim("/200k")}`,
    );
    expect(out).not.toContain("null");
  });
});

describe("pace segments", () => {
  test("both windows render used %, delta, and 5h countdown", async () => {
    const out = await main(deps(await fixture("main-pace"), { COLUMNS: "80" }));
    const fiveHour = `5h 62% ${st.fg(palette.red, "⇡7%")}${st.dim(" ⟳2h14m")}`;
    const sevenDay = `7d 31% ${st.fg(palette.green, "⇣12%")}`;
    expect(out).toContain(fiveHour + st.sep + sevenDay);
  });

  test("7d segment carries no countdown", async () => {
    const out = await main(deps(await fixture("main-pace"), { COLUMNS: "80" }));
    expect(out.split(st.sep).at(-1)).toBe(
      `7d 31% ${st.fg(palette.green, "⇣12%")}`,
    );
  });

  test("only five_hour present renders 5h alone", async () => {
    const out = await main(
      deps(await fixture("main-pace-5h-only"), { COLUMNS: "80" }),
    );
    expect(out).toContain("5h 12%");
    expect(out).not.toContain("7d");
  });

  test("payload without rate_limits renders no pace segments", async () => {
    const out = await main(deps(await fixture("main-43"), { COLUMNS: "80" }));
    expect(out).not.toContain("5h ");
    expect(out).not.toContain("7d ");
  });
});

describe("git segment", () => {
  const branchExec = (branch: string) => {
    const calls: { file: string; args: string[] }[] = [];
    const exec = (file: string, args: string[]) => {
      calls.push({ file, args });
      return Promise.resolve(branch);
    };
    return { exec, calls };
  };

  test("branch + repo name render dim; git gets array args with --no-optional-locks", async () => {
    const { exec, calls } = branchExec("main\n");
    const out = await main(
      deps(await fixture("main-full"), { COLUMNS: "80" }, exec),
    );
    expect(out).toContain(st.dim(`${st.glyphs.branch} main claude-visor`));
    expect(calls).toEqual([
      {
        file: "git",
        args: [
          "-C",
          "/Users/dev/claude-visor",
          "--no-optional-locks",
          "branch",
          "--show-current",
        ],
      },
    ]);
  });

  test("git failure drops only the git segment", async () => {
    const out = await main(
      deps(await fixture("main-full"), { COLUMNS: "80" }, () =>
        Promise.reject(new Error("not a git repository")),
      ),
    );
    expect(out).not.toContain(st.glyphs.branch);
    expect(out).toContain("Fable 5");
    expect(out).toContain(st.dim("$4.12"));
  });

  test("empty branch output drops the segment", async () => {
    const { exec } = branchExec("\n");
    const out = await main(
      deps(await fixture("main-full"), { COLUMNS: "80" }, exec),
    );
    expect(out).not.toContain(st.glyphs.branch);
  });

  test("branch without repo name renders branch alone", async () => {
    const { exec } = branchExec("main\n");
    const out = await main(
      deps(await fixture("main-43"), { COLUMNS: "80" }, exec),
    );
    expect(out).toContain(st.dim(`${st.glyphs.branch} main`));
  });
});

describe("cost segment", () => {
  test("cost renders as $N.NN dim", async () => {
    const out = await main(deps(await fixture("main-full"), { COLUMNS: "80" }));
    expect(out).toContain(st.dim("$4.12"));
  });

  test("absent cost field drops the segment", async () => {
    const out = await main(deps(await fixture("main-43"), { COLUMNS: "80" }));
    expect(out).not.toContain("$");
  });
});

describe("thinking glyph", () => {
  test("☰ appears exactly when thinking is enabled", async () => {
    const withThinking = await main(
      deps(await fixture("main-full"), { COLUMNS: "80" }),
    );
    expect(withThinking).toContain("☰");
    const without = await main(
      deps(await fixture("main-43"), { COLUMNS: "80" }),
    );
    expect(without).not.toContain("☰");
  });
});

describe("session color", () => {
  test("same session id + worktree is deterministic", () => {
    expect(sessionColor("abc123", "")).toEqual(sessionColor("abc123", ""));
    expect(sessionColor("abc123", "wt")).toEqual(sessionColor("abc123", "wt"));
  });

  test("different sessions or worktrees yield different hues", () => {
    expect(sessionColor("abc123", "")).not.toEqual(sessionColor("def456", ""));
    expect(sessionColor("abc123", "")).not.toEqual(
      sessionColor("abc123", "wt"),
    );
  });

  test("model segment is colored by the session color", async () => {
    const out = await main(deps(await fixture("main-full"), { COLUMNS: "80" }));
    expect(out).toContain(st.fg(sessionColor("abc123", ""), "Fable 5"));
  });

  test("payload without session_id falls back to the palette model color", async () => {
    const raw = JSON.stringify({ model: { display_name: "Fable 5" } });
    const out = await main(deps(raw, { COLUMNS: "80" }));
    expect(out).toContain(st.fg(palette.model, "Fable 5"));
  });
});

describe("segment isolation", () => {
  test("a segment throwing mid-render drops only that segment", () => {
    const payload = {
      model: { display_name: "Fable 5" },
      get cost(): { total_cost_usd?: number } {
        throw new Error("boom");
      },
      context_window: { used_percentage: 43, context_window_size: 200_000 },
    } as MainPayload;
    const out = renderMainLine(payload, 80, new Date(NOW * 1000), undefined, st);
    expect(out).toContain("Fable 5");
    expect(out).toContain("43%");
    expect(out).not.toContain("$");
  });

  test("every segment throwing still returns a string", () => {
    const explosive = new Proxy({} as MainPayload, {
      get() {
        throw new Error("boom");
      },
    });
    expect(
      renderMainLine(explosive, 80, new Date(NOW * 1000), undefined, st),
    ).toBe("");
  });
});

describe("update marker", () => {
  test("dim ↑ renders exactly when the marker file exists", async () => {
    const raw = await fixture("main-43");
    const withMarker = await main({
      ...deps(raw, { COLUMNS: "80", HOME: "/Users/dev" }),
      fileExists: () => true,
    });
    expect(withMarker).toContain(st.dim(st.glyphs.update));
    const without = await main({
      ...deps(raw, { COLUMNS: "80", HOME: "/Users/dev" }),
      fileExists: () => false,
    });
    expect(without).not.toContain(st.glyphs.update);
  });

  test("marker path is the data dir; CLAUDE_PLUGIN_DATA overrides", async () => {
    const paths: string[] = [];
    const spy = (p: string) => {
      paths.push(p);
      return false;
    };
    const raw = await fixture("main-43");
    await main({
      ...deps(raw, { COLUMNS: "80", HOME: "/Users/dev" }),
      fileExists: spy,
    });
    await main({
      ...deps(raw, { COLUMNS: "80", CLAUDE_PLUGIN_DATA: "/data/x" }),
      fileExists: spy,
    });
    expect(paths).toEqual([
      "/Users/dev/.claude/plugins/data/claude-visor-claude-visor/update-available",
      "/data/x/update-available",
    ]);
  });

  test("subagent surface never reads the marker", async () => {
    let called = false;
    await main({
      ...deps(await fixture("agents")),
      fileExists: () => ((called = true), false),
    });
    expect(called).toBe(false);
  });

  test("render path contains no network calls", async () => {
    const glob = new Bun.Glob("**/*.ts");
    for await (const file of glob.scan(new URL("../src/", import.meta.url).pathname)) {
      const source = await Bun.file(
        new URL(`../src/${file}`, import.meta.url),
      ).text();
      expect(source).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket|node:http|node:net|curl/);
    }
  });
});

describe("kill switch", () => {
  test("CLAUDE_VISOR_DISABLE=1 exits empty without reading stdin", async () => {
    let stdinRead = false;
    const out = await main({
      readStdin: () => {
        stdinRead = true;
        return Promise.resolve("{}");
      },
      env: { CLAUDE_VISOR_DISABLE: "1" },
    });
    expect(out).toBe("");
    expect(stdinRead).toBe(false);
  });
});

describe("malformed input", () => {
  test.each(["", "not json", "[1,2,3]", '{"model":', '{"model": 7}'])(
    "never throws on %j",
    async (raw) => {
      const out = await main(deps(raw));
      expect(typeof out).toBe("string");
    },
  );

  test("stdin read failure returns empty output", async () => {
    const out = await main({
      readStdin: () => Promise.reject(new Error("boom")),
      env: {},
    });
    expect(out).toBe("");
  });
});
