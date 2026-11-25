/** Name a Commander command by its complete path for diagnostics and guards. */
import type { Command } from "commander";

/** Render the complete Commander path for a diagnostic. */
export function formatCommandPath(cmd: Command): string {
  const parts: string[] = [];
  let cur: Command | null = cmd;
  while (cur !== null) {
    parts.unshift(cur.name());
    cur = cur.parent;
  }
  return parts.join(" ");
}
