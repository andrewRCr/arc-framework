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

/** Current version of the load-set manifest vocabulary. */
export const LOAD_SET_MANIFEST_VERSION = 1;

/** Version of the load-set manifest vocabulary. */
export type LoadSetManifestVersion = typeof LOAD_SET_MANIFEST_VERSION;

/** Read discipline mirroring session-init Step 3's context-load modes. */
export type ReadMode =
  | { kind: "full" }
  | { kind: "partial-section"; heading: string }
  | { kind: "partial-strategic" };

/** One context document in the ordered load set. */
export interface LoadSetEntry {
  /** Path relative to the repository root. */
  path: string;
  /** How the document should be read during context-load. */
  readMode: ReadMode;
}

/** Ordered context set; entry order is read order. */
export interface LoadSetManifest {
  /** Serialized manifest vocabulary version. */
  manifestVersion: LoadSetManifestVersion;
  entries: LoadSetEntry[];
}
