/** Stable, mutable ledger-anchor comment format. */

import { integerAt, objectAt, schemaOneAt, stringAt } from "../../core/validation.js";

/** HTML marker identifying the one PR-scoped ledger anchor. */
export const LEDGER_ANCHOR_MARKER = "arc-review-gate:ledger-anchor";

const PAYLOAD = /```json\n([\s\S]*?)\n```/gu;

/** Canonical metadata retained by the ledger anchor. */
export interface LedgerAnchorPayload {
  schemaVersion: 1;
  repositoryId: string;
  changeRequestId: string;
  ledgerVersion: number;
  receiptCount: number;
}

/** Serialize the compact, deliberately mutable anchor comment. */
export function serializeLedgerAnchor(anchor: LedgerAnchorPayload): string {
  return [
    `<!-- ${LEDGER_ANCHOR_MARKER}:${anchor.changeRequestId} -->`,
    `**ARC review-gate ledger** · version ${anchor.ledgerVersion} · ${anchor.receiptCount} receipt(s)`,
    "",
    "<details><summary>machine payload</summary>",
    "",
    "```json",
    JSON.stringify(anchor),
    "```",
    "",
    "</details>",
    "",
  ].join("\n");
}

/** Parse and scope-check an authenticated anchor body. */
export function parseLedgerAnchor(
  body: string,
  expectedRepositoryId: string,
  expectedChangeRequestId: string,
): LedgerAnchorPayload {
  if (!body.includes(`<!-- ${LEDGER_ANCHOR_MARKER}`)) throw new Error("missing-anchor-marker");
  const blocks = [...body.matchAll(PAYLOAD)];
  if (blocks.length !== 1) throw new Error(blocks.length === 0 ? "missing-anchor-payload" : "duplicate-anchor-payload");
  let raw: unknown;
  try {
    raw = JSON.parse(blocks[0]?.[1] ?? "") as unknown;
  } catch {
    throw new Error("malformed-anchor-payload");
  }
  const record = objectAt(raw, "anchor");
  const anchor: LedgerAnchorPayload = {
    schemaVersion: schemaOneAt(record.schemaVersion, "anchor.schemaVersion"),
    repositoryId: stringAt(record.repositoryId, "anchor.repositoryId"),
    changeRequestId: stringAt(record.changeRequestId, "anchor.changeRequestId"),
    ledgerVersion: integerAt(record.ledgerVersion, "anchor.ledgerVersion"),
    receiptCount: integerAt(record.receiptCount, "anchor.receiptCount"),
  };
  if (anchor.repositoryId !== expectedRepositoryId || anchor.changeRequestId !== expectedChangeRequestId) {
    throw new Error("anchor-scope-mismatch");
  }
  return anchor;
}
