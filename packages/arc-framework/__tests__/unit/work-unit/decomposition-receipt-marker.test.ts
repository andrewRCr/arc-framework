import { describe, expect, it } from "vitest";

import { renderMetaFile } from "../../../src/lib/active/meta-reader.js";
import type { CanonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import {
  removeDecompositionReceiptMarker,
  readDecompositionReceiptMarker,
  validateDecompositionReceiptMarker,
} from "../../../src/lib/work-unit/decomposition-receipt-marker.js";

const RECEIPT_ID = `sha256:${"a".repeat(64)}` as CanonicalDigest;

function ordinaryMeta(): string {
  return renderMetaFile("member", { state: "Planning", owner: "andrew" });
}

function preparedMeta(): string {
  return renderMetaFile("member", {
    state: "Planning",
    owner: "andrew",
    decompositionReceipt: RECEIPT_ID,
  });
}

describe("validateDecompositionReceiptMarker", () => {
  it("reads ordinary absence or one canonical marker before receipt lookup", () => {
    expect(readDecompositionReceiptMarker(ordinaryMeta())).toEqual({
      status: "valid",
      receiptId: null,
    });
    expect(readDecompositionReceiptMarker(preparedMeta())).toEqual({
      status: "valid",
      receiptId: RECEIPT_ID,
    });
    expect(readDecompositionReceiptMarker(
      ordinaryMeta().replace("- **Review Rubric:** [none]", "- **Review Rubric:** [none]\n- **Decomposition Receipt:**"),
    )).toEqual({ status: "refused", reason: "malformed" });
    expect(readDecompositionReceiptMarker(
      ordinaryMeta().replace("- **Review Rubric:** [none]", "- **Review Rubric:** [none]\n- **Unmanaged Receipt:** opaque"),
    )).toEqual({ status: "valid", receiptId: null });
  });

  it("accepts omission only for an ordinary meta tuple", () => {
    expect(validateDecompositionReceiptMarker(ordinaryMeta(), null)).toEqual({
      status: "valid",
      receiptId: null,
    });
    expect(validateDecompositionReceiptMarker(ordinaryMeta(), RECEIPT_ID)).toEqual({
      status: "refused",
      reason: "mismatch",
    });
  });

  it("accepts one canonical plan-bound marker in canonical position", () => {
    expect(validateDecompositionReceiptMarker(preparedMeta(), RECEIPT_ID)).toEqual({
      status: "valid",
      receiptId: RECEIPT_ID,
    });
  });

  it("removes only the exact canonical marker while preserving the surrounding projection", () => {
    const prepared = preparedMeta();
    const removed = removeDecompositionReceiptMarker(prepared, RECEIPT_ID);
    expect(removed).toBe(ordinaryMeta());
    expect(() => removeDecompositionReceiptMarker(prepared, `sha256:${"b".repeat(64)}`))
      .toThrow(/does not match/u);
  });

  it("refuses duplicate, misplaced, malformed, and mismatched markers", () => {
    const canonical = preparedMeta();
    const marker = `- **Decomposition Receipt:** \`${RECEIPT_ID}\``;
    const duplicate = canonical.replace(marker, `${marker}\n${marker}`);
    const misplaced = canonical.replace(`${marker}\n`, "").replace("\n---", `\n${marker}\n\n---`);
    const malformed = canonical.replace(RECEIPT_ID, "sha256:nope");
    const other = `sha256:${"b".repeat(64)}` as CanonicalDigest;

    expect(validateDecompositionReceiptMarker(duplicate, RECEIPT_ID)).toEqual({
      status: "refused",
      reason: "duplicate",
    });
    expect(validateDecompositionReceiptMarker(misplaced, RECEIPT_ID)).toEqual({
      status: "refused",
      reason: "misplaced",
    });
    expect(validateDecompositionReceiptMarker(malformed, RECEIPT_ID)).toEqual({
      status: "refused",
      reason: "malformed",
    });
    expect(validateDecompositionReceiptMarker(canonical, other)).toEqual({
      status: "refused",
      reason: "mismatch",
    });
  });
});
