export interface RateLimitWindow {
  used_percentage: number;
  resets_at?: number;
}

export interface MainPayload {
  session_id?: string;
  model?: { display_name?: string };
  effort?: { level?: string };
  thinking?: { enabled?: boolean };
  workspace?: {
    current_dir?: string;
    git_worktree?: string;
    repo?: { name?: string };
  };
  cost?: { total_cost_usd?: number };
  context_window?: {
    used_percentage?: number | null;
    context_window_size?: number;
  };
  rate_limits?: {
    five_hour?: RateLimitWindow;
    seven_day?: RateLimitWindow;
  };
}

// Any field may be missing, null, or mistyped; a segment with bad data is
// simply absent, so parsing keeps whatever passes its type check and drops the rest.
export function parsePayload(raw: string): MainPayload {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof json !== "object" || json === null) return {};
  const o = json as Record<string, unknown>;
  const payload: MainPayload = {};

  if (typeof o["session_id"] === "string") {
    payload.session_id = o["session_id"];
  }

  const model = asObject(o["model"]);
  if (typeof model?.["display_name"] === "string") {
    payload.model = { display_name: model["display_name"] };
  }

  const effort = asObject(o["effort"]);
  if (typeof effort?.["level"] === "string") {
    payload.effort = { level: effort["level"] };
  }

  const thinking = asObject(o["thinking"]);
  if (typeof thinking?.["enabled"] === "boolean") {
    payload.thinking = { enabled: thinking["enabled"] };
  }

  const workspace = asObject(o["workspace"]);
  if (workspace) {
    const repo = asObject(workspace["repo"]);
    payload.workspace = {
      current_dir:
        typeof workspace["current_dir"] === "string"
          ? workspace["current_dir"]
          : undefined,
      git_worktree:
        typeof workspace["git_worktree"] === "string"
          ? workspace["git_worktree"]
          : undefined,
      repo:
        typeof repo?.["name"] === "string" ? { name: repo["name"] } : undefined,
    };
  }

  const cost = asObject(o["cost"]);
  if (typeof cost?.["total_cost_usd"] === "number") {
    payload.cost = { total_cost_usd: cost["total_cost_usd"] };
  }

  const ctx = asObject(o["context_window"]);
  if (ctx) {
    payload.context_window = {
      used_percentage:
        typeof ctx["used_percentage"] === "number"
          ? ctx["used_percentage"]
          : null,
      context_window_size:
        typeof ctx["context_window_size"] === "number"
          ? ctx["context_window_size"]
          : undefined,
    };
  }

  const limits = asObject(o["rate_limits"]);
  if (limits) {
    const fiveHour = parseWindow(limits["five_hour"]);
    const sevenDay = parseWindow(limits["seven_day"]);
    if (fiveHour || sevenDay) {
      payload.rate_limits = {
        ...(fiveHour && { five_hour: fiveHour }),
        ...(sevenDay && { seven_day: sevenDay }),
      };
    }
  }

  return payload;
}

function parseWindow(v: unknown): RateLimitWindow | undefined {
  const w = asObject(v);
  if (typeof w?.["used_percentage"] !== "number") return undefined;
  return {
    used_percentage: w["used_percentage"],
    resets_at: typeof w["resets_at"] === "number" ? w["resets_at"] : undefined,
  };
}

function asObject(v: unknown): Record<string, unknown> | undefined {
  return typeof v === "object" && v !== null
    ? (v as Record<string, unknown>)
    : undefined;
}
