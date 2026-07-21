/** Explicit ordinary-v3 Errand abandonment after local occupancy is gone. */

import { describe, expect, it, vi } from "vitest";

import { abandonOrdinaryErrand } from "../../../src/lib/errand/abandon-locus.js";
import { TransientIdentityRecordV3Schema } from "../../../src/lib/errand/identity-record.js";
import type {
  ChangeRequestLifecycleEvidence,
  ChangeRequestLifecycleTruth,
} from "../../../src/lib/errand/change-request-lifecycle.js";
import type { OrdinaryErrandRecord } from "../../../src/lib/errand/identity-transitions.js";

function record(state: "open" | "paused" | "awaiting-merge"): OrdinaryErrandRecord {
  const head = "a".repeat(40);
  return TransientIdentityRecordV3Schema.parse({
    version: 3,
    slug: "discard",
    claimId: "c".repeat(32),
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:01:00.000Z",
    kind: "errand",
    purpose: "errand",
    intent: "discard",
    branch: "chore/discard",
    origin: "inbox",
    originEntry: "Discard capture",
    dispatchId: "dispatch-1",
    state,
    savedHead: state === "paused" ? head : null,
    changeRequest: state === "awaiting-merge" ? {
      repositoryRef: "owner/repo",
      hostRef: "github.com",
      baseRef: "main",
      headRef: "chore/discard",
      headSha: head,
    } : null,
  }) as OrdinaryErrandRecord;
}

function lifecycle(value: OrdinaryErrandRecord, kind: ChangeRequestLifecycleTruth): ChangeRequestLifecycleEvidence {
  if (value.state !== "awaiting-merge") throw new Error("expected awaiting tail");
  return { kind, changeRequest: value.changeRequest } as ChangeRequestLifecycleEvidence;
}

describe("abandonOrdinaryErrand", () => {
  it.each(["open", "paused"] as const)("abandons an identity-only %s claim after safe residue cleanup", async (state) => {
    const value = record(state);
    const events: string[] = [];
    const result = await abandonOrdinaryErrand({
      slug: value.slug,
      protection: "full",
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record: value }),
        cleanupResidue: async () => (events.push("cleanup"), { kind: "applied" }),
        readLifecycle: vi.fn(),
        clearDispatch: async () => (events.push("dispatch"), { kind: "applied" }),
        retire: async () => (events.push("identity"), { kind: "applied" }),
      },
    });

    expect(events).toEqual(["cleanup", "dispatch", "identity"]);
    expect(result).toMatchObject({ outcome: "applied", operation: "errand-abandon", identity: null });
  });

  it("requires exact closed-unmerged host truth for an awaiting tail", async () => {
    const value = record("awaiting-merge");
    const cleanupResidue = vi.fn(async () => ({ kind: "idempotent" as const }));
    const retire = vi.fn(async () => ({ kind: "applied" as const }));
    const exact = await abandonOrdinaryErrand({
      slug: value.slug,
      protection: "full",
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record: value }),
        cleanupResidue,
        readLifecycle: async () => lifecycle(value, "closed-unmerged"),
        clearDispatch: async () => ({ kind: "idempotent" }),
        retire,
      },
    });
    expect(exact).toMatchObject({ outcome: "applied" });

    for (const kind of [
      "merged", "requested-work", "open", "changed-head", "missing", "ambiguous", "unreachable",
    ] as const) {
      const refused = await abandonOrdinaryErrand({
        slug: value.slug,
        protection: "full",
        dependencies: {
          readIdentity: async () => ({ kind: "ready", record: value }),
          cleanupResidue,
          readLifecycle: async () => lifecycle(value, kind),
          clearDispatch: vi.fn(),
          retire,
        },
      });
      expect(refused).toMatchObject({ outcome: "refused" });
    }
  });

  it("refuses closed-unmerged evidence for different change-request coordinates", async () => {
    const value = record("awaiting-merge");
    if (value.state !== "awaiting-merge") throw new Error("expected awaiting tail");
    const evidence = {
      ...lifecycle(value, "closed-unmerged"),
      changeRequest: { ...value.changeRequest, headSha: "b".repeat(40) },
    } as ChangeRequestLifecycleEvidence;

    const result = await abandonOrdinaryErrand({
      slug: value.slug,
      protection: "full",
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record: value }),
        cleanupResidue: vi.fn(),
        readLifecycle: async () => evidence,
        clearDispatch: vi.fn(),
        retire: vi.fn(),
      },
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "change-request-unverifiable" });
  });

  it.each(["lease-live", "lease-unknown", "preservation-unproven"] as const)(
    "retains identity when residue cleanup refuses with %s",
    async (reason) => {
      const value = record("paused");
      const retire = vi.fn();
      const result = await abandonOrdinaryErrand({
        slug: value.slug,
        protection: "full",
        dependencies: {
          readIdentity: async () => ({ kind: "ready", record: value }),
          cleanupResidue: async () => ({ kind: "refused", reason, message: reason }),
          readLifecycle: vi.fn(),
          clearDispatch: vi.fn(),
          retire,
        },
      });
      expect(result).toMatchObject({ outcome: "refused", reason });
      expect(retire).not.toHaveBeenCalled();
    },
  );

  it("retains identity when exact dispatch unbinding races and replays a completed abandonment", async () => {
    const value = record("open");
    const retire = vi.fn(async () => ({ kind: "applied" as const }));
    const raced = await abandonOrdinaryErrand({
      slug: value.slug,
      protection: "full",
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record: value }),
        cleanupResidue: async () => ({ kind: "idempotent" }),
        readLifecycle: vi.fn(),
        clearDispatch: async () => ({ kind: "refused", reason: "dispatch-conflict", message: "changed inbox" }),
        retire,
      },
    });
    expect(raced).toMatchObject({ outcome: "refused", reason: "dispatch-conflict" });
    expect(retire).not.toHaveBeenCalled();

    const replay = await abandonOrdinaryErrand({
      slug: value.slug,
      protection: "full",
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record: null }),
        cleanupResidue: vi.fn(),
        readLifecycle: vi.fn(),
        clearDispatch: vi.fn(),
        retire: vi.fn(),
      },
    });
    expect(replay).toMatchObject({ outcome: "idempotent", operation: "errand-abandon" });
  });
});
