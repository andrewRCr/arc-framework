/** Runtime authority for the repository-shared forward receipt ledger. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";
import {
  ReviewGateV2SemanticsSchema,
  ReviewIdentifierSchema,
  ReviewReceiptV2Schema,
} from "./gate-contract-v2-schema.js";

export const ForwardReceiptLedgerRecordSchema = z.strictObject({
  schemaVersion: z.literal(2),
  semanticsVersion: ReviewGateV2SemanticsSchema,
  repositoryId: ReviewIdentifierSchema,
  ledgerVersion: z.number().int().nonnegative(),
  receipts: z.array(ReviewReceiptV2Schema),
}).superRefine((ledger, context) => {
  if (ledger.ledgerVersion !== ledger.receipts.length) {
    context.addIssue({ code: "custom", message: "ledger version must equal receipt count" });
  }
  const identities = ledger.receipts.map((receipt) => `${receipt.requestId}:${receipt.reviewRunId}`);
  if (new Set(identities).size !== identities.length) {
    context.addIssue({ code: "custom", message: "receipt identities must be unique" });
  }
});
export type ForwardReceiptLedgerRecord = z.infer<typeof ForwardReceiptLedgerRecordSchema>;

/** Register the strict repository-shared forward receipt ledger. */
export function registerForwardReceiptLedgerSchema(registry: KernelRegistry): KernelRegistry {
  registry.register(ForwardReceiptLedgerRecordSchema, {
    id: "review-receipt-ledger",
    version: 2,
    migrationPosture: "strict-current",
  });
  return registry;
}
