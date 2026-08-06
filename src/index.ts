import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gitBranch, type Exec } from "./git.ts";
import { isSubagentPayload, parsePayload } from "./stdin.ts";
import { renderAgentRows } from "./render/agent-rows.ts";
import { renderMainLine } from "./render/main-line.ts";
import { makeStyle } from "./render/style.ts";
import { VERSION } from "./version.ts";

export interface Deps {
  readStdin: () => Promise<string>;
  env: Record<string, string | undefined>;
  exec?: Exec;
  now?: () => Date;
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
    return renderMainLine(payload, columns, now, branch, style);
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
  }).then(
    (output) => {
      if (output) console.log(output);
      process.exit(0);
    },
    () => process.exit(0),
  );
}
