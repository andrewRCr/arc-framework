/**
 * Unit tests for the session-init recommended-action helper.
 *
 * Covers state×config×dirty-tree combinations across worktree and notes
 * channels, plus the combined-prompt composition rule.
 */

import { describe, it, expect } from "vitest";

import {
  inferSessionInitRecommendations,
  type NotesPullPolicy,
  type RecommendationInput,
  type WorktreePullPolicy,
} from "../../../src/lib/session-init/recommended-action.js";
import type { DirtyStateResult } from "../../../src/lib/git/dirty-state.js";
import type { WorktreeSyncStatusResult } from "../../../src/lib/git/worktree-sync.js";
import type { UserSessionInitStatusResult } from "../../../src/commands/user/types.js";

// --- Fixtures ---

function worktree(
  overrides: Partial<WorktreeSyncStatusResult> = {},
): WorktreeSyncStatusResult {
  return { state: "clean", ahead: 0, behind: 0, ...overrides };
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

  it("diverged → action=surface (Reconcile required)", () => {
    const result = inferSessionInitRecommendations(
      input({
        worktree: worktree({ state: "diverged", ahead: 1, behind: 2 }),
        user: user({ state: "clean" }),
      }),
    );
    expect(result.worktree.recommendedAction).toBe("surface");
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

  it("conflict + prompt → action=prompt with channel-named prompt text", () => {
    const result = inferSessionInitRecommendations(
      input({ user: user({ state: "conflict" }) }),
    );
    expect(result.user.recommendedAction).toBe("prompt");
    expect(result.user.recommendedPromptText).toContain("Notes");
    expect(result.user.recommendedPromptText).toContain("conflict");
  });

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
