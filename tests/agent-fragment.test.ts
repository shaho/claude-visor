import { describe, expect, test } from "bun:test";
import * as nodeFs from "node:fs";
import { join } from "node:path";
import { main, type Deps } from "../src/index.ts";
import { renderAgentRows } from "../src/render/agent-rows.ts";
import { makeStyle, palette } from "../src/render/style.ts";
import type { SubagentPayload } from "../src/stdin.ts";

const FIX = join(import.meta.dir, "fixtures", "transcripts");
const TRANSCRIPT = join(FIX, "session-x.jsonl"); // sidecars live beside it
const st = makeStyle({ COLORTERM: "truecolor" });
const NOW = new Date(1_800_000_000_000);

const payload = (tasks: SubagentPayload["tasks"], columns = 120): SubagentPayload => ({
  columns,
  transcript_path: TRANSCRIPT,
  tasks,
});

const running = (id: string) => ({
  id,
  name: "Explore",
  type: "local_agent",
  status: "running",
  model: "claude-haiku-4-5-20251001",
  contextWindowSize: 200000,
  tokenCount: 68000,
  startTime: 1_799_999_865_000,
});

function deps(stdin: string, env: Deps["env"] = {}, fs: Deps["fs"] = nodeFs): Deps {
  return {
    readStdin: () => Promise.resolve(stdin),
    env: { COLORTERM: "truecolor", ...env },
    now: () => NOW,
    fs,
  };
}

const FRAGMENT =
  st.sep +
  st.fg(palette.yellow, st.glyphs.running) +
  ` ${st.bold("Read")}` +
  st.dim(" token.ts");

describe("agent-row fragment end to end", () => {
  test("running task with open sidecar tool gains the fragment", async () => {
    const out = await main(deps(JSON.stringify(payload([running("abc123")]))));
    const content = JSON.parse(out).content as string;
    expect(content.endsWith(FRAGMENT)).toBe(true);
  });

  test("every other state renders the plain v0 row byte-identically", async () => {
    const cases: SubagentPayload["tasks"] = [
      { ...running("abc123"), status: "completed" }, // status gates the join
      running("done999"), // sidecar fully matched — no open tool
      running("no-sidecar-here"), // join fails
    ];
    for (const task of cases) {
      const v0 = renderAgentRows(payload([task]), st, NOW);
      const out = await main(deps(JSON.stringify(payload([task]))));
      expect(out).toBe(v0);
    }
  });

  test("narrow columns drop the fragment before any v0 segment", async () => {
    const v0 = renderAgentRows(payload([running("abc123")], 46), st, NOW);
    const out = await main(deps(JSON.stringify(payload([running("abc123")], 46))));
    expect(out).toBe(v0);
    expect(out).not.toContain("token.ts");
  });

  test("kill switch renders v0 rows with zero sidecar I/O", async () => {
    let calls = 0;
    const spy: Deps["fs"] = {
      statSync: (p) => (calls++, nodeFs.statSync(p)),
      openSync: (p, f) => (calls++, nodeFs.openSync(p, f)),
      readSync: nodeFs.readSync,
      closeSync: nodeFs.closeSync,
      readdirSync: (p) => (calls++, nodeFs.readdirSync(p) as string[]),
      readFileSync: (p, e) => (calls++, nodeFs.readFileSync(p, e)),
    };
    const out = await main(
      deps(
        JSON.stringify(payload([running("abc123")])),
        { CLAUDE_VISOR_NO_TRANSCRIPT: "1" },
        spy,
      ),
    );
    expect(calls).toBe(0);
    expect(out).toBe(renderAgentRows(payload([running("abc123")]), st, NOW));
  });

  test("mixed panel: only the joinable running task changes", async () => {
    const tasks = [
      running("abc123"),
      { ...running("done999"), name: "code-reviewer", status: "completed" },
    ];
    const out = await main(deps(JSON.stringify(payload(tasks))));
    const [row1, row2] = out.split("\n").map((l) => JSON.parse(l).content as string);
    expect(row1!.endsWith(FRAGMENT)).toBe(true);
    expect(row2).toBe(
      (JSON.parse(renderAgentRows(payload([tasks[1]!]), st, NOW)) as { content: string })
        .content,
    );
  });
});
