/**
 * Unit tests for release-wrapper routing classification.
 *
 * The resolver is pure logic over the resolved release-wrappers opt-in flag
 * and interlock values; status envelopes and workflow docs consume this
 * output instead of re-deriving routing rules at each fire site.
 */

import { describe, expect, it } from "vitest";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../helpers/schema-assertion.js";

import { ReleaseRoutingValueSchema, resolveReleaseRouting } from "../../../src/lib/release/routing.js";

const ROUTING_COMBINATIONS = [false, true].flatMap((releaseOptedIn) =>
  ["manual", "on-task-approval", "on-workflow"].flatMap((commitInterlock) =>
    ["manual", "on-sync", "on-workflow"].map((pushInterlock) => ({
      releaseOptedIn, commitInterlock, pushInterlock,
    }))));

describe("ReleaseRoutingValueSchema", () => {
  it.each(ROUTING_COMBINATIONS)("parses producer output for $releaseOptedIn/$commitInterlock/$pushInterlock", (input) => {
    const result = resolveReleaseRouting(input);
    assertSchemaAccepts(ReleaseRoutingValueSchema, result);
  });

  it.each([
    { commitInterlock: "future-commit", pushInterlock: "manual" },
    { commitInterlock: "manual", pushInterlock: "future-push" },
  ])("parses safe-default routing with unknown $commitInterlock/$pushInterlock", (interlocks) => {
    const result = resolveReleaseRouting({ releaseOptedIn: true, ...interlocks });
    assertSchemaAccepts(ReleaseRoutingValueSchema, result);
  });

  it("refuses a wrong-typed rationale field", () => {
    const result = resolveReleaseRouting({
      releaseOptedIn: true, commitInterlock: "manual", pushInterlock: "manual",
    });
    expect(() => ReleaseRoutingValueSchema.parse({
      ...result, rationale: { ...result.rationale, commitInterlock: 7 },
    })).toThrow(/commitInterlock/u);
  });

  it("refuses a missing rationale key", () => {
    const result = resolveReleaseRouting({
      releaseOptedIn: true, commitInterlock: "manual", pushInterlock: "manual",
    });
    const rationale = {
      releaseOptedIn: result.rationale.releaseOptedIn,
      commitInterlock: result.rationale.commitInterlock,
    };
    expect(() => ReleaseRoutingValueSchema.parse({ ...result, rationale })).toThrow(/pushInterlock/u);
  });

  it("names an undeclared rationale key", () => {
    const result = resolveReleaseRouting({
      releaseOptedIn: true, commitInterlock: "manual", pushInterlock: "manual",
    });
    expect(() => ReleaseRoutingValueSchema.parse({
      ...result, rationale: { ...result.rationale, unexpected: true },
    })).toThrow(/unexpected/u);
  });

  it("names an undeclared routing field", () => {
    const result = resolveReleaseRouting({
      releaseOptedIn: true, commitInterlock: "manual", pushInterlock: "manual",
    });
    expect(() => ReleaseRoutingValueSchema.parse({ ...result, unexpected: true })).toThrow(/unexpected/u);
  });

  it.each(["taskCommit", "workflowCommit", "workflowPush"] as const)(
    "refuses an invalid %s route",
    (key) => {
      const result = resolveReleaseRouting({
        releaseOptedIn: true, commitInterlock: "manual", pushInterlock: "manual",
      });
      assertSchemaRefuses(ReleaseRoutingValueSchema, { ...result, [key]: "maybe" });
    },
  );
});

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
