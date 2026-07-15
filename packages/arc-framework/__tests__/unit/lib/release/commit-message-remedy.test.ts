/** Unit tests for harness-compatible preflight resubmission guidance. */

import { describe, expect, it } from "vitest";

import { renderCommitMessageRemedy } from "../../../../src/lib/release/commit-message-remedy.js";

const installedAt = "2026-07-14T00:00:00.000Z";

describe("renderCommitMessageRemedy", () => {
  it.each([
    { harnesses: [] },
    { harnesses: [{ name: "codex", mode: "default-prompt" as const, installedAt }] },
    { harnesses: [{ name: "unrecognized", mode: "default-prompt" as const, installedAt }] },
    { harnesses: [
      { name: "claude-code", mode: "default-prompt" as const, installedAt },
      { name: "codex", mode: "default-prompt" as const, installedAt },
    ] },
  ])("uses prepared-file argv unless every harness has verified heredoc support", ({ harnesses }) => {
    expect(renderCommitMessageRemedy(harnesses)).toContain("arc release commit -F <message-file>");
    expect(renderCommitMessageRemedy(harnesses)).not.toContain("<<");
  });

  it("uses a quoted heredoc after a compatible harness is recorded", () => {
    const remedy = renderCommitMessageRemedy([
      { name: "claude-code", mode: "default-prompt", installedAt },
    ]);

    expect(remedy).toContain("arc release commit -F - <<'ARC_COMMIT_MESSAGE'");
    expect(remedy).toContain("\nARC_COMMIT_MESSAGE");
  });
});
