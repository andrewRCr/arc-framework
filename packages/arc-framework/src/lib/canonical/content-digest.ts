/**
 * Canonical blob/content digests and the closed artifact-set / patch shapes.
 *
 * Content digests hash the exact canonical stored bytes — the Git tree or index
 * blob after clean filters, or a backend adapter's backing-store blob — never
 * checkout bytes, so CRLF settings and smudge filters cannot change a receipt.
 * The pure hashing is injectable: the adapter reads stored bytes and hands them
 * in, so tests supply bytes directly.
 */

import { canonicalDigest, type CanonicalDigest, digestBytes } from "./canonical-json.js";
import type { ManagedPath } from "./managed-path.js";

/**
 * Hash the exact canonical stored bytes of a file's content.
 *
 * @param bytes - The stored blob bytes (post clean-filter), supplied by the adapter
 * @returns The content's canonical digest
 */
export function contentDigest(bytes: Uint8Array): CanonicalDigest {
  return digestBytes(bytes);
}

/** A path's membership in an artifact set: present with its content digest, or absent. */
export type ArtifactSetEntry =
  | { path: ManagedPath; state: "present"; contentDigest: CanonicalDigest }
  | { path: ManagedPath; state: "absent" };

/** A single patch operation over one managed path. */
export type PatchOperation =
  | { operation: "write"; path: ManagedPath; contentDigest: CanonicalDigest }
  | { operation: "delete"; path: ManagedPath };

/**
 * Read the canonical stored blob bytes for a managed path, or `null` when the
 * path is absent from the projection.
 *
 * The current adapter reads the Git tree or index blob after clean filters; a
 * backend adapter reads the backing-store blob. Either way it returns stored
 * bytes, never checkout bytes.
 */
export type StoredBlobReader = (path: ManagedPath) => Uint8Array | null;

/**
 * Resolve a path's artifact-set entry from its stored bytes.
 *
 * @param path - The managed path to resolve
 * @param readBlob - Reader over stored blob bytes; `null` marks the path absent
 * @returns A present entry carrying the content digest, or an absent entry —
 *   an absent path never produces a zero-byte content digest
 */
export function resolveArtifactEntry(path: ManagedPath, readBlob: StoredBlobReader): ArtifactSetEntry {
  const bytes = readBlob(path);
  if (bytes === null) return { path, state: "absent" };
  return { path, state: "present", contentDigest: contentDigest(bytes) };
}

/**
 * Build a `write` patch operation from a path's stored bytes.
 *
 * @param path - The managed path being written
 * @param bytes - The stored bytes to be written at that path
 */
export function writeOperation(path: ManagedPath, bytes: Uint8Array): PatchOperation {
  return { operation: "write", path, contentDigest: contentDigest(bytes) };
}

/**
 * Build a `delete` patch operation for a path.
 *
 * @param path - The managed path being deleted
 */
export function deleteOperation(path: ManagedPath): PatchOperation {
  return { operation: "delete", path };
}

/**
 * Digest a complete patch write set ordered by managed path and operation.
 *
 * @param operations - Closed write/delete operations; each path may occur once
 * @returns Canonical digest of the deterministically ordered operation set
 */
export function patchDigest(operations: readonly PatchOperation[]): CanonicalDigest {
  const paths = new Set<string>();
  for (const operation of operations) {
    if (paths.has(operation.path)) throw new Error(`duplicate patch path: ${operation.path}`);
    paths.add(operation.path);
  }
  const sorted = [...operations].sort((left, right) => {
    const pathOrder = Buffer.compare(Buffer.from(left.path, "utf8"), Buffer.from(right.path, "utf8"));
    if (pathOrder !== 0) return pathOrder;
    return left.operation < right.operation ? -1 : left.operation > right.operation ? 1 : 0;
  });
  return canonicalDigest(sorted);
}
