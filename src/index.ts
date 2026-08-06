import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gitBranch, type Exec } from "./git.ts";
import { isSubagentPayload, parsePayload } from "./stdin.ts";
import { renderAgentRows } from "./render/agent-rows.ts";
import { renderMainLine } from "./render/main-line.ts";
import { makeStyle } from "./render/style.ts";

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
  if (isSubagentPayload(payload)) {
    try {
      return renderAgentRows(payload, style, now);
    } catch {
      return "";
    }
  }
  const columns = Number(deps.env["COLUMNS"]) || 80;
  const branch = deps.exec
    ? await gitBranch(deps.exec, payload.workspace?.current_dir)
    : undefined;
  try {
    return renderMainLine(payload, columns, now, branch, style);
  } catch {
    return "";
  }
}

if (import.meta.main) {
  const exec: Exec = async (file, args) =>
    (await promisify(execFile)(file, args)).stdout;
  const output = await main({
    readStdin: () => new Response(Bun.stdin.stream()).text(),
    env: process.env,
    exec,
    now: () => new Date(),
  });
  if (output) console.log(output);
  process.exit(0);
}
