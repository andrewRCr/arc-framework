/** Recoverable ordinary-v3 Errand promotion composition. */

import { describe, expect, it, vi } from "vitest";

import {
  TransientIdentityRecordSchema,
  TransientIdentityRecordV3Schema,
} from "../../../src/lib/errand/identity-record.js";
import type { OrdinaryErrandRecord } from "../../../src/lib/errand/identity-transitions.js";
import { promoteOrdinaryErrand, type PromotionFrameReceipt } from "../../../src/lib/errand/promote.js";
import { orderPromotionLockPaths } from "../../../src/lib/errand/promote-runtime.js";
import { deriveLocusRecordId } from "../../../src/lib/locus/path-identity.js";

function record(): OrdinaryErrandRecord {
  return TransientIdentityRecordV3Schema.parse({
    version: 3,
    slug: "growing",
    claimId: "c".repeat(32),
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:01:00.000Z",
    kind: "errand",
    purpose: "errand",
    intent: "growing",
    branch: "chore/growing",
    origin: "inbox",
    originEntry: "Grow this concern",
    state: "open",
    savedHead: null,
    changeRequest: null,
  }) as OrdinaryErrandRecord;
}

function frame(kind: "applied" | "idempotent" = "applied"): PromotionFrameReceipt {
  return {
    kind,
    branch: "feat/growth",
    metaPath: ".arc/active/meta-growth.md",
    recordId: `sha256:${"d".repeat(64)}`,
    leaseId: "e".repeat(32),
    checkoutPath: "/repo/growing",
    allocation: "spawned",
    parentReleased: true,
  };
}

describe("promoteOrdinaryErrand", () => {
  it("replaces the live frame before retiring identity and preserves the capture pointer", async () => {
    const value = record();
    const events: string[] = [];
    const result = await promoteOrdinaryErrand({
      slug: value.slug,
      name: "growth",
      type: "feat",
      floor: "scale",
      protection: "full",
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record: value }),
        recoverPromoted: vi.fn(),
        replaceFrame: async () => (events.push("frame"), frame()),
        retire: async () => (events.push("identity"), { kind: "applied" }),
      },
    });

    expect(events).toEqual(["frame", "identity"]);
    expect(result).toMatchObject({
      outcome: "applied",
      operation: "errand-promote",
      originEntry: "Grow this concern",
      activeLocusPath: "/repo/growing",
      sessionHomePath: "/repo/growing",
    });
  });

  it("recovers a completed local replacement after identity retirement or a lost response", async () => {
    const replaceFrame = vi.fn();
    const retire = vi.fn();
    const result = await promoteOrdinaryErrand({
      slug: "growing",
      name: "growth",
      type: "feat",
      floor: "scale",
      protection: "full",
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record: null }),
        recoverPromoted: async () => frame("idempotent"),
        replaceFrame,
        retire,
      },
    });

    expect(result).toMatchObject({ outcome: "idempotent", operation: "errand-promote" });
    expect(replaceFrame).not.toHaveBeenCalled();
    expect(retire).not.toHaveBeenCalled();
  });

  it("retains identity when local replacement refuses and surfaces post-replacement retirement failure", async () => {
    const value = record();
    const retire = vi.fn();
    const refused = await promoteOrdinaryErrand({
      slug: value.slug,
      name: "growth",
      type: "feat",
      floor: "scale",
      protection: "full",
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record: value }),
        recoverPromoted: vi.fn(),
        replaceFrame: async () => ({ kind: "refused", reason: "lease-live", message: "parent changed" }),
        retire,
      },
    });
    expect(refused).toMatchObject({ outcome: "refused", reason: "lease-live" });
    expect(retire).not.toHaveBeenCalled();

    const failed = await promoteOrdinaryErrand({
      slug: value.slug,
      name: "growth",
      type: "feat",
      floor: "scale",
      protection: "full",
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record: value }),
        recoverPromoted: vi.fn(),
        replaceFrame: async () => frame(),
        retire: async () => ({ kind: "error", message: "remote unavailable" }),
      },
    });
    expect(failed).toMatchObject({ outcome: "error", operation: "errand-promote" });
  });

  it("refuses partial protection, legacy identity, and non-open v3 tails before frame mutation", async () => {
    const value = record();
    const replaceFrame = vi.fn();
    const dependencies = {
      readIdentity: async () => ({ kind: "ready" as const, record: value }),
      recoverPromoted: vi.fn(),
      replaceFrame,
      retire: vi.fn(),
    };
    const partial = await promoteOrdinaryErrand({
      slug: value.slug, name: "growth", type: "feat", floor: "scale", protection: "partial", dependencies,
    });
    expect(partial).toMatchObject({ outcome: "refused", reason: "full-protection-required" });

    const paused = { ...value, state: "paused", savedHead: "a".repeat(40) } as OrdinaryErrandRecord;
    const tail = await promoteOrdinaryErrand({
      slug: value.slug,
      name: "growth",
      type: "feat",
      floor: "scale",
      protection: "full",
      dependencies: { ...dependencies, readIdentity: async () => ({ kind: "ready", record: paused }) },
    });
    expect(tail).toMatchObject({ outcome: "refused", reason: "promotion-source-invalid" });

    const legacy = TransientIdentityRecordSchema.parse({
      version: 2,
      slug: "growing",
      origin: "description",
      intent: "growing",
      branch: "chore/growing",
      createdAt: "2026-07-21T00:00:00.000Z",
    });
    const legacyResult = await promoteOrdinaryErrand({
      slug: value.slug,
      name: "growth",
      type: "feat",
      floor: "scale",
      protection: "full",
      dependencies: { ...dependencies, readIdentity: async () => ({ kind: "ready", record: legacy }) },
    });
    expect(legacyResult).toMatchObject({ outcome: "refused", reason: "promotion-source-invalid" });
    expect(replaceFrame).not.toHaveBeenCalled();
  });
});

describe("orderPromotionLockPaths", () => {
  it("orders target and parent by record ID independent of caller order", () => {
    const paths = ["/repo/z-parent", "/repo/a-target"];
    const expected = [...paths].sort((left, right) => deriveLocusRecordId(left, "posix").recordId
      .localeCompare(deriveLocusRecordId(right, "posix").recordId));

    expect(orderPromotionLockPaths(paths, "posix")).toEqual(expected);
    expect(orderPromotionLockPaths([...paths].reverse(), "posix")).toEqual(expected);
  });
});
