/**
 * Destructive-flag refusal lists and detection for the release commit
 * and push wrappers. Single source of truth — every refusal-taxonomy
 * code-12 callsite imports the lists from here.
 *
 * The push detector also recognizes the `+refspec` syntax (a leading `+`
 * on a refspec argv token, e.g., `+main:main`), which git treats as a
 * force-push regardless of the surrounding flag set.
 *
 * @module
 */

/**
 * Flags that `arc release commit` refuses unconditionally.
 *
 * - `--amend`: amends route through raw git; the wrapper is the
 *   single-decision point for new commits.
 * - `--allow-empty`: smell signal; raw git for empty-commit intent.
 * - `--no-verify`: bypasses pre-commit gates; refused here so the
 *   wrapper never lets a commit slip past hook validation.
 */
export const COMMIT_DESTRUCTIVE_FLAGS = [
  "--amend",
  "--allow-empty",
  "--no-verify",
] as const;

/**
 * Flags that `arc release push` refuses unconditionally. The `+refspec`
 * pattern is detected separately — see {@link PUSH_REFSPEC_FORCE_IDENTIFIER}.
 */
export const PUSH_DESTRUCTIVE_FLAGS = [
  "--force",
  "-f",
  "--force-with-lease",
  "--delete",
  "-d",
  "--mirror",
] as const;

/**
 * Canonical identifier returned by {@link detectPushDestructive} when an
 * argv element matches the `+refspec` force-push pattern. Stable string
 * for refusal-message construction — the literal argv element
 * (`+main:main`, `+feat:dev`, etc.) varies per invocation and isn't
 * useful as a lookup key.
 */
export const PUSH_REFSPEC_FORCE_IDENTIFIER = "+refspec";

/**
 * Return the matched commit-side destructive-flag identifier on first hit
 * across `argv`, or null when none match.
 */
export function detectCommitDestructive(argv: readonly string[]): string | null {
  for (const token of argv) {
    if ((COMMIT_DESTRUCTIVE_FLAGS as readonly string[]).includes(token)) {
      return token;
    }
  }
  return null;
}

/**
 * Return the matched push-side destructive-flag identifier on first hit
 * across `argv`, or null when none match. Recognizes the `+refspec`
 * pattern (any token whose first character is `+` and that has a body
 * after the `+`), returning {@link PUSH_REFSPEC_FORCE_IDENTIFIER}.
 */
export function detectPushDestructive(argv: readonly string[]): string | null {
  for (const token of argv) {
    if ((PUSH_DESTRUCTIVE_FLAGS as readonly string[]).includes(token)) {
      return token;
    }
    if (token.length > 1 && token.startsWith("+")) {
      return PUSH_REFSPEC_FORCE_IDENTIFIER;
    }
  }
  return null;
}
