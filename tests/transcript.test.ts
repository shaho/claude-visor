import { describe, expect, test } from "bun:test";
import * as nodeFs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  agentCurrentTool,
  turnTools,
  type FsLike,
} from "../src/transcript.ts";

const fs: FsLike = nodeFs;
const FIX = join(import.meta.dir, "fixtures", "transcripts");

describe("turnTools", () => {
  test("derives running and completed tools scoped to the current turn", () => {
    const state = turnTools(fs, join(FIX, "turn-active.jsonl"));
    expect(state).toEqual({
      running: [{ name: "Edit", label: "auth.ts" }],
      // most recent completion first; previous turn's Grep excluded
      completed: [
        { name: "Bash", count: 2 },
        { name: "Read", count: 3 },
      ],
    });
  });

  test("parallel tool_use blocks and the {Task, Agent} set all run", () => {
    const state = turnTools(fs, join(FIX, "turn-parallel.jsonl"));
    expect(state?.running).toEqual([
      { name: "Edit", label: "auth.ts" },
      { name: "Bash", label: "bun test" },
      { name: "Agent", label: "Explore auth flow" },
      { name: "Task", label: "Legacy subagent" },
    ]);
    expect(state?.completed).toEqual([{ name: "Read", count: 1 }]);
  });

  test("idle turn yields empty state, not null", () => {
    expect(turnTools(fs, join(FIX, "turn-idle.jsonl"))).toEqual({
      running: [],
      completed: [],
    });
  });

  test("corruption drill parses without throwing and keeps partial state", () => {
    const state = turnTools(fs, join(FIX, "corruption.jsonl"));
    expect(state).toEqual({
      running: [],
      completed: [{ name: "Edit", count: 1 }],
    });
  });

  test("unreadable path yields null", () => {
    expect(turnTools(fs, join(FIX, "does-not-exist.jsonl"))).toBeNull();
  });
});

describe("agentCurrentTool", () => {
  const sidecars = join(FIX, "session-x", "subagents");

  test("yields the last unmatched tool_use from the sidecar", () => {
    expect(agentCurrentTool(fs, join(sidecars, "agent-abc123.jsonl"))).toEqual({
      name: "Read",
      label: "token.ts",
    });
  });

  test("matched-everything sidecar yields null, not an error", () => {
    expect(
      agentCurrentTool(fs, join(sidecars, "agent-done999.jsonl")),
    ).toBeNull();
  });

  test("missing sidecar yields null", () => {
    expect(agentCurrentTool(fs, join(sidecars, "agent-nope.jsonl"))).toBeNull();
  });
});

describe("performance", () => {
  test("parses a 2MB transcript in under 10ms", () => {
    // Build a large transcript by repeating the active fixture's entries;
    // the tail window makes size irrelevant, this guards against O(n) drift.
    const body = nodeFs.readFileSync(join(FIX, "turn-active.jsonl"), "utf8");
    const big = join(tmpdir(), "claude-visor-perf-fixture.jsonl");
    nodeFs.writeFileSync(big, body.repeat(Math.ceil(2_000_000 / body.length)));
    turnTools(fs, big); // warm-up
    const t0 = performance.now();
    const state = turnTools(fs, big);
    const elapsed = performance.now() - t0;
    nodeFs.rmSync(big, { force: true });
    expect(state?.running).toEqual([{ name: "Edit", label: "auth.ts" }]);
    expect(elapsed).toBeLessThan(10);
  });
});
