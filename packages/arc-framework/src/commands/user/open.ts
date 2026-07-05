/**
 * Per-WU user workspace lifecycle: open a `user/{identity}/{wuName}/` subdir
 * and seed its SESSION-NOTES.md from the internal template. Companion
 * helpers surface stale-subdir collisions from prior WUs so the CLI handler
 * can run the defensive prompt before opening a new one.
 *
 * @module
 */

import { rm } from "node:fs/promises";
import { join } from "node:path";

import type { DirEntry } from "../../lib/git/index.js";
import { ensureDir } from "../../lib/template/index.js";
import type { UserIOContext, UserOpenOptions } from "./types.js";

/**
 * Open a per-WU user workspace subdir at `user/{identity}/{wuName}/`, seeding
 * `SESSION-NOTES.md` from the internal template when absent.
 *
 * Idempotent — an existing subdir and existing SESSION-NOTES are preserved so
 * repeat invocations against the same WU don't clobber in-flight edits.
 * Stale-subdir collisions with prior WUs are the caller's responsibility
 * to resolve (see {@link findStaleUserWuSubdirs}); this function operates
 * unconditionally on the target path.
 */
export async function runUserOpen(options: UserOpenOptions): Promise<void> {
  const { cwd, io, identity, wuName, internalTemplateDir, sessionNotesSeed } = options;
  const wuDir = join(cwd, ".arc", "user", identity, wuName);

  await ensureDir(wuDir, io.mkdir);

  const seedPath = join(wuDir, "SESSION-NOTES.md");
  if (await fileExists(io, seedPath)) {
    return;
  }
  const content =
    sessionNotesSeed
    ?? await io.readFile(join(internalTemplateDir, "user", "SESSION-NOTES.md"));
  await io.writeFile(seedPath, content);
}

async function fileExists(io: UserIOContext, path: string): Promise<boolean> {
  try {
    await io.readFile(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Enumerate immediate subdirectories under `user/{identity}/` that aren't the
 * target WU. Derived from the recursive `io.readDir` output by extracting
 * the first path segment of any entry that lives inside a subdir.
 *
 * Per R65c, the per-WU subdir contract is one active WU at a time; a
 * non-empty return signals a stale subdir from a prior WU that the handler
 * must resolve (typically via the defensive prompt) before opening a new one.
 * Empty subdirs aren't surfaced — `readDir` only walks files, so a
 * content-less stale subdir carries nothing to preserve and is safely ignored.
 */
export async function findStaleUserWuSubdirs(options: {
  cwd: string;
  io: UserIOContext;
  identity: string;
  wuName: string;
}): Promise<string[]> {
  const userDir = join(options.cwd, ".arc", "user", options.identity);
  const entries = await options.io.readDir(userDir);
  const subdirs = new Set<string>();
  for (const entry of entries) {
    const slash = entry.name.indexOf("/");
    if (slash === -1) continue;
    const segment = entry.name.slice(0, slash);
    if (segment !== options.wuName) {
      subdirs.add(segment);
    }
  }
  return Array.from(subdirs).sort();
}

/**
 * List the file contents of a per-WU user subdir for the inspect arm of the
 * defensive prompt. Returns entries in `readDir`'s shape — relative paths
 * from the subdir root.
 */
export async function listUserWuSubdirContents(options: {
  cwd: string;
  io: UserIOContext;
  identity: string;
  subdir: string;
}): Promise<DirEntry[]> {
  const targetDir = join(options.cwd, ".arc", "user", options.identity, options.subdir);
  return options.io.readDir(targetDir);
}

/**
 * Remove a stale per-WU user subdir recursively. Caller has already confirmed
 * removal via the defensive prompt.
 */
export async function removeStaleUserWuSubdir(options: {
  cwd: string;
  identity: string;
  subdir: string;
}): Promise<void> {
  const staleDir = join(options.cwd, ".arc", "user", options.identity, options.subdir);
  await rm(staleDir, { recursive: true, force: true });
}
