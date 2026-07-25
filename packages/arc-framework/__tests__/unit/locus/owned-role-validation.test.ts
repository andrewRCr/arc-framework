/** The shared exact-generation ownership rule behind pop and pre-mutation proof. */

import { describe, expect, it } from "vitest";

import { validateOwnedLocusRole, type OwnedLocusRoleExpectations } from "../../../src/lib/locus/mutation.js";
import type { LocusRecordReadResult } from "../../../src/lib/locus/record-store.js";
import type { LocusAnchor, LocusRecordV1 } from "../../../src/lib/locus/schema/index.js";

const RECORD_ID = `sha256:${"1".repeat(64)}`;
const CHECKOUT = "/repo";
const LEASE_ID = "3".repeat(32);
const SUBJECT = { kind: "partial-errand" as const, key: "fix-output", claimId: null };
const ANCHOR: LocusAnchor = {
  kind: "process", pid: 4242, startToken: "9001", inspector: "proc", selector: "self",
};

const EXPECTATIONS: OwnedLocusRoleExpectations = {
  recordId: RECORD_ID,
  checkoutPath: CHECKOUT,
  expectedSubject: SUBJECT,
  expectedLeaseId: LEASE_ID,
  enteringAnchor: ANCHOR,
};

function record(overrides: Partial<LocusRecordV1> = {}): LocusRecordV1 {
  return {
    schemaVersion: 1,
    recordId: RECORD_ID,
    checkoutPath: CHECKOUT,
    role: {
      kind: "partial-errand", subject: SUBJECT, establishedAt: "2026-07-20T00:00:00.000Z",
      parentCheckoutPath: null, originEntry: "Fix output",
    },
    lease: {
      leaseId: LEASE_ID, sessionHomePath: CHECKOUT, anchor: ANCHOR,
      attachedAt: "2026-07-20T00:00:00.000Z", heartbeatAt: "2026-07-20T00:00:00.000Z",
    },
    ...overrides,
  };
}

function read(overrides: Partial<LocusRecordV1> = {}): LocusRecordReadResult {
  return { kind: "valid", record: record(overrides), bytes: Buffer.from("{}") };
}

describe("validateOwnedLocusRole", () => {
  it("accepts the caller's own exact generation", () => {
    expect(validateOwnedLocusRole(read(), EXPECTATIONS)).toEqual({ kind: "owned" });
  });

  it("reports absence separately from refusal", () => {
    expect(validateOwnedLocusRole({ kind: "absent" }, EXPECTATIONS)).toEqual({ kind: "absent" });
  });

  it("refuses a different lease generation on the same role", () => {
    const other = read({
      lease: { ...record().lease!, leaseId: "4".repeat(32) },
    });
    expect(validateOwnedLocusRole(other, EXPECTATIONS))
      .toEqual({ kind: "refused", reason: "lease-generation-mismatch" });
  });

  it("refuses a live lease held under another process anchor", () => {
    const foreign = read({
      lease: { ...record().lease!, anchor: { ...ANCHOR, pid: 5150 } },
    });
    expect(validateOwnedLocusRole(foreign, EXPECTATIONS))
      .toEqual({ kind: "refused", reason: "lease-generation-mismatch" });
  });

  it("refuses an unverifiable anchor where a process anchor was claimed", () => {
    const unverifiable = read({
      lease: { ...record().lease!, anchor: { kind: "unverifiable", reason: "inspector unavailable" } },
    });
    expect(validateOwnedLocusRole(unverifiable, EXPECTATIONS))
      .toEqual({ kind: "refused", reason: "lease-generation-mismatch" });
  });

  it("refuses a leaseless record", () => {
    expect(validateOwnedLocusRole(read({ lease: null }), EXPECTATIONS))
      .toEqual({ kind: "refused", reason: "lease-generation-mismatch" });
  });

  it("refuses a different subject under matching coordinates", () => {
    const other = read({
      role: {
        kind: "partial-errand", subject: { kind: "partial-errand", key: "other-slug", claimId: null },
        establishedAt: "2026-07-20T00:00:00.000Z", parentCheckoutPath: null, originEntry: null,
      },
    });
    expect(validateOwnedLocusRole(other, EXPECTATIONS)).toEqual({ kind: "refused", reason: "role-conflict" });
  });

  it.each([
    ["a mismatched record id", read({ recordId: `sha256:${"2".repeat(64)}` })],
    ["a mismatched checkout path", read({ checkoutPath: "/elsewhere" })],
    ["a malformed read", { kind: "malformed", message: "bad json" } as LocusRecordReadResult],
    ["a digest mismatch", { kind: "digest-mismatch" } as LocusRecordReadResult],
    ["an unsupported version", { kind: "unsupported", schemaVersion: 9 } as LocusRecordReadResult],
  ])("refuses %s as malformed", (_label, existing) => {
    expect(validateOwnedLocusRole(existing, EXPECTATIONS))
      .toEqual({ kind: "refused", reason: "record-malformed" });
  });
});
