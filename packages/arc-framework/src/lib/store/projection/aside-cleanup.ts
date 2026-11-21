/** Remove spent aside files and their empty scaffolding without following links or deleting recovery directories. */
import { lstatSync, rmSync, rmdirSync, type BigIntStats } from "node:fs";
import { rm } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { ASIDE_FILES_ROOT, parseAsideFile } from "./aside.js";
import { archiveOperationError, requireArchiveDestination, sameArchiveFile } from "./archive-file.js";

/** The filesystem calls pruning makes, replaceable so a refusal can be exercised. */
export interface AsideScaffoldFs {
  readonly rmdir: (path: string) => void;
  readonly lstat: (path: string) => { isDirectory(): boolean };
}

const nativeScaffoldFs: AsideScaffoldFs = { rmdir: path => { rmdirSync(path); }, lstat: path => lstatSync(path) };

/** Delete one spent file; only a recognized staged or aside name permits pruning its parent scaffolding. */
export async function removeProjectionAsideFile(checkout: string, location: string, checkpoint?: () => Promise<void>, pruneParents = true,
  fs: AsideScaffoldFs = nativeScaffoldFs): Promise<void> {
  await checkpoint?.();
  await removeAsideFile(checkout, location, checkpoint, pruneParents, fs);
}

async function removeAsideFile(checkout: string, location: string, checkpoint?: () => Promise<void>, pruneParents = true,
  fs: AsideScaffoldFs = nativeScaffoldFs): Promise<void> {
  const absolute = isAbsolute(location) ? location : join(checkout, location);
  await rm(absolute, { force: true });
  if (pruneParents) await pruneRemovedAsideFile(checkout, absolute, checkpoint, fs);
}

async function pruneRemovedAsideFile(checkout: string, absolute: string, checkpoint?: () => Promise<void>,
  fs: AsideScaffoldFs = nativeScaffoldFs): Promise<void> {
  const local = relative(checkout, absolute).split(sep).join("/");
  if (parseAsideFile(local) !== undefined) await pruneAsideScaffold(checkout, local.slice(0, local.lastIndexOf("/")), checkpoint, fs);
}

/** Discard a recovered copy only while its archive destination still belongs to the checkout. */
export async function removeRecoveredAsideFile(checkout: string, location: string, path: string, checkpoint?: () => Promise<void>): Promise<void> {
  await checkpoint?.();
  requireArchiveDestination(checkout, path);
  await removeAsideFile(checkout, location, checkpoint);
}

/** Discard a returned alias only while both names still identify the same regular file at unlink. */
export async function removeReturnedAsideFile(checkout: string, location: string, path: string, checkpoint?: () => Promise<void>):
Promise<"removed" | "retained" | "missing"> {
  await checkpoint?.();
  requireArchiveDestination(checkout, path);
  const absolute = join(checkout, location);
  const aside = aliasStat(absolute);
  if (aside === undefined) return "missing";
  let target: BigIntStats | undefined;
  try { target = aliasStat(join(checkout, path)); }
  catch (error) { throw archiveOperationError(path, error, "inspect the returned copy for"); }
  if (!aside.isFile() || !target?.isFile() || !sameArchiveFile(aside, target)) return "retained";
  rmSync(absolute, { force: true });
  await pruneRemovedAsideFile(checkout, absolute, checkpoint);
  return "removed";
}

function aliasStat(path: string): BigIntStats | undefined {
  try { return lstatSync(path, { bigint: true, throwIfNoEntry: false }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOTDIR") return undefined;
    throw error;
  }
}

/**
 * Prune only empty ordinary scaffold ancestors, stopping at the aside root, a recovery name, or any surviving data.
 * Pruning is cosmetic: a filesystem refusal stops it and never fails the swap, sweep, or deletion that called it.
 */
export async function pruneAsideScaffold(checkout: string, directory: string, checkpoint?: () => Promise<void>,
  fs: AsideScaffoldFs = nativeScaffoldFs): Promise<void> {
  if (directory !== ASIDE_FILES_ROOT && !directory.startsWith(`${ASIDE_FILES_ROOT}/`)) return;
  if (!ordinaryAncestors(checkout, directory, fs)) return;
  for (let at = directory; at.length >= ASIDE_FILES_ROOT.length; at = at.slice(0, at.lastIndexOf("/"))) {
    if (parseAsideFile(at) !== undefined) return;
    await checkpoint?.();
    try { fs.rmdir(join(checkout, at)); }
    catch { return; }
  }
}

function ordinaryAncestors(checkout: string, directory: string, fs: AsideScaffoldFs): boolean {
  const parts = directory.split("/");
  for (let depth = 1; depth <= parts.length; depth++) {
    const path = parts.slice(0, depth).join("/");
    if (parts[depth - 1] === ".." || parseAsideFile(path) !== undefined) return false;
    try { if (!fs.lstat(join(checkout, path)).isDirectory()) return false; }
    catch { return false; }
  }
  return true;
}
