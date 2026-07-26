/** Identity-free partial-Errand settlement composition. */

import { describe, expect, it, vi } from "vitest";

import {
  settlePartialErrand,
  type SettlePartialErrandDependencies,
} from "../../../src/lib/errand/partial-settle.js";
import { createLocusMutationResult } from "../../../src/lib/locus/mutation.js";
import type { LocusRowV1, LocusStateV1 } from "../../../src/lib/locus/schema/index.js";

const SLUG = "fix-output";
const CHECKOUT = "/repo";
const RECORD_ID = `sha256:${"1".repeat(64)}`;
const LEASE_ID = "3".repeat(32);

function partialRow(overrides: Partial<LocusRowV1> = {}): LocusRowV1 {
  return {
    kind: "managed-role", checkoutPath: CHECKOUT, primary: true, recordId: RECORD_ID,
    role: {
      kind: "partial-errand", subject: { kind: "partial-errand", key: SLUG, claimId: null },
      parentCheckoutPath: null, originEntry: "Fix output",
    },
    identity: null,
    lease: {
      leaseId: LEASE_ID, selfHeld: false, state: "live", sessionHomePath: CHECKOUT,
      attachedAt: "2026-07-20T00:00:00.000Z", heartbeatAt: "2026-07-20T00:00:00.000Z",
    },
    frame: "active", derived: null, diagnostics: [],
    ...overrides,
  };
}

function state(rows: LocusRowV1[]): LocusStateV1 {
  return {
    roster: { mode: "locus", ok: true, primaryPath: CHECKOUT, rows, diagnostics: [] },
    current: { kind: "none" },
    primaryAvailability: { kind: "free", checkoutPath: CHECKOUT },
    inFlightIdentities: [],
    recovery: { kind: "none" },
    reconciliation: { kind: "clean" },
  } as LocusStateV1;
}

/**
 * Dependencies whose evidence all passes, so each test can fail exactly one thing.
 *
 * Every signal starts green — owned generation, pinned base, clean checkout — which isolates the
 * ordering question from the evidence questions each test overrides.
 */
function dependencies(
  overrides: Partial<SettlePartialErrandDependencies> = {},
): SettlePartialErrandDependencies {
  return {
    readState: vi.fn(async () => state([partialRow()])),
    pinBaseHead: vi.fn(async () => ({ kind: "pinned" as const, head: "a".repeat(40) })),
    verifyBase: vi.fn(async () => null),
    acquireLock: vi.fn(async () => ({
      kind: "acquired" as const,
      generation: {
        validate: vi.fn(async () => ({ kind: "owned" as const })),
        pop: vi.fn(async () => ({
          outcome: "applied" as const, operation: "errand-close" as const,
          allocation: null, recordId: RECORD_ID, leaseId: null, activeLocusPath: null,
          sessionHomePath: null, identity: null, originEntry: null, restoredParent: null,
          nextOffer: null, recommendedPromptText: "Popped.",
        })),
      },
      release: vi.fn(async () => undefined),
    })),
    settleInbox: vi.fn(async () => ({ kind: "applied" as const, nextOffer: null })),
    ...overrides,
  };
}

describe("settlePartialErrand", () => {
  it("proves the locked generation is its own before the capture is settled", async () => {
    const settleInbox = vi.fn(async () => ({ kind: "applied" as const, nextOffer: null }));
    // Faithful to production: a generation `validate` rejects is one `pop` rejects the same way.
    const pop = vi.fn(async () => createLocusMutationResult({
      outcome: "refused", operation: "errand-close", reason: "lease-generation-mismatch",
      recommendedPromptText: "Not the caller's generation.",
    }));
    const deps = dependencies({
      settleInbox,
      acquireLock: vi.fn(async () => ({
        kind: "acquired" as const,
        generation: {
          validate: vi.fn(async () => ({ kind: "refused" as const, reason: "lease-generation-mismatch" as const })),
          pop,
        },
        release: vi.fn(async () => undefined),
      })),
    });

    const result = await settlePartialErrand({ slug: SLUG, action: "close", dependencies: deps });

    expect(result).toMatchObject({ outcome: "refused", reason: "lease-generation-mismatch" });
    expect(settleInbox).not.toHaveBeenCalled();
    expect(pop).not.toHaveBeenCalled();
  });

  it("settles the capture and pops the role once ownership holds", async () => {
    const deps = dependencies();
    const result = await settlePartialErrand({ slug: SLUG, action: "close", dependencies: deps });

    expect(result).toMatchObject({ outcome: "applied", operation: "errand-close", recordId: RECORD_ID });
    expect(deps.settleInbox).toHaveBeenCalledWith({ originEntry: "Fix output", parentCheckoutPath: null });
  });

  it("leaves the capture alone when the role vanished under the lock", async () => {
    const settleInbox = vi.fn(async () => ({ kind: "applied" as const, nextOffer: null }));
    const result = await settlePartialErrand({
      slug: SLUG, action: "close",
      dependencies: dependencies({
        settleInbox,
        acquireLock: vi.fn(async () => ({
          kind: "acquired" as const,
          generation: {
            validate: vi.fn(async () => ({ kind: "absent" as const })),
            pop: vi.fn(async () => createLocusMutationResult({
              outcome: "idempotent", operation: "errand-close",
              allocation: null, recordId: null, leaseId: null, activeLocusPath: null,
              sessionHomePath: null, identity: null, originEntry: null, restoredParent: null,
              nextOffer: null, recommendedPromptText: "Absent.",
            })),
          },
          release: vi.fn(async () => undefined),
        })),
      }),
    });

    expect(result).toMatchObject({ outcome: "idempotent" });
    expect(settleInbox).not.toHaveBeenCalled();
  });

  it("releases the lock when settlement refuses after ownership holds", async () => {
    const release = vi.fn(async () => undefined);
    const pop = vi.fn();
    const result = await settlePartialErrand({
      slug: SLUG, action: "close",
      dependencies: dependencies({
        settleInbox: vi.fn(async () => ({ kind: "refused" as const, reason: "Capture is bound elsewhere." })),
        acquireLock: vi.fn(async () => ({
          kind: "acquired" as const,
          generation: { validate: vi.fn(async () => ({ kind: "owned" as const })), pop },
          release,
        })),
      }),
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "identity-conflict" });
    expect(pop).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("refuses an off-base checkout before acquiring the lock at all", async () => {
    const acquireLock = vi.fn();
    const settleInbox = vi.fn(async () => ({ kind: "applied" as const, nextOffer: null }));
    const result = await settlePartialErrand({
      slug: SLUG, action: "close",
      dependencies: dependencies({
        acquireLock,
        settleInbox,
        verifyBase: vi.fn(async () => "Partial Errand checkout is dirty."),
      }),
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "preservation-unproven" });
    expect(acquireLock).not.toHaveBeenCalled();
    expect(settleInbox).not.toHaveBeenCalled();
  });
});
