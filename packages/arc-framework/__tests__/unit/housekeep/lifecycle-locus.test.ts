/** Exact housekeeping close, finalization, and abandonment composition. */

import { describe, expect, it, vi } from "vitest";

import type { HousekeepIdentityRecord } from "../../../src/lib/errand/identity-claims.js";
import {
  closeHousekeep,
  settleHousekeep,
  type CloseHousekeepDependencies,
  type SettleHousekeepDependencies,
} from "../../../src/lib/housekeep/lifecycle-locus.js";
import { createLocusMutationResult } from "../../../src/lib/locus/mutation.js";
import type { LocusRowV1 } from "../../../src/lib/locus/schema/index.js";
import { locusStateFixture } from "../../fixtures/locus-state.js";

const SLUG = "drain-inbox";
const CLAIM_ID = "c".repeat(32);
const CHECKOUT = "/repo/sweep";
const RECORD_ID = `sha256:${"a".repeat(64)}`;
const LEASE_ID = "b".repeat(32);
const HEAD = "d".repeat(40);
const BASE_HEAD = "e".repeat(40);
const CHANGE_REQUEST = {
  repositoryRef: "owner/repo",
  hostRef: "github.com",
  baseRef: "main",
  headRef: `chore/${SLUG}`,
  headSha: HEAD,
};

function record(overrides: Partial<HousekeepIdentityRecord> = {}): HousekeepIdentityRecord {
  return {
    version: 3,
    kind: "errand",
    purpose: "housekeep-routing",
    slug: SLUG,
    claimId: CLAIM_ID,
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
    branch: `chore/${SLUG}`,
    state: "open",
    savedHead: null,
    changeRequest: null,
    ...overrides,
  } as HousekeepIdentityRecord;
}

function awaitingRecord(): HousekeepIdentityRecord {
  return record({ state: "awaiting-merge", changeRequest: CHANGE_REQUEST } as Partial<HousekeepIdentityRecord>);
}

function housekeepRow(overrides: Partial<LocusRowV1> = {}): LocusRowV1 {
  return {
    kind: "managed-role",
    checkoutPath: CHECKOUT,
    primary: false,
    recordId: RECORD_ID,
    role: {
      kind: "housekeep",
      subject: { kind: "errand", key: SLUG, claimId: CLAIM_ID },
      parentCheckoutPath: "/repo",
      originEntry: null,
    },
    identity: null,
    lease: {
      leaseId: LEASE_ID, state: "live", sessionHomePath: CHECKOUT,
      attachedAt: "2026-07-24T00:00:00.000Z", heartbeatAt: "2026-07-24T00:00:00.000Z",
    },
    frame: "active",
    derived: null,
    diagnostics: [],
    ...overrides,
  };
}

function partialRow(overrides: Partial<LocusRowV1> = {}): LocusRowV1 {
  return housekeepRow({
    primary: true,
    role: {
      kind: "housekeep",
      subject: { kind: "housekeep", key: SLUG, claimId: null },
      parentCheckoutPath: "/repo",
      originEntry: null,
    },
    ...overrides,
  });
}

/** The identity tree plus the branch refs, so ordering shows up as retained state. */
interface HousekeepWorld {
  record: HousekeepIdentityRecord | null;
  branch: boolean;
}

const popped = createLocusMutationResult({
  outcome: "applied", operation: "housekeep-close", allocation: null, recordId: RECORD_ID, leaseId: null,
  activeLocusPath: null, sessionHomePath: null, identity: null, originEntry: null,
  restoredParent: null, nextOffer: null, recommendedPromptText: "Housekeeping occupancy removed.",
});

const refusedPop = createLocusMutationResult({
  outcome: "refused", operation: "housekeep-close", reason: "lease-live",
  recommendedPromptText: "Housekeeping session locus lock unavailable.",
});

/**
 * Close dependencies whose evidence all passes, so each test can fail exactly one thing.
 *
 * Identity writes land in `world`, which is what distinguishes an ordering claim from a call
 * count: a refused pop that still leaves the change request recorded is the recoverable residue.
 */
