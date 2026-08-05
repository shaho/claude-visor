import { parsePayload } from "./stdin.ts";
import { renderMainLine } from "./render/main-line.ts";

export interface Deps {
  readStdin: () => Promise<string>;
  env: Record<string, string | undefined>;
  exec?: (file: string, args: string[]) => Promise<string>;
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
  try {
    return renderMainLine(payload, columns);
  } catch {
    return "";
  }
}

if (import.meta.main) {
  const output = await main({
    readStdin: () => new Response(Bun.stdin.stream()).text(),
    env: process.env,
    now: () => new Date(),
  });
  if (output) console.log(output);
  process.exit(0);
}
