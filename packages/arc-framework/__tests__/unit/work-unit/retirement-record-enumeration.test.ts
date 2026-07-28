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

function receipt(name: string): RetirementReceipt {
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
      transition: "abandon",
      sourceBranch: source.branch,
      sourceHead: source.head,
    }),
    subject,
    transition: "abandon",
    source,
    transitionPatchDigest: canonicalDigest(`patch:${name}`),
    retiringProjection: { kind: "direct-transition" },
    authorization: "discard-confirmed",
    result: { kind: "discard", artifactDigest: "absent" },
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
