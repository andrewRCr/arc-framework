/** Discover projected files and symbolic links without following links or entering machine-local folders. */
import type { Stats } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE_LOCAL_PATHS } from "../registry.js";
import { isExcludedProjectionFile } from "./discovery-exclusions.js";
import { readProjectionLinkBoundary } from "./discovery-links.js";

/** Filesystem observations used by discovery, native unless a caller needs a fault or scheduling boundary. */
export interface ProjectionWalkFs {
  readonly lstat: (path: string) => Promise<Pick<Stats, "isDirectory" | "isFile" | "isSymbolicLink">>;
  readonly readdir: (path: string) => Promise<readonly string[]>;
}

/** Regular files eligible for inspection and links retained only for repair reporting. */
export interface ProjectionWalkResult {
  readonly files: readonly string[];
  readonly links: readonly string[];
}

function excludedFromDiscovery(path: string): boolean {
  if (isExcludedProjectionFile(path)) return true;
  const segments = path.split("/");
  return MACHINE_LOCAL_PATHS.some(rule => {
    const prefix = rule.root === "user" ? [".arc", "user"] : rule.root === "checkout" ? [] : null;
    if (prefix === null) return false;
    const pattern = [...prefix, ...rule.pattern.replace(/\/\*\*$/u, "").split("/")];
    return segments.length >= pattern.length && pattern.every((part, index) => (
      part === "*" || part === "<identity>" || part === segments[index]
    ));
  });
}

/** Walk each root by lstat, returning regular files and unfollowed links in stable order. */
export async function walkProjectionRoots(checkout: string, roots: readonly string[], fs: ProjectionWalkFs = { lstat, readdir }): Promise<ProjectionWalkResult> {
  const selected = roots.filter(path => !excludedFromDiscovery(path));
  const boundary = await readProjectionLinkBoundary(checkout, selected, fs);
  const pending = selected.filter(path => boundary(path) === null);
  const files: string[] = [];
  const links = [...new Set(selected.flatMap(path => {
    const link = boundary(path);
    return link === null ? [] : [link];
  }))];
  for (let path = pending.pop(); path !== undefined; path = pending.pop()) {
    if (excludedFromDiscovery(path)) continue;
    try {
      const stat = await fs.lstat(join(checkout, path));
      if (stat.isDirectory()) {
        for (const name of await fs.readdir(join(checkout, path))) pending.push(`${path}/${name}`);
      } else if (stat.isFile()) files.push(path);
      else if (stat.isSymbolicLink()) links.push(path);
    } catch (error) {
      if (!missingPath(error)) throw error;
    }
  }
  return { files: files.sort(), links: links.sort() };
}

function missingPath(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
}
