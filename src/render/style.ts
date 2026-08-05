const ESC = "\x1b[";
const RESET = `${ESC}0m`;

export type Rgb = readonly [number, number, number];

export const palette = {
  model: [86, 182, 194] as Rgb,
  green: [123, 216, 143] as Rgb,
  yellow: [229, 192, 123] as Rgb,
  red: [244, 112, 103] as Rgb,
} as const;

export function fg([r, g, b]: Rgb, s: string): string {
  return `${ESC}38;2;${r};${g};${b}m${s}${RESET}`;
}

export function bold(s: string): string {
  return `${ESC}1m${s}${RESET}`;
}

export function dim(s: string): string {
  return `${ESC}2m${s}${RESET}`;
}

export const separator = dim(" │ ");