function closeDependencies(
  world: HousekeepWorld,
  overrides: Partial<CloseHousekeepDependencies> = {},
): CloseHousekeepDependencies {
  return {
    readIdentity: vi.fn(async () => ({ kind: "ok" as const, record: world.record })),
    readState: vi.fn(async () => ({
      kind: "read" as const, state: locusStateFixture({ rows: [housekeepRow()] }),
    })),
    readCheckout: vi.fn(async () => ({ dirty: false, head: HEAD })),
    pinBaseHead: vi.fn(async () => ({ kind: "pinned" as const, head: HEAD })),
    cleanupOccupancy: vi.fn(async () => popped),
    mergeBase: vi.fn(async () => BASE_HEAD),
    changedPaths: vi.fn(async () => [".arc/backlog/planned/meta-alpha.md"]),
    observeChangeRequest: vi.fn(async () => ({
      kind: "observed" as const, changeRequest: CHANGE_REQUEST,
    })),
    persistAwaitingMerge: vi.fn(async () => {
      world.record = awaitingRecord();
      return { kind: "ready" as const, value: world.record };
    }),
    resolveNextOffer: vi.fn(async () => ({ kind: "resolved" as const, nextOffer: null })),
    ...overrides,
  };
}

function settleDependencies(
  world: HousekeepWorld,
  overrides: Partial<SettleHousekeepDependencies> = {},
): SettleHousekeepDependencies {
  return {
    readIdentity: vi.fn(async () => ({ kind: "ok" as const, record: world.record })),
    readState: vi.fn(async () => ({
      kind: "read" as const, state: locusStateFixture({ rows: [housekeepRow()] }),
    })),
    readCheckout: vi.fn(async () => ({ dirty: false, head: HEAD })),
    pinBaseHead: vi.fn(async () => ({ kind: "pinned" as const, head: HEAD })),
    cleanupOccupancy: vi.fn(async () => popped),
    readTail: vi.fn(async () => ({ kind: "read" as const, truth: "merged" as const })),
    readBranchGeneration: vi.fn(async () => ({ kind: "exact" as const, head: HEAD })),
    tearDownBranch: vi.fn(async () => {
      world.branch = false;
      return { kind: "applied" as const };
    }),
    retire: vi.fn(async () => {
      world.record = null;
      return { kind: "ready" as const, value: null };
    }),
    ...overrides,
  };
}

