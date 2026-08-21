/** Protection-aware allocation over the worktree-derived locus frame. */

import { describe, expect, it } from "vitest";

import {
  createSpawnedLocusWorktree,
  planLocusAllocation,
  type LocusAllocationPlan,
} from "../../../src/lib/locus/allocator.js";
import type { DerivedCheckoutRow } from "../../../src/lib/locus/derived-roster.js";
import type {
  DerivedLocusFrame,
  DerivedPrimaryAvailability,
} from "../../../src/lib/locus/derived-reader.js";

const SUBJECT = { kind: "errand", key: "docs", claimId: "a".repeat(32) } as const;
const PARTIAL_SUBJECT = { ...SUBJECT, claimId: null } as const;

function frame(primaryAvailability: DerivedPrimaryAvailability): DerivedLocusFrame {
  const row: DerivedCheckoutRow = primaryAvailability.kind === "free"
    ? rowFor("free-primary", null)
    : primaryAvailability.kind === "occupied"
      ? rowFor("transient", primaryAvailability.subject)
      : rowFor("unresolved-checkout", null);
  return {
    roster: [row],
    entering: { kind: "selected", row },
    primaryAvailability,
    identityDiscovery: { kind: "complete", identities: [], diagnostics: [] },
    active: null,
  };
}

function rowFor(
  kind: "free-primary" | "transient" | "unresolved-checkout",
  subject: DerivedCheckoutRow["subject"],
): DerivedCheckoutRow {
  const base = {
    checkout: {
      path: "/repo",
      head: "1".repeat(40),
      branch: "main",
      detached: false,
      primary: true,
    },
    markerGeneration: kind === "free-primary" ? null : "sha256:marker",
    parentCheckoutPath: null,
    origin: null,
    identity: null,
    context: null,
    lifecycleLocation: null,
    diagnostics: kind === "unresolved-checkout"
      ? [{ code: "primary-dirty", message: "Primary is dirty" }]
      : [],
  };
  if (kind === "free-primary") return { ...base, kind, subject: null };
  if (kind === "transient" && subject !== null) return { ...base, kind, subject };
  return { ...base, kind: "unresolved-checkout", subject };
}

describe("planLocusAllocation", () => {
  it("proposes the free primary when isolation is not requested", () => {
    expect(planLocusAllocation({
      frame: frame({ kind: "free", checkoutPath: "/repo" }),
      protection: "full",
      isolation: "prefer-primary",
      subject: SUBJECT,
    })).toEqual({
      kind: "proposal",
      allocation: { kind: "primary", checkoutPath: "/repo" },
      subject: SUBJECT,
    });
  });

  it("spawns from an occupied primary only under full protection", () => {
    const occupied = frame({
      kind: "occupied",
      checkoutPath: "/repo",
      subject: { kind: "work-unit", key: "active" },
    });
    expect(planLocusAllocation({
      frame: occupied,
      protection: "full",
      isolation: "prefer-primary",
      subject: SUBJECT,
    })).toMatchObject({ kind: "proposal", allocation: { kind: "spawn", primaryPath: "/repo" } });
    expect(planLocusAllocation({
      frame: occupied,
      protection: "partial",
      isolation: "prefer-primary",
      subject: PARTIAL_SUBJECT,
    })).toEqual({ kind: "refused", reason: "primary-occupied" });
  });

  it("refuses unsafe primary evidence instead of offering a spawn", () => {
    expect(planLocusAllocation({
      frame: frame({ kind: "unsafe", checkoutPath: "/repo", reasons: ["primary-dirty"] }),
      protection: "full",
      isolation: "prefer-primary",
      subject: SUBJECT,
    })).toEqual({ kind: "refused", reason: "primary-dirty" });
  });

  it("requires full protection for explicit isolation", () => {
    const free = frame({ kind: "free", checkoutPath: "/repo" });
    expect(planLocusAllocation({
      frame: free,
      protection: "full",
      isolation: "require-isolation",
      subject: SUBJECT,
    })).toMatchObject({ kind: "proposal", allocation: { kind: "spawn" } });
    expect(planLocusAllocation({
      frame: free,
      protection: "partial",
      isolation: "require-isolation",
      subject: PARTIAL_SUBJECT,
    })).toEqual({ kind: "refused", reason: "full-protection-required" });
  });

  it("keeps partial Errand identities claim-free", () => {
    expect(planLocusAllocation({
      frame: frame({ kind: "free", checkoutPath: "/repo" }),
      protection: "partial",
      isolation: "prefer-primary",
      subject: SUBJECT,
    })).toEqual({ kind: "refused", reason: "identity-conflict" });
  });
});

describe("createSpawnedLocusWorktree", () => {
  it("qualifies placement with the exact transient generation", async () => {
    const calls: string[][] = [];
    const proposal: Extract<LocusAllocationPlan, { kind: "proposal" }> = {
      kind: "proposal",
      allocation: { kind: "spawn", primaryPath: "/repo" },
      subject: SUBJECT,
    };
    const result = await createSpawnedLocusWorktree({
      exec: async (command, args) => {
        calls.push([command, ...args]);
        return { stdout: "" };
      },
      pathExists: async () => false,
    }, {
      proposal,
      protection: "full",
      locationTemplate: "../{name}",
      repo: "arc-framework",
      branch: "chore/docs",
      base: "main",
    });

    expect(result.kind).toBe("created");
    expect(calls.flat().join(" ")).toContain(`locus-errand-docs-${SUBJECT.claimId}`);
  });
});
