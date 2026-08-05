import { describe, expect, test } from "bun:test";
import { main, type Deps } from "../src/index.ts";
import { bar, emptyBar } from "../src/render/bar.ts";
import { bold, dim, fg, palette, separator } from "../src/render/style.ts";

const fixture = (name: string) =>
  Bun.file(new URL(`fixtures/${name}.json`, import.meta.url)).text();

const NOW = 1_800_000_000;

function deps(stdin: string | Promise<string>, env: Deps["env"] = {}): Deps {
  return {
    readStdin: () => Promise.resolve(stdin),
    env,
    now: () => new Date(NOW * 1000),
  };
}

describe("main line end to end", () => {
  test("43% renders green bar with model and effort", async () => {
    const out = await main(deps(await fixture("main-43"), { COLUMNS: "80" }));
    const expected =
      bold(fg(palette.model, "Fable 5")) +
      dim(" high") +
      separator +
      `${bar(43, 8)} ${fg(palette.green, "43%")}${dim("/200k")}`;
    expect(out).toBe(expected);
  });

  test("75% uses yellow, 90% uses red with 1M window", async () => {
    const at75 = await main(deps(await fixture("main-75"), { COLUMNS: "80" }));
    expect(at75).toContain(fg(palette.yellow, "75%"));
    const at90 = await main(deps(await fixture("main-90"), { COLUMNS: "80" }));
    expect(at90).toContain(fg(palette.red, "90%"));
    expect(at90).toContain(dim("/1M"));
  });

  test("wide terminal grows the bar to 14 cells", async () => {
    const out = await main(deps(await fixture("main-43"), { COLUMNS: "120" }));
    expect(out).toContain(bar(43, 14));
  });

  test("null used_percentage renders empty bar and –%", async () => {
    const out = await main(
      deps(await fixture("main-early"), { COLUMNS: "80" }),
    );
    expect(out).toContain(`${emptyBar(8)} ${dim("–%")}${dim("/200k")}`);
    expect(out).not.toContain("null");
  });
});

describe("pace segments", () => {
  test("both windows render used %, delta, and 5h countdown", async () => {
    const out = await main(deps(await fixture("main-pace"), { COLUMNS: "80" }));
    const fiveHour = `5h 62% ${fg(palette.red, "⇡7%")}${dim(" ⟳2h14m")}`;
    const sevenDay = `7d 31% ${fg(palette.green, "⇣12%")}`;
    expect(out).toContain(fiveHour + separator + sevenDay);
  });

  test("7d segment carries no countdown", async () => {
    const out = await main(deps(await fixture("main-pace"), { COLUMNS: "80" }));
    expect(out.split(separator).at(-1)).toBe(
      `7d 31% ${fg(palette.green, "⇣12%")}`,
    );
  });

  test("only five_hour present renders 5h alone", async () => {
    const out = await main(
      deps(await fixture("main-pace-5h-only"), { COLUMNS: "80" }),
    );
    expect(out).toContain("5h 12%");
    expect(out).not.toContain("7d");
  });

  test("payload without rate_limits renders no pace segments", async () => {
    const out = await main(deps(await fixture("main-43"), { COLUMNS: "80" }));
    expect(out).not.toContain("5h ");
    expect(out).not.toContain("7d ");
  });
});

describe("kill switch", () => {
  test("CLAUDE_VISOR_DISABLE=1 exits empty without reading stdin", async () => {
    let stdinRead = false;
    const out = await main({
      readStdin: () => {
        stdinRead = true;
        return Promise.resolve("{}");
      },
      env: { CLAUDE_VISOR_DISABLE: "1" },
    });
    expect(out).toBe("");
    expect(stdinRead).toBe(false);
  });
});

describe("malformed input", () => {
  test.each(["", "not json", "[1,2,3]", '{"model":', '{"model": 7}'])(
    "never throws on %j",
    async (raw) => {
      const out = await main(deps(raw));
      expect(typeof out).toBe("string");
    },
  );

  test("stdin read failure returns empty output", async () => {
    const out = await main({
      readStdin: () => Promise.reject(new Error("boom")),
      env: {},
    });
    expect(out).toBe("");
  });
});
