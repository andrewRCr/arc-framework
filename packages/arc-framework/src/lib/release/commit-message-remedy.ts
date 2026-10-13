/** Safe resubmission guidance for release-commit preflight failures. */

/**
 * Render a retry shape that cannot collide with unknown corrected message text.
 *
 * @param options - `amend` keeps the retry an amend rather than a new commit.
 * @returns Wrapper-only prepared-file retry guidance.
 */
export function renderCommitMessageRemedy(options: { amend?: boolean } = {}): string {
  return [
    "Write the corrected message to a prepared file, then retry:",
    `arc release commit ${options.amend === true ? "--amend " : ""}-F <message-file>`,
  ].join("\n");
}
