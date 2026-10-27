/** Resolve a routed cwd without crossing the selected source root. */
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

/** Validate lexical and resolved directory containment, returning a slash-relative cwd. */
export async function resolveSourceCwd(root: string, checkRoot: string): Promise<string> {
  try {
    const directory = resolve(root, checkRoot);
    if (checkRoot.includes("\0") || !inside(root, directory)) throw new Error("Lexical cwd escapes source");
    const [actualRoot, actualDirectory] = await Promise.all([realpath(root), realpath(directory)]);
    if (!inside(actualRoot, actualDirectory) || !(await stat(actualDirectory)).isDirectory()) {
      throw new Error("Resolved cwd is not a contained directory");
    }
    return relative(root, directory).split(sep).join("/") || ".";
  } catch (cause) {
    throw new Error("Cannot establish a contained directory for check.root. Repair the directory or link and retry; keep the check local or declare an explicit input boundary for external files.", { cause });
  }
}

function inside(root: string, directory: string): boolean {
  const path = relative(root, directory);
  return !isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`);
}
