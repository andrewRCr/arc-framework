/** Safe resubmission guidance for release-commit preflight failures. */

/**
 * Render a retry shape that cannot collide with unknown corrected message text.
 *
 * @returns Wrapper-only prepared-file retry guidance.
 */
export function renderCommitMessageRemedy(): string {
  return [
    "Write the corrected message to a prepared file, then retry:",
    "arc release commit -F <message-file>",
  ].join("\n");
}
