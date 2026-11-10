/** Publish a returned file's rendering provenance before unlinking its aside alias. */
import { withProjectionEntry } from "./index-memory.js";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { commitProjectionIndex } from "./index-file.js";
import type { ProjectionIndex } from "./index-schema.js";
import { readStat } from "./change-detection.js";
import { deleteAsideCopy, finalizeAsideCopy } from "./stampless.js";

/** One returned alias whose record stays until its restored path mapping is published. */
export interface ReturnedCopy { readonly path: string; readonly copy: string }

/** Prove two names currently refer to the same regular file without following a final symbolic link. */
export async function sameProjectionFile(left: string, right: string): Promise<boolean> {
  try {
    const [a, b] = await Promise.all([lstat(left, { bigint: true }), lstat(right, { bigint: true })]);
    return a.isFile() && b.isFile() && a.dev === b.dev && a.ino === b.ino;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw error;
  }
}

/** Publish restored mappings, clean up proved returned aliases, then publish the removed copy records. */
export async function commitReturnedCopies(input: Parameters<typeof commitProjectionIndex>[0] & {
  readonly returned: readonly ReturnedCopy[];
}): Promise<ProjectionIndex> {
  const published = await commitProjectionIndex(input);
  let index = published;
  for (const { path, copy } of input.returned) {
    const entry = index.entries[path];
    if (entry?.kind !== "record" || !entry.copies.some(record => record.name === copy)) continue;
    const at = join(input.checkout, copy);
    const exists = await readStat(at) !== null;
    if (exists && !await sameProjectionFile(at, join(input.checkout, path))) continue;
    const updated = exists
      ? await deleteAsideCopy({ checkout: input.checkout, path, entry, copy, checkpoint: input.checkpoint })
      : await finalizeAsideCopy({ checkout: input.checkout, path, entry, copy });
    index = withProjectionEntry(index, path, updated);
  }
  return index === published ? published : commitProjectionIndex({ ...input, index });
}
