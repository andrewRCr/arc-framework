/** Discover projected files and symbolic links without following links or entering machine-local folders. */
import { readdirSync, type Dirent } from "node:fs";
import { join } from "node:path";
import { isExcludedProjectionPath } from "./discovery-exclusions.js";
import { readProjectionLinkBoundary, type ProjectionLinkFs } from "./discovery-links.js";

/** Filesystem observations used by discovery, native unless a caller needs a fault or scheduling boundary. */
export interface ProjectionWalkFs {
  readonly readdir: (path: string) => readonly Pick<Dirent, "name" | "isDirectory" | "isFile" | "isSymbolicLink">[];
}

/** Regular files eligible for inspection and links retained only for repair reporting. */
export interface ProjectionWalkResult {
  readonly files: readonly string[];
  readonly links: readonly string[];
}

/** Enumerate typed folder entries without per-entry stats, yielding between folders for concurrent Git work. */
export async function walkProjectionRoots(checkout: string, roots: readonly string[],
  fs: ProjectionWalkFs = { readdir: path => readdirSync(path, { withFileTypes: true }) }, linkFs?: ProjectionLinkFs): Promise<ProjectionWalkResult> {
  const selected = roots.filter(path => !isExcludedProjectionPath(path));
  const boundary = await readProjectionLinkBoundary(checkout, selected, linkFs);
  const pending = selected.filter(path => boundary(path) === null);
  const files: string[] = [];
  const links = [...new Set(selected.flatMap(path => {
    const link = boundary(path);
    return link === null ? [] : [link];
  }))];
  const output = { pending, files, links };
  for (let path = pending.pop(); path !== undefined; path = pending.pop()) {
    if (isExcludedProjectionPath(path)) continue;
    try {
      collectEntries(path, fs.readdir(join(checkout, path)), output);
    } catch (error) {
      if (!missingPath(error)) throw error;
    }
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  return { files: files.sort(), links: links.sort() };
}

function collectEntries(path: string, entries: ReturnType<ProjectionWalkFs["readdir"]>,
  output: { pending: string[]; files: string[]; links: string[] }): void {
  for (const entry of entries) {
    const child = `${path}/${entry.name}`;
    if (isExcludedProjectionPath(child)) continue;
    if (entry.isDirectory()) output.pending.push(child);
    else if (entry.isFile()) output.files.push(child);
    else if (entry.isSymbolicLink()) output.links.push(child);
  }
}

function missingPath(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
}
