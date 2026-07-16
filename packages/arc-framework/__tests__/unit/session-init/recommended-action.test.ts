/**
 * Unit tests for the session-init recommended-action helper.
 *
 * Covers state×config×dirty-tree combinations across worktree and notes
 * channels, plus the combined-prompt composition rule.
 */

import { describe, it, expect } from "vitest";

import {
  inferBaseBranchSync,
  inferBaseDistance,
  inferRetiredSubdirs,
  inferSessionInitRecommendations,
  type BaseBranchSyncPullPolicy,
  type NotesLoadPolicy,
  type NotesPullPolicy,
  type RecommendationInput,
  type WorktreePullPolicy,
} from "../../../src/lib/session-init/recommended-action.js";
import type { DirtyStateResult } from "../../../src/lib/git/dirty-state.js";
import type { RetiredSubdirDetectionResult } from "../../../src/lib/session-init/retired-subdir-detection.js";
import type { WorktreeSyncStatusResult } from "../../../src/lib/git/worktree-sync.js";
import type { BaseDistanceStatusResult } from "../../../src/lib/git/base-distance.js";
import type { BaseBranchSyncStatusResult } from "../../../src/lib/git/base-branch-sync.js";
import type { UserSessionInitStatusResult } from "../../../src/commands/user/types.js";

function baseDistance(
  overrides: Partial<BaseDistanceStatusResult> = {},
): BaseDistanceStatusResult {
  return { state: "clean", ahead: 0, behind: 0, base: "main", overlappingPaths: [], ...overrides };
}

// --- Fixtures ---

function worktree(
  overrides: Partial<WorktreeSyncStatusResult> = {},
): WorktreeSyncStatusResult {
  return { state: "clean", ahead: 0, behind: 0, branch: "main", ...overrides };
}

function user(
  overrides: Partial<UserSessionInitStatusResult> = {},
): UserSessionInitStatusResult {
  return {
    identity: "andrew",
    state: "clean",
    summary: "andrew: session-init remote state clean",
    detailLines: [],
    actionHint: null,
    shouldPromptToPull: false,
    ...overrides,
  };
}

function dirty(state: "clean" | "dirty" = "clean"): DirtyStateResult {
  return { state, fileCount: state === "dirty" ? 1 : 0 };
}

function input(overrides: Partial<RecommendationInput> = {}): RecommendationInput {
  return {
    worktree: worktree(),
    user: user(),
    worktreePullPolicy: "prompt" as WorktreePullPolicy,
    notesPullPolicy: "prompt" as NotesPullPolicy,
    dirty: dirty(),
    supersession: null,
    ...overrides,
  };
}

// --- Worktree channel ---

