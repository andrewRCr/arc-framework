/** Safe resubmission guidance for release-commit preflight failures. */

import type { HarnessEntry } from "./setup-marker.js";

/**
 * Select the safest documented message transport for recorded harness setup.
 *
 * @param harnesses - Harnesses recorded in the local setup marker.
 * @returns Wrapper-only retry guidance compatible with every recorded harness.
 */
export function renderCommitMessageRemedy(harnesses: readonly HarnessEntry[]): string {
  const heredocSupported = harnesses.length > 0
    && harnesses.every((entry) => entry.name === "claude-code");
  if (!heredocSupported) {
    return [
      "Write the corrected message to a prepared file, then retry:",
      "arc release commit -F <message-file>",
    ].join("\n");
  }
  return [
    "Retry with a quoted heredoc:",
    "arc release commit -F - <<'ARC_COMMIT_MESSAGE'",
    "<corrected commit message>",
    "ARC_COMMIT_MESSAGE",
  ].join("\n");
}
