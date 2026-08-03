/** Ordinary v3 Errand finalization after exact checkout and role settlement. */

import { describe, expect, it, vi } from "vitest";

import {
  closeOrdinaryErrand,
  type CloseAuthorityGuard,
  type CloseOccupancyResult,
} from "../../../src/lib/errand/close-locus.js";
import { TransientIdentityRecordV3Schema } from "../../../src/lib/errand/identity-record.js";
import type { ChangeRequestLifecycleEvidence } from "../../../src/lib/errand/change-request-lifecycle.js";
import type { OrdinaryErrandRecord } from "../../../src/lib/errand/identity-transitions.js";

function awaiting(): OrdinaryErrandRecord {
  return TransientIdentityRecordV3Schema.parse({
    version: 3,
    slug: "done",
    claimId: "c".repeat(32),
    createdAt: "2026-07-20T12:00:00.000Z",
    updatedAt: "2026-07-20T12:01:00.000Z",
    kind: "errand",
    purpose: "errand",
    intent: "done",
    branch: "chore/done",
    origin: "inbox",
    originEntry: "Done capture",
    originEntrySourceDigest: `sha256:${"a".repeat(64)}`,
    state: "awaiting-merge",
    savedHead: null,
    changeRequest: {
      repositoryRef: "owner/repo",
      hostRef: "github.com",
      baseRef: "main",
      headRef: "chore/done",
      headSha: "a".repeat(40),
    },
  }) as OrdinaryErrandRecord;
}

/** The same Errand still occupying its checkout — merged in place, so it holds no change request. */
function open(): OrdinaryErrandRecord {
  return TransientIdentityRecordV3Schema.parse({
    ...awaiting(),
    state: "open",
    changeRequest: null,
  }) as OrdinaryErrandRecord;
}

const observedChangeRequest = {
  repositoryRef: "owner/repo",
  hostRef: "github.com",
  baseRef: "main",
  headRef: "chore/done",
  headSha: "a".repeat(40),
};

function resolved(): { kind: "resolved"; changeRequest: typeof observedChangeRequest } {
  return { kind: "resolved", changeRequest: observedChangeRequest };
}

function merged(record: OrdinaryErrandRecord): ChangeRequestLifecycleEvidence {
  if (record.state !== "awaiting-merge") throw new Error("expected awaiting tail");
  return { kind: "merged", changeRequest: record.changeRequest } as ChangeRequestLifecycleEvidence;
}

function clearOccupancy(
  guard: CloseAuthorityGuard | null = null,
  onSettle: () => void = () => undefined,
): CloseOccupancyResult {
  return {
    kind: "clear",
    settle: () => {
      onSettle();
      return Promise.resolve({
        kind: "idempotent",
        guard,
        recordId: null,
        sessionHomePath: null,
        restoredParent: null,
      });
    },
  };
}

