/**
 * Visible-plus-machine receipt comment format.
 *
 * An authoritative transition serializes to one compact human summary plus a
 * single collapsible machine payload carrying the core `ReviewReceipt` and its
 * ledger position. Parsing extracts that payload by structure only — the content
 * is never executed or interpolated — and reconstructs a store envelope from the
 * host comment's own node id and created/updated times, so payload time is never
 * trusted for ordering. Repository, change-request, schema, size, and
 * single-payload identities are all validated; a truncated, malformed, oversized,
 * duplicated, or out-of-scope payload fails closed. Only authoritative
 * transitions are serialized — routine observation, waiting, and check refreshes
 * emit no comment.
 *
 * @module
 */

import { parseReceiptEnvelope, type ReceiptEnvelope, type ReviewReceipt } from "../../core/execution.js";

/** HTML-comment marker identifying an ARC receipt comment. */
export const RECEIPT_MARKER = "arc-review-gate:receipt";
/** Maximum accepted comment size in bytes (below GitHub's hard comment limit). */
export const MAX_RECEIPT_COMMENT_BYTES = 60_000;

const PAYLOAD_BLOCK = /```json\n([\s\S]*?)\n```/gu;

/** A receipt plus the ledger position the store assigns it. */
export interface ReceiptPayload {
  ledgerVersion: number;
  receipt: ReviewReceipt;
}

/** Serialize an authoritative receipt into its visible-plus-machine comment body. */
export function serializeReceiptComment(payload: ReceiptPayload): string {
  const machine = JSON.stringify(payload);
  const receipt = payload.receipt;
  return [
    `<!-- ${RECEIPT_MARKER}:${receipt.request.changeRequestId} -->`,
    `**ARC review-gate receipt** · \`${receipt.action}\` · requirement \`${receipt.request.requirementId}\``
      + ` · ledger v${payload.ledgerVersion}`,
    "",
    "<details><summary>machine payload</summary>",
    "",
    "```json",
    machine,
    "```",
    "",
    "</details>",
    "",
  ].join("\n");
}

/** Host comment coordinates and the scope the payload must match. */
export interface ParseReceiptCommentInput {
  body: string;
  /** Host comment node id, retained as the durable record id. */
  commentNodeId: string;
  /** Host-created timestamp; the only trusted receipt time. */
  createdAt: string;
  /** Host last-modified timestamp; an edit is detected when it differs from created. */
  updatedAt: string;
  /** Repository the store is scoped to; a mismatched payload fails closed. */
  expectedRepositoryId: string;
  /** Change request the store is scoped to; a mismatched payload fails closed. */
  expectedChangeRequestId: string;
  maxBytes?: number;
}

/** Result of parsing a candidate receipt comment. */
export type ReceiptCommentParse =
  | { kind: "receipt"; envelope: ReceiptEnvelope }
  | { kind: "not-a-receipt" }
  | { kind: "invalid"; reason: string };

function extractLedgerVersion(raw: unknown): number | null {
  if (raw === null || typeof raw !== "object" || !("ledgerVersion" in raw)) return null;
  const value: unknown = raw.ledgerVersion;
  return typeof value === "number" ? value : null;
}

function extractReceipt(raw: unknown): unknown {
  return raw !== null && typeof raw === "object" && "receipt" in raw ? raw.receipt : undefined;
}

/** Parse a candidate comment into a validated, scope-checked receipt envelope. */
export function parseReceiptComment(input: ParseReceiptCommentInput): ReceiptCommentParse {
  if (!input.body.includes(`<!-- ${RECEIPT_MARKER}`)) return { kind: "not-a-receipt" };
  if (Buffer.byteLength(input.body, "utf8") > (input.maxBytes ?? MAX_RECEIPT_COMMENT_BYTES)) {
    return { kind: "invalid", reason: "oversized" };
  }

  const blocks = [...input.body.matchAll(PAYLOAD_BLOCK)];
  if (blocks.length === 0) return { kind: "invalid", reason: "missing-payload" };
  if (blocks.length > 1) return { kind: "invalid", reason: "duplicate-payload" };

  let raw: unknown;
  try {
    raw = JSON.parse(blocks[0]?.[1] ?? "") as unknown;
  } catch {
    return { kind: "invalid", reason: "malformed-json" };
  }

  const ledgerVersion = extractLedgerVersion(raw);
  if (ledgerVersion === null) return { kind: "invalid", reason: "missing-ledger-version" };

  let envelope: ReceiptEnvelope;
  try {
    envelope = parseReceiptEnvelope({
      schemaVersion: 1,
      durableRecordId: input.commentNodeId,
      recordedAt: input.createdAt,
      lastModifiedAt: input.updatedAt,
      ledgerVersion,
      receipt: extractReceipt(raw),
    });
  } catch (error) {
    return { kind: "invalid", reason: error instanceof Error ? error.message : "schema-invalid" };
  }

  if (
    envelope.receipt.request.repositoryId !== input.expectedRepositoryId
    || envelope.receipt.request.changeRequestId !== input.expectedChangeRequestId
  ) {
    return { kind: "invalid", reason: "scope-mismatch" };
  }
  return { kind: "receipt", envelope };
}
