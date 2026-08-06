// Transcript-only parsing (spec §3–§4): stateless 256KB tail-reads, per-line
// defensive parse, never throws. Todo state lives in todos.ts, not here.

export interface FsLike {
  statSync(path: string): { size: number };
  openSync(path: string, flags: string): number;
  readSync(
    fd: number,
    buffer: Buffer,
    offset: number,
    length: number,
    position: number,
  ): number;
  closeSync(fd: number): void;
}

export interface RunningTool {
  name: string;
  label: string;
}

export interface CompletedTool {
  name: string;
  count: number;
}

export interface ToolActivity {
  running: RunningTool[];
  completed: CompletedTool[]; // most recent completion first
}

const TAIL_WINDOW = 256 * 1024; // > largest observed line (61.6KB)

// Current turn's tool activity from the main transcript. null = unreadable.
export function turnTools(fs: FsLike, path: string): ToolActivity | null {
  const entries = tailEntries(fs, path);
  if (entries === null) return null;
  return deriveTools(currentTurn(entries));
}

// The agent's currently-running tool from its sidecar transcript. Sidecars
// have no turn boundary — the last unmatched tool_use in the window wins.
export function agentCurrentTool(
  fs: FsLike,
  sidecarPath: string,
): RunningTool | null {
  const entries = tailEntries(fs, sidecarPath);
  if (entries === null) return null;
  const { running } = deriveTools(entries);
  return running.at(-1) ?? null;
}

function tailEntries(fs: FsLike, path: string): unknown[] | null {
  let buf: string;
  let partialFirst: boolean;
  try {
    const size = fs.statSync(path).size;
    const start = Math.max(0, size - TAIL_WINDOW);
    partialFirst = start > 0;
    const b = Buffer.alloc(size - start);
    const fd = fs.openSync(path, "r");
    try {
      fs.readSync(fd, b, 0, b.length, start);
    } finally {
      fs.closeSync(fd);
    }
    buf = b.toString("utf8");
  } catch {
    return null;
  }
  const lines = buf.split("\n");
  if (partialFirst) lines.shift();
  const entries: unknown[] = [];
  for (const line of lines) {
    if (!line) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // malformed line — skip, never throw
    }
  }
  return entries;
}

// Entries after the last human prompt; the whole window when none is present
// (a long-running turn can exceed the window).
function currentTurn(entries: unknown[]): unknown[] {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i] as Record<string, any>;
    if (
      e?.type === "user" &&
      (e.origin?.kind === "human" || typeof e.promptSource === "string")
    ) {
      return entries.slice(i + 1);
    }
  }
  return entries;
}

function deriveTools(entries: unknown[]): ToolActivity {
  const open = new Map<string, RunningTool>();
  const completedAt = new Map<string, number>(); // name → last completion index
  const counts = new Map<string, number>();
  entries.forEach((entry, i) => {
    const e = entry as Record<string, any>;
    const content = e?.message?.content;
    if (!Array.isArray(content)) return;
    for (const block of content) {
      try {
        if (e.type === "assistant" && block?.type === "tool_use") {
          if (typeof block.id === "string")
            open.set(block.id, {
              name: String(block.name ?? "?"),
              label: toolLabel(block.input),
            });
        } else if (e.type === "user" && block?.type === "tool_result") {
          const started = open.get(block.tool_use_id);
          if (started) {
            open.delete(block.tool_use_id);
            counts.set(started.name, (counts.get(started.name) ?? 0) + 1);
            completedAt.set(started.name, i);
          }
        }
      } catch {
        // one bad block never takes down the rest
      }
    }
  });
  const completed = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => (completedAt.get(b.name) ?? 0) - (completedAt.get(a.name) ?? 0));
  return { running: [...open.values()], completed };
}

function toolLabel(input: unknown): string {
  const i = input as Record<string, unknown> | undefined;
  if (typeof i?.file_path === "string")
    return i.file_path.split("/").at(-1) ?? "";
  if (typeof i?.description === "string") return i.description;
  return "";
}

if (import.meta.main) {
  const [path, agentId] = process.argv.slice(2);
  if (!path) {
    console.error("usage: bun src/transcript.ts <transcript.jsonl> [agentId]");
    process.exit(1);
  }
  const fs = require("node:fs") as FsLike;
  const state: Record<string, unknown> = { turnTools: turnTools(fs, path) };
  if (agentId) {
    const sidecar = `${path.replace(/\.jsonl$/, "")}/subagents/agent-${agentId}.jsonl`;
    state["agentCurrentTool"] = agentCurrentTool(fs, sidecar);
  }
  console.log(JSON.stringify(state, null, 2));
}
