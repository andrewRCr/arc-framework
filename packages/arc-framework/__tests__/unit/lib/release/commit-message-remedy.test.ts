/** Unit tests for harness-compatible preflight resubmission guidance. */

import { describe, expect, it } from "vitest";

import { renderCommitMessageRemedy } from "../../../../src/lib/release/commit-message-remedy.js";

describe("renderCommitMessageRemedy", () => {
  it("uses prepared-file argv because corrected message text is not yet available", () => {
    expect(renderCommitMessageRemedy()).toContain("arc release commit -F <message-file>");
    expect(renderCommitMessageRemedy()).not.toContain("<<");
  });
});
