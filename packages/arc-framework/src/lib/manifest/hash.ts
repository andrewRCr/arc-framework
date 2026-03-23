/**
 * Content hashing for manifest integrity tracking.
 *
 * Used to compute pristine hashes during init and to detect file
 * modifications during status/update by comparing current vs stored hash.
 */

import { createHash } from "node:crypto";

/**
 * Compute the SHA-256 hex digest of a string.
 *
 * @param content - The content to hash
 * @returns Lowercase hex-encoded SHA-256 digest
 */
export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}
