import {
  isCanonicalDigest,
  type CanonicalDigest,
} from "../canonical/canonical-json.js";
import { parseMetaRecord } from "../active/meta-reader.js";

export type DecompositionReceiptMarkerResult =
  | { readonly status: "valid"; readonly receiptId: CanonicalDigest | null }
  | {
      readonly status: "refused";
      readonly reason: "duplicate" | "misplaced" | "malformed" | "mismatch";
    };

const REVIEW_MARKER = /^- \*\*Review Rubric:\*\* /u;
const RECEIPT_MARKER = /^- \*\*Decomposition Receipt:\*\* (.+)$/u;

/**
 * Validate the optional decomposition marker as part of a prepared meta tuple.
 * Ordinary metas omit it. A prepared new-leaf meta carries exactly one canonical
 * digest immediately after Review Rubric and must match the plan-bound receipt.
 */
export function validateDecompositionReceiptMarker(
  content: string,
  expectedReceiptId: CanonicalDigest | null,
): DecompositionReceiptMarkerResult {
  const lines = content.split(/\r?\n/u);
  const receiptLines = lines
    .map((line, index) => ({ line, index, match: RECEIPT_MARKER.exec(line) }))
    .filter((entry) => entry.match !== null);

  if (receiptLines.length > 1) return { status: "refused", reason: "duplicate" };
  if (receiptLines.length === 0) {
    return expectedReceiptId === null
      ? { status: "valid", receiptId: null }
      : { status: "refused", reason: "mismatch" };
  }

  const [entry] = receiptLines;
  if (entry === undefined || entry.match === null) {
    return { status: "refused", reason: "malformed" };
  }
  const reviewIndex = lines.findIndex((line) => REVIEW_MARKER.test(line));
  if (reviewIndex === -1 || entry.index !== reviewIndex + 1) {
    return { status: "refused", reason: "misplaced" };
  }

  const parsed = parseMetaRecord(content).decompositionReceipt;
  if (!isCanonicalDigest(parsed)) return { status: "refused", reason: "malformed" };
  if (expectedReceiptId === null || parsed !== expectedReceiptId) {
    return { status: "refused", reason: "mismatch" };
  }
  return { status: "valid", receiptId: parsed };
}
