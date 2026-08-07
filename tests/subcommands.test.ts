import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkConfig, PRESETS, resolveTheme, type ThemeFs } from "../src/theme.ts";

const ENTRY = join(import.meta.dir, "..", "src", "index.ts");

function run(args: string[], env: Record<string, string> = {}) {
  const proc = Bun.spawnSync(["bun", ENTRY, ...args], {
    env: { ...process.env, ...env },
  });
  return {
    code: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

function fsWith(files: Record<string, string>): ThemeFs {
  return {
    readFileSync(path: string) {
      if (path in files) return files[path]!;
      const e = new Error(`ENOENT: ${path}`) as Error & { code: string };
      e.code = "ENOENT";
      throw e;
    },
  };
}

describe("checkConfig", () => {
  test("clean file yields no warnings", () => {
    const fs = fsWith({ "/c.json": JSON.stringify({ theme: "nord" }) });
    expect(checkConfig(fs, "/c.json")).toEqual([]);
  });

  test("one warning per problem, path-labelled", () => {
    const fs = fsWith({
      "/c.json": JSON.stringify({
        theme: "dracula",
        sparkles: true,
        segments: { main: [{ name: "model", fg: "not-a-color" }] },
      }),
    });
    expect(checkConfig(fs, "/c.json").sort()).toEqual(
      [
        '/c.json: unknown theme "dracula"; falling back to default',
        '/c.json: unknown key "sparkles" ignored',
        '/c.json: bad color "not-a-color" for model.fg; ignored',
      ].sort(),
    );
  });

  test("missing and malformed files warn instead of erroring", () => {
    expect(checkConfig(fsWith({}), "/nope.json")).toEqual([
      "/nope.json: file not found",
    ]);
    expect(checkConfig(fsWith({ "/bad.json": "{nope" }), "/bad.json")).toEqual([
      "/bad.json: not valid JSON; ignored",
    ]);
  });

  test("a theme name resolvable from the user themes dir is not unknown", () => {
    const home = "/home/u";
    const fs = fsWith({
      "/c.json": JSON.stringify({ theme: "mine" }),
      [`${home}/.claude/claude-visor/themes/mine.json`]: "{}",
    });
    expect(checkConfig(fs, "/c.json", home)).toEqual([]);
    expect(checkConfig(fs, "/c.json")).toEqual([
      '/c.json: unknown theme "mine"; falling back to default',
    ]);
  });
});

describe("check subcommand", () => {
  const scratch = mkdtempSync(join(tmpdir(), "visor-check-"));

  test("clean file: silent, exit 0", async () => {
    const path = `${scratch}/clean.json`;
    await Bun.write(path, JSON.stringify({ theme: "gruvbox" }));
    const { code, stdout, stderr } = run(["check", path]);
    expect(code).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toBe("");
  });

  test("problem file: warn: lines on stderr, still exit 0", async () => {
    const path = `${scratch}/dirty.json`;
    await Bun.write(path, JSON.stringify({ sparkles: 1, charset: "wingdings" }));
    const { code, stdout, stderr } = run(["check", path]);
    expect(code).toBe(0);
    expect(stdout).toBe("");
    const lines = stderr.trim().split("\n").sort();
    expect(lines).toEqual(
      [
        `warn: ${path}: unknown key "sparkles" ignored`,
        `warn: ${path}: unknown charset "wingdings"; keeping "unicode"`,
      ].sort(),
    );
  });

  test("missing file warns, exit 0; no operand is usage error, exit 1", () => {
    const missing = run(["check", "/no/such/file.json"]);
    expect(missing.code).toBe(0);
    expect(missing.stderr).toBe("warn: /no/such/file.json: file not found\n");
    const usage = run(["check"]);
    expect(usage.code).toBe(1);
  });
});

describe("theme subcommand", () => {
  test("prints a preset's JSON that round-trips to the identical theme", () => {
    const { code, stdout } = run(["theme", "nord"]);
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual(PRESETS["nord"]);
    // saved as a user theme, the printed JSON resolves identically to the preset
    const home = "/home/u";
    const viaFile = resolveTheme({
      fs: fsWith({ [`${home}/.claude/claude-visor/themes/nord.json`]: stdout }),
      env: { HOME: home, CLAUDE_VISOR_THEME: "nord" },
    });
    const embedded = resolveTheme({
      fs: fsWith({}),
      env: { HOME: home, CLAUDE_VISOR_THEME: "nord" },
    });
    expect(viaFile.warnings).toEqual([]);
    expect(viaFile.theme).toEqual(embedded.theme);
  });

  test("bare theme lists built-ins plus user themes", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "visor-themes-"));
    await Bun.write(`${scratch}/.claude/claude-visor/themes/mine.json`, "{}");
    const { code, stdout } = run(["theme"], { HOME: scratch });
    expect(code).toBe(0);
    const names = stdout.trim().split("\n");
    expect(names).toEqual([...Object.keys(PRESETS), "mine"]);
  });

  test("unknown name errors with the built-in list, exit 1", () => {
    const { code, stderr } = run(["theme", "dracula"]);
    expect(code).toBe(1);
    expect(stderr).toContain('unknown theme "dracula"');
    expect(stderr).toContain("nord");
  });
});

describe("stdin mode untouched", () => {
  test("no subcommand still renders from stdin", () => {
    const proc = Bun.spawnSync(["bun", ENTRY], {
      stdin: Buffer.from(JSON.stringify({ model: { display_name: "Fable 5" } })),
      env: { ...process.env, COLUMNS: "80", HOME: "/nonexistent-home" },
    });
    expect(proc.exitCode).toBe(0);
    expect(proc.stdout.toString()).toContain("Fable 5");
  });
});
