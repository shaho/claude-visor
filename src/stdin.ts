export interface RateLimitWindow {
  used_percentage: number;
  resets_at?: number;
}

export interface MainPayload {
  model?: { display_name?: string };
  effort?: { level?: string };
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

  const model = asObject(o["model"]);
  if (typeof model?.["display_name"] === "string") {
    payload.model = { display_name: model["display_name"] };
  }

  const effort = asObject(o["effort"]);
  if (typeof effort?.["level"] === "string") {
    payload.effort = { level: effort["level"] };
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
