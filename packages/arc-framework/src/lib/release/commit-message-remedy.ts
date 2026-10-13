/** Safe resubmission guidance for release-commit preflight failures. */

import { replaceCommitMessageSource } from "./commit-message-source.js";
import { renderReleaseCommitCommand } from "./commit-message-retry.js";

const MESSAGE_FILE = "<message-file>";

/**
 * Render a retry shape that cannot collide with unknown corrected message text: the commit's own arguments with a
 * prepared-file placeholder as their only message source.
 *
 * @param args - The refused commit's argv; none renders the placeholder alone.
 * @returns Wrapper-only prepared-file retry guidance.
 */
export function renderCommitMessageRemedy(args: readonly string[] = []): string {
  return [
    "Write the corrected message to a prepared file, then retry:",
    renderReleaseCommitCommand(replaceCommitMessageSource(args, MESSAGE_FILE), [MESSAGE_FILE]),
  ].join("\n");
}
