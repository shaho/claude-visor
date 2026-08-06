const ESC = "\x1b[";

export type Rgb = readonly [number, number, number];

export const palette = {
  model: [86, 182, 194] as Rgb,
  green: [123, 216, 143] as Rgb,
  yellow: [229, 192, 123] as Rgb,
  red: [244, 112, 103] as Rgb,
} as const;

export interface Glyphs {
  filled: string;
  empty: string;
  barOpen: string;
  barClose: string;
  up: string;
  down: string;
  reset: string;
  branch: string;
  thinking: string;
  sep: string;
  noPct: string;
}

const NERD: Glyphs = {
  filled: "█",
  empty: "░",
  barOpen: "",
  barClose: "",
  up: "⇡",
  down: "⇣",
  reset: "⟳",
  branch: "",
  thinking: "☰",
  sep: " │ ",
  noPct: "–%",
};

const ASCII: Glyphs = {
  filled: "#",
  empty: "-",
  barOpen: "[",
  barClose: "]",
  up: "^",
  down: "v",
  reset: "~",
  branch: "git",
  thinking: "=",
  sep: " | ",
  noPct: "-%",
};

export interface Style {
  fg(color: Rgb, s: string): string;
  bold(s: string): string;
  dim(s: string): string;
  sep: string;
  glyphs: Glyphs;
}

type Depth = "none" | "16" | "256" | "truecolor";

export function makeStyle(env: Record<string, string | undefined>): Style {
  const glyphs = env["CLAUDE_VISOR_ASCII"] === "1" ? ASCII : NERD;
  const depth: Depth = env["NO_COLOR"]
    ? "none"
    : /^(truecolor|24bit)$/i.test(env["COLORTERM"] ?? "")
      ? "truecolor"
      : (env["TERM"] ?? "").includes("256")
        ? "256"
        : "16";
  const sgr = (code: string, s: string) =>
    s === "" || depth === "none" ? s : `${ESC}${code}m${s}${ESC}0m`;
  return {
    fg: (color, s) => sgr(fgCode(color, depth), s),
    bold: (s) => sgr("1", s),
    dim: (s) => sgr("2", s),
    sep: sgr("2", glyphs.sep),
    glyphs,
  };
}

function fgCode([r, g, b]: Rgb, depth: Depth): string {
  if (depth === "truecolor") return `38;2;${r};${g};${b}`;
  if (depth === "256") {
    const c = (v: number) => Math.round((v / 255) * 5);
    return `38;5;${16 + 36 * c(r) + 6 * c(g) + c(b)}`;
  }
  return String(nearest16([r, g, b]));
}

// xterm's default 16-color values; nearest by squared RGB distance.
const ANSI16: [number, Rgb][] = [
  [30, [0, 0, 0]],
  [31, [205, 49, 49]],
  [32, [13, 188, 121]],
  [33, [229, 229, 16]],
  [34, [36, 114, 200]],
  [35, [188, 63, 188]],
  [36, [17, 168, 205]],
  [37, [229, 229, 229]],
  [90, [102, 102, 102]],
  [91, [241, 76, 76]],
  [92, [35, 209, 139]],
  [93, [245, 245, 67]],
  [94, [59, 142, 234]],
  [95, [214, 112, 214]],
  [96, [41, 184, 219]],
  [97, [255, 255, 255]],
];

function nearest16([r, g, b]: Rgb): number {
  let best = 37;
  let min = Infinity;
  for (const [code, [cr, cg, cb]] of ANSI16) {
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (d < min) {
      min = d;
      best = code;
    }
  }
  return best;
}

export function visibleLength(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}