describe("inferSessionInitRecommendations — worktree channel", () => {
  it("remote-ahead + prompt → action=prompt; prompt text names channel and includes count", () => {
    const result = inferSessionInitRecommendations(
      input({
        worktree: worktree({ state: "remote-ahead", behind: 3 }),
        user: user({ state: "clean" }),
      }),
    );
    expect(result.worktree.recommendedAction).toBe("prompt");
    expect(result.worktree.recommendedPromptText).toContain("Worktree");
    expect(result.worktree.recommendedPromptText).toContain("3");
    expect(result.worktree.recommendedPromptText).toContain("Pull?");
  });

  it("remote-ahead + manual → action=surface; prompt text empty", () => {
    const result = inferSessionInitRecommendations(
      input({
        worktree: worktree({ state: "remote-ahead", behind: 2 }),
        worktreePullPolicy: "manual",
        user: user({ state: "clean" }),
      }),
    );
    expect(result.worktree.recommendedAction).toBe("surface");
    expect(result.worktree.recommendedPromptText).toBe("");
  });

  it("remote-ahead + prompt + dirty tree → prompt text carries the stash-or-commit warning", () => {
    const result = inferSessionInitRecommendations(
      input({
        worktree: worktree({ state: "remote-ahead", behind: 1 }),
        user: user({ state: "clean" }),
        dirty: dirty("dirty"),
      }),
    );
    expect(result.worktree.recommendedAction).toBe("prompt");
    expect(result.worktree.recommendedPromptText).toContain(
      "Working tree dirty — stash or commit before accepting.",
    );
  });

  it.each([
    ["clean"],
    ["no-upstream"],
    ["detached-head"],
    ["no-remote"],
    ["skipped"],
  ] as const)("%s → action=skip", (state) => {
    const result = inferSessionInitRecommendations(
      input({ worktree: worktree({ state }), user: user({ state: "clean" }) }),
    );
    expect(result.worktree.recommendedAction).toBe("skip");
    expect(result.worktree.recommendedPromptText).toBe("");
  });

  it("local-ahead → action=surface (informational, not skipped)", () => {
    const result = inferSessionInitRecommendations(
      input({
        worktree: worktree({ state: "local-ahead", ahead: 2 }),
        user: user({ state: "clean" }),
      }),
    );
    expect(result.worktree.recommendedAction).toBe("surface");
  });

  it("diverged → action=surface (Reconcile required); no supersession → prompt text empty", () => {
    const result = inferSessionInitRecommendations(
      input({
        worktree: worktree({ state: "diverged", ahead: 1, behind: 2 }),
        user: user({ state: "clean" }),
      }),
    );
    expect(result.worktree.recommendedAction).toBe("surface");
    expect(result.worktree.recommendedPromptText).toBe("");
  });

  it("diverged + patch-equal supersession → action=surface; prompt text offers the lossless reset", () => {
    const result = inferSessionInitRecommendations(
      input({
        worktree: worktree({ state: "diverged", ahead: 2, behind: 3, branch: "feat/x" }),
        user: user({ state: "clean" }),
        supersession: { superseded: true, supersededCommits: ["a", "b"], novelCommits: [] },
      }),
    );
    expect(result.worktree.recommendedAction).toBe("surface");
    expect(result.worktree.recommendedPromptText).toContain("superseded");
    expect(result.worktree.recommendedPromptText).toContain("git reset --hard origin/feat/x");
  });

  it("diverged + genuine divergence (not superseded) → action=surface; prompt text empty (generic reconcile)", () => {
    const result = inferSessionInitRecommendations(
      input({
        worktree: worktree({ state: "diverged", ahead: 2, behind: 3, branch: "feat/x" }),
        user: user({ state: "clean" }),
        supersession: { superseded: false, supersededCommits: [], novelCommits: ["a", "b"] },
      }),
    );
    expect(result.worktree.recommendedAction).toBe("surface");
    expect(result.worktree.recommendedPromptText).toBe("");
  });

  it("remote-unavailable → action=surface", () => {
    const result = inferSessionInitRecommendations(
      input({
        worktree: worktree({ state: "remote-unavailable", failureReason: "timeout" }),
        user: user({ state: "clean" }),
      }),
    );
    expect(result.worktree.recommendedAction).toBe("surface");
  });

  it("branch-gone → action=surface (recovery is a state-keyed workflow arm, no prompt text)", () => {
    const result = inferSessionInitRecommendations(
      input({
        worktree: worktree({ state: "branch-gone" }),
        user: user({ state: "clean" }),
      }),
    );
    expect(result.worktree.recommendedAction).toBe("surface");
    expect(result.worktree.recommendedPromptText).toBe("");
  });
});

// --- Notes channel ---

