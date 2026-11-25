/** Supersession narration distinguishes preserved commits from disposable working-tree edits. */

import { describe, expect, it } from "vitest";
import { dirtyState, supersessionResult, worktreeSync } from "../../helpers/session-init-fixtures.js";
import { composeSupersessionHead, inferSessionInitRecommendations } from "../../../src/lib/session-init/recommended-action.js";

const head = "Local commits are superseded by rebased equivalents on `origin/feat/work`; dropping them loses nothing.";
const warning = "Working tree dirty — the reset discards uncommitted changes; stash them first (a commit made now would be dropped too).";
const question = "Reset? `git reset --hard origin/feat/work`";

describe("superseded commit prompt", () => {
  it("exports the explanation shared by offers and orientation", () => {
    expect(composeSupersessionHead("feat/work")).toBe(head);
  });

  it.each([false, true])("composes the exact reset question with dirty=%s", dirty => {
    const result = inferSessionInitRecommendations({
      worktree: worktreeSync({ state: "diverged", ahead: 1, behind: 2, branch: "feat/work" }),
      user: null, worktreePullPolicy: "prompt", notesPullPolicy: "prompt",
      dirty: dirtyState({ state: dirty ? "dirty" : "clean", fileCount: dirty ? 1 : 0 }),
      supersession: supersessionResult({ superseded: true, supersededCommits: ["a".repeat(40)] }),
    });
    expect(result.worktree.recommendedAction).toBe("surface");
    expect(result.worktree.recommendedPromptText).toBe([head, ...(dirty ? [warning] : []), question].join("\n"));
  });
});
