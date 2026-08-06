import { describe, expect, it } from "vitest";

import {
  composePrimaryCheckoutRole,
  deriveCheckoutRole,
  type CheckoutRoleAuthorityFacts,
} from "../../../src/lib/locus/role-derivation.js";

function authorityFacts(
  overrides: Partial<CheckoutRoleAuthorityFacts> = {},
): CheckoutRoleAuthorityFacts {
  return {
    topology: { path: "/repo/worktree", primary: false },
    marker: { kind: "absent" },
    lifecycle: { kind: "absent" },
    identity: { kind: "absent" },
    ...overrides,
  };
}

describe("checkout role derivation", () => {
  it("keeps unreadable authority evidence unresolved for only that checkout", () => {
    expect(deriveCheckoutRole(authorityFacts({
      marker: { kind: "unreadable", reason: "marker bytes are malformed" },
    }))).toEqual({
      kind: "unresolved-checkout",
      topology: { path: "/repo/worktree", primary: false },
      diagnostics: [{
        code: "authority-evidence-unreadable",
        source: "marker",
        message: "marker bytes are malformed",
      }],
    });
  });

  it("derives a work-unit from exact lifecycle authority", () => {
    expect(deriveCheckoutRole(authorityFacts({
      lifecycle: {
        kind: "present",
        state: "active",
        subject: { kind: "work-unit", key: "widget" },
        expectedTopology: { branch: "feat/widget", detached: false },
      },
    }))).toEqual({
      kind: "work-unit",
      topology: { path: "/repo/worktree", primary: false },
      subject: { kind: "work-unit", key: "widget" },
      expectedTopology: { branch: "feat/widget", detached: false },
    });
  });

  it("derives a generation-bearing transient from identity authority", () => {
    expect(deriveCheckoutRole(authorityFacts({
      identity: {
        kind: "present",
        subject: { kind: "errand", key: "repair-index", claimId: "claim-1" },
        expectedTopology: { branch: "chore/repair-index", head: "a".repeat(40), detached: false },
      },
    }))).toEqual({
      kind: "transient",
      topology: { path: "/repo/worktree", primary: false },
      subject: { kind: "errand", key: "repair-index", claimId: "claim-1" },
      expectedTopology: { branch: "chore/repair-index", head: "a".repeat(40), detached: false },
    });
  });

  it("derives retirement only from positive lifecycle authority", () => {
    expect(deriveCheckoutRole(authorityFacts({
      lifecycle: {
        kind: "present",
        state: "retired",
        subject: { kind: "work-unit", key: "shipped-widget" },
        expectedTopology: { head: "b".repeat(40) },
      },
    }))).toEqual({
      kind: "retired",
      topology: { path: "/repo/worktree", primary: false },
      subject: { kind: "work-unit", key: "shipped-widget" },
      expectedTopology: { head: "b".repeat(40) },
    });
  });

  it("distinguishes an unoccupied physical primary from an unmanaged linked checkout", () => {
    expect(deriveCheckoutRole(authorityFacts({
      topology: { path: "/repo", primary: true },
    }))).toEqual({
      kind: "unoccupied-primary",
      topology: { path: "/repo", primary: true },
    });
    expect(deriveCheckoutRole(authorityFacts())).toEqual({
      kind: "unmanaged-checkout",
      topology: { path: "/repo/worktree", primary: false },
    });
  });

  it("derives an identity-free partial Errand from marker authority", () => {
    expect(deriveCheckoutRole(authorityFacts({
      marker: {
        kind: "present",
        subject: { kind: "partial-errand", key: "quick-repair", claimId: null },
        expectedTopology: { branch: "main", detached: false },
      },
    }))).toEqual({
      kind: "transient",
      topology: { path: "/repo/worktree", primary: false },
      subject: { kind: "partial-errand", key: "quick-repair", claimId: null },
      expectedTopology: { branch: "main", detached: false },
    });
  });

  it("unresolves contradictory subject authorities instead of choosing one", () => {
    expect(deriveCheckoutRole(authorityFacts({
      marker: {
        kind: "present",
        subject: { kind: "work-unit", key: "marker-widget" },
        expectedTopology: { branch: "feat/marker-widget" },
      },
      lifecycle: {
        kind: "present",
        state: "active",
        subject: { kind: "work-unit", key: "meta-widget" },
        expectedTopology: { branch: "feat/meta-widget" },
      },
    }))).toEqual({
      kind: "unresolved-checkout",
      topology: { path: "/repo/worktree", primary: false },
      diagnostics: [{
        code: "authority-conflict",
        source: "combined",
        message: "Authority evidence selects different checkout subjects",
      }],
    });
  });

  it("unresolves contradictory topology from authorities selecting one subject", () => {
    expect(deriveCheckoutRole(authorityFacts({
      marker: {
        kind: "present",
        subject: { kind: "work-unit", key: "widget" },
        expectedTopology: { branch: "feat/widget" },
      },
      lifecycle: {
        kind: "present",
        state: "active",
        subject: { kind: "work-unit", key: "widget" },
        expectedTopology: { branch: "feat/other" },
      },
    }))).toMatchObject({
      kind: "unresolved-checkout",
      diagnostics: [{
        code: "authority-conflict",
        source: "combined",
        message: "Authority evidence assigns contradictory expected topology",
      }],
    });
  });

  it("merges complementary topology from authorities selecting one subject", () => {
    expect(deriveCheckoutRole(authorityFacts({
      marker: {
        kind: "present",
        subject: { kind: "work-unit", key: "widget" },
        expectedTopology: { branch: "feat/widget" },
      },
      lifecycle: {
        kind: "present",
        state: "active",
        subject: { kind: "work-unit", key: "widget" },
        expectedTopology: { head: "a".repeat(40), detached: false },
      },
    }))).toMatchObject({
      kind: "work-unit",
      expectedTopology: { branch: "feat/widget", head: "a".repeat(40), detached: false },
    });
  });

  it("composes free-primary only from positive clean configured-base safety", () => {
    const unoccupied = deriveCheckoutRole(authorityFacts({
      topology: { path: "/repo", primary: true },
    }));
    expect(composePrimaryCheckoutRole(unoccupied, {
      kind: "complete", clean: true, onBase: true,
    })).toEqual({ kind: "free-primary", topology: { path: "/repo", primary: true } });

    for (const safety of [
      { kind: "complete" as const, clean: false, onBase: true },
      { kind: "complete" as const, clean: true, onBase: false },
      { kind: "error" as const, message: "status failed" },
    ]) {
      expect(composePrimaryCheckoutRole(unoccupied, safety)).toMatchObject({
        kind: "unresolved-checkout",
        diagnostics: [{ code: "primary-safety-unproven", source: "primary-safety" }],
      });
    }
  });
});
