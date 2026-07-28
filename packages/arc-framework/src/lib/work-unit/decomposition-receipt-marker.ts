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
const RECEIPT_FIELD = /^- \*\*Decomposition Receipt:\*\*/u;
const RECEIPT_MARKER = /^- \*\*Decomposition Receipt:\*\* (.+)$/u;

/**
 * Read one structurally canonical optional decomposition marker before any
 * receipt lookup. Ordinary metas omit it.
 */
export function readDecompositionReceiptMarker(
  content: string,
): DecompositionReceiptMarkerResult {
  const lines = content.split(/\r?\n/u);
  const receiptLines = lines
    .map((line, index) => ({ line, index, match: RECEIPT_MARKER.exec(line) }))
    .filter((entry) => RECEIPT_FIELD.test(entry.line));

  if (receiptLines.length > 1) return { status: "refused", reason: "duplicate" };
  if (receiptLines.length === 0) return { status: "valid", receiptId: null };

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
  return { status: "valid", receiptId: parsed };
}

/**
 * Validate the optional marker against one already selected plan-bound receipt.
 */
export function validateDecompositionReceiptMarker(
  content: string,
  expectedReceiptId: CanonicalDigest | null,
): DecompositionReceiptMarkerResult {
  const marker = readDecompositionReceiptMarker(content);
  if (marker.status === "refused") return marker;
  if (marker.receiptId !== expectedReceiptId) {
    return { status: "refused", reason: "mismatch" };
  }
  return marker;
}
