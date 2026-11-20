/** Publish a returned file's rendering provenance before unlinking its aside alias. */
import { withProjectionEntry } from "./index-memory.js";
import { lstat } from "node:fs/promises";
import { commitProjectionIndex } from "./index-file.js";
import type { ProjectionIndex, RecordEntry } from "./index-schema.js";
import type { ArchiveChangeRefusal } from "./archive-selection.js";
import { finalizeAsideCopy, type AsideCopyDeletion } from "./stampless.js";
import { ArchiveDestinationBlocked } from "./archive-file.js";
import { removeReturnedAsideFile } from "./aside-cleanup.js";

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
  readonly onPublished?: (index: ProjectionIndex) => void;
  /** Takes a path whose alias the check just before the unlink found is not this checkout's; the alias is kept. */
  readonly refuseChange?: ArchiveChangeRefusal;
}): Promise<ProjectionIndex> {
  const published = await commitProjectionIndex(input);
  input.onPublished?.(published);
  let index = published;
  for (const { path, copy } of input.returned) {
    const entry = index.entries[path];
    if (entry?.kind !== "record" || !entry.copies.some(record => record.name === copy)) continue;
    const updated = await cleanReturnedAlias({ checkout: input.checkout, path, entry, copy, checkpoint: input.checkpoint }, input.refuseChange);
    if (updated !== entry) index = withProjectionEntry(index, path, updated);
  }
  return index === published ? published : commitProjectionIndex({ ...input, index });
}

async function cleanReturnedAlias(input: AsideCopyDeletion,
  refuseChange?: ArchiveChangeRefusal): Promise<RecordEntry> {
  const { checkout, path, copy, entry, checkpoint } = input;
  try {
    const outcome = await removeReturnedAsideFile(checkout, copy, path, checkpoint);
    return outcome === "retained" ? entry : await finalizeAsideCopy(input);
  } catch (error) {
    if (!(error instanceof ArchiveDestinationBlocked)) throw error;
    refuseChange?.({ path, copy, mark: error.mark });
    return entry;
  }
}
