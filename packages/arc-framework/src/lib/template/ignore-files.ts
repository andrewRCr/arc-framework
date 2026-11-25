/** Preflight managed ignore outputs together, then install the fixed personal npm policy without overwriting it. */
import { lstat, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { UserFacingError } from "../errors.js";
import { atomicCreateFile } from "../fs.js";
import { findSymlinkedWritePaths } from "../manifest/symlinked.js";
import {
  PERSONAL_NPM_IGNORE, PERSONAL_NPM_IGNORE_CONTENT, readPersonalNpmIgnore, type IgnoreLstat,
} from "../personal-npm-ignore.js";
import type { MkdirFn, ReadFileFn, WriteFileFn } from "./files.js";

/** Additional setup boundaries; normal commands supply their existing create and directory operations. */
export interface IgnoreSetupIO {
  lstat?: IgnoreLstat;
  mkdir?: MkdirFn;
  exclusiveCreate?: WriteFileFn;
}

const nodeIgnoreLstat: IgnoreLstat = (path) => lstat(path, { bigint: true });

/** Validate the complete output set without writing, so commands can refuse before installing other files. */
export async function preflightIgnoreFiles(
  root: string, readFile: ReadFileFn, io: IgnoreSetupIO,
): Promise<"absent" | "accepted"> {
  const paths = [".gitignore", ".ignore", PERSONAL_NPM_IGNORE];
  const stat = io.lstat ?? nodeIgnoreLstat;
  const linked = await findSymlinkedWritePaths(root, paths, stat);
  if (linked.length > 0) throw unsafeIgnoreFiles(linked);
  const identities = new Set<string>();
  for (const path of paths) {
    try {
      const entry = await stat(join(root, path));
      const identity = entry.ino === 0 || entry.ino === 0n ? null : `${entry.dev}:${entry.ino}`;
      if (!entry.isFile() || entry.nlink > 1 || identity !== null && identities.has(identity)) {
        throw unsafeIgnoreFiles([path]);
      }
      if (identity !== null) identities.add(identity);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const policy = await readPersonalNpmIgnore(root, readFile, stat);
  if (policy === "conflict") throw conflictingNpmPolicy();
  return policy;
}

/** Refuse linked or aliased output files before any member is changed, and create only an absent npm policy. */
export async function prepareIgnoreFiles(root: string, readFile: ReadFileFn, io: IgnoreSetupIO): Promise<void> {
  if (await preflightIgnoreFiles(root, readFile, io) === "accepted") return;
  const stat = io.lstat ?? nodeIgnoreLstat;
  const target = join(root, PERSONAL_NPM_IGNORE);
  await (io.mkdir ?? mkdir)(dirname(target), { recursive: true });
  try {
    await (io.exclusiveCreate ?? atomicCreateFile)(target, PERSONAL_NPM_IGNORE_CONTENT);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (await readPersonalNpmIgnore(root, readFile, stat) !== "accepted") throw conflictingNpmPolicy();
  }
}

function unsafeIgnoreFiles(paths: readonly string[]): UserFacingError {
  return new UserFacingError({
    code: "ignore.unsafe-output",
    whatHappened: "ARC refused to write linked or aliased ignore files",
    why: `These output paths are not independent regular files: ${paths.join(", ")}. A write could replace another file's rules or contents.`,
    whatToDo: "Replace linked paths with independent regular files or directories, preserving their intended contents, then retry the command.",
  });
}

function conflictingNpmPolicy(): UserFacingError {
  return new UserFacingError({
    code: "ignore.npm-policy-conflict",
    whatHappened: `ARC refused conflicting ${PERSONAL_NPM_IGNORE}`,
    why: "The existing policy must be a regular file containing only blank/comment lines and at least one literal * line.",
    whatToDo: "Repair the policy or move it aside so ARC can create it, then retry the command. Existing contents were not overwritten.",
  });
}
