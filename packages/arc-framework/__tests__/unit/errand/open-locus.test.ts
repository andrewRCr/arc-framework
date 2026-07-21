/** Ordinary Errand open composition over identity, allocation, and provisioning boundaries. */

import { describe, expect, it, vi } from "vitest";

import { openOrdinaryErrand } from "../../../src/lib/errand/open.js";
import type { LocusStateV1 } from "../../../src/lib/locus/schema/index.js";

const RECORD_ID = `sha256:${"a".repeat(64)}`;
const CLAIM_ID = "c".repeat(32);
const LEASE_ID = "d".repeat(32);
const ANCHOR = { kind: "process" as const, selector: "codex", pid: 7, startToken: "start", inspector: "linux-procfs" };

function state(availability: LocusStateV1["primaryAvailability"]): LocusStateV1 {
  return {
    roster: { mode: "locus", ok: true, primaryPath: "/repo", rows: [], diagnostics: [] },
    current: { kind: "none" },
    primaryAvailability: availability,
    inFlightIdentities: [],
    recovery: { kind: "none" },
    reconciliation: { kind: "clean" },
  };
}

describe("openOrdinaryErrand", () => {
  it("claims a v3 identity before provisioning the free primary and returns the shared result", async () => {
    const events: string[] = [];
    const claim = vi.fn(async (record) => {
      events.push("claim");
      return { kind: "applied" as const, record };
    });
    const provision = vi.fn(async () => {
      events.push("provision");
      return {
        kind: "provisioned" as const,
        receipt: {
          allocation: "primary" as const,
          checkoutPath: "/repo",
          branch: { name: "chore/docs", created: true, head: "b".repeat(40), base: null },
          worktree: { path: "/repo", created: false, head: "b".repeat(40) },
          marker: null,
          record: { recordId: RECORD_ID, bytes: Buffer.from("record") },
          leaseToken: LEASE_ID,
        },
      };
    });

    const result = await openOrdinaryErrand({
      slug: "docs",
      intent: "tighten docs",
      protection: "full",
      base: "main",
      createdAt: "2026-07-21T12:00:00.000Z",
      identityName: "andrew",
      locationTemplate: "/work/{repo}.{name}",
      repo: "repo",
      leaseId: LEASE_ID,
      dependencies: {
        mintClaimId: () => CLAIM_ID,
        acquireAnchor: async () => ANCHOR,
        readState: async () => state({ kind: "free", checkoutPath: "/repo" }),
        claim,
        rollbackClaim: vi.fn(),
        provision,
      },
    });

    expect(events).toEqual(["claim", "provision"]);
    expect(claim.mock.calls[0]?.[0]).toMatchObject({
      version: 3,
      slug: "docs",
      claimId: CLAIM_ID,
      branch: "chore/docs",
      state: "open",
    });
    expect(result).toMatchObject({
      outcome: "applied",
      operation: "errand-open",
      allocation: { kind: "primary", checkoutPath: "/repo" },
      recordId: RECORD_ID,
      leaseId: LEASE_ID,
      activeLocusPath: "/repo",
      sessionHomePath: "/repo",
      identity: { key: "docs", claimId: CLAIM_ID },
      recommendedPromptText: expect.stringMatching(/opened at \/repo.*session home remains \/repo/iu),
    });
  });

  it("opens a partial Errand on the free primary without claiming identity or creating a branch", async () => {
    const claim = vi.fn();
    const provision = vi.fn(async (options: unknown) => (void options, {
      kind: "provisioned" as const,
      receipt: {
        allocation: "primary" as const,
        checkoutPath: "/repo",
        branch: { name: null, created: false, head: "b".repeat(40), base: null },
        worktree: { path: "/repo", created: false, head: "b".repeat(40) },
        marker: null,
        record: { recordId: RECORD_ID, bytes: Buffer.from("record") },
        leaseToken: LEASE_ID,
      },
    }));

    const result = await openOrdinaryErrand({
      slug: "local-docs",
      originEntry: "Captured docs fix",
      dispatchId: "dispatch-12",
      protection: "partial",
      base: "main",
      createdAt: "2026-07-21T12:00:00.000Z",
      identityName: "andrew",
      locationTemplate: "/work/{repo}.{name}",
      repo: "repo",
      leaseId: LEASE_ID,
      dependencies: {
        acquireAnchor: async () => ANCHOR,
        readState: async () => state({ kind: "free", checkoutPath: "/repo" }),
        claim,
        rollbackClaim: vi.fn(),
        provision,
      },
    });

    expect(claim).not.toHaveBeenCalled();
    expect(provision.mock.calls[0]?.[0]).toMatchObject({
      protection: "partial",
      identity: null,
      branch: null,
      authority: {
        kind: "partial-errand",
        originEntry: "Captured docs fix",
        dispatchId: "dispatch-12",
      },
    });
    expect(result).toMatchObject({
      outcome: "applied",
      identity: null,
      originEntry: "Captured docs fix",
      dispatchId: "dispatch-12",
      activeLocusPath: "/repo",
    });
  });

  it("spawns beside a warm WU and preserves that checkout as parent and session home", async () => {
    const warm = state({
      kind: "occupied",
      checkoutPath: "/repo",
      recordId: RECORD_ID,
      leaseState: "live",
    });
    warm.roster.rows.push({
      kind: "managed-role",
      checkoutPath: "/repo",
      primary: true,
      recordId: RECORD_ID,
      role: {
        kind: "work-unit",
        subject: { kind: "work-unit", key: "parent", claimId: null },
        parentCheckoutPath: null,
        dispatchId: null,
        originEntry: null,
        routingPlanDigest: null,
      },
      identity: null,
      lease: null,
      frame: "active",
      derived: null,
      diagnostics: [],
    });
    warm.current = { kind: "resolved", sessionHomeRecordId: RECORD_ID, activeRecordId: RECORD_ID, parentRecordId: null };
    const provision = vi.fn(async (options: unknown) => (void options, {
      kind: "provisioned" as const,
      receipt: {
        allocation: "spawned" as const,
        checkoutPath: "/work/repo.locus-errand-child",
        branch: { name: "chore/child", created: true, head: "b".repeat(40), base: "main" },
        worktree: { path: "/work/repo.locus-errand-child", created: true, head: "b".repeat(40) },
        marker: { state: "ready" as const, bytes: Buffer.from("marker") },
        record: { recordId: `sha256:${"e".repeat(64)}`, bytes: Buffer.from("record") },
        leaseToken: LEASE_ID,
      },
    }));

    const result = await openOrdinaryErrand({
      slug: "child",
      protection: "full",
      base: "main",
      createdAt: "2026-07-21T12:00:00.000Z",
      identityName: "andrew",
      locationTemplate: "/work/{repo}.{name}",
      repo: "repo",
      leaseId: LEASE_ID,
      dependencies: {
        mintClaimId: () => CLAIM_ID,
        acquireAnchor: async () => ANCHOR,
        readState: async () => warm,
        claim: async (record) => ({ kind: "applied", record }),
        rollbackClaim: vi.fn(),
        provision,
      },
    });

    expect(provision.mock.calls[0]?.[0]).toMatchObject({
      proposal: { allocation: { kind: "spawn", primaryPath: "/repo" } },
      parentCheckoutPath: "/repo",
      sessionHomePath: "/repo",
    });
    expect(result).toMatchObject({
      outcome: "applied",
      allocation: { kind: "spawned", checkoutPath: "/work/repo.locus-errand-child" },
      activeLocusPath: "/work/repo.locus-errand-child",
      sessionHomePath: "/repo",
    });
  });

  it("rolls back only its newly applied identity when allocation fails", async () => {
    const rollbackClaim = vi.fn(async () => ({ kind: "rolled-back" as const }));
    const result = await openOrdinaryErrand({
      slug: "blocked",
      protection: "full",
      base: "main",
      createdAt: "2026-07-21T12:00:00.000Z",
      identityName: "andrew",
      locationTemplate: "/work/{repo}.{name}",
      repo: "repo",
      leaseId: LEASE_ID,
      dependencies: {
        mintClaimId: () => CLAIM_ID,
        acquireAnchor: async () => ANCHOR,
        readState: async () => state({ kind: "unsafe", checkoutPath: "/repo", reasons: ["primary-dirty"] }),
        claim: async (record) => ({ kind: "applied", record }),
        rollbackClaim,
        provision: vi.fn(),
      },
    });

    expect(rollbackClaim).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ outcome: "refused", reason: "primary-dirty" });
  });

  it("refuses unavailable ancestry before identity or allocation mutation", async () => {
    const claim = vi.fn();
    const readState = vi.fn();
    const result = await openOrdinaryErrand({
      slug: "blocked-anchor",
      protection: "full",
      base: "main",
      createdAt: "2026-07-21T12:00:00.000Z",
      identityName: "andrew",
      locationTemplate: "/work/{repo}.{name}",
      repo: "repo",
      leaseId: LEASE_ID,
      dependencies: {
        acquireAnchor: async () => ({ kind: "unverifiable", reason: "permission denied" }),
        readState,
        claim,
        rollbackClaim: vi.fn(),
        provision: vi.fn(),
      },
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "cold-entry-required" });
    expect(readState).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
  });

  it("keeps legacy identity conflicts close-only without provisioning a new locus", async () => {
    const provision = vi.fn();
    const result = await openOrdinaryErrand({
      slug: "legacy",
      protection: "full",
      base: "main",
      createdAt: "2026-07-21T12:00:00.000Z",
      identityName: "andrew",
      locationTemplate: "/work/{repo}.{name}",
      repo: "repo",
      leaseId: LEASE_ID,
      dependencies: {
        mintClaimId: () => CLAIM_ID,
        acquireAnchor: async () => ANCHOR,
        readState: async () => state({ kind: "free", checkoutPath: "/repo" }),
        claim: async () => ({ kind: "refused", reason: "Legacy v2 identity is close-only" }),
        rollbackClaim: vi.fn(),
        provision,
      },
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "identity-conflict" });
    expect(provision).not.toHaveBeenCalled();
  });
});
