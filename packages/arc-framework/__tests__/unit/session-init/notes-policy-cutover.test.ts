/** Notes policies retire only once operational state moves off branch. */
import { expect, it } from "vitest";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { inferRetiredSubdirs, inferSessionInitRecommendations } from "../../../src/lib/session-init/recommended-action.js";

it.each(["manual", "prompt", "always"] as const)("retires the %s notes pull policy while preserving the worktree setting", policy => {
  const store = createLifecycleHarness().store;
  const dirty = { state: "clean" as const, fileCount: 0 };
  for (const worktreePullPolicy of ["manual", "prompt"] as const) {
    const recommendation = inferSessionInitRecommendations({ stateOffBranch: store.capabilities.stateOffBranch,
      worktree: { state: "remote-ahead", ahead: 0, behind: 3, branch: "feature" },
      user: { identity: "alice", state: "remote-ahead", summary: "Notes ahead", detailLines: [], actionHint: null, shouldPromptToPull: true },
      worktreePullPolicy, notesPullPolicy: policy, dirty, supersession: null });
    expect(recommendation).toEqual({ worktree: worktreePullPolicy === "prompt"
      ? { recommendedAction: "prompt", recommendedPromptText: "Worktree: branch is behind origin by 3 commit(s).\nPull?" }
      : { recommendedAction: "surface", recommendedPromptText: "" },
    user: { recommendedAction: "skip", recommendedPromptText: "" }, recommendedCombinedPrompt: null });
  }
});
it.each(["manual", "prompt", "always"] as const)("retires the %s notes-load dispatch with lingering retired subdirectories", policy => {
  const store = createLifecycleHarness().store;
  expect(inferRetiredSubdirs({ candidates: [SlugSchema.parse("shipped")] }, policy,
    { state: "clean", fileCount: 0 }, store.capabilities.stateOffBranch)).toEqual({ recommendedAction: "skip", recommendedPromptText: "" });
});
