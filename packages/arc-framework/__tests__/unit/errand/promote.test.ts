/** Recoverable ordinary-v3 Errand promotion composition. */

import { describe, expect, it, vi } from "vitest";

import {
  TransientIdentityRecordV3Schema,
} from "../../../src/lib/errand/identity-record.js";
import type { OrdinaryErrandRecord } from "../../../src/lib/errand/identity-transitions.js";
import { promoteOrdinaryErrand, type PromotionFrameReceipt } from "../../../src/lib/errand/promote.js";

const ORIGIN_DIGEST = `sha256:${"a".repeat(64)}` as const;

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
    originEntrySourceDigest: ORIGIN_DIGEST,
    state: "open",
    savedHead: null,
    changeRequest: null,
  }) as OrdinaryErrandRecord;
}

function frame(kind: "applied" | "idempotent" = "applied"): PromotionFrameReceipt & {
  originEntry: string;
  originEntrySourceDigest: typeof ORIGIN_DIGEST;
  metaCommitted: boolean;
} {
  return {
    kind,
    subject: { slug: "growing", claimId: "c".repeat(32) },
    generation: `errand-v1/growing/${"c".repeat(32)}`,
    branch: "feat/growth",
    metaPath: ".arc/active/meta-growth.md",
    checkoutPath: "/repo/growing",
    allocation: "spawned",
    parentCheckoutPath: "/repo",
    originEntry: "Grow this concern",
    originEntrySourceDigest: ORIGIN_DIGEST,
    metaCommitted: false,
  };
}

describe("promoteOrdinaryErrand", () => {
  it("classifies malformed work-unit names as invalid promotion sources", async () => {
    const result = await promoteOrdinaryErrand({
      slug: "growing",
      name: "growth/unit",
      type: "feat",
      floor: "scale",
      protection: "full",
      dependencies: {
        readIdentity: vi.fn(),
        recoverPromoted: vi.fn(),
        replaceFrame: vi.fn(),
        retire: vi.fn(),
        settleInbox: vi.fn(),
        settleOccupancy: vi.fn(),
      },
    });

    expect(result).toMatchObject({ outcome: "refused", reason: "promotion-source-invalid" });
  });

  it("retains identity until the promoted meta is committed", async () => {
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
        settleInbox: async (value) => (events.push("inbox"), value),
        settleOccupancy: async (value) => (events.push("occupancy"), value),
      },
    });

    expect(events).toEqual(["frame"]);
    expect(result).toMatchObject({
      outcome: "applied",
      operation: "errand-promote",
      checkoutPath: "/repo/growing",
      settlement: {
        state: "commit-required",
        identity: "retained",
        originEntry: "Grow this concern",
        originEntrySourceDigest: ORIGIN_DIGEST,
      },
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
        recoverPromoted: async () => ({
          ...frame("idempotent"),
          metaCommitted: true,
          originEntry: null,
          originEntrySourceDigest: null,
        }),
        replaceFrame,
        retire,
        settleInbox: async (value) => value,
        settleOccupancy: async (value) => value,
      },
    });

    expect(result).toMatchObject({
      outcome: "idempotent",
      operation: "errand-promote",
      settlement: { state: "settled", identity: "retired", originEntry: null },
    });
    expect(replaceFrame).not.toHaveBeenCalled();
    expect(retire).not.toHaveBeenCalled();
  });

  it("settles the capture before retiring identity once the meta is committed", async () => {
    const value = record();
    const events: string[] = [];
    const committed = { ...frame(), metaCommitted: true };

    const result = await promoteOrdinaryErrand({
      slug: value.slug,
      name: "growth",
      type: "feat",
      floor: "scale",
      protection: "full",
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record: value }),
        recoverPromoted: vi.fn(),
        replaceFrame: async () => (events.push("frame"), committed),
        settleInbox: async () => (events.push("inbox"), {
          ...committed,
          originEntry: null,
          originEntrySourceDigest: null,
        }),
        retire: async () => (events.push("identity"), { kind: "applied" }),
        settleOccupancy: async (receipt) => (events.push("occupancy"), receipt),
      },
    });

    expect(events).toEqual(["frame", "inbox", "identity", "occupancy"]);
    expect(result).toMatchObject({
      outcome: "applied",
      settlement: { state: "settled", identity: "retired", originEntry: null },
    });
  });

  it("does not settle checkout occupancy until identity retirement commits", async () => {
    const value = record();
    const events: string[] = [];
    const committed = { ...frame(), metaCommitted: true, originEntry: null, originEntrySourceDigest: null };

    await promoteOrdinaryErrand({
      slug: value.slug,
      name: "growth",
      type: "feat",
      floor: "scale",
      protection: "full",
      dependencies: {
        readIdentity: async () => ({ kind: "ready", record: value }),
        recoverPromoted: vi.fn(),
        replaceFrame: async () => (events.push("frame"), committed),
        retire: async () => (events.push("identity"), { kind: "applied" }),
        settleInbox: async (receipt) => receipt,
        settleOccupancy: async (receipt) => (events.push("occupancy"), receipt),
      },
    });

    expect(events).toEqual(["frame", "identity", "occupancy"]);
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
        replaceFrame: async () => ({ kind: "refused", reason: "role-conflict", message: "parent changed" }),
        retire,
        settleInbox: async (value) => value,
        settleOccupancy: async (value) => value,
      },
    });
    expect(refused).toMatchObject({ outcome: "refused", reason: "role-conflict" });
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
        replaceFrame: async () => ({ ...frame(), metaCommitted: true }),
        retire: async () => ({ kind: "error", message: "remote unavailable" }),
        settleInbox: async (value) => value,
        settleOccupancy: async (value) => value,
      },
    });
    expect(failed).toMatchObject({ outcome: "error", operation: "errand-promote" });
  });

  it("refuses partial protection and non-open v3 tails before frame mutation", async () => {
    const value = record();
    const replaceFrame = vi.fn();
    const dependencies = {
      readIdentity: async () => ({ kind: "ready" as const, record: value }),
      recoverPromoted: vi.fn(),
      replaceFrame,
      retire: vi.fn(),
      settleInbox: async (value: PromotionFrameReceipt) => value,
      settleOccupancy: async (value: PromotionFrameReceipt) => value,
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

    expect(replaceFrame).not.toHaveBeenCalled();
  });
});
