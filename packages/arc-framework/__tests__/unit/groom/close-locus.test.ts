/** Exact grooming close composition. */

import { describe, expect, it, vi } from "vitest";

import {
  closeGroom,
  type CloseGroomDependencies,
} from "../../../src/lib/groom/close-locus.js";
import {
  TransientIdentityRecordV3Schema,
  type GroomIdentityRecord,
  type SettledPartialGroomRecord,
} from "../../../src/lib/errand/index.js";
import { createLocusMutationResult } from "../../../src/lib/locus/mutation.js";
import type { LocusRowV1 } from "../../../src/lib/locus/schema/index.js";
import { locusStateFixture } from "../../fixtures/locus-state.js";

const ANCHOR = "alpha";
const CHECKOUT = "/repo";
const RECORD_ID = `sha256:${"1".repeat(64)}`;
const LEASE_ID = "3".repeat(32);
const CLAIM_ID = "1".repeat(32);
const BASE_HEAD = "a".repeat(40);
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
    openedBaseHead: BASE_HEAD,
    protection: "full",
    branch: "chore/groom-alpha",
    state: "open",
    changeRequest: null,
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    ...overrides,
  }) as GroomIdentityRecord;
}

function partialGroom(overrides: Record<string, unknown> = {}): GroomIdentityRecord {
  return groom({ protection: "partial", branch: null, ...overrides });
}

