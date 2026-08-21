/** Retry-safe orchestration for ordinary Errand close tails. */

import { describe, expect, it, vi } from "vitest";

import type { ChangeRequestLifecycleEvidence } from "../../../src/lib/errand/change-request-lifecycle.js";
import {
  closeOrdinaryErrand,
  type CloseAuthorityGuard,
  type CloseOrdinaryErrandDependencies,
  type CloseTarget,
} from "../../../src/lib/errand/close-locus.js";
import { TransientIdentityRecordV3Schema } from "../../../src/lib/errand/identity-record.js";
import type { OrdinaryErrandRecord } from "../../../src/lib/errand/identity-transitions.js";

const HEAD = "a".repeat(40);
const CHANGE_REQUEST = {
  repositoryRef: "owner/repo",
  hostRef: "github.com",
  baseRef: "main",
  headRef: "chore/done",
  headSha: HEAD,
};

function openRecord(): OrdinaryErrandRecord {
  return TransientIdentityRecordV3Schema.parse({
    version: 3,
    slug: "done",
    claimId: "c".repeat(32),
    createdAt: "2026-08-20T12:00:00.000Z",
    updatedAt: "2026-08-20T12:01:00.000Z",
    kind: "errand",
    purpose: "errand",
    intent: "done",
    branch: "chore/done",
    origin: "inbox",
    originEntry: "Finish close",
    originEntrySourceDigest: `sha256:${"d".repeat(64)}`,
    state: "open",
    savedHead: null,
    changeRequest: null,
  }) as OrdinaryErrandRecord;
}

function retainedRecord(previous: OrdinaryErrandRecord): OrdinaryErrandRecord {
  return TransientIdentityRecordV3Schema.parse({
    ...previous,
    updatedAt: "2026-08-20T12:02:00.000Z",
    state: "awaiting-merge",
    savedHead: null,
    changeRequest: CHANGE_REQUEST,
  }) as OrdinaryErrandRecord;
}

function lifecycle(): ChangeRequestLifecycleEvidence {
  return { kind: "merged", changeRequest: CHANGE_REQUEST } as ChangeRequestLifecycleEvidence;
}

function target(record: OrdinaryErrandRecord): CloseTarget {
  return { kind: "merged", record, changeRequest: CHANGE_REQUEST };
}

function guard(events: string[]): CloseAuthorityGuard {
  return {
    checkoutPath: "/repo",
    revalidate: async () => ({ kind: "valid" }),
    acquire: async () => {
      events.push("guard-acquire");
      return { kind: "acquired", release: async () => { events.push("guard-release"); } };
    },
  };
}

