/**
 * Unit tests for the pure inbound-pull decision matrix.
 *
 * Exercises (compare-state × tree × policy × TTY) → decision independent of any
 * git I/O.
 */

import { describe, it, expect } from "vitest";

import { decideInboundPull } from "../../src/lib/git/inbound-pull.js";

describe("decideInboundPull", () => {
  it("fast-forwards on remote-ahead + clean tree under the always policy", () => {
    expect(
      decideInboundPull({
        compareState: "remote-ahead",
        tree: "clean",
        policy: "always",
        isTty: false,
      }),
    ).toBe("ff-pull");
  });

  it("blocks on diverged — never auto-resolves", () => {
    expect(
      decideInboundPull({
        compareState: "diverged",
        tree: "clean",
        policy: "always",
        isTty: true,
      }),
    ).toBe("block");
  });

  it("blocks on diverged even under a dirty tree (block dominates)", () => {
    expect(
      decideInboundPull({
        compareState: "diverged",
        tree: "dirty",
        policy: "always",
        isTty: true,
      }),
    ).toBe("block");
  });

  it("refuses on a dirty tree when there is something to fast-forward", () => {
    expect(
      decideInboundPull({
        compareState: "remote-ahead",
        tree: "dirty",
        policy: "always",
        isTty: true,
      }),
    ).toBe("refuse");
  });

  it("is a no-op when already up to date (clean compare state)", () => {
    expect(
      decideInboundPull({
        compareState: "clean",
        tree: "clean",
        policy: "always",
        isTty: true,
      }),
    ).toBe("no-op");
  });

  it("is a no-op when the branch is only ahead (nothing inbound)", () => {
    expect(
      decideInboundPull({
        compareState: "local-ahead",
        tree: "clean",
        policy: "always",
        isTty: true,
      }),
    ).toBe("no-op");
  });

  it("prompts on remote-ahead + clean under the prompt policy in a TTY", () => {
    expect(
      decideInboundPull({
        compareState: "remote-ahead",
        tree: "clean",
        policy: "prompt",
        isTty: true,
      }),
    ).toBe("prompt");
  });

  it("auto-skips to surface under the prompt policy when non-TTY — never a blocking prompt, never auto-pull", () => {
    expect(
      decideInboundPull({
        compareState: "remote-ahead",
        tree: "clean",
        policy: "prompt",
        isTty: false,
      }),
    ).toBe("surface");
  });

  it("surfaces (no auto-pull) under the manual policy", () => {
    expect(
      decideInboundPull({
        compareState: "remote-ahead",
        tree: "clean",
        policy: "manual",
        isTty: true,
      }),
    ).toBe("surface");
  });

  it("surfaces a degraded compare state rather than acting", () => {
    for (const compareState of [
      "no-upstream",
      "no-remote",
      "branch-gone",
      "remote-unavailable",
      "detached-head",
      "skipped",
    ] as const) {
      expect(
        decideInboundPull({ compareState, tree: "clean", policy: "always", isTty: true }),
      ).toBe("surface");
    }
  });
});
