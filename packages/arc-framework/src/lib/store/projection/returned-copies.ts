/** Publish a returned file's rendering provenance before unlinking its aside alias. */
import { withProjectionEntry } from "./index-memory.js";
import { commitProjectionIndex } from "./index-file.js";
import type { ProjectionIndex } from "./index-schema.js";
import { removeReturnedAsideFile } from "./aside-cleanup.js";
import { finalizeAsideCopy } from "./stampless.js";

/** One returned alias whose record stays until its restored path mapping is published. */
export interface ReturnedCopy { readonly path: string; readonly copy: string }

/** Publish restored mappings, clean up proved returned aliases, then publish the removed copy records. */
export async function commitReturnedCopies(input: Parameters<typeof commitProjectionIndex>[0] & {
  readonly returned: readonly ReturnedCopy[];
  readonly onPublished?: (index: ProjectionIndex) => void;
}): Promise<ProjectionIndex> {
  const published = await commitProjectionIndex(input);
  input.onPublished?.(published);
  let index = published;
  for (const { path, copy } of input.returned) {
    const entry = index.entries[path];
    if (entry?.kind !== "record" || !entry.copies.some(record => record.name === copy)) continue;
    if (await removeReturnedAsideFile(input.checkout, copy, path, input.checkpoint) === "retained") continue;
    index = withProjectionEntry(index, path, await finalizeAsideCopy({ checkout: input.checkout, path, entry, copy }));
  }
  return index === published ? published : commitProjectionIndex({ ...input, index });
}
