/** Git and system utilities without user-installed CLI search directories. */
import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";

/** Resolve the restricted environment used by hook CLI-absence fixtures. */
export async function restrictedGitPath(): Promise<string> {
  for (const raw of (process.env.PATH ?? "").split(delimiter)) {
    const entry = raw.replace(/^"(.*)"$/u, "$1");
    try {
      await access(join(entry, process.platform === "win32" ? "git.exe" : "git"));
      return [...new Set([entry, "/usr/bin", "/bin"])].join(delimiter);
    } catch { /* Continue to the next executable search directory. */ }
  }
  throw new Error("Git executable unavailable");
}
