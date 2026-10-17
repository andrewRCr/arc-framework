/** Safe resubmission guidance for release-commit preflight failures. */

import { replaceCommitMessageSource, reusesCommitMessage } from "./commit-message-source.js";
import { renderReleaseCommitCommand } from "./commit-message-retry.js";

const MESSAGE_FILE = "<message-file>";

/**
 * Render a retry shape that cannot collide with unknown corrected message text: the commit's own arguments with a
 * prepared-file placeholder as their only message source. A reused message gets no such retry, since a prepared file
 * would drop the reused commit's author and date.
 *
 * @param args - The refused commit's argv; none renders the placeholder alone.
 * @param wrapperArgs - Leading wrapper metadata retained separately from Git arguments.
 * @returns Wrapper-only prepared-file retry guidance.
 */
export function renderCommitMessageRemedy(args: readonly string[] = [], wrapperArgs: readonly string[] = []): string {
  if (reusesCommitMessage(args)) {
    return [
      "`-C` and `-c` reuse a commit's author and date as well as its message, which a prepared file cannot carry.",
      "Run this commit from a terminal, or with raw `git commit`.",
    ].join("\n");
  }
  return [
    "Write the corrected message to a prepared file, then retry:",
    renderReleaseCommitCommand([...wrapperArgs, ...replaceCommitMessageSource(args, MESSAGE_FILE)], [MESSAGE_FILE]),
  ].join("\n");
}
