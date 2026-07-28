import { describe, expect, it } from "vitest";

import { canonicalDigest, canonicalize } from "../../../src/lib/canonical/canonical-json.js";
import { receiptId } from "../../../src/lib/canonical/receipt-id.js";
import type { RetirementReceipt } from "../../../src/lib/work-unit/retirement-authority.js";
import {
  validateRetirementRecordEnumeration,
  type RetirementRecordEnumerationEntry,
} from "../../../src/lib/work-unit/retirement-record-enumeration.js";
import { encodeRetirementRecordKey } from "../../../src/lib/work-unit/retirement-record-store.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

function receipt(
  name: string,
  transition: "abandon" | "park-planning" | "rename" = "abandon",
): RetirementReceipt {
  const subject = { kind: "work-unit", name } as const;
  const source = {
    branch: `plan/${name}`,
    head: "a".repeat(40),
    artifactDigest: canonicalDigest(`source:${name}`),
  };
  return {
    schemaVersion: 1,
    receiptId: receiptId({
      schemaVersion: 1,
      subject,
      transition,
      sourceBranch: source.branch,
      sourceHead: source.head,
    }),
    subject,
    transition,
    source,
    transitionPatchDigest: canonicalDigest(`patch:${name}`),
    retiringProjection: { kind: "direct-transition" },
    authorization: transition === "rename"
      ? "identity-renamed"
      : transition === "park-planning"
        ? "planning-relocated"
        : "discard-confirmed",
    result: transition === "rename"
      ? { kind: "rename", targetSlug: `renamed-${name}`, artifactDigest: canonicalDigest(`renamed:${name}`) }
      : transition === "park-planning"
        ? { kind: "relocate", plannedArtifactDigest: canonicalDigest(`planned:${name}`) }
        : { kind: "discard", artifactDigest: "absent" },
  };
}

function entry(
  candidate: RetirementReceipt,
  overrides: Partial<RetirementRecordEnumerationEntry> = {},
): RetirementRecordEnumerationEntry {
  return {
    filename: `${encodeRetirementRecordKey(candidate.receiptId)}.json`,
    mode: "100644",
    type: "blob",
    content: canonicalize(candidate),
    ...overrides,
  };
}

describe("retirement record namespace enumeration", () => {
  it("authenticates distinct v3 preparation and finalized receipt arms", () => {
    const { preparation, receipt: finalized } = v3DecompositionEvidenceFixture();
    const raw = (content: string): RetirementRecordEnumerationEntry => ({
      filename: `${encodeRetirementRecordKey(preparation.receiptId)}.json`,
      mode: "100644",
      type: "blob",
      content,
    });

    const prepared = validateRetirementRecordEnumeration([raw(canonicalize(preparation))]);
    expect(prepared.status === "valid" ? prepared.records[0]?.record.kind : prepared.status)
      .toBe("v3-decomposition-preparation");
    const receipt = validateRetirementRecordEnumeration([raw(canonicalize(finalized))]);
    expect(receipt.status === "valid" ? receipt.records[0]?.record.kind : receipt.status)
      .toBe("v3-decomposition-receipt");
  });

  it("fails the namespace closed for v3 version-plus-kind collisions", () => {
    const { preparation } = v3DecompositionEvidenceFixture();
    const raw = (candidate: unknown): RetirementRecordEnumerationEntry => ({
      filename: `${encodeRetirementRecordKey(preparation.receiptId)}.json`,
      mode: "100644",
      type: "blob",
      content: canonicalize(candidate),
    });

    expect(validateRetirementRecordEnumeration([
      raw({ ...preparation, schemaVersion: 2 }),
    ]).status).toBe("namespace-corrupt");
    expect(validateRetirementRecordEnumeration([
      raw({ ...preparation, kind: "decompose-receipt" }),
    ]).status).toBe("namespace-corrupt");
  });

  it("deduplicates byte-identical canonical and historical records", () => {
    const candidate = receipt("sample");

    const result = validateRetirementRecordEnumeration([entry(candidate), entry(candidate)]);

    expect(result).toEqual({
      status: "valid",
      records: [{
        id: candidate.receiptId,
        content: canonicalize(candidate),
        record: { kind: "receipt", value: candidate },
      }],
    });
  });

  it("authenticates a namespace containing only retained transition receipts", () => {
    const retained = [
      receipt("abandoned"),
      receipt("parked", "park-planning"),
      receipt("renamed", "rename"),
    ];

    const result = validateRetirementRecordEnumeration(retained.map((candidate) => entry(candidate)));

    expect(result.status).toBe("valid");
    if (result.status !== "valid") throw new Error("expected retained namespace");
    expect(result.records.map(({ record }) => record.kind)).toEqual(["receipt", "receipt", "receipt"]);
  });

  it("fails the whole namespace closed for a reachable legacy decomposition receipt", () => {
    const subject = { kind: "work-unit", name: "legacy" } as const;
    const source = {
      branch: "plan/legacy",
      head: "a".repeat(40),
      artifactDigest: canonicalDigest("legacy-source"),
    };
    const legacyId = receiptId({
      schemaVersion: 1,
      subject,
      transition: "decompose",
      sourceBranch: source.branch,
      sourceHead: source.head,
    });
    const legacy = {
      schemaVersion: 1,
      receiptId: legacyId,
      subject,
      transition: "decompose",
      source,
      transitionPatchDigest: canonicalDigest("legacy-patch"),
      retiringProjection: { kind: "unchanged" },
      authorization: "discard-confirmed",
      result: {
        kind: "decompose",
        preparationId: canonicalDigest("legacy-preparation"),
      },
    };
    const legacyEntry: RetirementRecordEnumerationEntry = {
      filename: `${encodeRetirementRecordKey(legacyId)}.json`,
      mode: "100644",
      type: "blob",
      content: canonicalize(legacy),
    };

    expect(validateRetirementRecordEnumeration([entry(receipt("retained")), legacyEntry]).status)
      .toBe("namespace-corrupt");
  });

  it("surfaces divergent duplicate identities as a namespace conflict", () => {
    const candidate = receipt("sample");
    const divergent: RetirementReceipt = {
      ...candidate,
      transitionPatchDigest: canonicalDigest("different-patch"),
    };

    const result = validateRetirementRecordEnumeration([
      entry(candidate),
      entry(divergent),
    ]);

    expect(result.status).toBe("version-conflict");
  });

  it.each([
    { filename: "not-a-record.json" },
    { filename: `${encodeRetirementRecordKey(receipt("sample").receiptId)}.json`, mode: "120000" },
    { filename: `${encodeRetirementRecordKey(receipt("sample").receiptId)}.json`, type: "tree" },
    { filename: `${encodeRetirementRecordKey(receipt("sample").receiptId)}.json`, content: "{\"schemaVersion\":99}" },
  ])("fails the whole namespace closed for an invalid reachable entry: $filename", (overrides) => {
    const unrelated = receipt("unrelated");
    const corrupt = entry(receipt("sample"), overrides);

    expect(validateRetirementRecordEnumeration([entry(unrelated), corrupt]).status).toBe("namespace-corrupt");
  });

  it("rejects a valid receipt stored under a different digest filename", () => {
    const candidate = receipt("sample");
    const other = receipt("other");

    expect(validateRetirementRecordEnumeration([
      entry(candidate, { filename: `${encodeRetirementRecordKey(other.receiptId)}.json` }),
    ]).status).toBe("namespace-corrupt");
  });
});
