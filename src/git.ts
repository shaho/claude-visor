export type Exec = (file: string, args: string[]) => Promise<string>;

// Argument-array execFile only — never a shell, so no interpolation surface.
export async function gitBranch(
  exec: Exec,
  dir?: string,
): Promise<string | undefined> {
  const args = ["--no-optional-locks", "branch", "--show-current"];
  try {
    const out = await exec("git", dir ? ["-C", dir, ...args] : args);
    return out.trim() || undefined;
  } catch {
    return undefined;
  }
}