describe("inferSessionInitRecommendations — notes channel", () => {
  it("remote-ahead + prompt → action=prompt with channel-named prompt text", () => {
    const result = inferSessionInitRecommendations(
      input({ user: user({ state: "remote-ahead" }) }),
    );
    expect(result.user.recommendedAction).toBe("prompt");
    expect(result.user.recommendedPromptText).toContain("Notes");
    expect(result.user.recommendedPromptText).toContain("Pull?");
  });

  it.each([["manual"], ["prompt"], ["always"]] as const)(
    "conflict + %s → action=surface without pull or prompt text",
    (policy) => {
      const result = inferSessionInitRecommendations(input({
        user: user({ state: "conflict", contentRelation: "conflicting" }),
        notesPullPolicy: policy,
      }));
      expect(result.user.recommendedAction).toBe("surface");
      expect(result.user.recommendedPromptText).toBe("");
    },
  );

  it("remote-ahead + always → action=pull; no prompt text", () => {
    const result = inferSessionInitRecommendations(
      input({
        user: user({ state: "remote-ahead" }),
        notesPullPolicy: "always",
      }),
    );
    expect(result.user.recommendedAction).toBe("pull");
    expect(result.user.recommendedPromptText).toBe("");
  });

  it("remote-ahead + manual → action=surface; no prompt text", () => {
    const result = inferSessionInitRecommendations(
      input({
        user: user({ state: "remote-ahead" }),
        notesPullPolicy: "manual",
      }),
    );
    expect(result.user.recommendedAction).toBe("surface");
    expect(result.user.recommendedPromptText).toBe("");
  });

  it("remote-unavailable → action=surface regardless of policy", () => {
    const result = inferSessionInitRecommendations(
      input({
        user: user({ state: "remote-unavailable" }),
        notesPullPolicy: "prompt",
      }),
    );
    expect(result.user.recommendedAction).toBe("surface");
  });

  it.each([["clean"], ["disabled"]] as const)("%s → action=skip", (state) => {
    const result = inferSessionInitRecommendations(
      input({ user: user({ state }) }),
    );
    expect(result.user.recommendedAction).toBe("skip");
  });

  it("clean + refState=local-ahead → action=surface (informational orientation; no pull)", () => {
    const result = inferSessionInitRecommendations(
      input({ user: user({ state: "clean", refState: "local-ahead" }) }),
    );
    expect(result.user.recommendedAction).toBe("surface");
    expect(result.user.recommendedPromptText).toBe("");
  });

  it("clean + diverged remote-subset → action=surface for informational orientation", () => {
    const result = inferSessionInitRecommendations(input({
      user: user({
        state: "clean",
        refState: "diverged",
        contentRelation: "remote-subset",
      }),
    }));
    expect(result.user.recommendedAction).toBe("surface");
    expect(result.user.recommendedPromptText).toBe("");
  });

  it("clean + refState=same → action=skip (disambiguates from local-ahead)", () => {
    const result = inferSessionInitRecommendations(
      input({ user: user({ state: "clean", refState: "same" }) }),
    );
    expect(result.user.recommendedAction).toBe("skip");
  });

  it.each([["manual"], ["prompt"], ["always"]] as const)(
    "clean + local-ahead stays surface regardless of notes policy (%s)",
    (policy) => {
      const result = inferSessionInitRecommendations(
        input({
          user: user({ state: "clean", refState: "local-ahead" }),
          notesPullPolicy: policy,
        }),
      );
      expect(result.user.recommendedAction).toBe("surface");
    },
  );

  it("clean + local-ahead stays surface even with dirty tree", () => {
    const result = inferSessionInitRecommendations(
      input({
        user: user({ state: "clean", refState: "local-ahead" }),
        dirty: dirty("dirty"),
      }),
    );
    expect(result.user.recommendedAction).toBe("surface");
    expect(result.user.recommendedPromptText).toBe("");
  });

  it("user=null (identity missing) → action=skip; no prompt text", () => {
    const result = inferSessionInitRecommendations(input({ user: null }));
    expect(result.user.recommendedAction).toBe("skip");
    expect(result.user.recommendedPromptText).toBe("");
  });

  it("dirty tree adds the stash-or-commit warning to the notes prompt text", () => {
    const result = inferSessionInitRecommendations(
      input({ user: user({ state: "remote-ahead" }), dirty: dirty("dirty") }),
    );
    expect(result.user.recommendedPromptText).toContain(
      "Working tree dirty — stash or commit before accepting.",
    );
  });
});

