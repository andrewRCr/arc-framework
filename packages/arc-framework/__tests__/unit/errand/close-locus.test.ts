/** Ordinary v3 Errand finalization after local occupancy has already left. */

import { describe, expect, it, vi } from "vitest";

import { closeOrdinaryErrand } from "../../../src/lib/errand/close-locus.js";
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
        readOccupancy: async () => ({ kind: "clear" }),
        cleanupRefs: async () => (events.push("refs"), { kind: "applied" }),
        removeInbox: async () => (events.push("inbox"), {
          kind: "removed",
          nextOffer: { kind: "errand", key: "next", parentCheckoutPath: null },
        }),
        retire: async () => (events.push("identity"), { kind: "applied" }),
      },
    });

    expect(events).toEqual(["refs", "inbox", "identity"]);
    expect(result).toMatchObject({
      outcome: "applied",
      operation: "errand-close",
      identity: null,
      originEntry: "Done capture",
      nextOffer: { key: "next" },
    });
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
        readOccupancy: async () => ({ kind: "clear" }),
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
        readOccupancy: async () => ({ kind: "clear" }),
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
        readOccupancy: async () => ({ kind: "clear" }),
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
        readOccupancy: async () => ({ kind: "clear" }),
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
        readOccupancy: async () => ({ kind: "clear" }),
        cleanupRefs: async () => ({ kind: "idempotent" }),
        removeInbox: async () => ({ kind: "error", message: "notes lock raced" }),
        retire,
      },
    });
    expect(raced).toMatchObject({ outcome: "error", error: { code: "locus.errand-close.inbox" } });
    expect(retire).not.toHaveBeenCalled();
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
        readOccupancy: async () => ({ kind: "clear" }),
        cleanupRefs,
        removeInbox: vi.fn(),
        retire: vi.fn(),
      },
    });
    expect(force).toMatchObject({ outcome: "refused", reason: "identity-conflict" });
    expect(cleanupRefs).not.toHaveBeenCalled();

    for (const kind of ["open", "changed-head", "unreachable"] as const) {
      const result = await closeOrdinaryErrand({
        slug: record.slug,
        protection: "full",
        force: false,
        dependencies: {
          readIdentity: async () => ({ kind: "ready", record }),
          resolveTarget: async () => resolved(),
          readLifecycle: async () => ({ kind, changeRequest: record.changeRequest } as ChangeRequestLifecycleEvidence),
          readOccupancy: async () => ({ kind: "clear" }),
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
