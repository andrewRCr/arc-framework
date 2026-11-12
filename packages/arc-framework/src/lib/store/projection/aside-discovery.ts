/** Enumerate recovery names and completed scaffold visits without changing the aside tree. */
import { readdirSync, type Dirent } from "node:fs";
import { join } from "node:path";
import { ASIDE_FILES_ROOT, parseAsideFile } from "./aside.js";

/** Recovery names are opaque; directory events allow a writable consumer to prune on exit. */
export type ProjectionAsideVisit = { readonly kind: "copy" | "directory"; readonly location: string };

/** Walk typed entries without following directory links or entering an opaque recovery directory. */
export async function* walkProjectionAsideFolder(checkout: string): AsyncGenerator<ProjectionAsideVisit> {
  const pending = [{ directory: ASIDE_FILES_ROOT, visited: false }];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const { directory } = next;
    if (next.visited) { yield { kind: "directory", location: directory }; continue; }
    const entries = asideDirectoryEntries(checkout, directory);
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

function asideDirectoryEntries(checkout: string, directory: string): Dirent[] {
  try { return readdirSync(join(checkout, directory), { withFileTypes: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
