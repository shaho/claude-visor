import { describe, expect, test } from "bun:test";
import * as nodeFs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, type Deps } from "../src/index.ts";
import { renderTodoLine } from "../src/render/todo-line.ts";
import { makeStyle, palette, visibleLength } from "../src/render/style.ts";
import { readTodos } from "../src/todos.ts";

const HOME = join(import.meta.dir, "fixtures", "todo-home");
const st = makeStyle({ COLORTERM: "truecolor" });

const payloadWith = async (sessionId: string) => {
  const base = JSON.parse(
    await Bun.file(new URL("fixtures/main-43.json", import.meta.url)).text(),
  );
  return JSON.stringify({ ...base, session_id: sessionId });
};

function deps(stdin: string, env: Deps["env"] = {}): Deps {
  return {
    readStdin: () => Promise.resolve(stdin),
    env: { COLORTERM: "truecolor", COLUMNS: "120", HOME, ...env },
    now: () => new Date(1_800_000_000_000),
    fs: nodeFs,
  };
}

describe("todo line end to end", () => {
  test("mixed statuses render mini bar, count, and in-progress subject", async () => {
    const out = await main(deps(await payloadWith("sess-mixed")));
    const line = out.split("\n").at(-1)!;
    // 2/5 done (bad.json skipped) → 2 filled cells of 5
    expect(line).toBe(
      st.fg(palette.green, st.glyphs.filled.repeat(2)) +
        st.dim(st.glyphs.empty.repeat(3)) +
        ` ${st.dim("2/5")} Fix authentication bug in session middleware`,
    );
  });

  test("todo line lands directly after line 1 when tools are quiet", async () => {
    const out = await main(deps(await payloadWith("sess-mixed")));
    expect(out.split("\n")).toHaveLength(2); // no blank tool row between
  });

  test("missing dir, all-completed, and absent session_id hide the line", async () => {
    for (const sess of ["sess-nope", "sess-done"]) {
      const payload = await payloadWith(sess);
      const v0 = await main(
        deps(payload, { CLAUDE_VISOR_NO_TRANSCRIPT: "1" }),
      );
      const out = await main(deps(payload));
      expect(out.split("\n")).toHaveLength(1);
      expect(out).toBe(v0);
    }
    const empty = join(tmpdir(), "cv-empty-todos", ".claude", "tasks", "s1");
    nodeFs.mkdirSync(empty, { recursive: true });
    const out = await main(
      deps(await payloadWith("s1"), { HOME: join(tmpdir(), "cv-empty-todos") }),
    );
    expect(out.split("\n")).toHaveLength(1);
  });

  test("long subject clips with ellipsis and never overflows", () => {
    const line = renderTodoLine(
      { done: 1, total: 3, current: "a very long subject ".repeat(8) },
      40,
      st,
    )!;
    expect(visibleLength(line)).toBeLessThanOrEqual(40);
    expect(line).toContain(st.glyphs.ellipsis);
  });

  test("ASCII mode renders ##--- 2/5 via the glyph table", () => {
    const ascii = makeStyle({ CLAUDE_VISOR_ASCII: "1", NO_COLOR: "1" });
    expect(
      renderTodoLine({ done: 2, total: 5, current: "Fix the bug" }, 80, ascii),
    ).toBe("##--- 2/5 Fix the bug");
  });
});

describe("readTodos", () => {
  test("skips bad JSON files and finds first in-progress by numeric order", () => {
    const state = readTodos(nodeFs, join(HOME, ".claude", "tasks", "sess-mixed"));
    expect(state).toEqual({
      done: 2,
      total: 5,
      current: "Fix authentication bug in session middleware",
    });
  });

  test("unreadable dir yields null", () => {
    expect(readTodos(nodeFs, "/does/not/exist")).toBeNull();
  });
});
