import { describe, expect, test } from "bun:test";
import {
  countdown,
  FIVE_HOUR_SECONDS,
  paceDelta,
  SEVEN_DAY_SECONDS,
} from "../src/pace.ts";

const NOW = 1_800_000_000;

describe("paceDelta", () => {
  test("mid-window over pace: 62% used with 2h14m of 5h left is +7", () => {
    expect(paceDelta(62, NOW + 8040, FIVE_HOUR_SECONDS, NOW)).toBe(7);
  });

  test("mid-window under pace: 31% used with 57% of 7d left is -12", () => {
    expect(paceDelta(31, NOW + 344736, SEVEN_DAY_SECONDS, NOW)).toBe(-12);
  });

  test("just reset: expected usage is 0, delta equals usage", () => {
    expect(paceDelta(5, NOW + FIVE_HOUR_SECONDS, FIVE_HOUR_SECONDS, NOW)).toBe(
      5,
    );
  });

  test("nearly expired: expected usage approaches 100", () => {
    expect(paceDelta(50, NOW + 60, FIVE_HOUR_SECONDS, NOW)).toBe(-50);
  });

  test("resets_at in the past clamps to a fully elapsed window", () => {
    expect(paceDelta(80, NOW - 999, FIVE_HOUR_SECONDS, NOW)).toBe(-20);
  });

  test("resets_at beyond the window length clamps to just-reset", () => {
    expect(
      paceDelta(10, NOW + FIVE_HOUR_SECONDS * 2, FIVE_HOUR_SECONDS, NOW),
    ).toBe(10);
  });
});

describe("countdown", () => {
  test("hours and minutes", () => {
    expect(countdown(NOW + 8040, NOW)).toBe("2h14m");
  });

  test("minutes only under an hour", () => {
    expect(countdown(NOW + 540, NOW)).toBe("9m");
  });

  test("exact hour boundary", () => {
    expect(countdown(NOW + 3600, NOW)).toBe("1h0m");
  });

  test("past reset clamps to 0m", () => {
    expect(countdown(NOW - 10, NOW)).toBe("0m");
  });
});
