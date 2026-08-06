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

// The type is an assertion, not a guarantee: every segment renders inside its
// own guard and type-checks what it prints, so a mistyped field drops that
// segment instead of crashing the line.
export function parsePayload(raw: string): MainPayload {
  try {
    const json: unknown = JSON.parse(raw);
    return typeof json === "object" && json !== null
      ? (json as MainPayload)
      : {};
  } catch {
    return {};
  }
}
