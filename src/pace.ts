export const FIVE_HOUR_SECONDS = 5 * 3600;
export const SEVEN_DAY_SECONDS = 7 * 24 * 3600;

// Positive = burning faster than the window sustains, negative = headroom.
// Expected usage is the elapsed fraction of the window; the delta is how far
// actual usage runs ahead of or behind that line.
export function paceDelta(
  usedPercentage: number,
  resetsAt: number,
  windowSeconds: number,
  nowSeconds: number,
): number {
  const remaining = Math.min(windowSeconds, Math.max(0, resetsAt - nowSeconds));
  const expected = (1 - remaining / windowSeconds) * 100;
  return Math.round(usedPercentage - expected);
}

export function countdown(resetsAt: number, nowSeconds: number): string {
  const seconds = Math.max(0, resetsAt - nowSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h${minutes}m` : `${minutes}m`;
}
