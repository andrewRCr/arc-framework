import { describe, expect, it } from "vitest";

import { corroborateCheckoutRole } from "../../../src/lib/locus/role-corroboration.js";
import type { AuthorityDerivedCheckoutRole } from "../../../src/lib/locus/role-derivation.js";

const derived: AuthorityDerivedCheckoutRole = {
  kind: "work-unit",
  topology: { path: "/repo/widget", primary: false },
  subject: { kind: "work-unit", key: "widget" },
  expectedTopology: { branch: "feat/widget", head: "a".repeat(40), detached: false },
};

describe("checkout role corroboration", () => {
  it("returns the exact authority-derived role when observed topology agrees", () => {
    expect(corroborateCheckoutRole(derived, {
      branch: "feat/widget",
      head: "a".repeat(40),
      detached: false,
    })).toBe(derived);
  });

  it.each([
    ["branch", { branch: "feat/other", head: "a".repeat(40), detached: false }],
    ["HEAD", { branch: "feat/widget", head: "b".repeat(40), detached: false }],
    ["detached state", { branch: null, head: "a".repeat(40), detached: true }],
  ] as const)("unresolves a %s mismatch without retargeting the subject", (_label, observed) => {
    expect(corroborateCheckoutRole(derived, observed)).toEqual({
      kind: "unresolved-checkout",
      topology: { path: "/repo/widget", primary: false },
      diagnostics: [{
        code: "topology-mismatch",
        expected: derived.expectedTopology,
        observed,
        message: "Observed checkout topology does not corroborate the authority-derived subject",
      }],
    });
  });

  it.each([
    {
      kind: "unresolved-checkout",
      topology: { path: "/repo/widget", primary: false },
      diagnostics: [],
    },
    { kind: "unoccupied-primary", topology: { path: "/repo", primary: true } },
    { kind: "unmanaged-checkout", topology: { path: "/repo/widget", primary: false } },
  ] as const)("preserves subjectless role $kind regardless of observations", (role) => {
    expect(corroborateCheckoutRole(role, {
      branch: "feat/other",
      head: "b".repeat(40),
      detached: false,
    })).toBe(role);
  });

  it("ignores observation keys omitted from authority expectations", () => {
    const partial: AuthorityDerivedCheckoutRole = {
      ...derived,
      expectedTopology: { branch: "feat/widget" },
    };
    expect(corroborateCheckoutRole(partial, {
      branch: "feat/widget",
      head: "b".repeat(40),
      detached: false,
    })).toBe(partial);
  });
});
