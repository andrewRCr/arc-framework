/**
 * Symbolic links on the paths an install writes — refused so no install write lands outside the repository.
 *
 * `arc init`, `arc update`, and `arc init --reconfigure` write ARC's files under `.arc/`. A write follows a symbolic
 * link at its own path or at any directory above it, so a linked `.arc/`, or a linked directory or file under it, would
 * send the write wherever the link points. ARC does not support either layout. Only components below the repository
 * root are read: the root, and the directories holding it, are the project's own arrangement.
 *
 * @module
 */

import { lstat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { UserFacingError } from "../errors.js";

/** What a path component holds, read without following a link there. */
type Component = "link" | "absent" | "present";

/** Read one component without following it; a missing entry, or a file where a directory belongs, is absent. */
async function readComponent(path: string): Promise<Component> {
  try {
    return (await lstat(path)).isSymbolicLink() ? "link" : "present";
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return "absent";
    throw err;
  }
}

/** The path's components below the repository root, outermost first and `/`-separated; none for a path outside it. */
function componentsBelow(root: string, path: string): string[] {
  const rel = relative(root, resolve(root, path));
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return [];
  const segments = rel.split(sep);
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}

/**
 * Find the symbolic links an install's writes would follow: at a written path, or at a directory above it, below the
 * repository root.
 *
 * @param root - Repository root
 * @param paths - Paths the install writes, absolute or relative to `root`
 * @returns Each linked component once, repository-relative and `/`-separated, in the order the writes reach it
 */
export async function findSymlinkedWritePaths(root: string, paths: readonly string[]): Promise<string[]> {
  const read = new Map<string, Component>();
  const linked: string[] = [];
  for (const path of paths) {
    for (const component of componentsBelow(root, path)) {
      let state = read.get(component);
      if (state === undefined) {
        state = await readComponent(resolve(root, component));
        read.set(component, state);
        if (state === "link") linked.push(component);
      }
      if (state !== "present") break;
    }
  }
  return linked;
}

/**
 * Build the refusal for an install that would write through a symbolic link.
 *
 * @param paths - Repository-relative paths that are symbolic links
 * @param command - The refusing command
 * @returns The user-facing refusal, naming each link and the remedy
 */
export function symlinkedWritePathsError(
  paths: readonly string[],
  command: "init" | "update" | "reconfigure",
): UserFacingError {
  const retry = command === "init" ? "arc init" : command === "update" ? "arc update" : "arc init --reconfigure";
  return new UserFacingError({
    code: "manifest.install-path-symlinked",
    whatHappened: `${command} would write through a symbolic link`,
    why: `These paths are symbolic links: ${paths.join(", ")}. ARC writes its files at or below them, so each write `
      + "would land wherever the link points. ARC does not support a linked .arc/ directory or a link inside it.",
    whatToDo: `Replace each link with a regular directory or file holding what it points to, then retry \`${retry}\`.`,
  });
}
