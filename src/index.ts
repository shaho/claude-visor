import { execFile } from "node:child_process";
import * as nodeFs from "node:fs";
import { promisify } from "node:util";
import { gitBranch, type Exec } from "./git.ts";
import { isSubagentPayload, parsePayload } from "./stdin.ts";
import { renderAgentRows } from "./render/agent-rows.ts";
import { renderMainLine } from "./render/main-line.ts";
import { renderToolLine } from "./render/tool-line.ts";
import { makeStyle } from "./render/style.ts";
import { turnTools, type FsLike } from "./transcript.ts";
import { VERSION } from "./version.ts";

export interface Deps {
  readStdin: () => Promise<string>;
  env: Record<string, string | undefined>;
  exec?: Exec;
  now?: () => Date;
  fileExists?: (path: string) => boolean;
  fs?: FsLike;
}

export async function main(deps: Deps): Promise<string> {
  if (deps.env["CLAUDE_VISOR_DISABLE"] === "1") return "";
  let raw: string;
  try {
    raw = await deps.readStdin();
  } catch {
    return "";
  }
  const payload = parsePayload(raw);
  const now = deps.now ? deps.now() : new Date();
  const style = makeStyle(deps.env);
  try {
    if (isSubagentPayload(payload)) return renderAgentRows(payload, style, now);
    const branch = deps.exec
      ? await gitBranch(deps.exec, payload.workspace?.current_dir)
      : undefined;
    const columns = Number(deps.env["COLUMNS"]) || 80;
    // The hook owns the release check; the render path only reads the marker.
    const dataDir =
      deps.env["CLAUDE_PLUGIN_DATA"] ??
      `${deps.env["HOME"]}/.claude/plugins/data/claude-visor-claude-visor`;
    const updateAvailable =
      deps.fileExists?.(`${dataDir}/update-available`) ?? false;
    const lines = [
      renderMainLine(payload, columns, now, branch, style, updateAvailable),
    ];
    // v2 lines are strictly additive: the kill switch is checked before any
    // transcript I/O, and any failure leaves line 1 exactly as v0 rendered it.
    if (
      deps.fs &&
      payload.transcript_path &&
      deps.env["CLAUDE_VISOR_NO_TRANSCRIPT"] !== "1"
    ) {
      try {
        const activity = turnTools(deps.fs, payload.transcript_path);
        const toolLine = activity && renderToolLine(activity, columns, style);
        if (toolLine) lines.push(toolLine);
      } catch {
        // silent degradation — never touch line 1
      }
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

if (import.meta.main) {
  if (process.argv.includes("--version")) {
    console.log(VERSION);
    process.exit(0);
  }
  const exec: Exec = async (file, args) =>
    (await promisify(execFile)(file, args)).stdout;
  // --bytecode compiles to CJS, where top-level await is unavailable.
  main({
    readStdin: () => new Response(Bun.stdin.stream()).text(),
    env: process.env,
    exec,
    now: () => new Date(),
    fileExists: nodeFs.existsSync,
    fs: nodeFs,
  }).then(
    (output) => {
      if (output) console.log(output);
      process.exit(0);
    },
    () => process.exit(0),
  );
}
