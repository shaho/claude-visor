import { describe, expect, test } from "bun:test";
import * as nodeFs from "node:fs";
import { join } from "node:path";
import { main, type Deps } from "../src/index.ts";
import { renderToolLine } from "../src/render/tool-line.ts";
import { makeStyle, palette, visibleLength } from "../src/render/style.ts";
import type { FsLike, ToolActivity } from "../src/transcript.ts";

const FIX = join(import.meta.dir, "fixtures", "transcripts");
const st = makeStyle({ COLORTERM: "truecolor" });

const payloadWith = async (transcript: string) => {
  const base = JSON.parse(
    await Bun.file(new URL("fixtures/main-43.json", import.meta.url)).text(),
  );
  return JSON.stringify({ ...base, transcript_path: join(FIX, transcript) });
};

function deps(stdin: string, env: Deps["env"] = {}, fs: Deps["fs"] = nodeFs): Deps {
  return {
    readStdin: () => Promise.resolve(stdin),
    env: { COLORTERM: "truecolor", COLUMNS: "120", ...env },
    now: () => new Date(1_800_000_000_000),
    fs,
  };
}

describe("tool-activity line end to end", () => {
  test("active turn renders running and completed segments on line 2", async () => {
    const out = await main(deps(await payloadWith("turn-active.jsonl")));
    const [line1, line2, rest] = out.split("\n");
    expect(rest).toBeUndefined();
    expect(line1).toContain("Fable 5");
    expect(line2).toBe(
      st.fg(palette.yellow, st.glyphs.running) +
        ` ${st.bold("Edit")}` +
        st.dim(" auth.ts") +
        st.sep +
        st.fg(palette.green, st.glyphs.completed) +
        " Bash" +
        st.dim(` ${st.glyphs.times}2`) +
        st.sep +
        st.fg(palette.green, st.glyphs.completed) +
        " Read" +
        st.dim(` ${st.glyphs.times}3`),
    );
  });

  test("parallel fixture renders one ◐ segment per running tool", async () => {
    const out = await main(deps(await payloadWith("turn-parallel.jsonl")));
    const line2 = out.split("\n")[1]!;
    const spinners = line2.split(st.fg(palette.yellow, st.glyphs.running)).length - 1;
    expect(spinners).toBe(4); // Edit, Bash, Agent, Task
  });

  test("idle turn is byte-identical to the kill-switched v0 output", async () => {
    const payload = await payloadWith("turn-idle.jsonl");
    const v0 = await main(deps(payload, { CLAUDE_VISOR_NO_TRANSCRIPT: "1" }));
    expect(await main(deps(payload))).toBe(v0);
    expect(v0).not.toContain("\n");
  });

  test("missing and garbage transcripts degrade to v0 output", async () => {
    const payload = await payloadWith("does-not-exist.jsonl");
    const v0 = await main(deps(payload, { CLAUDE_VISOR_NO_TRANSCRIPT: "1" }));
    expect(await main(deps(payload))).toBe(v0);

    const garbage = join(FIX, "..", "garbage.tmp.jsonl");
    nodeFs.writeFileSync(garbage, "not json\nstill not json\n");
    const gPayload = await payloadWith("../garbage.tmp.jsonl");
    const gOut = await main(deps(gPayload));
    nodeFs.rmSync(garbage, { force: true });
    expect(gOut).toBe(await main(deps(gPayload, { CLAUDE_VISOR_NO_TRANSCRIPT: "1" })));
  });

  test("kill switch does zero transcript I/O", async () => {
    let calls = 0;
    const spy: Deps["fs"] = {
      statSync: (p) => (calls++, nodeFs.statSync(p)),
      openSync: (p, f) => (calls++, nodeFs.openSync(p, f)),
      readSync: nodeFs.readSync,
      closeSync: nodeFs.closeSync,
      readdirSync: (p) => (calls++, nodeFs.readdirSync(p) as string[]),
      readFileSync: (p, e) => (calls++, nodeFs.readFileSync(p, e)),
    };
    const payload = await payloadWith("turn-active.jsonl");
    await main(deps(payload, { CLAUDE_VISOR_NO_TRANSCRIPT: "1" }, spy));
    expect(calls).toBe(0);
  });
});

describe("width pressure", () => {
  const activity: ToolActivity = {
    running: [
      { name: "Edit", label: "authentication-middleware.ts" },
      { name: "Bash", label: "run the full integration suite" },
    ],
    completed: [
      { name: "Grep", count: 1 },
      { name: "Bash", count: 2 },
      { name: "Read", count: 3 },
    ],
  };

  test("drops completed segments oldest-first, then clips running labels", () => {
    const wide = renderToolLine(activity, 200, st)!;
    expect(wide).toContain("Read");
    const mid = renderToolLine(activity, 80, st)!;
    // Read ×3 is oldest (last in most-recent-first order) — dropped first
    expect(mid).not.toContain("Read");
    expect(visibleLength(mid)).toBeLessThanOrEqual(80);
    const narrow = renderToolLine(activity, 30, st)!;
    expect(narrow).toContain(st.glyphs.ellipsis);
    expect(visibleLength(narrow)).toBeLessThanOrEqual(30);
    const tiny = renderToolLine(activity, 12, st)!;
    expect(visibleLength(tiny)).toBeLessThanOrEqual(12);
    expect(tiny).toContain("Bash"); // newest running survives to the last
  });

  test("empty activity renders no line", () => {
    expect(renderToolLine({ running: [], completed: [] }, 80, st)).toBeUndefined();
  });
});

describe("degradation ladder", () => {
  test("ASCII mode renders * + | and xN via the glyph table", async () => {
    const ascii = makeStyle({ CLAUDE_VISOR_ASCII: "1", NO_COLOR: "1" });
    const line = renderToolLine(
      {
        running: [{ name: "Edit", label: "auth.ts" }],
        completed: [{ name: "Read", count: 3 }],
      },
      80,
      ascii,
    );
    expect(line).toBe("* Edit auth.ts | + Read x3");
  });
});
