import { describe, expect, test } from "bun:test";
import { main, type Deps } from "../src/index.ts";
import { makeStyle, palette, visibleLength } from "../src/render/style.ts";

const NOW = 1_800_000_000;
const st = makeStyle({ COLORTERM: "truecolor" });

const fixture = (name: string) =>
  Bun.file(new URL(`fixtures/${name}.json`, import.meta.url)).text();

function deps(stdin: string, exec?: Deps["exec"]): Deps {
  return {
    readStdin: () => Promise.resolve(stdin),
    env: { COLORTERM: "truecolor", COLUMNS: "80" },
    exec,
    now: () => new Date(NOW * 1000),
  };
}

const rowsOf = (out: string) =>
  out.split("\n").map((l) => JSON.parse(l) as { id: string; content: string });

describe("gauge rows", () => {
  test("all five task types emit one valid JSON line each", async () => {
    const out = await main(deps(await fixture("agents")));
    const rows = rowsOf(out);
    expect(rows.map((r) => r.id)).toEqual([
      "task-1",
      "task-2",
      "task-3",
      "task-4",
      "task-5",
    ]);
    for (const r of rows) expect(typeof r.content).toBe("string");
  });

  test("agent row: glyph, bold name, dim model, gauge, tokens, elapsed", async () => {
    const [explore] = rowsOf(await main(deps(await fixture("agents"))));
    const c = explore!.content;
    expect(c).toContain(st.fg(palette.yellow, st.glyphs.running));
    expect(c).toContain(st.bold("Explore"));
    expect(c).toContain(st.dim("[haiku]"));
    expect(c).toContain(st.fg(palette.green, "34%"));
    expect(c).toContain("68.0k");
    expect(c).toContain("2m15s");
  });

  test("task without model shows the n/a gauge", async () => {
    const [, bash] = rowsOf(await main(deps(await fixture("agents"))));
    const c = bash!.content;
    expect(c).toContain(st.dim(st.glyphs.naDash.repeat(6)));
    expect(c).toContain(st.dim("n/a"));
    expect(c.replace(/\x1b\[[0-9;]*m/g, "")).not.toContain("[");
    expect(c).toContain("0.8k");
    expect(c).toContain("0m41s");
  });

  test("model short-names and thresholds across rows", async () => {
    const [, , review, remote] = rowsOf(await main(deps(await fixture("agents"))));
    expect(review!.content).toContain(st.dim("[sonnet]"));
    expect(review!.content).toContain(st.fg(palette.yellow, "71%"));
    expect(review!.content).toContain("6m02s");
    expect(remote!.content).toContain(st.dim("[fable]"));
    expect(remote!.content).toContain(st.fg(palette.green, "6%"));
  });

  test("ISO startTime parses and elapsed renders against the injected clock", async () => {
    const rows = rowsOf(await main(deps(await fixture("agents"))));
    expect(rows.at(-1)!.content).toContain("2m05s");
  });
});

describe("status glyphs", () => {
  const renderStatus = async (status: string) => {
    const payload = JSON.stringify({
      columns: 80,
      tasks: [{ id: "t", name: "N", status, tokenCount: 0 }],
    });
    return rowsOf(await main(deps(payload)))[0]!.content;
  };

  test("known statuses map to spec glyphs and colors", async () => {
    expect(await renderStatus("running")).toContain(
      st.fg(palette.yellow, st.glyphs.running),
    );
    expect(await renderStatus("completed")).toContain(
      st.fg(palette.green, st.glyphs.completed),
    );
    expect(await renderStatus("failed")).toContain(
      st.fg(palette.red, st.glyphs.failed),
    );
    expect(await renderStatus("pending")).toContain(st.dim(st.glyphs.pending));
    expect(await renderStatus("queued")).toContain(st.dim(st.glyphs.pending));
    expect(await renderStatus("paused")).toContain(st.dim(st.glyphs.paused));
    expect(await renderStatus("killed")).toContain(st.dim(st.glyphs.killed));
  });

  test("an invented status renders its raw string dim", async () => {
    expect(await renderStatus("melting")).toContain(st.dim("melting"));
  });
});

describe("columns budget", () => {
  const task = {
    id: "t",
    name: "very-long-agent-name-for-truncation",
    status: "running",
    model: "claude-haiku-4-5-20251001",
    contextWindowSize: 200_000,
    tokenCount: 68_000,
    startTime: (NOW - 135) * 1000,
  };
  const renderAt = async (columns: number) =>
    rowsOf(
      await main(deps(JSON.stringify({ columns, tasks: [task] }))),
    )[0]!.content;

  test("name truncates first, then tokens drop; never over budget", async () => {
    const fullLen = visibleLength(await renderAt(200));
    let truncStart = -1;
    let tokensGone = -1;
    for (let cols = fullLen + 2; cols >= 14; cols--) {
      const c = await renderAt(cols);
      expect(visibleLength(c)).toBeLessThanOrEqual(cols);
      const text = c.replace(/\x1b\[[0-9;]*m/g, "");
      if (truncStart === -1 && text.includes(st.glyphs.ellipsis))
        truncStart = cols;
      if (tokensGone === -1 && !text.includes("68.0k")) tokensGone = cols;
    }
    expect(truncStart).toBeGreaterThan(tokensGone);
    expect(tokensGone).toBeGreaterThan(0);
  });
});

describe("surface detection", () => {
  test("main payload renders the main line, not JSON rows, and calls git", async () => {
    let gitCalls = 0;
    const exec = () => {
      gitCalls++;
      return Promise.resolve("main\n");
    };
    const out = await main(deps(await fixture("main-43"), exec));
    expect(out).toContain("Fable 5");
    expect(out).not.toContain('"id"');
    expect(gitCalls).toBe(1);
  });

  test("tasks payload renders only JSON rows and never invokes git", async () => {
    let gitCalls = 0;
    const exec = () => {
      gitCalls++;
      return Promise.resolve("main\n");
    };
    const out = await main(deps(await fixture("agents"), exec));
    for (const line of out.split("\n")) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    expect(gitCalls).toBe(0);
  });

  test("task without an id is skipped, the rest still render", async () => {
    const payload = JSON.stringify({
      columns: 80,
      tasks: [
        { name: "ghost", status: "running" },
        { id: "ok", name: "N", status: "running", tokenCount: 0 },
      ],
    });
    const rows = rowsOf(await main(deps(payload)));
    expect(rows.map((r) => r.id)).toEqual(["ok"]);
  });
});