describe("closeOrdinaryErrand", () => {
  it("retains an exact merged target before deleting refs and supplies a surviving inbox cwd", async () => {
    const events: string[] = [];
    const retained = retainedRecord(openRecord());
    const removeInbox = vi.fn(async () => ({ kind: "removed" as const, nextOffer: null }));
    const dependencies: CloseOrdinaryErrandDependencies = {
      readIdentity: async () => ({ kind: "ready", record: openRecord() }),
      resolveTarget: async () => ({ kind: "resolved", changeRequest: CHANGE_REQUEST }),
      readLifecycle: async () => lifecycle(),
      readOccupancy: async () => ({
        kind: "clear",
        settle: async () => ({
          kind: "applied",
          guard: guard(events),
          parentCheckoutPath: null,
        }),
      }),
      retainTarget: async () => {
        events.push("retain");
        return { kind: "applied", target: target(retained) };
      },
      cleanupRefs: async (value) => {
        events.push(`refs:${value.record.state}`);
        return { kind: "applied" };
      },
      removeInbox,
      retire: async (value) => {
        events.push(`retire:${value.record.state}`);
        return { kind: "applied" };
      },
    };

    await expect(closeOrdinaryErrand({ slug: "done", protection: "full", dependencies }))
      .resolves.toMatchObject({ outcome: "applied" });

    expect(events).toEqual([
      "guard-acquire",
      "retain",
      "refs:awaiting-merge",
      "retire:awaiting-merge",
      "guard-release",
    ]);
    expect(removeInbox).toHaveBeenCalledWith(retained, null, "/repo");
  });

  it("replays an inbox failure from the retained target without reconstructing branch refs", async () => {
    let identity: OrdinaryErrandRecord | null = openRecord();
    let refsPresent = true;
    let inboxAttempts = 0;
    const events: string[] = [];
    const dependencies: CloseOrdinaryErrandDependencies = {
      readIdentity: async () => ({ kind: "ready", record: identity }),
      resolveTarget: async (record) => {
        events.push(`resolve:${record.state}:${refsPresent ? "refs" : "no-refs"}`);
        return { kind: "resolved", changeRequest: CHANGE_REQUEST };
      },
      readLifecycle: async () => lifecycle(),
      readOccupancy: async () => ({
        kind: "clear",
        settle: async () => ({ kind: "idempotent", guard: null, parentCheckoutPath: null }),
      }),
      retainTarget: async (value) => {
        if (value.record.state === "awaiting-merge") return { kind: "idempotent", target: value };
        identity = retainedRecord(value.record);
        return { kind: "applied", target: target(identity) };
      },
      cleanupRefs: async () => {
        const kind = refsPresent ? "applied" as const : "idempotent" as const;
        refsPresent = false;
        return { kind };
      },
      removeInbox: async () => {
        inboxAttempts += 1;
        return inboxAttempts === 1
          ? { kind: "error", message: "injected inbox failure" }
          : { kind: "removed", nextOffer: null };
      },
      retire: async () => {
        identity = null;
        return { kind: "applied" };
      },
    };

    await expect(closeOrdinaryErrand({ slug: "done", protection: "full", dependencies }))
      .resolves.toMatchObject({ outcome: "error", error: { code: "locus.errand-close.inbox" } });
    expect(identity?.state).toBe("awaiting-merge");
    expect(refsPresent).toBe(false);

    await expect(closeOrdinaryErrand({ slug: "done", protection: "full", dependencies }))
      .resolves.toMatchObject({ outcome: "applied" });
    expect(identity).toBeNull();
    expect(events).toEqual([
      "resolve:open:refs",
      "resolve:awaiting-merge:no-refs",
    ]);
  });

  it.each(["refs", "retire"] as const)(
    "replays an injected %s failure from the retained merged target",
    async (failureStage) => {
      let identity: OrdinaryErrandRecord | null = openRecord();
      let refsPresent = true;
      let failed = false;
      const dependencies: CloseOrdinaryErrandDependencies = {
        readIdentity: async () => ({ kind: "ready", record: identity }),
        resolveTarget: async () => ({ kind: "resolved", changeRequest: CHANGE_REQUEST }),
        readLifecycle: async () => lifecycle(),
        readOccupancy: async () => ({
          kind: "clear",
          settle: async () => ({ kind: "idempotent", guard: null, parentCheckoutPath: null }),
        }),
        retainTarget: async (value) => {
          if (value.record.state === "awaiting-merge") return { kind: "idempotent", target: value };
          identity = retainedRecord(value.record);
          return { kind: "applied", target: target(identity) };
        },
        cleanupRefs: async () => {
          if (failureStage === "refs" && !failed) {
            failed = true;
            return { kind: "error", message: "injected refs failure" };
          }
          const kind = refsPresent ? "applied" as const : "idempotent" as const;
          refsPresent = false;
          return { kind };
        },
        removeInbox: async () => ({ kind: "removed", nextOffer: null }),
        retire: async () => {
          if (failureStage === "retire" && !failed) {
            failed = true;
            return { kind: "error", message: "injected retirement failure" };
          }
          identity = null;
          return { kind: "applied" };
        },
      };

      await expect(closeOrdinaryErrand({ slug: "done", protection: "full", dependencies }))
        .resolves.toMatchObject({ outcome: "error" });
      expect(identity?.state).toBe("awaiting-merge");

      await expect(closeOrdinaryErrand({ slug: "done", protection: "full", dependencies }))
        .resolves.toMatchObject({ outcome: "applied" });
      expect(identity).toBeNull();
      expect(refsPresent).toBe(false);
    },
  );

  it("does not delete refs when exact-target retention fails", async () => {
    const cleanupRefs = vi.fn(async () => ({ kind: "applied" as const }));
    const dependencies: CloseOrdinaryErrandDependencies = {
      readIdentity: async () => ({ kind: "ready", record: openRecord() }),
      resolveTarget: async () => ({ kind: "resolved", changeRequest: CHANGE_REQUEST }),
      readLifecycle: async () => lifecycle(),
      readOccupancy: async () => ({
        kind: "clear",
        settle: async () => ({ kind: "idempotent", guard: null, parentCheckoutPath: null }),
      }),
      retainTarget: async () => ({ kind: "error", message: "identity remote unavailable" }),
      cleanupRefs,
      removeInbox: async () => ({ kind: "removed", nextOffer: null }),
      retire: async () => ({ kind: "applied" }),
    };

    await expect(closeOrdinaryErrand({ slug: "done", protection: "full", dependencies }))
      .resolves.toMatchObject({
        outcome: "error",
        error: { code: "locus.errand-close.identity", message: "identity remote unavailable" },
      });
    expect(cleanupRefs).not.toHaveBeenCalled();
  });

  it("does not delete refs when the retained identity records a different target", async () => {
    const cleanupRefs = vi.fn(async () => ({ kind: "applied" as const }));
    const mismatchedRecord = TransientIdentityRecordV3Schema.parse({
      ...retainedRecord(openRecord()),
      changeRequest: { ...CHANGE_REQUEST, headSha: "b".repeat(40) },
    }) as OrdinaryErrandRecord;
    const dependencies: CloseOrdinaryErrandDependencies = {
      readIdentity: async () => ({ kind: "ready", record: openRecord() }),
      resolveTarget: async () => ({ kind: "resolved", changeRequest: CHANGE_REQUEST }),
      readLifecycle: async () => lifecycle(),
      readOccupancy: async () => ({
        kind: "clear",
        settle: async () => ({ kind: "idempotent", guard: null, parentCheckoutPath: null }),
      }),
      retainTarget: async (value) => ({
        kind: "applied",
        target: { ...value, record: mismatchedRecord },
      }),
      cleanupRefs,
      removeInbox: async () => ({ kind: "removed", nextOffer: null }),
      retire: async () => ({ kind: "applied" }),
    };

    await expect(closeOrdinaryErrand({ slug: "done", protection: "full", dependencies }))
      .resolves.toMatchObject({
        outcome: "error",
        error: { code: "locus.errand-close.identity" },
      });
    expect(cleanupRefs).not.toHaveBeenCalled();
  });
});