describe("closeHousekeep", () => {
  it("records the change request before occupancy removal can lose it", async () => {
    const world: HousekeepWorld = { record: record(), branch: true };
    const result = await closeHousekeep({
      slug: SLUG,
      dependencies: closeDependencies(world, { cleanupOccupancy: vi.fn(async () => refusedPop) }),
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "lease-live" });
    expect(world.record).toMatchObject({ state: "awaiting-merge", changeRequest: CHANGE_REQUEST });
  });

  it("preserves the sweep and closes occupancy once the tail is recorded", async () => {
    const world: HousekeepWorld = { record: record(), branch: true };
    const result = await closeHousekeep({ slug: SLUG, dependencies: closeDependencies(world) });

    expect(result).toMatchObject({
      outcome: "applied",
      operation: "housekeep-close",
      recommendedPromptText: "Housekeeping change request preserved; routing occupancy closed.",
    });
    expect(world.record).toMatchObject({ state: "awaiting-merge" });
  });

  it("leaves the open generation untouched when the diff reaches outside routing", async () => {
    const world: HousekeepWorld = { record: record(), branch: true };
    const observeChangeRequest = vi.fn();
    const result = await closeHousekeep({
      slug: SLUG,
      dependencies: closeDependencies(world, {
        changedPaths: vi.fn(async () => ["packages/arc-framework/src/cli.ts"]),
        observeChangeRequest,
      }),
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "identity-conflict" });
    expect(observeChangeRequest).not.toHaveBeenCalled();
    expect(world.record).toMatchObject({ state: "open" });
  });

  it("refuses an unreadable continuation queue before the tail is recorded", async () => {
    const world: HousekeepWorld = { record: record(), branch: true };
    const cleanupOccupancy = vi.fn();
    const result = await closeHousekeep({
      slug: SLUG,
      dependencies: closeDependencies(world, {
        resolveNextOffer: vi.fn(async () => ({
          kind: "refused" as const, reason: "USER-INBOX is missing.",
        })),
        cleanupOccupancy,
      }),
    });

    expect(result).toMatchObject({
      outcome: "refused", reason: "identity-conflict", recommendedPromptText: "USER-INBOX is missing.",
    });
    expect(world.record).toMatchObject({ state: "open" });
    expect(cleanupOccupancy).not.toHaveBeenCalled();
  });

  it("refuses a re-close whose head moved after its tail was preserved", async () => {
    const world: HousekeepWorld = { record: awaitingRecord(), branch: true };
    const cleanupOccupancy = vi.fn();
    const result = await closeHousekeep({
      slug: SLUG,
      dependencies: closeDependencies(world, {
        readCheckout: vi.fn(async () => ({ dirty: false, head: "f".repeat(40) })),
        cleanupOccupancy,
      }),
    });

    expect(result).toMatchObject({
      outcome: "refused",
      reason: "preservation-unproven",
      recommendedPromptText: "Housekeeping head moved after its review tail was preserved.",
    });
    expect(cleanupOccupancy).not.toHaveBeenCalled();
  });

  it("reports an awaiting tail whose occupancy is already closed as idempotent", async () => {
    const world: HousekeepWorld = { record: awaitingRecord(), branch: true };
    const result = await closeHousekeep({
      slug: SLUG,
      dependencies: closeDependencies(world, {
        readState: vi.fn(async () => ({ kind: "read" as const, state: locusStateFixture() })),
      }),
    });

    expect(result).toMatchObject({
      outcome: "idempotent",
      recommendedPromptText: "Housekeeping change request is awaiting merge.",
    });
  });

  it("completes a partial sweep sitting on the freshly pushed base", async () => {
    const world: HousekeepWorld = { record: null, branch: false };
    const result = await closeHousekeep({
      slug: SLUG,
      dependencies: closeDependencies(world, {
        readState: vi.fn(async () => ({
          kind: "read" as const, state: locusStateFixture({ rows: [partialRow()] }),
        })),
      }),
    });

    expect(result).toMatchObject({
      outcome: "applied",
      recommendedPromptText: "Partial housekeeping sweep completed.",
    });
  });

  it("refuses a partial sweep that is not at the freshly pushed base head", async () => {
    const world: HousekeepWorld = { record: null, branch: false };
    const cleanupOccupancy = vi.fn();
    const result = await closeHousekeep({
      slug: SLUG,
      dependencies: closeDependencies(world, {
        readState: vi.fn(async () => ({
          kind: "read" as const, state: locusStateFixture({ rows: [partialRow()] }),
        })),
        pinBaseHead: vi.fn(async () => ({ kind: "pinned" as const, head: "f".repeat(40) })),
        cleanupOccupancy,
      }),
    });

    expect(result).toMatchObject({
      outcome: "refused",
      reason: "preservation-unproven",
      recommendedPromptText: "Partial housekeeping HEAD is not the freshly pushed base head.",
    });
    expect(cleanupOccupancy).not.toHaveBeenCalled();
  });

  it("refuses occupancy whose authority is not established", async () => {
    const world: HousekeepWorld = { record: record(), branch: true };
    const result = await closeHousekeep({
      slug: SLUG,
      dependencies: closeDependencies(world, {
        readState: vi.fn(async () => ({
          kind: "read" as const,
          state: locusStateFixture({ rows: [housekeepRow(), housekeepRow()] }),
        })),
      }),
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "duplicate-locus" });
    expect(world.record).toMatchObject({ state: "open" });
  });
});

