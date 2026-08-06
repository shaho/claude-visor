import { execFile } from "node:child_process";
import { gitBranch, type Exec } from "./git.ts";
import { parsePayload } from "./stdin.ts";
import { renderMainLine } from "./render/main-line.ts";

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
  const columns = Number(deps.env["COLUMNS"]) || 80;
  const now = deps.now ? deps.now() : new Date();
  const branch = deps.exec
    ? await gitBranch(deps.exec, payload.workspace?.current_dir)
    : undefined;
  try {
    return renderMainLine(payload, columns, now, branch);
  } catch {
    return "";
  }
}

if (import.meta.main) {
  const exec: Exec = (file, args) =>
    new Promise((resolve, reject) => {
      execFile(file, args, (err, stdout) =>
        err ? reject(err) : resolve(stdout),
      );
    });
  const output = await main({
    readStdin: () => new Response(Bun.stdin.stream()).text(),
    env: process.env,
    exec,
    now: () => new Date(),
  });
  if (output) console.log(output);
  process.exit(0);
}
