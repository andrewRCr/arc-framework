/** Filesystem adapter for origin-keyed transition records. */

import { lstat, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { SlugSchema } from "../kernel/schema/slug.js";
import { serializeTransitionRecord, type TransitionRecord } from "./transition-record.js";

/** Repository-relative namespace for lean terminal transition history. */
export const TRANSITION_RECORD_NAMESPACE = ".arc/system/.internal/transitions";

/** Minimal filesystem boundary for creating the namespace and writing records. */
export interface TransitionRecordFs {
  lstat(path: string): Promise<{ isDirectory(): boolean; isSymbolicLink(): boolean }>;
  mkdir(path: string, options: { recursive: boolean }): Promise<unknown>;
  writeFile(path: string, content: string, options: { flag: "wx" }): Promise<void>;
}

/** Production transition-record filesystem adapter. */
export const nodeTransitionRecordFs: TransitionRecordFs = {
  lstat,
  mkdir,
  writeFile: (path, content, options) => writeFile(path, content, { encoding: "utf8", ...options }),
};

/** Resolve one transition record's repository-relative path. */
export function resolveTransitionRecordRelativePath(origin: string): string {
  const parsed = SlugSchema.safeParse(origin);
  if (!parsed.success) throw new Error("invalid transition record origin");
  return `${TRANSITION_RECORD_NAMESPACE}/${parsed.data}.json`;
}

/** Resolve one transition record's absolute path. */
export function resolveTransitionRecordPath(cwd: string, origin: string): string {
  return join(cwd, resolveTransitionRecordRelativePath(origin));
}

/** Exclusively write one validated transition record. */
export async function writeTransitionRecord(
  cwd: string,
  record: TransitionRecord,
  fs: TransitionRecordFs = nodeTransitionRecordFs,
): Promise<void> {
  const content = serializeTransitionRecord(record);
  const recordPath = resolveTransitionRecordPath(cwd, record.origin);
  for (const path of [
    join(cwd, ".arc"),
    join(cwd, ".arc", "system"),
    join(cwd, ".arc", "system", ".internal"),
    join(cwd, TRANSITION_RECORD_NAMESPACE),
  ]) {
    await ensureRealDirectory(path, fs);
  }
  await fs.writeFile(recordPath, content, { flag: "wx" });
}

async function ensureRealDirectory(path: string, fs: TransitionRecordFs): Promise<void> {
  try {
    const entry = await fs.lstat(path);
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new Error(`Transition record parent is not a real directory: ${path}`);
    }
  } catch (error) {
    if ((error as { code?: unknown }).code !== "ENOENT") throw error;
    try {
      await fs.mkdir(path, { recursive: false });
    } catch (mkdirError) {
      if ((mkdirError as { code?: unknown }).code !== "EEXIST") throw mkdirError;
      const entry = await fs.lstat(path);
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        throw new Error(`Transition record parent is not a real directory: ${path}`, { cause: mkdirError });
      }
    }
  }
}
