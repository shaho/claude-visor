import type { TodoState } from "../todos.ts";
import { defaultTheme, type ResolvedTheme } from "../theme.ts";
import { visibleLength, type Style } from "./style.ts";

const CELLS = 5;

// §5.2 todo line: mini progress bar + done/total + in-progress subject.
// Gated on open todos: none exist or all completed ⇒ no line.
export function renderTodoLine(
  todos: TodoState,
  columns: number,
  style: Style,
  theme: ResolvedTheme = defaultTheme(),
): string | undefined {
  if (todos.total === 0 || todos.done === todos.total) return undefined;
  const g = style.glyphs;
  const filled = Math.round((todos.done / todos.total) * CELLS);
  const progressFg =
    theme.segments.todo.find((s) => s.name === "progress")?.fg ?? null;
  const mini =
    (filled > 0 ? style.paint(progressFg, g.filled.repeat(filled)) : "") +
    (filled < CELLS ? style.dim(g.empty.repeat(CELLS - filled)) : "");
  const prefix = `${mini} ${style.dim(`${todos.done}/${todos.total}`)}`;
  const room = columns - visibleLength(prefix) - 1;
  let subject = todos.current;
  if (subject.length > room)
    subject =
      room > g.ellipsis.length
        ? subject.slice(0, room - g.ellipsis.length) + g.ellipsis
        : "";
  return subject ? `${prefix} ${subject}` : prefix;
}
