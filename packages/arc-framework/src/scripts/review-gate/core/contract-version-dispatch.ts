/** Explicit schema/semantics dispatch for legacy and forward review records. */

import { parseNormalizedChangeRequest, parseReviewRequirement } from "./contracts.js";
import {
  parseReceiptEnvelope,
  parseReviewReceipt,
  parseReviewRequest,
} from "./execution.js";
import {
  validateReviewReceipt,
  validateReviewRequest,
  validateReviewRequirement,
  validateReviewTarget,
} from "./gate-contract-v2.js";
import { ForwardReceiptLedgerRecordSchema } from "./forward-receipt-ledger-schema.js";
import { objectAt, ReviewRecordValidationError } from "./validation.js";

export type ReviewContractVersion = 1 | 2;

/** Resolve only an explicit supported schema/semantics pair. */
export function reviewContractVersionAt(input: unknown, path: string): ReviewContractVersion {
  const record = objectAt(input, path);
  if (record.schemaVersion === 1) {
    if (record.semanticsVersion !== undefined && record.semanticsVersion !== "review-gate/v1") {
      throw new ReviewRecordValidationError(`${path}.semanticsVersion`, "schema v1 requires review-gate/v1");
    }
    return 1;
  }
  if (record.schemaVersion === 2) {
    if (record.semanticsVersion !== "review-gate/v2") {
      throw new ReviewRecordValidationError(`${path}.semanticsVersion`, "schema v2 requires review-gate/v2");
    }
    return 2;
  }
  throw new ReviewRecordValidationError(`${path}.schemaVersion`, "unsupported review contract version");
}

/** Parse a repository target record without coercing legacy or canonical identities. */
export function parseVersionedReviewTarget(input: unknown):
  | { version: 1; record: ReturnType<typeof parseNormalizedChangeRequest> }
  | { version: 2; record: ReturnType<typeof validateReviewTarget> } {
  return reviewContractVersionAt(input, "target") === 1
    ? { version: 1, record: parseNormalizedChangeRequest(input) }
    : { version: 2, record: validateReviewTarget(input) };
}

/** Parse a requirement only beside a target from the same contract generation. */
export function parseVersionedReviewRequirement(input: unknown, target: unknown):
  | { version: 1; record: ReturnType<typeof parseReviewRequirement> }
  | { version: 2; record: ReturnType<typeof validateReviewRequirement> } {
  const version = reviewContractVersionAt(input, "requirement");
  if (reviewContractVersionAt(target, "target") !== version) throw new Error("mixed review contract versions");
  return version === 1
    ? { version, record: parseReviewRequirement(input) }
    : { version, record: validateReviewRequirement(target, input) };
}

/** Parse a workflow/provider request only beside a target from the same contract generation. */
export function parseVersionedReviewRequest(input: unknown, target: unknown):
  | { version: 1; record: ReturnType<typeof parseReviewRequest> }
  | { version: 2; record: ReturnType<typeof validateReviewRequest> } {
  const version = reviewContractVersionAt(input, "request");
  if (reviewContractVersionAt(target, "target") !== version) throw new Error("mixed review contract versions");
  return version === 1
    ? { version, record: parseReviewRequest(input) }
    : { version, record: validateReviewRequest(target, input) };
}

/** Parse a provider receipt with complete v2 binding context and bounded v1 compatibility. */
export function parseVersionedReviewReceipt(input: {
  receipt: unknown;
  target: unknown;
  requirement: unknown;
  request: unknown;
}):
  | { version: 1; record: ReturnType<typeof parseReviewReceipt> }
  | { version: 2; record: ReturnType<typeof validateReviewReceipt> } {
  const version = reviewContractVersionAt(input.receipt, "receipt");
  for (const [path, value] of [
    ["target", input.target],
    ["requirement", input.requirement],
    ["request", input.request],
  ] as const) {
    if (reviewContractVersionAt(value, path) !== version) throw new Error("mixed review contract versions");
  }
  return version === 1
    ? { version, record: parseReviewReceipt(input.receipt) }
    : {
        version,
        record: validateReviewReceipt(input.target, input.requirement, input.request, input.receipt),
      };
}

/** Parse a comment/local-ledger record by its explicit top-level contract version. */
export function parseVersionedReceiptLedgerRecord(input: unknown):
  | { version: 1; record: ReturnType<typeof parseReceiptEnvelope> }
  | { version: 2; record: ReturnType<typeof ForwardReceiptLedgerRecordSchema.parse> } {
  return reviewContractVersionAt(input, "ledger") === 1
    ? { version: 1, record: parseReceiptEnvelope(input) }
    : { version: 2, record: ForwardReceiptLedgerRecordSchema.parse(input) };
}
