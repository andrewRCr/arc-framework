/** Closed refusal vocabulary with actionable repair and retry information. */

import { z } from "zod";
import { RemoteFailureReasonSchema } from "../kernel/index.js";
import { RecordReferenceSchema } from "./identity.js";
import { LookupInputSchema } from "./lookup.js";

/** Human remedy, and executable arguments when one command advances. */
export const RemedySchema = z.strictObject({ text: z.string().trim().min(1), argv: z.array(z.string()).min(1).optional() });
/** Recoverable and terminal reasons for an unsupported interim operation. */
export const UNSUPPORTED_CASES = {
  "cross-substrate-batch": "recoverable",
  "uncovered-state-version": "recoverable",
  "work-item-kind-required": "recoverable",
  "held-here": "recoverable",
  "unhomed-kind": "terminal",
  "personal-history": "terminal",
  "links-write": "terminal",
  "placement-move": "terminal",
  "completed-create": "terminal",
  "rename": "terminal",
} as const;
/** A named unsupported call case. */
export type UnsupportedCase = keyof typeof UNSUPPORTED_CASES;
const common = { condition: z.string().trim().min(1), remedy: RemedySchema };
const recoverable = { ...common, class: z.literal("recoverable") };
const terminal = { ...common, class: z.literal("terminal") };

/** Failure classes shared by sync and interim transient writes. */
export const PublishFailureSchema = z.discriminatedUnion("code", [
  z.strictObject({ code: z.literal("retries-exhausted"), ...recoverable, retryCount: z.number().int().nonnegative(), waitedMs: z.number().nonnegative() }),
  z.strictObject({ code: z.literal("unreachable"), ...recoverable, cause: RemoteFailureReasonSchema }),
  z.strictObject({ code: z.literal("refused"), ...terminal, message: z.string().min(1) }),
]);
/** A local refusal, including the interim backend's narrowly assigned unsupported cases. */
export const LocalRefusalSchema = z.discriminatedUnion("code", [
  z.strictObject({ code: z.literal("not-found"), ...recoverable, reference: RecordReferenceSchema.optional(), lookup: LookupInputSchema.optional() })
    .refine((value) => value.reference !== undefined || value.lookup !== undefined, "Name the missing record or lookup"),
  z.strictObject({ code: z.literal("version-conflict"), ...recoverable, records: z.array(RecordReferenceSchema).min(1) }),
  z.strictObject({ code: z.literal("record-malformed"), ...recoverable, reference: RecordReferenceSchema, rule: z.string().min(1) }),
  z.strictObject({ code: z.literal("identity-mismatch"), ...recoverable, expected: RecordReferenceSchema, actual: RecordReferenceSchema }),
  z.strictObject({ code: z.literal("ambiguous-match"), ...recoverable, candidates: z.array(RecordReferenceSchema).min(2) }),
  z.strictObject({ code: z.literal("lock-held"), ...recoverable, lock: z.string().min(1) }),
  z.strictObject({ code: z.literal("namespace-corrupt"), ...terminal, namespace: z.string().min(1) }),
  z.strictObject({ code: z.literal("checkout-not-writable"), ...recoverable, checkout: z.string().min(1) }),
  z.strictObject({ code: z.literal("unsupported"), ...common, class: z.enum(["recoverable", "terminal"]), case: z.enum(Object.keys(UNSUPPORTED_CASES) as [UnsupportedCase, ...UnsupportedCase[]]) })
    .refine((value) => value.class === UNSUPPORTED_CASES[value.case], "Class must match the unsupported case"),
]);
/** The operation envelope's complete closed refusal union. */
export const StoreRefusalSchema = z.union([LocalRefusalSchema, PublishFailureSchema]);
/** A refusal is a value; defects and unclassifiable environment failures throw. */
export type StoreRefusal = z.infer<typeof StoreRefusalSchema>;
/** Every refused outcome code, used to make recovery coverage exhaustive. */
export type RefusalCode = StoreRefusal["code"];

/** Construct a status-discriminated operation validator.
 * @param result - Validator for the operation's success payload.
 * @returns The complete ok/refused envelope validator.
 */
export function storeResultSchema<T extends z.ZodType>(result: T) {
  return z.discriminatedUnion("status", [
    z.strictObject({ status: z.literal("ok"), result }),
    z.strictObject({ status: z.literal("refused"), refusal: StoreRefusalSchema }),
  ]);
}
/** Generic envelope used by every operation. */
export type StoreResult<T> = { status: "ok"; result: T } | { status: "refused"; refusal: StoreRefusal };
