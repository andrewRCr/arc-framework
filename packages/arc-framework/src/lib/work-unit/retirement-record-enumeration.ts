/**
 * Storage-agnostic validation for one reachable retirement-record namespace.
 *
 * Adapters supply raw entries and keep their paths private. Validation
 * authenticates the complete namespace before any caller projects records by
 * subject, because invalid bytes cannot be classified as unrelated evidence.
 *
 * @module
 */

import type { CanonicalDigest } from "../canonical/canonical-json.js";
import type { V3DecomposePreparation } from "./decompose-v3-preparation.js";
import type { V3DecomposeReceipt } from "./decompose-v3-receipt.js";
import type { RetirementReceipt } from "./retirement-authority.js";
import { parseRetirementRecord } from "./retirement-receipt-codec.js";
import { decodeRetirementRecordKey } from "./retirement-record-store.js";

/** One raw record discovered by an adapter, without exposing its storage path. */
export interface RetirementRecordEnumerationEntry {
  filename: string;
  mode: string;
  type: string;
  content: string;
}

/** One authenticated record keyed by its durable receipt identity. */
export interface EnumeratedRetirementRecord {
  id: CanonicalDigest;
  content: string;
  record:
    | { kind: "receipt"; value: RetirementReceipt }
    | { kind: "v3-decomposition-preparation"; value: V3DecomposePreparation }
    | { kind: "v3-decomposition-receipt"; value: V3DecomposeReceipt };
}

/** Complete namespace result before a subject-specific projection. */
export type RetirementRecordEnumerationResult =
  | { status: "valid"; records: readonly EnumeratedRetirementRecord[] }
  | { status: "version-conflict"; id: CanonicalDigest }
  /** The complete namespace is unusable; `filename` identifies the rejected entry when available. */
  | { status: "namespace-corrupt"; filename?: string };

const RECORD_FILENAME_PATTERN = /^(sha256-[0-9a-f]{64})\.json$/u;

/**
 * Authenticate every reachable entry and deduplicate byte-identical records.
 *
 * @param entries - Raw canonical-current and legacy-historical entries
 * @returns The complete validated set, a duplicate conflict, or global corruption
 */
export function validateRetirementRecordEnumeration(
  entries: readonly RetirementRecordEnumerationEntry[],
): RetirementRecordEnumerationResult {
  const records = new Map<CanonicalDigest, EnumeratedRetirementRecord>();
  for (const entry of entries) {
    if (entry.mode !== "100644" || entry.type !== "blob") {
      return { status: "namespace-corrupt", filename: entry.filename };
    }
    const match = RECORD_FILENAME_PATTERN.exec(entry.filename);
    if (match === null || match[1] === undefined) {
      return { status: "namespace-corrupt", filename: entry.filename };
    }

    let id: CanonicalDigest;
    try {
      id = decodeRetirementRecordKey(match[1]);
    } catch {
      return { status: "namespace-corrupt", filename: entry.filename };
    }
    const decoded = parseRetirementRecord(entry.content);
    const receipt = decoded?.kind === "retained" ? decoded.receipt : null;
    const v3Receipt = decoded?.kind === "v3-decomposition" ? decoded.receipt : null;
    const v3Preparation = decoded?.kind === "v3-decomposition-preparation"
      ? decoded.preparation
      : null;
    const record: EnumeratedRetirementRecord | null = receipt !== null && receipt.receiptId === id
      ? { id, content: entry.content, record: { kind: "receipt", value: receipt } }
      : v3Preparation !== null && v3Preparation.receiptId === id
          ? {
              id,
              content: entry.content,
              record: { kind: "v3-decomposition-preparation", value: v3Preparation },
            }
          : v3Receipt !== null && v3Receipt.receiptId === id
            ? {
                id,
                content: entry.content,
                record: { kind: "v3-decomposition-receipt", value: v3Receipt },
              }
        : null;
    if (record === null) {
      return { status: "namespace-corrupt", filename: entry.filename };
    }

    const previous = records.get(id);
    if (previous !== undefined && previous.content !== entry.content) {
      return { status: "version-conflict", id };
    }
    records.set(id, previous ?? record);
  }
  return {
    status: "valid",
    records: [...records.values()].sort((left, right) => left.id.localeCompare(right.id)),
  };
}