// --- Combined prompt ---

describe("inferSessionInitRecommendations — combined prompt", () => {
  it("both channels prompt → composes a per-channel offer with both lines", () => {
    const result = inferSessionInitRecommendations(
      input({
        worktree: worktree({ state: "remote-ahead", behind: 3 }),
        user: user({ state: "remote-ahead" }),
      }),
    );
    expect(result.worktree.recommendedAction).toBe("prompt");
    expect(result.user.recommendedAction).toBe("prompt");
    expect(result.recommendedCombinedPrompt).not.toBeNull();
    expect(result.recommendedCombinedPrompt).toContain("Worktree");
    expect(result.recommendedCombinedPrompt).toContain("Notes");
    expect(result.recommendedCombinedPrompt).toContain(
      "Pull both / worktree only / notes only / skip?",
    );
  });

  it("only one channel prompts → recommendedCombinedPrompt is null", () => {
    const result = inferSessionInitRecommendations(
      input({
        worktree: worktree({ state: "remote-ahead", behind: 1 }),
        user: user({ state: "clean" }),
      }),
    );
    expect(result.worktree.recommendedAction).toBe("prompt");
    expect(result.user.recommendedAction).toBe("skip");
    expect(result.recommendedCombinedPrompt).toBeNull();
  });

  it("neither channel prompts → recommendedCombinedPrompt is null", () => {
    const result = inferSessionInitRecommendations(input());
    expect(result.recommendedCombinedPrompt).toBeNull();
  });

  it("combined prompt carries the dirty-tree warning when applicable", () => {
    const result = inferSessionInitRecommendations(
      input({
        worktree: worktree({ state: "remote-ahead", behind: 2 }),
        user: user({ state: "remote-ahead" }),
        dirty: dirty("dirty"),
      }),
    );
    expect(result.recommendedCombinedPrompt).toContain(
      "Working tree dirty — stash or commit before accepting.",
    );
  });

  it("worktree manual mode + notes prompt → combined null; per-channel intact", () => {
    const result = inferSessionInitRecommendations(
      input({
        worktree: worktree({ state: "remote-ahead", behind: 1 }),
        worktreePullPolicy: "manual",
        user: user({ state: "remote-ahead" }),
      }),
    );
    expect(result.worktree.recommendedAction).toBe("surface");
    expect(result.user.recommendedAction).toBe("prompt");
    expect(result.recommendedCombinedPrompt).toBeNull();
  });
});

