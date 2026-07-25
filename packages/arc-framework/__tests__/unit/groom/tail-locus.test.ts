/** Exact grooming finalization and abandonment composition. */

import { describe, expect, it, vi } from "vitest";

import {
  settleGroom,
  type SettleGroomDependencies,
} from "../../../src/lib/groom/tail-locus.js";
import {
  TransientIdentityRecordV3Schema,
  type GroomIdentityRecord,
} from "../../../src/lib/errand/index.js";
import { createLocusMutationResult } from "../../../src/lib/locus/mutation.js";
import type { LocusRowV1 } from "../../../src/lib/locus/schema/index.js";
import { locusStateFixture } from "../../fixtures/locus-state.js";

const ANCHOR = "alpha";
const CHECKOUT = "/repo";
const RECORD_ID = `sha256:${"1".repeat(64)}`;
const LEASE_ID = "3".repeat(32);
const CLAIM_ID = "1".repeat(32);
const HEAD = "b".repeat(40);
const CHANGE_REQUEST = {
  repositoryRef: "owner/repo",
  hostRef: "github.com",
  baseRef: "main",
  headRef: "chore/groom-alpha",
  headSha: HEAD,
};

function groom(overrides: Record<string, unknown> = {}): GroomIdentityRecord {
  return TransientIdentityRecordV3Schema.parse({
    version: 3,
    kind: "groom",
    slug: `groom-${ANCHOR}`,
    claimId: CLAIM_ID,
    anchorStub: ANCHOR,
    members: ["alpha"],
    openedBaseHead: "a".repeat(40),
    protection: "full",
    branch: "chore/groom-alpha",
    state: "open",
    changeRequest: null,
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    ...overrides,
  }) as GroomIdentityRecord;
}

function awaitingGroom(): GroomIdentityRecord {
  return groom({ state: "awaiting-merge", changeRequest: CHANGE_REQUEST });
}

function groomRow(overrides: Partial<LocusRowV1> = {}): LocusRowV1 {
  return {
    kind: "managed-role", checkoutPath: CHECKOUT, primary: false, recordId: RECORD_ID,
    role: {
      kind: "groom", subject: { kind: "groom", key: `groom-${ANCHOR}`, claimId: CLAIM_ID },
      parentCheckoutPath: null, originEntry: null,
    },
    identity: null,
    lease: {
      leaseId: LEASE_ID, selfHeld: false, state: "live", sessionHomePath: CHECKOUT,
      attachedAt: "2026-07-20T00:00:00.000Z", heartbeatAt: "2026-07-20T00:00:00.000Z",
    },
    frame: "active", derived: null, diagnostics: [],
    ...overrides,
  } as LocusRowV1;
}

/** The identity tree plus the branch refs, so ordering shows up as retained state. */
interface SettleWorld {
  record: GroomIdentityRecord | null;
  branch: boolean;
}

const popped = createLocusMutationResult({
  outcome: "applied", operation: "plan-close", allocation: null, recordId: RECORD_ID, leaseId: null,
  activeLocusPath: null, sessionHomePath: null, identity: null, originEntry: null,
  restoredParent: null, nextOffer: null, recommendedPromptText: "Grooming occupancy removed.",
});

const refusedPop = createLocusMutationResult({
  outcome: "refused", operation: "plan-close", reason: "lease-live",
  recommendedPromptText: "Grooming session locus lock unavailable.",
});

/**
 * Dependencies whose evidence all passes, so each test can fail exactly one thing.
 *
 * Teardown and retirement land in `world`: a settlement that stops partway must leave both the
 * branch generation and the identity behind for the next pass to resume from.
 */