describe("closeOrdinaryErrand", () => {
  it("finalizes exact merged refs, removes the inbox capture, and returns the next execute-bound offer", async () => {
    const record = awaiting();
    const events: string[] = [];
    const result = await closeOrdinaryErrand({
      slug: record.slug,
      protection: "full",
      force: false,
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record }),
        resolveTarget: async () => resolved(),
        readLifecycle: async () => merged(record),
        readOccupancy: async () => clearOccupancy(null, () => { events.push("settle"); }),
        cleanupRefs: async () => (events.push("refs"), { kind: "applied" }),
        removeInbox: async () => (events.push("inbox"), {
          kind: "removed",
          nextOffer: { kind: "errand", key: "next", parentCheckoutPath: null },
        }),
        retire: async () => (events.push("identity"), { kind: "applied" }),
      },
    });

    expect(events).toEqual(["settle", "refs", "inbox", "identity"]);
    expect(result).toMatchObject({
      outcome: "applied",
      operation: "errand-close",
      identity: null,
      originEntry: "Done capture",
      nextOffer: { key: "next" },
    });
  });

  it("propagates applied settlement coordinates through capture cleanup and the close result", async () => {
    const record = awaiting();
    const recordId = `sha256:${"1".repeat(64)}`;
    const restoredParent = {
      recordId: `sha256:${"2".repeat(64)}`,
      checkoutPath: "/repo-parent",
    };
    const removeInbox = vi.fn(async (_record: OrdinaryErrandRecord, sessionHomePath: string | null) => {
      expect(sessionHomePath).toBe("/repo-session");
      return { kind: "absent" as const, nextOffer: null };
    });
    const result = await closeOrdinaryErrand({
      slug: record.slug,
      protection: "full",
      force: false,
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record }),
        resolveTarget: async () => resolved(),
        readLifecycle: async () => merged(record),
        readOccupancy: async () => ({
          kind: "clear",
          settle: () => Promise.resolve({
            kind: "applied",
            guard: null,
            recordId,
            sessionHomePath: "/repo-session",
            restoredParent,
          }),
        }),
        cleanupRefs: async () => ({ kind: "idempotent" }),
        removeInbox,
        retire: async () => ({ kind: "idempotent" }),
      },
    });

    expect(removeInbox).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      outcome: "applied",
      operation: "errand-close",
      recordId,
      sessionHomePath: "/repo-session",
      restoredParent,
    });
  });

  it("holds base-checkout authority through every destructive close step", async () => {
    const record = awaiting();
    const events: string[] = [];
    const guard: CloseAuthorityGuard = {
      checkoutPath: "/repo",
      acquire: async () => {
        events.push("acquire");
        return { kind: "acquired", release: async () => { events.push("release"); } };
      },
      revalidate: async () => {
        events.push("revalidate");
        return { kind: "valid" };
      },
    };
    const result = await closeOrdinaryErrand({
      slug: record.slug,
      protection: "full",
      force: false,
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record }),
        resolveTarget: async () => resolved(),
        readLifecycle: async () => merged(record),
        readOccupancy: async () => clearOccupancy(guard, () => { events.push("settle"); }),
        cleanupRefs: async () => (events.push("refs"), { kind: "applied" }),
        removeInbox: async () => (events.push("inbox"), { kind: "removed", nextOffer: null }),
        retire: async () => (events.push("identity"), { kind: "applied" }),
      },
    });

    expect(result).toMatchObject({ outcome: "applied", operation: "errand-close" });
    expect(events).toEqual([
      "settle",
      "acquire",
      "refs",
      "revalidate",
      "inbox",
      "revalidate",
      "identity",
      "release",
    ]);
  });

  it("retains refs, capture, and identity when checkout settlement refuses", async () => {
    const record = awaiting();
    const cleanupRefs = vi.fn();
    const removeInbox = vi.fn();
    const retire = vi.fn();
    const result = await closeOrdinaryErrand({
      slug: record.slug,
      protection: "full",
      force: false,
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record }),
        resolveTarget: async () => resolved(),
        readLifecycle: async () => merged(record),
        readOccupancy: async () => ({
          kind: "clear",
          settle: () => Promise.resolve({
            kind: "refused",
            reason: "preservation-unproven",
            message: "The occupied Errand checkout is dirty.",
          }),
        }),
        cleanupRefs,
        removeInbox,
        retire,
      },
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "preservation-unproven" });
    expect(cleanupRefs).not.toHaveBeenCalled();
    expect(removeInbox).not.toHaveBeenCalled();
    expect(retire).not.toHaveBeenCalled();
  });

  it("retains refs, capture, and identity when checkout settlement returns an error", async () => {
    const record = awaiting();
    const cleanupRefs = vi.fn();
    const removeInbox = vi.fn();
    const retire = vi.fn();
    const result = await closeOrdinaryErrand({
      slug: record.slug,
      protection: "full",
      force: false,
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record }),
        resolveTarget: async () => resolved(),
        readLifecycle: async () => merged(record),
        readOccupancy: async () => ({
          kind: "clear",
          settle: () => Promise.resolve({ kind: "error", message: "settlement failed" }),
        }),
        cleanupRefs,
        removeInbox,
        retire,
      },
    });

    expect(result).toMatchObject({
      outcome: "error",
      error: { code: "locus.errand-close.occupancy", message: "settlement failed" },
    });
    expect(cleanupRefs).not.toHaveBeenCalled();
    expect(removeInbox).not.toHaveBeenCalled();
    expect(retire).not.toHaveBeenCalled();
  });

  it("retains refs, capture, and identity when checkout settlement throws", async () => {
    const record = awaiting();
    const cleanupRefs = vi.fn();
    const removeInbox = vi.fn();
    const retire = vi.fn();
    const result = await closeOrdinaryErrand({
      slug: record.slug,
      protection: "full",
      force: false,
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record }),
        resolveTarget: async () => resolved(),
        readLifecycle: async () => merged(record),
        readOccupancy: async () => ({
          kind: "clear",
          settle: () => Promise.reject(new Error("settlement crashed")),
        }),
        cleanupRefs,
        removeInbox,
        retire,
      },
    });

    expect(result).toMatchObject({
      outcome: "error",
      error: { code: "locus.errand-close.occupancy", message: "settlement crashed" },
    });
    expect(cleanupRefs).not.toHaveBeenCalled();
    expect(removeInbox).not.toHaveBeenCalled();
    expect(retire).not.toHaveBeenCalled();
  });

  it("finalizes an Errand that merged while its checkout was still occupied", async () => {
    const record = open();
    const targets: unknown[] = [];
    const result = await closeOrdinaryErrand({
      slug: record.slug,
      protection: "full",
      force: false,
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record }),
        resolveTarget: async () => resolved(),
        readLifecycle: async (target) => (targets.push(target), {
          kind: "merged",
          changeRequest: target.changeRequest,
        } as ChangeRequestLifecycleEvidence),
        readOccupancy: async () => clearOccupancy(),
        cleanupRefs: async (target) => (targets.push(target), { kind: "applied" }),
        removeInbox: async () => ({ kind: "removed", nextOffer: null }),
        retire: async (target) => (targets.push(target), { kind: "applied" }),
      },
    });

    expect(result).toMatchObject({ outcome: "applied", operation: "errand-close", originEntry: "Done capture" });
    // Host truth, ref cleanup, and retirement all read the one observed change request.
    expect(targets).toEqual([
      { record, changeRequest: observedChangeRequest },
      { record, changeRequest: observedChangeRequest },
      { record, changeRequest: observedChangeRequest },
    ]);
  });

  it("refuses an open Errand whose merged change request cannot be resolved", async () => {
    const record = open();
    const cleanupRefs = vi.fn();
    const result = await closeOrdinaryErrand({
      slug: record.slug,
      protection: "full",
      force: false,
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record }),
        resolveTarget: async () => ({
          kind: "refused",
          reason: "change-request-unverifiable",
          message: "Expected exactly one merged change request for the Errand branch.",
        }),
        readLifecycle: vi.fn(),
        readOccupancy: async () => clearOccupancy(),
        cleanupRefs,
        removeInbox: vi.fn(),
        retire: vi.fn(),
      },
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "change-request-unverifiable" });
    expect(cleanupRefs).not.toHaveBeenCalled();
  });

  it("refuses a paused Errand, which has no change request to finalize", async () => {
    const paused = TransientIdentityRecordV3Schema.parse({
      ...awaiting(),
      state: "paused",
      savedHead: "b".repeat(40),
      changeRequest: null,
    }) as OrdinaryErrandRecord;
    const resolveTarget = vi.fn();
    const result = await closeOrdinaryErrand({
      slug: paused.slug,
      protection: "full",
      force: false,
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record: paused }),
        resolveTarget,
        readLifecycle: vi.fn(),
        readOccupancy: async () => clearOccupancy(),
        cleanupRefs: vi.fn(),
        removeInbox: vi.fn(),
        retire: vi.fn(),
      },
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "identity-conflict" });
    expect(resolveTarget).not.toHaveBeenCalled();
  });

  it("retains identity when exact ref cleanup or inbox mutation is unsafe", async () => {
    const record = awaiting();
    const retire = vi.fn();
    const moved = await closeOrdinaryErrand({
      slug: record.slug,
      protection: "full",
      force: false,
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record }),
        resolveTarget: async () => resolved(),
        readLifecycle: async () => merged(record),
        readOccupancy: async () => clearOccupancy(),
        cleanupRefs: async () => ({ kind: "refused", reason: "preservation-unproven", message: "head moved" }),
        removeInbox: vi.fn(),
        retire,
      },
    });
    expect(moved).toMatchObject({ outcome: "refused", reason: "preservation-unproven" });
    expect(retire).not.toHaveBeenCalled();

    const raced = await closeOrdinaryErrand({
      slug: record.slug,
      protection: "full",
      force: false,
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record }),
        resolveTarget: async () => resolved(),
        readLifecycle: async () => merged(record),
        readOccupancy: async () => clearOccupancy(),
        cleanupRefs: async () => ({ kind: "idempotent" }),
        removeInbox: async () => ({ kind: "error", message: "notes lock raced" }),
        retire,
      },
    });
    expect(raced).toMatchObject({ outcome: "error", error: { code: "locus.errand-close.inbox" } });
    expect(retire).not.toHaveBeenCalled();
  });

  it("reports completed ref cleanup when capture settlement or retirement refuses", async () => {
    const record = awaiting();
    const captureRefused = await closeOrdinaryErrand({
      slug: record.slug,
      protection: "full",
      force: false,
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record }),
        resolveTarget: async () => resolved(),
        readLifecycle: async () => merged(record),
        readOccupancy: async () => clearOccupancy(),
        cleanupRefs: async () => ({ kind: "applied" }),
        removeInbox: async () => ({ kind: "refused", reason: "capture generation changed" }),
        retire: vi.fn(),
      },
    });
    expect(captureRefused).toMatchObject({
      outcome: "refused",
      reason: "identity-conflict",
      recommendedPromptText: expect.stringContaining("refs were cleaned up"),
    });

    const retirementRefused = await closeOrdinaryErrand({
      slug: record.slug,
      protection: "full",
      force: false,
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record }),
        resolveTarget: async () => resolved(),
        readLifecycle: async () => merged(record),
        readOccupancy: async () => clearOccupancy(),
        cleanupRefs: async () => ({ kind: "idempotent" }),
        removeInbox: async () => ({ kind: "removed", nextOffer: null }),
        retire: async () => ({ kind: "refused", reason: "identity generation changed" }),
      },
    });
    expect(retirementRefused).toMatchObject({
      outcome: "refused",
      reason: "identity-conflict",
      recommendedPromptText: expect.stringContaining("refs were cleaned up"),
    });
  });

  it("revalidates base-checkout authority after ref cleanup before removing the capture", async () => {
    const record = awaiting();
    const release = vi.fn();
    const guard: CloseAuthorityGuard = {
      checkoutPath: "/repo",
      acquire: vi.fn().mockResolvedValue({ kind: "acquired", release }),
      revalidate: vi.fn().mockResolvedValue({
        kind: "refused",
        reason: "role-conflict",
        message: "checkout left base",
      }),
    };
    const removeInbox = vi.fn();
    const retire = vi.fn();
    const result = await closeOrdinaryErrand({
      slug: record.slug,
      protection: "full",
      force: false,
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record }),
        resolveTarget: async () => resolved(),
        readLifecycle: async () => merged(record),
        readOccupancy: async () => clearOccupancy(guard),
        cleanupRefs: async (_target, receivedGuard) => {
          expect(receivedGuard).toBe(guard);
          return { kind: "applied" };
        },
        removeInbox,
        retire,
      },
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "role-conflict" });
    expect(guard.revalidate).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
    expect(removeInbox).not.toHaveBeenCalled();
    expect(retire).not.toHaveBeenCalled();
  });

  it("revalidates base-checkout authority after capture settlement before retiring identity", async () => {
    const record = awaiting();
    const release = vi.fn();
    const guard: CloseAuthorityGuard = {
      checkoutPath: "/repo",
      acquire: vi.fn().mockResolvedValue({ kind: "acquired", release }),
      revalidate: vi.fn()
        .mockResolvedValueOnce({ kind: "valid" })
        .mockResolvedValueOnce({
          kind: "refused",
          reason: "role-conflict",
          message: "checkout left base",
        }),
    };
    const retire = vi.fn();
    const result = await closeOrdinaryErrand({
      slug: record.slug,
      protection: "full",
      force: false,
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record }),
        resolveTarget: async () => resolved(),
        readLifecycle: async () => merged(record),
        readOccupancy: async () => clearOccupancy(guard),
        cleanupRefs: async () => ({ kind: "applied" }),
        removeInbox: async () => ({ kind: "removed", nextOffer: null }),
        retire,
      },
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "role-conflict" });
    expect(guard.revalidate).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenCalledOnce();
    expect(retire).not.toHaveBeenCalled();
  });

  it("retains everything when base-checkout authority cannot be locked", async () => {
    const record = awaiting();
    const cleanupRefs = vi.fn();
    const guard: CloseAuthorityGuard = {
      checkoutPath: "/repo",
      acquire: async () => ({
        kind: "refused",
        reason: "role-conflict",
        message: "checkout HEAD is locked",
      }),
      revalidate: vi.fn(),
    };
    const result = await closeOrdinaryErrand({
      slug: record.slug,
      protection: "full",
      force: false,
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record }),
        resolveTarget: async () => resolved(),
        readLifecycle: async () => merged(record),
        readOccupancy: async () => clearOccupancy(guard),
        cleanupRefs,
        removeInbox: vi.fn(),
        retire: vi.fn(),
      },
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "role-conflict" });
    expect(cleanupRefs).not.toHaveBeenCalled();
    expect(guard.revalidate).not.toHaveBeenCalled();
  });

  it("refuses foreign occupancy before any ref, capture, or identity is destroyed", async () => {
    const record = awaiting();
    const cleanupRefs = vi.fn();
    const removeInbox = vi.fn();
    const retire = vi.fn();
    const result = await closeOrdinaryErrand({
      slug: record.slug,
      protection: "full",
      force: false,
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record }),
        resolveTarget: async () => resolved(),
        readLifecycle: async () => merged(record),
        readOccupancy: async () => ({
          kind: "refused",
          reason: "lease-live",
          message: "Errand 'done' is occupied by another session at '/repo-errand'; resume or close it there.",
        }),
        cleanupRefs,
        removeInbox,
        retire,
      },
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "lease-live" });
    expect(cleanupRefs).not.toHaveBeenCalled();
    expect(removeInbox).not.toHaveBeenCalled();
    expect(retire).not.toHaveBeenCalled();
  });

  it("retains everything when occupancy cannot be read at all", async () => {
    const record = awaiting();
    const cleanupRefs = vi.fn();
    const result = await closeOrdinaryErrand({
      slug: record.slug,
      protection: "full",
      force: false,
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record }),
        resolveTarget: async () => resolved(),
        readLifecycle: async () => merged(record),
        readOccupancy: async () => ({ kind: "error", message: "record root unavailable" }),
        cleanupRefs,
        removeInbox: vi.fn(),
        retire: vi.fn(),
      },
    });

    expect(result).toMatchObject({ outcome: "error", error: { code: "locus.errand-close.occupancy" } });
    expect(cleanupRefs).not.toHaveBeenCalled();
  });

  it("refuses force and every non-merged host result for v3", async () => {
    const record = awaiting();
    const cleanupRefs = vi.fn();
    const force = await closeOrdinaryErrand({
      slug: record.slug,
      protection: "full",
      force: true,
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record }),
        resolveTarget: async () => resolved(),
        readLifecycle: vi.fn(),
        readOccupancy: async () => clearOccupancy(),
        cleanupRefs,
        removeInbox: vi.fn(),
        retire: vi.fn(),
      },
    });
    expect(force).toMatchObject({ outcome: "refused", reason: "identity-conflict" });
    expect(cleanupRefs).not.toHaveBeenCalled();

    for (const kind of [
      "open", "requested-work", "closed-unmerged", "changed-head", "missing", "ambiguous", "unreachable",
    ] as const) {
      const result = await closeOrdinaryErrand({
        slug: record.slug,
        protection: "full",
        force: false,
        dependencies: {
          readIdentity: async () => ({ kind: "ready", record }),
          resolveTarget: async () => resolved(),
          readLifecycle: async () => ({ kind, changeRequest: record.changeRequest } as ChangeRequestLifecycleEvidence),
          readOccupancy: async () => clearOccupancy(),
          cleanupRefs,
          removeInbox: vi.fn(),
          retire: vi.fn(),
        },
      });
      expect(result).toMatchObject({ outcome: "refused" });
    }
    expect(cleanupRefs).not.toHaveBeenCalled();
  });
});
