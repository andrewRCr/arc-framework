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
    originEntrySourceDigest: `sha256:${"a".repeat(64)}`,
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
        clearExecuteBound: async () => (events.push("inbox"), { kind: "applied" }),
        retire: async () => (events.push("identity"), { kind: "applied" }),
      },
    });

    expect(events).toEqual(["cleanup", "inbox", "identity"]);
    expect(result).toMatchObject({ outcome: "applied", operation: "errand-abandon", identity: null });
  });

  it("releases the session locus a retired identity left behind", async () => {
    const cleanupResidue = vi.fn();
    const retire = vi.fn();
    const result = await abandonOrdinaryErrand({
      slug: "retired",
      protection: "full",
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record: null }),
        releaseRetiredResidue: async () => ({ kind: "applied" }),
        cleanupResidue,
        readLifecycle: vi.fn(),
        clearExecuteBound: vi.fn(),
        retire,
      },
    });

    expect(result).toMatchObject({ outcome: "applied", operation: "errand-abandon" });
    // The identity is already gone: neither the record-keyed cleanup nor retirement may run.
    expect(cleanupResidue).not.toHaveBeenCalled();
    expect(retire).not.toHaveBeenCalled();
  });

  it("reports idempotent when a retired identity left no occupancy behind", async () => {
    const result = await abandonOrdinaryErrand({
      slug: "retired",
      protection: "full",
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record: null }),
        releaseRetiredResidue: async () => ({ kind: "idempotent" }),
        cleanupResidue: vi.fn(),
        readLifecycle: vi.fn(),
        clearExecuteBound: vi.fn(),
        retire: vi.fn(),
      },
    });

    expect(result).toMatchObject({ outcome: "idempotent", operation: "errand-abandon" });
  });

  it("surfaces a refused residue release instead of reporting the errand abandoned", async () => {
    const result = await abandonOrdinaryErrand({
      slug: "retired",
      protection: "full",
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record: null }),
        releaseRetiredResidue: async () => ({
          kind: "refused",
          reason: "lease-live",
          message: "The Errand session locus still has a live lease.",
        }),
        cleanupResidue: vi.fn(),
        readLifecycle: vi.fn(),
        clearExecuteBound: vi.fn(),
        retire: vi.fn(),
      },
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "lease-live" });
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
        clearExecuteBound: async () => ({ kind: "idempotent" }),
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
          clearExecuteBound: vi.fn(),
          retire,
        },
      });
      expect(refused).toMatchObject({ outcome: "refused" });
      if (kind === "merged") {
        expect(refused).toMatchObject({
          reason: "identity-conflict",
          recommendedPromptText: expect.stringContaining("finalize"),
        });
      }
    }
    expect(cleanupResidue).toHaveBeenCalledTimes(1);
    expect(retire).toHaveBeenCalledTimes(1);
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
        clearExecuteBound: vi.fn(),
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
          clearExecuteBound: vi.fn(),
          retire,
        },
      });
      expect(result).toMatchObject({ outcome: "refused", reason });
      expect(retire).not.toHaveBeenCalled();
    },
  );

  it("retains identity when execute-bound clearing refuses and replays a completed abandonment", async () => {
    const value = record("open");
    const retire = vi.fn(async () => ({ kind: "applied" as const }));
    const raced = await abandonOrdinaryErrand({
      slug: value.slug,
      protection: "full",
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record: value }),
        cleanupResidue: async () => ({ kind: "idempotent" }),
        readLifecycle: vi.fn(),
        clearExecuteBound: async () => ({
          kind: "refused", reason: "record-malformed", message: "malformed inbox entry",
        }),
        retire,
      },
    });
    expect(raced).toMatchObject({ outcome: "refused", reason: "record-malformed" });
    expect(retire).not.toHaveBeenCalled();

    const replay = await abandonOrdinaryErrand({
      slug: value.slug,
      protection: "full",
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record: null }),
        cleanupResidue: vi.fn(),
        readLifecycle: vi.fn(),
        clearExecuteBound: vi.fn(),
        retire: vi.fn(),
      },
    });
    expect(replay).toMatchObject({ outcome: "idempotent", operation: "errand-abandon" });
  });
});