describe("settleHousekeep", () => {
  it("finalizes a merged tail by clearing occupancy, refs, and identity", async () => {
    const world: HousekeepWorld = { record: awaitingRecord(), branch: true };
    const result = await settleHousekeep({
      slug: SLUG, action: "finalize", dependencies: settleDependencies(world),
    });

    expect(result).toMatchObject({
      outcome: "applied",
      operation: "housekeep-close",
      recommendedPromptText: "Merged housekeeping tail finalized.",
    });
    expect(world).toMatchObject({ record: null, branch: false });
  });

  it("keeps the branch generation and identity when occupancy cannot be removed", async () => {
    const world: HousekeepWorld = { record: awaitingRecord(), branch: true };
    const tearDownBranch = vi.fn();
    const result = await settleHousekeep({
      slug: SLUG, action: "finalize",
      dependencies: settleDependencies(world, {
        cleanupOccupancy: vi.fn(async () => refusedPop),
        tearDownBranch,
      }),
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "lease-live" });
    expect(tearDownBranch).not.toHaveBeenCalled();
    expect(world).toMatchObject({ record: { state: "awaiting-merge" }, branch: true });
  });

  it("retains the identity when its branch generation cannot be torn down", async () => {
    const world: HousekeepWorld = { record: record(), branch: true };
    const result = await settleHousekeep({
      slug: SLUG, action: "abandon",
      dependencies: settleDependencies(world, {
        tearDownBranch: vi.fn(async () => ({
          kind: "refused" as const, message: "Local housekeeping head moved.",
        })),
      }),
    });

    expect(result).toMatchObject({
      outcome: "refused",
      operation: "housekeep-abandon",
      reason: "preservation-unproven",
      recommendedPromptText: "Local housekeeping head moved.",
    });
    expect(world).toMatchObject({ record: { state: "open" }, branch: true });
  });

  it("refuses a tail whose host truth is not the state the action requires", async () => {
    const world: HousekeepWorld = { record: awaitingRecord(), branch: true };
    const cleanupOccupancy = vi.fn();
    const result = await settleHousekeep({
      slug: SLUG, action: "finalize",
      dependencies: settleDependencies(world, {
        readTail: vi.fn(async () => ({ kind: "read" as const, truth: "open" as const })),
        cleanupOccupancy,
      }),
    });

    expect(result).toMatchObject({
      outcome: "refused",
      reason: "change-request-unverifiable",
      recommendedPromptText: "Housekeeping tail is 'open', not 'merged'.",
    });
    expect(cleanupOccupancy).not.toHaveBeenCalled();
    expect(world).toMatchObject({ record: { state: "awaiting-merge" }, branch: true });
  });

  it("refuses occupancy that outlived an already-deleted branch generation", async () => {
    const world: HousekeepWorld = { record: record(), branch: false };
    const cleanupOccupancy = vi.fn();
    const result = await settleHousekeep({
      slug: SLUG, action: "abandon",
      dependencies: settleDependencies(world, {
        readBranchGeneration: vi.fn(async () => ({ kind: "absent" as const })),
        cleanupOccupancy,
      }),
    });

    expect(result).toMatchObject({
      outcome: "refused",
      reason: "preservation-unproven",
      recommendedPromptText: "Housekeeping occupancy remains after its branch generation was deleted.",
    });
    expect(cleanupOccupancy).not.toHaveBeenCalled();
    expect(world.record).toMatchObject({ state: "open" });
  });

  it("abandons a partial sweep sitting clean on the freshly fetched base", async () => {
    const world: HousekeepWorld = { record: null, branch: false };
    const result = await settleHousekeep({
      slug: SLUG, action: "abandon",
      dependencies: settleDependencies(world, {
        readState: vi.fn(async () => ({
          kind: "read" as const, state: locusStateFixture({ rows: [partialRow()] }),
        })),
      }),
    });

    expect(result).toMatchObject({
      outcome: "applied",
      operation: "housekeep-abandon",
      recommendedPromptText: "Partial housekeeping sweep abandoned.",
    });
  });

  it("refuses a dirty partial sweep before its occupancy is touched", async () => {
    const world: HousekeepWorld = { record: null, branch: false };
    const cleanupOccupancy = vi.fn();
    const result = await settleHousekeep({
      slug: SLUG, action: "abandon",
      dependencies: settleDependencies(world, {
        readState: vi.fn(async () => ({
          kind: "read" as const, state: locusStateFixture({ rows: [partialRow()] }),
        })),
        readCheckout: vi.fn(async () => ({ dirty: true, head: HEAD })),
        cleanupOccupancy,
      }),
    });

    expect(result).toMatchObject({
      outcome: "refused",
      reason: "preservation-unproven",
      recommendedPromptText: "Partial housekeeping checkout is dirty or not at the freshly fetched base head.",
    });
    expect(cleanupOccupancy).not.toHaveBeenCalled();
  });

  it("refuses a generation other than the one the caller selected", async () => {
    const world: HousekeepWorld = { record: awaitingRecord(), branch: true };
    const cleanupOccupancy = vi.fn();
    const result = await settleHousekeep({
      slug: SLUG, action: "finalize",
      selected: { recordId: `sha256:${"9".repeat(64)}`, leaseId: LEASE_ID },
      dependencies: settleDependencies(world, { cleanupOccupancy }),
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "lease-generation-mismatch" });
    expect(cleanupOccupancy).not.toHaveBeenCalled();
    expect(world).toMatchObject({ record: { state: "awaiting-merge" }, branch: true });
  });

  it("reports an already-retired generation as idempotent on finalize", async () => {
    const world: HousekeepWorld = { record: null, branch: false };
    const readState = vi.fn();
    const result = await settleHousekeep({
      slug: SLUG, action: "finalize", dependencies: settleDependencies(world, { readState }),
    });

    expect(result).toMatchObject({
      outcome: "idempotent",
      recommendedPromptText: "Housekeeping generation is already retired.",
    });
    expect(readState).not.toHaveBeenCalled();
  });
});
