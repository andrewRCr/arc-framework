/** Exact Git object-id validation for SHA-1 and SHA-256 repositories. */

export const GIT_OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

/** Return whether a value is one complete lowercase Git object id. */
export function isGitObjectId(value: string): boolean {
  return GIT_OBJECT_ID_PATTERN.test(value);
}
