/**
 * Managed-path validation for the canonical digest trust core.
 *
 * A managed path is a repository-relative POSIX path safe to place in a digest
 * or hand to the filesystem. Validation is a total gate: a hostile or ambiguous
 * path is rejected before it can reach hashing, never silently repaired. Unlike
 * canonical string values, a non-NFC path is rejected rather than normalized —
 * silent repair would let two spellings of one path address the same record.
 */

/** A validated repository-relative POSIX path. */
export type ManagedPath = string & { readonly __brand: "ManagedPath" };

/**
 * Validate a repository-relative POSIX path.
 *
 * @param path - A candidate repository-relative POSIX path
 * @returns The same string, branded as a {@link ManagedPath}
 * @throws If the path is empty, absolute, contains `.`/`..` or empty segments,
 *   backslashes, NUL bytes, or a non-NFC form
 */
export function validateManagedPath(path: string): ManagedPath {
  if (path.length === 0) throw new Error("managed path: must be a non-empty string");
  if (path.includes("\0")) throw new Error("managed path: NUL byte is not allowed");
  if (path.includes("\\")) {
    throw new Error("managed path: backslashes are not allowed; use POSIX separators");
  }
  if (path.normalize("NFC") !== path) {
    throw new Error("managed path: must be NFC-normalized (non-NFC forms are rejected, not repaired)");
  }
  if (path.startsWith("/") || /^[A-Za-z]:/u.test(path)) {
    throw new Error(`managed path: must be repository-relative, not absolute: "${path}"`);
  }
  for (const segment of path.split("/")) {
    if (segment.length === 0) {
      throw new Error(`managed path: empty path segment is not allowed: "${path}"`);
    }
    if (segment === "." || segment === "..") {
      throw new Error(`managed path: "." and ".." segments are not allowed: "${path}"`);
    }
  }
  return path as ManagedPath;
}

/** Narrow a string to a well-formed {@link ManagedPath}. */
export function isManagedPath(path: string): path is ManagedPath {
  try {
    validateManagedPath(path);
    return true;
  } catch {
    return false;
  }
}
