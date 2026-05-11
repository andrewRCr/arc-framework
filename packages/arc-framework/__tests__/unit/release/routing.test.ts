/**
 * Unit tests for release-wrapper routing classification.
 *
 * The resolver is pure logic over the resolved release-wrappers opt-in flag
 * and interlock values; status envelopes and workflow docs consume this
 * output instead of re-deriving routing rules at each fire site.
 */

import { describe, expect, it } from "vitest";

import { resolveReleaseRouting } from "../../../src/lib/release/routing.js";

describe("resolveReleaseRouting", () => {
  it("returns raw for every class when release wrappers are disabled", () => {
    const result = resolveReleaseRouting({
      releaseOptedIn: false,
      commitInterlock: "on-workflow",
      pushInterlock: "on-workflow",
    });

    expect(result).toEqual({
      taskCommit: "raw",
      workflowCommit: "raw",
      workflowPush: "raw",
      rationale: {
        releaseOptedIn: false,
        commitInterlock: "on-workflow",
        pushInterlock: "on-workflow",
      },
    });
  });

  it("keeps commit classes raw when commit interlock is manual", () => {
    const result = resolveReleaseRouting({
      releaseOptedIn: true,
      commitInterlock: "manual",
      pushInterlock: "manual",
    });

    expect(result.taskCommit).toBe("raw");
    expect(result.workflowCommit).toBe("raw");
  });

  it("routes task commits through the wrapper under on-task-approval", () => {
    const result = resolveReleaseRouting({
      releaseOptedIn: true,
      commitInterlock: "on-task-approval",
      pushInterlock: "manual",
    });

    expect(result.taskCommit).toBe("wrapper");
    expect(result.workflowCommit).toBe("raw");
  });

  it("routes task and workflow commits through the wrapper under on-workflow", () => {
    const result = resolveReleaseRouting({
      releaseOptedIn: true,
      commitInterlock: "on-workflow",
      pushInterlock: "manual",
    });

    expect(result.taskCommit).toBe("wrapper");
    expect(result.workflowCommit).toBe("wrapper");
  });

  it("keeps workflow pushes raw under manual and on-sync", () => {
    expect(
      resolveReleaseRouting({
        releaseOptedIn: true,
        commitInterlock: "manual",
        pushInterlock: "manual",
      }).workflowPush,
    ).toBe("raw");
    expect(
      resolveReleaseRouting({
        releaseOptedIn: true,
        commitInterlock: "manual",
        pushInterlock: "on-sync",
      }).workflowPush,
    ).toBe("raw");
  });

  it("routes workflow pushes through the wrapper only under push on-workflow", () => {
    const result = resolveReleaseRouting({
      releaseOptedIn: true,
      commitInterlock: "manual",
      pushInterlock: "on-workflow",
    });

    expect(result.workflowPush).toBe("wrapper");
  });

  it("preserves rationale inputs verbatim", () => {
    const result = resolveReleaseRouting({
      releaseOptedIn: true,
      commitInterlock: "future-commit-mode",
      pushInterlock: "future-push-mode",
    });

    expect(result.rationale).toEqual({
      releaseOptedIn: true,
      commitInterlock: "future-commit-mode",
      pushInterlock: "future-push-mode",
    });
  });

  it("safe-defaults unknown interlock values to raw for their classes", () => {
    const result = resolveReleaseRouting({
      releaseOptedIn: true,
      commitInterlock: "future-commit-mode",
      pushInterlock: "future-push-mode",
    });

    expect(result.taskCommit).toBe("raw");
    expect(result.workflowCommit).toBe("raw");
    expect(result.workflowPush).toBe("raw");
  });
});
