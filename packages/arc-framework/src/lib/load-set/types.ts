/**
 * Shared load-set manifest vocabulary.
 *
 * A load set is an ordered list of repository-relative context documents plus
 * the read discipline ARC should apply to each member. The vocabulary is shared
 * by the status probe envelope and compaction seed schema so neither surface
 * redefines the recovery/context-load contract.
 *
 * @module
 */
import { posix, win32 } from "node:path";

import { z } from "zod";

/** Current version of the load-set manifest vocabulary. */
export const LOAD_SET_MANIFEST_VERSION = 1;

/** Runtime authority for paths serialized in a load-set entry. */
export const LoadSetPathSchema = z.string().refine(isLoadSetPath, {
  error: "Load-set path must be canonical repository-relative or absolute",
});

const NON_EMPTY_TEXT = z.string().refine((value) => value.trim().length > 0, {
  error: "Value must contain non-whitespace text",
});

const FULL_READ_MODE_SHAPE = { kind: z.literal("full") };
const PARTIAL_SECTION_READ_MODE_SHAPE = {
  kind: z.literal("partial-section"),
  heading: NON_EMPTY_TEXT,
};
const PARTIAL_STRATEGIC_READ_MODE_SHAPE = { kind: z.literal("partial-strategic") };

/** Strict producer authority for the three context read disciplines. */
export const ReadModeSchema = z.discriminatedUnion("kind", [
  z.strictObject(FULL_READ_MODE_SHAPE),
  z.strictObject(PARTIAL_SECTION_READ_MODE_SHAPE),
  z.strictObject(PARTIAL_STRATEGIC_READ_MODE_SHAPE),
]);

/** Unknown-stripping reader variant derived from the producer field shapes. */
export const ReadModeReaderSchema = z.discriminatedUnion("kind", [
  z.object(FULL_READ_MODE_SHAPE),
  z.object(PARTIAL_SECTION_READ_MODE_SHAPE),
  z.object(PARTIAL_STRATEGIC_READ_MODE_SHAPE),
]);

const LOAD_SET_ENTRY_SHAPE = {
  path: LoadSetPathSchema,
  readMode: ReadModeSchema,
};

/** Strict producer authority for one ordered load-set entry. */
export const LoadSetEntrySchema = z.strictObject(LOAD_SET_ENTRY_SHAPE);

/** Recursively unknown-stripping reader authority for one entry. */
export const LoadSetEntryReaderSchema = z.object({
  ...LOAD_SET_ENTRY_SHAPE,
  readMode: ReadModeReaderSchema,
});

const LOAD_SET_MANIFEST_SHAPE = {
  manifestVersion: z.literal(LOAD_SET_MANIFEST_VERSION),
  entries: z.array(LoadSetEntrySchema),
};

/** Strict producer authority for the ordered load-set manifest. */
export const LoadSetManifestSchema = z.strictObject(LOAD_SET_MANIFEST_SHAPE);

/** Recursively unknown-stripping reader authority for persisted manifests. */
export const LoadSetManifestReaderSchema = z.object({
  ...LOAD_SET_MANIFEST_SHAPE,
  entries: z.array(LoadSetEntryReaderSchema),
});

/** Version of the load-set manifest vocabulary. */
export type LoadSetManifestVersion = z.infer<typeof LOAD_SET_MANIFEST_SHAPE.manifestVersion>;

/** Read discipline mirroring session-init Step 3's context-load modes. */
export type ReadMode = z.infer<typeof ReadModeSchema>;

/** One context document in the ordered load set. */
export type LoadSetEntry = z.infer<typeof LoadSetEntrySchema>;

/** Ordered context set; entry order is read order. */
export type LoadSetManifest = z.infer<typeof LoadSetManifestSchema>;

function isLoadSetPath(value: string): boolean {
  if (value.length === 0 || value.includes("\0")) return false;
  if (isRepositoryRelativePath(value)) return true;
  if (value.startsWith("/")) return posix.normalize(value) === value;
  if (/^[A-Za-z]:\\/u.test(value) || value.startsWith("\\\\")) {
    return win32.normalize(value) === value;
  }
  return false;
}

function isRepositoryRelativePath(value: string): boolean {
  if (
    value.includes("\\")
    || value.startsWith("/")
    || value.startsWith("//")
    || /^[A-Za-z]:/u.test(value)
    || posix.normalize(value) !== value
  ) {
    return false;
  }
  return !value.split("/").some((segment) =>
    segment.length === 0 || segment === "." || segment === "..");
}
