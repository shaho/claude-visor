// Todo state from the task store (spec §3.2): one JSON file per todo at
// ~/.claude/tasks/<session_id>/<n>.json. Not a transcript — see transcript.ts.

export interface TodoFs {
  readdirSync(path: string): string[];
  readFileSync(path: string, encoding: "utf8"): string;
}

export interface TodoState {
  done: number;
  total: number;
  current: string; // first in_progress subject in file order, or ""
}

export function readTodos(fs: TodoFs, dir: string): TodoState | null {
  let files: string[];
  try {
    files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort((a, b) => parseInt(a) - parseInt(b));
  } catch {
    return null; // missing/unreadable dir
  }
  const state: TodoState = { done: 0, total: 0, current: "" };
  for (const file of files) {
    try {
      const todo = JSON.parse(fs.readFileSync(`${dir}/${file}`, "utf8"));
      state.total++;
      if (todo.status === "completed") state.done++;
      if (todo.status === "in_progress" && !state.current)
        state.current = String(todo.subject ?? "");
    } catch {
      // bad file — skip, never throw
    }
  }
  return state;
}