describe("inferBaseDistance — behind-base advisory", () => {
  it("remote-ahead (base moved under the branch) → surface with the merge-base advisory", () => {
    const result = inferBaseDistance(baseDistance({ state: "remote-ahead", behind: 4 }));
    expect(result.recommendedAction).toBe("surface");
    expect(result.recommendedPromptText).toContain("Base `main` has advanced 4 commit(s)");
    expect(result.recommendedPromptText).toContain("Merge the base in?");
    expect(result.recommendedPromptText).not.toMatch(/rebase/i);
  });

  it("diverged → surface", () => {
    const result = inferBaseDistance(baseDistance({ state: "diverged", ahead: 2, behind: 3 }));
    expect(result.recommendedAction).toBe("surface");
  });

  it("clean (at parity with the base) → skip, no prompt text", () => {
    const result = inferBaseDistance(baseDistance({ state: "clean" }));
    expect(result.recommendedAction).toBe("skip");
    expect(result.recommendedPromptText).toBe("");
  });

  it("local-ahead (branch ahead of an unmoved base) → skip", () => {
    const result = inferBaseDistance(baseDistance({ state: "local-ahead", ahead: 5 }));
    expect(result.recommendedAction).toBe("skip");
  });

  it("degraded states (no-remote / detached-head / skipped / remote-unavailable) → skip", () => {
    for (const state of ["no-remote", "detached-head", "skipped", "remote-unavailable"] as const) {
      expect(inferBaseDistance(baseDistance({ state })).recommendedAction).toBe("skip");
    }
  });

  it("null slot (probe failed) → skip", () => {
    expect(inferBaseDistance(null).recommendedAction).toBe("skip");
  });

  it("names overlapping paths and warns of merge conflict when sets intersect", () => {
    const result = inferBaseDistance(
      baseDistance({ state: "diverged", behind: 3, overlappingPaths: ["src/a.ts", "src/b.ts"] }),
    );
    expect(result.recommendedPromptText).toContain("Overlapping paths:");
    expect(result.recommendedPromptText).toContain("`src/a.ts`");
    expect(result.recommendedPromptText).toContain("merge may conflict");
    expect(result.recommendedPromptText).not.toMatch(/rebase/i);
  });

  it("collapses the overlap list to a sample plus a remainder count when long", () => {
    const result = inferBaseDistance(
      baseDistance({
        state: "diverged",
        behind: 1,
        overlappingPaths: ["a", "b", "c", "d", "e"],
      }),
    );
    expect(result.recommendedPromptText).toContain("(+2 more)");
  });

  it("states no overlap when the diverged changed-path sets are disjoint", () => {
    const result = inferBaseDistance(
      baseDistance({ state: "diverged", behind: 2, overlappingPaths: [] }),
    );
    expect(result.recommendedPromptText).toContain("No overlapping paths.");
  });
});

describe("inferBaseBranchSync — config-gated base-ref freshen", () => {
  function baseBranchSync(
    overrides: Partial<BaseBranchSyncStatusResult> = {},
  ): BaseBranchSyncStatusResult {
    return { state: "clean", ahead: 0, behind: 0, base: "main", ...overrides };
  }

  const policy = (p: BaseBranchSyncPullPolicy): BaseBranchSyncPullPolicy => p;

  it("always + behind & fast-forwardable → pull, no prompt text", () => {
    const result = inferBaseBranchSync(
      baseBranchSync({ state: "remote-ahead", behind: 3 }),
      policy("always"),
      dirty("clean"),
    );
    expect(result.recommendedAction).toBe("pull");
    expect(result.recommendedPromptText).toBe("");
  });

  it("prompt + behind & fast-forwardable → prompt with the fast-forward offer", () => {
    const result = inferBaseBranchSync(
      baseBranchSync({ state: "remote-ahead", behind: 3 }),
      policy("prompt"),
      dirty("clean"),
    );
    expect(result.recommendedAction).toBe("prompt");
    expect(result.recommendedPromptText).toContain("Local base `main` is behind `origin/main` by 3 commit(s)");
    expect(result.recommendedPromptText).toContain("Fast-forward base?");
  });

  it("manual + behind → surface only (advisory, no offer)", () => {
    const result = inferBaseBranchSync(
      baseBranchSync({ state: "remote-ahead", behind: 2 }),
      policy("manual"),
      dirty("clean"),
    );
    expect(result.recommendedAction).toBe("surface");
    expect(result.recommendedPromptText).not.toContain("Fast-forward base?");
  });

  it("diverged → surface + refuse, regardless of policy", () => {
    for (const p of ["manual", "prompt", "always"] as const) {
      const result = inferBaseBranchSync(
        baseBranchSync({ state: "diverged", ahead: 1, behind: 4 }),
        policy(p),
        dirty("clean"),
      );
      expect(result.recommendedAction).toBe("surface");
      expect(result.recommendedPromptText).toContain("not fast-forwardable");
    }
  });

  it("dirty tree → surface + refuse, even under always/prompt", () => {
    for (const p of ["always", "prompt"] as const) {
      const result = inferBaseBranchSync(
        baseBranchSync({ state: "remote-ahead", behind: 3 }),
        policy(p),
        dirty("dirty"),
      );
      expect(result.recommendedAction).toBe("surface");
      expect(result.recommendedPromptText).toContain("Working tree dirty");
    }
  });

  it("clean (base at parity) → skip", () => {
    const result = inferBaseBranchSync(baseBranchSync({ state: "clean" }), policy("prompt"), dirty("clean"));
    expect(result.recommendedAction).toBe("skip");
    expect(result.recommendedPromptText).toBe("");
  });

  it("local-ahead (local base carries unpushed commits) → skip", () => {
    const result = inferBaseBranchSync(
      baseBranchSync({ state: "local-ahead", ahead: 2 }),
      policy("always"),
      dirty("clean"),
    );
    expect(result.recommendedAction).toBe("skip");
  });

  it("degraded states (no-remote / skipped / remote-unavailable) → skip", () => {
    for (const state of ["no-remote", "skipped", "remote-unavailable"] as const) {
      expect(
        inferBaseBranchSync(baseBranchSync({ state }), policy("always"), dirty("clean")).recommendedAction,
      ).toBe("skip");
    }
  });

  it("null slot (probe failed) → skip", () => {
    expect(inferBaseBranchSync(null, policy("prompt"), dirty("clean")).recommendedAction).toBe("skip");
  });
});

