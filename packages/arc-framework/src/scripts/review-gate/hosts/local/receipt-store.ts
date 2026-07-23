/** Repository-shared local authority for exact forward review receipts. */

import { canonicalize } from "../../../../lib/kernel/index.js";
import {
  validateReviewReceipt,
} from "../../core/gate-contract-v2.js";
import {
  ReviewReceiptV2Schema,
  type ReviewReceiptV2,
  type ReviewRequestV2,
  type ReviewRequirementV2,
  type ReviewTarget,
} from "../../core/gate-contract-v2-schema.js";
import {
  ForwardReceiptLedgerRecordSchema,
  type ForwardReceiptLedgerRecord,
} from "../../core/forward-receipt-ledger-schema.js";
import type {
  ForwardReceiptLedger,
  ForwardReviewReceiptStore,
} from "../../core/ports.js";
import type { GitCommonStatePublisher } from "./git-common-state.js";

const RECEIPT_RECORD = "receipts-v2.json";
const RECEIPT_REFERENCE_PREFIX = `git-common:review-gate/evidence/${RECEIPT_RECORD}#`;

/** Stable local-store failure that callers can handle without parsing prose. */
export class LocalReceiptStoreError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "LocalReceiptStoreError";
  }
}

function emptyLedger(repositoryId: string): ForwardReceiptLedgerRecord {
  return {
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    repositoryId,
    ledgerVersion: 0,
    receipts: [],
  };
}

function parseLedger(raw: string | null, repositoryId: string): ForwardReceiptLedgerRecord {
  if (raw === null) return emptyLedger(repositoryId);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new LocalReceiptStoreError("malformed-ledger");
  }
  const parsed = ForwardReceiptLedgerRecordSchema.safeParse(value);
  if (!parsed.success) throw new LocalReceiptStoreError("malformed-ledger");
  if (parsed.data.repositoryId !== repositoryId) throw new LocalReceiptStoreError("repository-mismatch");
  return parsed.data;
}

function receiptIdentity(receipt: ReviewReceiptV2): string {
  return `${receipt.requestId}:${receipt.reviewRunId}`;
}

/** Version-checked local receipt store; all mutation occurs inside the publisher's repository lock. */
export class LocalForwardReviewReceiptStore implements ForwardReviewReceiptStore {
  constructor(
    private readonly publisher: GitCommonStatePublisher,
    private readonly repositoryId: string,
  ) {}

  async readReceipts(targetId: string): Promise<ForwardReceiptLedger> {
    const ledger = parseLedger(await this.publisher.read("evidence", RECEIPT_RECORD), this.repositoryId);
    return {
      ledgerVersion: ledger.ledgerVersion,
      receipts: ledger.receipts.filter((receipt) => receipt.targetId === targetId),
    };
  }

  /** Read target receipts with their stable global-ledger references. */
  async readReceiptEntries(targetId: string): Promise<Array<{
    receipt: ReviewReceiptV2;
    durableEvidenceRef: string;
  }>> {
    const ledger = parseLedger(await this.publisher.read("evidence", RECEIPT_RECORD), this.repositoryId);
    return ledger.receipts.flatMap((receipt, index) => receipt.targetId === targetId
      ? [{
          receipt,
          durableEvidenceRef: `${RECEIPT_REFERENCE_PREFIX}${index + 1}`,
        }]
      : []);
  }

  /** Resolve the exact receipt named by one store-issued durable reference. */
  async readReceiptReference(reference: string): Promise<ReviewReceiptV2 | null> {
    if (!reference.startsWith(RECEIPT_REFERENCE_PREFIX)) {
      throw new LocalReceiptStoreError("invalid-receipt-reference");
    }
    const position = Number(reference.slice(RECEIPT_REFERENCE_PREFIX.length));
    if (!Number.isSafeInteger(position) || position <= 0) {
      throw new LocalReceiptStoreError("invalid-receipt-reference");
    }
    const ledger = parseLedger(await this.publisher.read("evidence", RECEIPT_RECORD), this.repositoryId);
    return ledger.receipts[position - 1] ?? null;
  }

  async appendReceipt(
    receipt: ReviewReceiptV2,
    expectedLedgerVersion: number,
  ): Promise<{ ledgerVersion: number; durableEvidenceRef: string }> {
    const canonicalReceipt = ReviewReceiptV2Schema.parse(receipt);
    return this.publisher.update("evidence", RECEIPT_RECORD, (raw) => {
      const ledger = parseLedger(raw, this.repositoryId);
      const identity = receiptIdentity(canonicalReceipt);
      const replay = ledger.receipts.find((candidate) => receiptIdentity(candidate) === identity);
      if (replay !== undefined) {
        if (canonicalize(replay) !== canonicalize(canonicalReceipt)) {
          throw new LocalReceiptStoreError("conflicting-replay");
        }
        const replayVersion = ledger.receipts.indexOf(replay) + 1;
        return {
          content: null,
          result: {
            ledgerVersion: ledger.ledgerVersion,
            durableEvidenceRef: `${RECEIPT_REFERENCE_PREFIX}${replayVersion}`,
          },
        };
      }
      if (ledger.ledgerVersion !== expectedLedgerVersion) {
        throw new LocalReceiptStoreError("version-conflict");
      }
      const next = ForwardReceiptLedgerRecordSchema.parse({
        ...ledger,
        ledgerVersion: ledger.ledgerVersion + 1,
        receipts: [...ledger.receipts, canonicalReceipt],
      });
      return {
        content: `${JSON.stringify(next)}\n`,
        result: {
          ledgerVersion: next.ledgerVersion,
          durableEvidenceRef: `${RECEIPT_REFERENCE_PREFIX}${next.ledgerVersion}`,
        },
      };
    });
  }
}

/** Explicitly revalidate local evidence before appending it through another authority. */
export async function importLocalReviewReceipt(input: {
  target: ReviewTarget;
  requirement: ReviewRequirementV2;
  request: ReviewRequestV2;
  receipt: ReviewReceiptV2;
  destination: ForwardReviewReceiptStore;
  expectedLedgerVersion: number;
}): Promise<{ ledgerVersion: number; durableEvidenceRef: string }> {
  const receipt = validateReviewReceipt(input.target, input.requirement, input.request, input.receipt);
  return input.destination.appendReceipt(receipt, input.expectedLedgerVersion);
}
