import { describe, expect, test } from "bun:test";
import { main, type Deps } from "../src/index.ts";
import { visibleLength } from "../src/render/style.ts";

const NOW = 1_800_000_000;

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

// main-full (git, cost, thinking) + main-pace (rate limits): every segment on.
const fullPayload = async () => {
  const full = await Bun.file(
    new URL("fixtures/main-full.json", import.meta.url),
  ).json();
  const pace = await Bun.file(
    new URL("fixtures/main-pace.json", import.meta.url),
  ).json();
  return JSON.stringify({ ...full, rate_limits: pace.rate_limits });
};

function render(env: Deps["env"]): Promise<string> {
  return fullPayload().then((stdin) =>
    main({
      readStdin: () => Promise.resolve(stdin),
      env,
      exec: () => Promise.resolve("main\n"),
      now: () => new Date(NOW * 1000),
    }),
  );
}

describe("width ladder", () => {
  test("full-segment line fits 80 and 120 columns, measured without ANSI", async () => {
    for (const cols of [80, 120]) {
      const out = await render({ COLUMNS: String(cols), COLORTERM: "truecolor" });
      expect(visibleLength(out)).toBeLessThanOrEqual(cols);
    }
  });

  test("everything renders at 120 columns", async () => {
    const text = strip(
      await render({ COLUMNS: "120", COLORTERM: "truecolor" }),
    );
    for (const piece of ["Fable 5", "☰", "43%", "5h 62%", "7d 31%", "main", "claude-visor", "$4.12"]) {
      expect(text).toContain(piece);
    }
  });

  test("narrowing shrinks the bar to 4 cells first, then drops repo → cost → 7d → git, never overflowing", async () => {
    const cells = (text: string) => (text.match(/[█░]/g) ?? []).length;
    const gone = { repo: -1, cost: -1, sevenD: -1, git: -1 };
    const cellsAt: Record<number, number> = {};

    for (let cols = 130; cols >= 16; cols--) {
      const out = await render({
        COLUMNS: String(cols),
        COLORTERM: "truecolor",
      });
      expect(visibleLength(out)).toBeLessThanOrEqual(cols);
      const text = strip(out);
      cellsAt[cols] = cells(text);
      if (gone.repo === -1 && !text.includes("claude-visor")) gone.repo = cols;
      if (gone.cost === -1 && !text.includes("$")) gone.cost = cols;
      if (gone.sevenD === -1 && !text.includes("7d")) gone.sevenD = cols;
      if (gone.git === -1 && !text.includes("main")) gone.git = cols;
    }

    // Spec order, each drop strictly before the next as the terminal narrows.
    expect(gone.repo).toBeGreaterThan(gone.cost);
    expect(gone.cost).toBeGreaterThan(gone.sevenD);
    expect(gone.sevenD).toBeGreaterThan(gone.git);
    expect(gone.git).toBeGreaterThan(0);

    // Bar shrink precedes the first drop: at the last width with the repo
    // name, the bar is already at its 4-cell minimum; comfortable widths
    // keep the default cells.
    expect(cellsAt[gone.repo + 1]).toBe(4);
    expect(cellsAt[130]).toBe(14);
    expect(cellsAt[110]).toBe(8);
  });
});

describe("color ladder", () => {
  test("COLORTERM=truecolor emits 24-bit escapes", async () => {
    const out = await render({ COLUMNS: "200", COLORTERM: "truecolor" });
    expect(out).toContain("\x1b[38;2;");
  });

  test("256-color TERM without COLORTERM emits 256-color escapes only", async () => {
    const out = await render({ COLUMNS: "200", TERM: "xterm-256color" });
    expect(out).toContain("\x1b[38;5;");
    expect(out).not.toContain("\x1b[38;2;");
  });

  test("plain TERM falls back to 16-color codes", async () => {
    const out = await render({ COLUMNS: "200", TERM: "xterm" });
    expect(out).toMatch(/\x1b\[(3[0-7]|9[0-7])m/);
    expect(out).not.toContain("\x1b[38;");
  });

  test("NO_COLOR strips every escape but keeps text and glyphs", async () => {
    const colored = await render({ COLUMNS: "200", COLORTERM: "truecolor" });
    const plain = await render({
      COLUMNS: "200",
      COLORTERM: "truecolor",
      NO_COLOR: "1",
    });
    expect(plain).not.toContain("\x1b");
    expect(plain).toBe(strip(colored));
    expect(plain).toContain("░");
    expect(plain).toContain("☰");
  });
});

describe("ascii mode", () => {
  test("CLAUDE_VISOR_ASCII=1 output is pure ASCII and threshold-meaningful", async () => {
    const out = await render({
      COLUMNS: "200",
      CLAUDE_VISOR_ASCII: "1",
      NO_COLOR: "1",
    });
    expect(out).toMatch(/^[\x20-\x7e]*$/);
    expect(out).toContain("[######--------] 43%");
    expect(out).toContain("git main claude-visor");
    expect(out).toContain("^7%");
    expect(out).toContain("v12%");
    expect(out).toContain("~2h14m");
    expect(out).toContain(" | ");
  });

  test("ascii mode keeps color escapes when color is available", async () => {
    const out = await render({
      COLUMNS: "200",
      CLAUDE_VISOR_ASCII: "1",
      COLORTERM: "truecolor",
    });
    expect(strip(out)).toMatch(/^[\x20-\x7e]*$/);
    expect(out).toContain("\x1b[38;2;");
  });
});