describe("inferRetiredSubdirs — config-gated retired-subdir reconcile", () => {
  function retiredSubdirs(
    overrides: Partial<RetiredSubdirDetectionResult> = {},
  ): RetiredSubdirDetectionResult {
    return { candidates: ["old-wu"], ...overrides };
  }

  const policy = (p: NotesLoadPolicy): NotesLoadPolicy => p;

  it("candidates + always + clean → pull (auto-reconcile via arc user load)", () => {
    const result = inferRetiredSubdirs(retiredSubdirs(), policy("always"), dirty("clean"));
    expect(result.recommendedAction).toBe("pull");
    expect(result.recommendedPromptText).toBe("");
  });

  it("candidates + always + dirty → prompt (degrade to offer with the load warning)", () => {
    const result = inferRetiredSubdirs(retiredSubdirs(), policy("always"), dirty("dirty"));
    expect(result.recommendedAction).toBe("prompt");
    expect(result.recommendedPromptText).toContain("before loading");
    expect(result.recommendedPromptText).toContain("arc user load");
  });

  it("candidates + prompt → prompt (offer, no auto-run)", () => {
    const result = inferRetiredSubdirs(retiredSubdirs(), policy("prompt"), dirty("clean"));
    expect(result.recommendedAction).toBe("prompt");
    expect(result.recommendedPromptText).toContain("arc user load");
    expect(result.recommendedPromptText).not.toContain("before loading");
  });

  it("candidates + prompt + dirty → dirty-tree-aware offer", () => {
    const result = inferRetiredSubdirs(retiredSubdirs(), policy("prompt"), dirty("dirty"));
    expect(result.recommendedAction).toBe("prompt");
    expect(result.recommendedPromptText).toContain("before loading");
  });

  it("candidates + manual → surface (warn-only orientation, no run)", () => {
    const result = inferRetiredSubdirs(retiredSubdirs(), policy("manual"), dirty("clean"));
    expect(result.recommendedAction).toBe("surface");
    expect(result.recommendedPromptText).toBe("");
  });

  it("no candidates → skip regardless of policy", () => {
    for (const p of ["always", "prompt", "manual"] as const) {
      expect(
        inferRetiredSubdirs(retiredSubdirs({ candidates: [] }), policy(p), dirty("clean")).recommendedAction,
      ).toBe("skip");
    }
  });

  it("null slot (identity missing / probe failed) → skip", () => {
    expect(inferRetiredSubdirs(null, policy("always"), dirty("clean")).recommendedAction).toBe("skip");
  });

  it("names the candidate count in the offer text", () => {
    const result = inferRetiredSubdirs(
      retiredSubdirs({ candidates: ["a", "b"] }),
      policy("prompt"),
      dirty("clean"),
    );
    expect(result.recommendedPromptText).toContain("2");
  });
});