function groomRow(overrides: Partial<LocusRowV1> = {}): LocusRowV1 {
  return {
    kind: "managed-role", checkoutPath: CHECKOUT, primary: true, recordId: RECORD_ID,
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

/** The identity tree as the close sees it, so ordering shows up as retained state. */
interface IdentityWorld {
  record: GroomIdentityRecord | null;
}

const popped = createLocusMutationResult({
  outcome: "applied", operation: "plan-close", allocation: null, recordId: RECORD_ID, leaseId: null,
  activeLocusPath: null, sessionHomePath: null, identity: null, originEntry: null,
  restoredParent: null, nextOffer: null, recommendedPromptText: "Grooming occupancy removed.",
});

/**
 * Dependencies whose evidence all passes, so each test can fail exactly one thing.
 *
 * Identity writes land in `world`, which is what distinguishes an ordering claim from a call
 * count: a refused pop that still leaves the claim settled is the recoverable residue.
 */
function dependencies(
  world: IdentityWorld,
  overrides: Partial<CloseGroomDependencies> = {},
): CloseGroomDependencies {
  return {
    readClaim: vi.fn(async () => ({ kind: "ready" as const, value: world.record })),
    readState: vi.fn(async () => ({ kind: "read" as const, state: locusStateFixture({ rows: [groomRow()] }) })),
    pinBaseHead: vi.fn(async () => ({ kind: "pinned" as const, head: HEAD })),
    readCheckout: vi.fn(async () => ({ dirty: false, head: HEAD })),
    isAncestor: vi.fn(async () => true),
    changedPaths: vi.fn(async () => [".arc/backlog/planned/meta-alpha.md"]),
    claimedCohortPaths: vi.fn(async () => []),
    settleClaim: vi.fn(async (record: GroomIdentityRecord, head: string) => {
      const settled = groom({
        protection: "partial", branch: null, state: "settled", savedHead: head,
        claimId: record.claimId,
      }) as SettledPartialGroomRecord;
      world.record = settled;
      return { kind: "ready" as const, value: settled };
    }),
    observeChangeRequest: vi.fn(async () => ({
      kind: "observed" as const, changeRequest: CHANGE_REQUEST,
    })),
    persistAwaitingMerge: vi.fn(async () => {
      const awaiting = groom({ state: "awaiting-merge", changeRequest: CHANGE_REQUEST });
      world.record = awaiting;
      return { kind: "ready" as const, value: awaiting };
    }),
    cleanupOccupancy: vi.fn(async () => popped),
    retireClaim: vi.fn(async () => {
      world.record = null;
      return { kind: "retired" as const, tip: null };
    }),
    ...overrides,
  };
}

const refusedPop = createLocusMutationResult({
  outcome: "refused", operation: "plan-close", reason: "lease-live",
  recommendedPromptText: "Grooming session locus lock unavailable.",
});

describe("closeGroom — partial protection", () => {
  it("leaves the proven head recorded when occupancy removal refuses", async () => {
    const world: IdentityWorld = { record: partialGroom() };
    const retireClaim = vi.fn();
    const result = await closeGroom({
      anchorStub: ANCHOR,
      dependencies: dependencies(world, {
        cleanupOccupancy: vi.fn(async () => refusedPop),
        retireClaim,
      }),
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "lease-live" });
    expect(world.record).toMatchObject({ state: "settled", savedHead: HEAD });
    expect(retireClaim).not.toHaveBeenCalled();
  });

  it("retires the settled claim once its occupancy is gone", async () => {
    const world: IdentityWorld = { record: partialGroom() };
    const result = await closeGroom({ anchorStub: ANCHOR, dependencies: dependencies(world) });

    expect(result).toMatchObject({
      outcome: "applied",
      operation: "plan-close",
      recommendedPromptText: "Partial grooming completed on the configured base.",
    });
    expect(world.record).toBeNull();
  });

  it("keeps a settled claim whose head never reached the pushed base", async () => {
    const world: IdentityWorld = {
      record: partialGroom({ state: "settled", savedHead: HEAD }),
    };
    const retireClaim = vi.fn();
    const result = await closeGroom({
      anchorStub: ANCHOR,
      dependencies: dependencies(world, {
        // Contained in its own checkout, absent from the base the close pinned.
        isAncestor: vi.fn(async (ancestor: string) => ancestor !== HEAD),
        retireClaim,
      }),
    });

    expect(result).toMatchObject({
      outcome: "refused",
      reason: "preservation-unproven",
      recommendedPromptText: "Settled partial grooming head is not contained in the pushed base.",
    });
    expect(retireClaim).not.toHaveBeenCalled();
    expect(world.record).toMatchObject({ state: "settled" });
  });

  it("retires a settled claim whose checkout is already gone without touching occupancy", async () => {
    const world: IdentityWorld = {
      record: partialGroom({ state: "settled", savedHead: HEAD }),
    };
    const cleanupOccupancy = vi.fn();
    const result = await closeGroom({
      anchorStub: ANCHOR,
      dependencies: dependencies(world, {
        readState: vi.fn(async () => ({ kind: "read" as const, state: locusStateFixture({ rows: [] }) })),
        cleanupOccupancy,
      }),
    });

    expect(result).toMatchObject({ outcome: "applied" });
    expect(cleanupOccupancy).not.toHaveBeenCalled();
    expect(world.record).toBeNull();
  });

  it("refuses an unsettled claim whose occupancy is absent", async () => {
    const world: IdentityWorld = { record: partialGroom() };
    const result = await closeGroom({
      anchorStub: ANCHOR,
      dependencies: dependencies(world, {
        readState: vi.fn(async () => ({ kind: "read" as const, state: locusStateFixture({ rows: [] }) })),
      }),
    });

    expect(result).toMatchObject({
      outcome: "refused",
      reason: "checkout-missing",
      recommendedPromptText: "Exact grooming occupancy is absent.",
    });
    expect(world.record).toMatchObject({ state: "open" });
  });
});

describe("closeGroom — full protection", () => {
  it("records the change request before occupancy removal can lose it", async () => {
    const world: IdentityWorld = { record: groom() };
    const result = await closeGroom({
      anchorStub: ANCHOR,
      dependencies: dependencies(world, { cleanupOccupancy: vi.fn(async () => refusedPop) }),
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "lease-live" });
    expect(world.record).toMatchObject({ state: "awaiting-merge", changeRequest: CHANGE_REQUEST });
  });

  it("leaves the open generation untouched when its change request is unverifiable", async () => {
    const world: IdentityWorld = { record: groom() };
    const cleanupOccupancy = vi.fn();
    const result = await closeGroom({
      anchorStub: ANCHOR,
      dependencies: dependencies(world, {
        observeChangeRequest: vi.fn(async () => ({
          kind: "unverifiable" as const, message: "No remote change request is observable.",
        })),
        cleanupOccupancy,
      }),
    });

    expect(result).toMatchObject({
      outcome: "refused",
      reason: "change-request-unverifiable",
      recommendedPromptText: "No remote change request is observable.",
    });
    expect(world.record).toMatchObject({ state: "open", changeRequest: null });
    expect(cleanupOccupancy).not.toHaveBeenCalled();
  });

  it("refuses a diff reaching outside the claimed set before any identity write", async () => {
    const world: IdentityWorld = { record: groom() };
    const result = await closeGroom({
      anchorStub: ANCHOR,
      dependencies: dependencies(world, {
        changedPaths: vi.fn(async () => ["packages/arc-framework/src/cli.ts"]),
      }),
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "identity-conflict" });
    expect(world.record).toMatchObject({ state: "open" });
  });
});
