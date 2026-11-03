/** Pure envelopes shared by repository review persistence and import decoding. */
import { z } from "zod";
import { ReviewOperationStateSchema } from "./operation-state-schema.js";
import { FrontlineOutcomeRecordSchema } from "./advisory-records.js";

const IdentifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u);
export const OPERATION_STORE_SEMANTICS = "review-operation-store/v1" as const;
export const OUTCOME_STORE_SEMANTICS = "frontline-outcome-store/v1" as const;

export const ReviewOperationStoreRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal(OPERATION_STORE_SEMANTICS),
  operationId: IdentifierSchema,
  version: z.number().int().positive(),
  state: ReviewOperationStateSchema,
});
export type ReviewOperationStoreRecord = z.infer<typeof ReviewOperationStoreRecordSchema>;

export const FrontlineOutcomeStoreRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal(OUTCOME_STORE_SEMANTICS),
  operationId: IdentifierSchema,
  version: z.number().int().positive(),
  record: FrontlineOutcomeRecordSchema,
});
export type FrontlineOutcomeStoreRecord = z.infer<typeof FrontlineOutcomeStoreRecordSchema>;
