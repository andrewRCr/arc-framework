/** Exact occupancy-closing composition for ordinary-Errand leave. */

import { describe, expect, it, vi } from "vitest";

import {
  closeLeaveOccupancy,
  type CloseLeaveOccupancyDependencies,
  type LeaveOccupancyTarget,
} from "../../../src/lib/errand/leave-cleanup.js";
import { createLocusMutationResult } from "../../../src/lib/locus/mutation.js";

const TARGET: LeaveOccupancyTarget = {
  checkoutPath: "/repo-locus",
  recordId: `sha256:${"1".repeat(64)}`,
  leaseId: "3".repeat(32),
  allocation: "spawned",
};

const PARENT = { recordId: `sha256:${"2".repeat(64)}`, checkoutPath: "/repo-wu" };

/**
 * Dependencies whose evidence all passes, so each test can fail exactly one thing.
 *
 * Every signal starts green — owned generation, preserved checkout, applied pop — which isolates
 * the ordering question from the evidence questions each test overrides.
 */
function dependencies(
  overrides: Partial<CloseLeaveOccupancyDependencies> = {},
): CloseLeaveOccupancyDependencies {
  return {
    acquireLock: vi.fn(async () => ({
      kind: "acquired" as const,
      generation: {
        validate: vi.fn(async () => ({ kind: "owned" as const })),
        pop: vi.fn(async () => createLocusMutationResult({
          outcome: "applied", operation: "errand-leave",
          allocation: null, recordId: TARGET.recordId, leaseId: null, activeLocusPath: null,
          sessionHomePath: null, identity: null, originEntry: null, restoredParent: null,
          nextOffer: null, recommendedPromptText: "Errand occupancy removed.",
        })),
      },
      release: vi.fn(async () => undefined),
    })),
    preserveCheckout: vi.fn(async () => null),
    ...overrides,
  };
}

describe("closeLeaveOccupancy", () => {
  it("proves the locked generation is its own before the checkout is preserved", async () => {
    // Faithful to production: a generation `validate` rejects is one `pop` rejects the same way.
    const pop = vi.fn(async () => createLocusMutationResult({
      outcome: "refused", operation: "errand-leave", reason: "lease-generation-mismatch",
      recommendedPromptText: "Not the caller's generation.",
    }));
    const deps = dependencies({
      acquireLock: vi.fn(async () => ({
        kind: "acquired" as const,
        generation: {
          validate: vi.fn(async () => ({ kind: "refused" as const, reason: "lease-generation-mismatch" as const })),
          pop,
        },
        release: vi.fn(async () => undefined),
      })),
    });

    const result = await closeLeaveOccupancy({ target: TARGET, restoredParent: PARENT, dependencies: deps });

    expect(result).toMatchObject({ kind: "refused", reason: "lease-generation-mismatch" });
    expect(deps.preserveCheckout).not.toHaveBeenCalled();
    expect(pop).not.toHaveBeenCalled();
  });

  it("preserves the checkout and pops the role once ownership holds", async () => {
    const deps = dependencies();

    const result = await closeLeaveOccupancy({ target: TARGET, restoredParent: PARENT, dependencies: deps });

    expect(result).toEqual({
      kind: "applied",
      allocation: { kind: "spawned", checkoutPath: TARGET.checkoutPath },
      recordId: TARGET.recordId,
      restoredParent: PARENT,
    });
    expect(deps.preserveCheckout).toHaveBeenCalledTimes(1);
  });

  it("leaves the checkout alone when the role vanished under the lock", async () => {
    const deps = dependencies({
      acquireLock: vi.fn(async () => ({
        kind: "acquired" as const,
        generation: {
          validate: vi.fn(async () => ({ kind: "absent" as const })),
          pop: vi.fn(async () => createLocusMutationResult({
            outcome: "idempotent", operation: "errand-leave",
            allocation: null, recordId: null, leaseId: null, activeLocusPath: null,
            sessionHomePath: null, identity: null, originEntry: null, restoredParent: null,
            nextOffer: null, recommendedPromptText: "Absent.",
          })),
        },
        release: vi.fn(async () => undefined),
      })),
    });

    const result = await closeLeaveOccupancy({ target: TARGET, restoredParent: PARENT, dependencies: deps });

    expect(result).toEqual({ kind: "idempotent", allocation: null, recordId: null, restoredParent: PARENT });
    expect(deps.preserveCheckout).not.toHaveBeenCalled();
  });

  it("refuses an unavailable lock without reading the record or touching the checkout", async () => {
    const live = dependencies({ acquireLock: vi.fn(async () => ({ kind: "refused" as const, reason: "live" as const })) });
    const unknown = dependencies({
      acquireLock: vi.fn(async () => ({ kind: "refused" as const, reason: "timeout" as const })),
    });

    const heldLive = await closeLeaveOccupancy({ target: TARGET, restoredParent: PARENT, dependencies: live });
    const unverifiable = await closeLeaveOccupancy({ target: TARGET, restoredParent: PARENT, dependencies: unknown });

    expect(heldLive).toMatchObject({ kind: "refused", reason: "lease-live" });
    expect(unverifiable).toMatchObject({ kind: "refused", reason: "lease-unknown" });
    expect(live.preserveCheckout).not.toHaveBeenCalled();
    expect(unknown.preserveCheckout).not.toHaveBeenCalled();
  });

  it("releases the lock and retains the role when the checkout cannot be preserved", async () => {
    const release = vi.fn(async () => undefined);
    const pop = vi.fn();
    const deps = dependencies({
      acquireLock: vi.fn(async () => ({
        kind: "acquired" as const,
        generation: { validate: vi.fn(async () => ({ kind: "owned" as const })), pop },
        release,
      })),
      preserveCheckout: vi.fn(async () => ({
        kind: "refused" as const,
        reason: "preservation-unproven" as const,
        message: "Primary Errand checkout is dirty.",
      })),
    });

    const result = await closeLeaveOccupancy({ target: TARGET, restoredParent: PARENT, dependencies: deps });

    expect(result).toMatchObject({ kind: "refused", reason: "preservation-unproven" });
    expect(pop).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("reports the pop's own refusal once the checkout is already preserved", async () => {
    const deps = dependencies({
      acquireLock: vi.fn(async () => ({
        kind: "acquired" as const,
        generation: {
          validate: vi.fn(async () => ({ kind: "owned" as const })),
          pop: vi.fn(async () => createLocusMutationResult({
            outcome: "refused", operation: "errand-leave", reason: "lease-generation-mismatch",
            recommendedPromptText: "The generation changed under the lock.",
          })),
        },
        release: vi.fn(async () => undefined),
      })),
    });

    const result = await closeLeaveOccupancy({ target: TARGET, restoredParent: PARENT, dependencies: deps });

    expect(result).toEqual({
      kind: "refused",
      reason: "lease-generation-mismatch",
      message: "The generation changed under the lock.",
    });
  });
});
