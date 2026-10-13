/** Unit tests for harness-compatible preflight resubmission guidance. */

import { describe, expect, it } from "vitest";

import { renderCommitMessageRemedy } from "../../../../src/lib/release/commit-message-remedy.js";

describe("renderCommitMessageRemedy", () => {
  it("uses prepared-file argv because corrected message text is not yet available", () => {
    expect(renderCommitMessageRemedy()).toContain("arc release commit -F <message-file>");
    expect(renderCommitMessageRemedy()).not.toContain("<<");
  });

  it.each([["-C", "HEAD"], ["--reedit-message=HEAD", "-a"]])(
    "offers no prepared-file retry for a reused message, which also carries authorship (%s)",
    (...args) => {
      const remedy = renderCommitMessageRemedy(args);

      expect(remedy).toContain("reuse a commit's author and date as well as its message");
      expect(remedy).toContain("raw `git commit`");
      expect(remedy).not.toContain("<message-file>");
    },
  );

  it("keeps the refused commit's other arguments around the prepared-file placeholder", () => {
    expect(renderCommitMessageRemedy(["--amend", "--no-edit", "-m", "subject", "--", "file-a"]))
      .toContain("arc release commit --amend --no-edit -F <message-file> -- 'file-a'");
  });
});
