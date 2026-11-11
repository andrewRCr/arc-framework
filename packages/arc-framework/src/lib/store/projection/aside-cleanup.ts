/** Remove spent aside files and their empty scaffolding without following links or deleting recovery directories. */
import { lstatSync, rmdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { ASIDE_FILES_ROOT, parseAsideFile } from "./aside.js";

const BENIGN = new Set(["ENOENT", "ENOTDIR", "ENOTEMPTY", "EEXIST", "EACCES", "EPERM"]);

/** Delete one spent file; only a recognized staged or aside name permits pruning its parent scaffolding. */
export async function removeProjectionAsideFile(checkout: string, location: string, checkpoint?: () => Promise<void>, pruneParents = true): Promise<void> {
  const absolute = isAbsolute(location) ? location : join(checkout, location);
  await checkpoint?.();
  await rm(absolute, { force: true });
  const local = relative(checkout, absolute).split(sep).join("/");
  if (pruneParents && parseAsideFile(local) !== undefined) await pruneAsideScaffold(checkout, local.slice(0, local.lastIndexOf("/")), checkpoint);
}

/** Prune only empty ordinary scaffold ancestors, stopping at the aside root, a recovery name, or any surviving data. */
export async function pruneAsideScaffold(checkout: string, directory: string, checkpoint?: () => Promise<void>): Promise<void> {
  if (directory !== ASIDE_FILES_ROOT && !directory.startsWith(`${ASIDE_FILES_ROOT}/`)) return;
  if (!ordinaryAncestors(checkout, directory)) return;
  for (let at = directory; at.length >= ASIDE_FILES_ROOT.length; at = at.slice(0, at.lastIndexOf("/"))) {
    if (parseAsideFile(at) !== undefined) return;
    await checkpoint?.();
    try { rmdirSync(join(checkout, at)); }
    catch (error) {
      if (BENIGN.has((error as NodeJS.ErrnoException).code ?? "")) return;
      throw error;
    }
  }
}

function ordinaryAncestors(checkout: string, directory: string): boolean {
  const parts = directory.split("/");
  for (let depth = 1; depth <= parts.length; depth++) {
    const path = parts.slice(0, depth).join("/");
    if (parts[depth - 1] === ".." || parseAsideFile(path) !== undefined) return false;
    try { if (!lstatSync(join(checkout, path)).isDirectory()) return false; }
    catch (error) {
      if (BENIGN.has((error as NodeJS.ErrnoException).code ?? "")) return false;
      throw error;
    }
  }
  return true;
}
