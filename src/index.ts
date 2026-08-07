import { execFile } from "node:child_process";
import * as nodeFs from "node:fs";
import { promisify } from "node:util";
import { gitBranch, type Exec } from "./git.ts";
import { isSubagentPayload, parsePayload } from "./stdin.ts";
import { renderAgentRows } from "./render/agent-rows.ts";
import { renderMainLine } from "./render/main-line.ts";
import { renderToolLine } from "./render/tool-line.ts";
import { renderTodoLine } from "./render/todo-line.ts";
import { makeStyle, palette } from "./render/style.ts";
import { sessionColor } from "./session-color.ts";
import { defaultTheme, resolveTheme } from "./theme.ts";
import { readTodos, type TodoFs } from "./todos.ts";
import { agentCurrentTool, turnTools, type FsLike } from "./transcript.ts";
import { checkConfig, PRESETS } from "./theme.ts";
import { VERSION } from "./version.ts";

export interface Deps {
  readStdin: () => Promise<string>;
  env: Record<string, string | undefined>;
  exec?: Exec;
  now?: () => Date;
  fileExists?: (path: string) => boolean;
  fs?: FsLike & TodoFs;
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
  // Theme resolution never throws and falls back per-field; render-path
  // warnings are ignored here (doctor and `check` surface them).
  const projectDir = isSubagentPayload(payload)
    ? undefined
    : payload.workspace?.current_dir;
  const theme = deps.fs
    ? resolveTheme({ fs: deps.fs, env: deps.env, projectDir }).theme
    : defaultTheme();
  const tint =
    !isSubagentPayload(payload) && payload.session_id
      ? sessionColor(payload.session_id, payload.workspace?.git_worktree ?? "")
      : palette.model;
  const style = makeStyle(deps.env, { theme, tint });
  try {
    if (isSubagentPayload(payload)) {
      const fs = deps.fs;
      const sidecarDir =
        fs &&
        payload.transcript_path &&
        deps.env["CLAUDE_VISOR_NO_TRANSCRIPT"] !== "1"
          ? `${payload.transcript_path.replace(/\.jsonl$/, "")}/subagents`
          : undefined;
      const agentTool =
        fs && sidecarDir
          ? (id: string) =>
              agentCurrentTool(fs, `${sidecarDir}/agent-${id}.jsonl`)
          : undefined;
      return renderAgentRows(payload, style, now, agentTool, theme);
    }
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
      renderMainLine(payload, columns, now, branch, style, updateAvailable, theme),
    ];
    // v2 lines are strictly additive: the kill switch is checked before any
    // transcript I/O, and any failure leaves line 1 exactly as v0 rendered it.
    if (deps.fs && deps.env["CLAUDE_VISOR_NO_TRANSCRIPT"] !== "1") {
      try {
        const activity = payload.transcript_path
          ? turnTools(deps.fs, payload.transcript_path)
          : null;
        const toolLine =
          activity && renderToolLine(activity, columns, style, theme);
        if (toolLine) lines.push(toolLine);
      } catch {
        // silent degradation — never touch line 1
      }
      try {
        const todos =
          payload.session_id && deps.env["HOME"]
            ? readTodos(
                deps.fs,
                `${deps.env["HOME"]}/.claude/tasks/${payload.session_id}`,
              )
            : null;
        const todoLine =
          todos && renderTodoLine(todos, columns, style, theme);
        if (todoLine) lines.push(todoLine);
      } catch {
        // silent degradation — never touch the lines above
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
  const [cmd, arg] = process.argv.slice(2);
  // §8 subcommands. `check`: warnings are the signal, exit 0 regardless —
  // config can't hard-fail. Only CLI misuse (no operand, unknown name) exits 1.
  if (cmd === "check") {
    if (!arg) {
      console.error("usage: claude-visor check <config.json>");
      process.exit(1);
    }
    for (const w of checkConfig(nodeFs, arg, process.env["HOME"])) {
      console.error(`warn: ${w}`);
    }
    process.exit(0);
  }
  if (cmd === "theme") {
    if (!arg) {
      const names = Object.keys(PRESETS);
      try {
        const dir = `${process.env["HOME"]}/.claude/claude-visor/themes`;
        for (const f of nodeFs.readdirSync(dir)) {
          if (f.endsWith(".json")) names.push(f.slice(0, -5));
        }
      } catch {
        // no user themes dir
      }
      console.log(names.join("\n"));
      process.exit(0);
    }
    const preset = PRESETS[arg];
    if (!preset) {
      console.error(
        `unknown theme "${arg}" — built-ins: ${Object.keys(PRESETS).join(", ")}`,
      );
      process.exit(1);
    }
    console.log(JSON.stringify(preset, null, 2));
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