function dependencies(
  world: SettleWorld,
  overrides: Partial<SettleGroomDependencies> = {},
): SettleGroomDependencies {
  return {
    readClaim: vi.fn(async () => ({ kind: "ready" as const, value: world.record })),
    readTail: vi.fn(async () => ({ kind: "read" as const, truth: "merged" as const })),
    readBranchGeneration: vi.fn(async () => ({ kind: "exact" as const, head: HEAD })),
    readState: vi.fn(async () => ({ kind: "read" as const, state: locusStateFixture({ rows: [groomRow()] }) })),
    readCheckout: vi.fn(async () => ({ dirty: false, head: HEAD })),
    cleanupOccupancy: vi.fn(async () => popped),
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

describe("settleGroom", () => {
  it("finalizes a merged tail by clearing occupancy, refs, and identity", async () => {
    const world: SettleWorld = { record: awaitingGroom(), branch: true };
    const result = await settleGroom({
      anchorStub: ANCHOR, action: "finalize", dependencies: dependencies(world),
    });

    expect(result).toMatchObject({
      outcome: "applied",
      operation: "plan-abandon",
      recommendedPromptText: "Merged grooming tail finalized.",
    });
    expect(world).toMatchObject({ record: null, branch: false });
  });

  it("keeps the branch generation and identity when occupancy cannot be removed", async () => {
    const world: SettleWorld = { record: awaitingGroom(), branch: true };
    const tearDownBranch = vi.fn();
    const result = await settleGroom({
      anchorStub: ANCHOR, action: "finalize",
      dependencies: dependencies(world, {
        cleanupOccupancy: vi.fn(async () => refusedPop),
        tearDownBranch,
      }),
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "lease-live" });
    expect(tearDownBranch).not.toHaveBeenCalled();
    expect(world).toMatchObject({ record: { state: "awaiting-merge" }, branch: true });
  });

  it("retains the identity when its branch generation cannot be torn down", async () => {
    const world: SettleWorld = { record: groom(), branch: true };
    const result = await settleGroom({
      anchorStub: ANCHOR, action: "abandon",
      dependencies: dependencies(world, {
        tearDownBranch: vi.fn(async () => ({
          kind: "refused" as const, message: "Local grooming head moved.",
        })),
      }),
    });

    expect(result).toMatchObject({
      outcome: "refused",
      reason: "preservation-unproven",
      recommendedPromptText: "Local grooming head moved.",
    });
    expect(world).toMatchObject({ record: { state: "open" }, branch: true });
  });

  it("refuses a tail whose host truth is not the state the action requires", async () => {
    const world: SettleWorld = { record: awaitingGroom(), branch: true };
    const cleanupOccupancy = vi.fn();
    const result = await settleGroom({
      anchorStub: ANCHOR, action: "finalize",
      dependencies: dependencies(world, {
        readTail: vi.fn(async () => ({ kind: "read" as const, truth: "open" as const })),
        cleanupOccupancy,
      }),
    });

    expect(result).toMatchObject({
      outcome: "refused",
      reason: "change-request-unverifiable",
      recommendedPromptText: "Grooming tail is 'open', not 'merged'.",
    });
    expect(cleanupOccupancy).not.toHaveBeenCalled();
    expect(world).toMatchObject({ record: { state: "awaiting-merge" }, branch: true });
  });

  it("refuses occupancy that outlived an already-deleted branch generation", async () => {
    const world: SettleWorld = { record: groom(), branch: false };
    const cleanupOccupancy = vi.fn();
    const result = await settleGroom({
      anchorStub: ANCHOR, action: "abandon",
      dependencies: dependencies(world, {
        readBranchGeneration: vi.fn(async () => ({ kind: "absent" as const })),
        cleanupOccupancy,
      }),
    });

    expect(result).toMatchObject({
      outcome: "refused",
      reason: "preservation-unproven",
      recommendedPromptText: "Grooming occupancy remains after its branch generation was deleted.",
    });
    expect(cleanupOccupancy).not.toHaveBeenCalled();
    expect(world.record).toMatchObject({ state: "open" });
  });

  it("retires an already-deleted branch generation once its occupancy is gone", async () => {
    const world: SettleWorld = { record: groom(), branch: false };
    const tearDownBranch = vi.fn();
    const result = await settleGroom({
      anchorStub: ANCHOR, action: "abandon",
      dependencies: dependencies(world, {
        readBranchGeneration: vi.fn(async () => ({ kind: "absent" as const })),
        readState: vi.fn(async () => ({ kind: "read" as const, state: locusStateFixture({ rows: [] }) })),
        tearDownBranch,
      }),
    });

    expect(result).toMatchObject({
      outcome: "applied",
      recommendedPromptText: "Grooming generation abandoned.",
    });
    expect(tearDownBranch).not.toHaveBeenCalled();
    expect(world.record).toBeNull();
  });

  it("refuses a generation other than the one the caller selected", async () => {
    const world: SettleWorld = { record: awaitingGroom(), branch: true };
    const cleanupOccupancy = vi.fn();
    const result = await settleGroom({
      anchorStub: ANCHOR, action: "finalize",
      selected: { recordId: `sha256:${"9".repeat(64)}`, leaseId: LEASE_ID },
      dependencies: dependencies(world, { cleanupOccupancy }),
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "lease-generation-mismatch" });
    expect(cleanupOccupancy).not.toHaveBeenCalled();
    expect(world).toMatchObject({ record: { state: "awaiting-merge" }, branch: true });
  });

  it("refuses to settle a partial grooming generation at all", async () => {
    const world: SettleWorld = { record: groom({ protection: "partial", branch: null }), branch: true };
    const readState = vi.fn();
    const result = await settleGroom({
      anchorStub: ANCHOR, action: "abandon", dependencies: dependencies(world, { readState }),
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "full-protection-required" });
    expect(readState).not.toHaveBeenCalled();
  });
});
