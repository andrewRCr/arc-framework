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
    dispatchId: "dispatch-1",
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

function merged(record: OrdinaryErrandRecord): ChangeRequestLifecycleEvidence {
  if (record.state !== "awaiting-merge") throw new Error("expected awaiting tail");
  return { kind: "merged", changeRequest: record.changeRequest } as ChangeRequestLifecycleEvidence;
}

describe("closeOrdinaryErrand", () => {
  it("finalizes exact merged refs, removes the inbox capture, and returns its next dispatch offer", async () => {
    const record = awaiting();
    const events: string[] = [];
    const result = await closeOrdinaryErrand({
      slug: record.slug,
      protection: "full",
      force: false,
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record }),
        readLifecycle: async () => merged(record),
        cleanupRefs: async () => (events.push("refs"), { kind: "applied" }),
        removeInbox: async () => (events.push("inbox"), {
          kind: "removed",
          nextOffer: { kind: "errand", key: "next", dispatchId: "dispatch-1", parentCheckoutPath: null },
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
      dispatchId: "dispatch-1",
      nextOffer: { key: "next", dispatchId: "dispatch-1" },
    });
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
        readLifecycle: async () => merged(record),
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
        readLifecycle: async () => merged(record),
        cleanupRefs: async () => ({ kind: "idempotent" }),
        removeInbox: async () => ({ kind: "error", message: "notes lock raced" }),
        retire,
      },
    });
    expect(raced).toMatchObject({ outcome: "error", error: { code: "locus.errand-close.inbox" } });
    expect(retire).not.toHaveBeenCalled();
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
        readLifecycle: vi.fn(),
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
          readLifecycle: async () => ({ kind, changeRequest: record.changeRequest } as ChangeRequestLifecycleEvidence),
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
