/** Discover projected regular files without following links or entering machine-local folders. */
import type { Stats } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE_LOCAL_PATHS } from "../registry.js";

/** Filesystem observations used by discovery, native unless a caller needs a fault or scheduling boundary. */
export interface ProjectionWalkFs {
  readonly lstat: (path: string) => Promise<Pick<Stats, "isDirectory" | "isFile">>;
  readonly readdir: (path: string) => Promise<readonly string[]>;
}

function machineLocal(path: string): boolean {
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

/** Walk each root by lstat, returning only regular file paths, in stable order. */
export async function walkProjectionRoots(checkout: string, roots: readonly string[], fs: ProjectionWalkFs = { lstat, readdir }): Promise<string[]> {
  const pending = [...roots];
  const files: string[] = [];
  for (let path = pending.pop(); path !== undefined; path = pending.pop()) {
    if (machineLocal(path)) continue;
    try {
      const stat = await fs.lstat(join(checkout, path));
      if (stat.isDirectory()) {
        for (const name of await fs.readdir(join(checkout, path))) pending.push(`${path}/${name}`);
      } else if (stat.isFile()) files.push(path);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
    }
  }
  return files.sort();
}
