import { describe, expect, it } from "vitest";

import { applyFrontlineInvocationOverride } from "../../../../../src/scripts/review-gate/policy/frontline-resolution.js";

describe("frontline invocation override precedence", () => {
  it.each(["skip", "offer", "attempt"] as const)(
    "inherit preserves the router's %s action",
    (routerAction) => {
      expect(applyFrontlineInvocationOverride({
        methodActive: true,
        routerAction,
        invocation: { mode: "inherit" },
      })).toEqual({
        action: routerAction,
        effectiveActive: true,
        invocationSourceId: null,
        reasons: [`frontline-policy-${routerAction}`],
      });
    },
  );

  it("inherit with a source changes only source selection", () => {
    expect(applyFrontlineInvocationOverride({
      methodActive: true,
      routerAction: "offer",
      invocation: { mode: "inherit", sourceId: "review-cli" },
    })).toEqual({
      action: "offer",
      effectiveActive: true,
      invocationSourceId: "review-cli",
      reasons: ["frontline-policy-offer"],
    });
  });

  it("inherit keeps an inactive method skipped without retaining a source", () => {
    expect(applyFrontlineInvocationOverride({
      methodActive: false,
      routerAction: "attempt",
      invocation: { mode: "inherit", sourceId: "review-cli" },
    })).toEqual({
      action: "skip",
      effectiveActive: false,
      invocationSourceId: null,
      reasons: ["frontline-policy-attempt", "frontline-inactive"],
    });
  });

  it("force temporarily activates and overrides policy skip", () => {
    expect(applyFrontlineInvocationOverride({
      methodActive: false,
      routerAction: "skip",
      invocation: { mode: "force", sourceId: "review-cli" },
    })).toEqual({
      action: "attempt",
      effectiveActive: true,
      invocationSourceId: "review-cli",
      reasons: ["frontline-policy-skip", "invocation-force"],
    });
  });

  it("skip overrides activation and policy while rejecting a source", () => {
    expect(applyFrontlineInvocationOverride({
      methodActive: true,
      routerAction: "attempt",
      invocation: { mode: "skip" },
    })).toEqual({
      action: "skip",
      effectiveActive: false,
      invocationSourceId: null,
      reasons: ["frontline-policy-attempt", "invocation-skip"],
    });
    expect(() => applyFrontlineInvocationOverride({
      methodActive: true,
      routerAction: "attempt",
      invocation: { mode: "skip", sourceId: "review-cli" },
    })).toThrow(/unrecognized key/iu);
  });

  it("defaults an omitted invocation to inherit", () => {
    expect(applyFrontlineInvocationOverride({
      methodActive: true,
      routerAction: "attempt",
    })).toMatchObject({ action: "attempt", invocationSourceId: null });
  });
});
