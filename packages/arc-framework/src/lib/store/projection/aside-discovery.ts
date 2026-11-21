/** Enumerate recovery names and completed scaffold visits without changing the aside tree. */
import { join } from "node:path";
import { ASIDE_FILES_ROOT, parseAsideFile } from "./aside.js";
import { readProjectionFolder, type ProjectionWalkFs, type WalkEntry } from "./engine-walk.js";
import { archiveOperationError } from "./archive-file.js";
import { readFile } from "node:fs/promises";
import { readStat } from "./change-detection.js";

/** Recovery names are opaque; directory events allow a writable consumer to prune on exit. */
export type ProjectionAsideVisit = { readonly kind: "copy" | "directory"; readonly location: string };

/** Walk typed entries without following directory links or entering an opaque recovery directory. */
export async function* walkProjectionAsideFolder(checkout: string, walkFs?: ProjectionWalkFs): AsyncGenerator<ProjectionAsideVisit> {
  const pending = [{ directory: ASIDE_FILES_ROOT, visited: false }];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const { directory } = next;
    if (next.visited) { yield { kind: "directory", location: directory }; continue; }
    const entries = asideDirectoryEntries(checkout, directory, walkFs);
    pending.push({ directory, visited: true });
    for (const entry of entries) {
      const location = `${directory}/${entry.name}`;
      const named = parseAsideFile(location);
      if (named?.role === "aside" || (named !== undefined && !entry.isDirectory())) yield { kind: "copy", location };
      if (named === undefined && entry.isDirectory()) pending.push({ directory: location, visited: false });
    }
    await new Promise<void>(resolve => setImmediate(resolve));
  }
}

/** One vanished entry never hides its siblings: the main walk's read keeps the surviving entries. */
function asideDirectoryEntries(checkout: string, directory: string, walkFs?: ProjectionWalkFs): readonly WalkEntry[] {
  // A named aside is listed even if typing it fails. Its consumer can bind the refusal to its destination.
  return readProjectionFolder(join(checkout, directory), walkFs, undefined, undefined,
    name => parseAsideFile(`${directory}/${name}`)?.role === "aside") ?? [];
}

/** Type a named recovery copy at the point its logical destination is known. */
export async function readAsideStat(absolute: string, path: string): ReturnType<typeof readStat> {
  try { return await readStat(absolute); }
  catch (error) { throw archiveOperationError(path, error, "inspect a copy of"); }
}

/** Read a named recovery copy's contents for comparison under the same destination hold. */
export async function readAsideText(absolute: string, path: string): Promise<string> {
  try { return await readFile(absolute, "utf8"); }
  catch (error) { throw archiveOperationError(path, error, "read a copy of"); }
}
