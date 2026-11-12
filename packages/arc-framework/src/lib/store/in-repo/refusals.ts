/** Typed refusal control flow kept separate from unclassified adapter failures. */

import { ArcError } from "../../kernel/errors.js";
import { StoreRefusalSchema, UNSUPPORTED_CASES, type StoreRefusal, type StoreResult, type UnsupportedCase } from "../refusal.js";
import type { RecordReference } from "../identity.js";

class OperationRefusal extends Error {
  constructor(readonly refusal: StoreRefusal) { super(refusal.condition); }
}
/** Stop an operation with a validated refusal value.
 * @param value - Complete condition, classification, and repair route.
 * @returns Never; the operation envelope catches this private control-flow value.
 */
export function refuse(value: StoreRefusal): never { throw new OperationRefusal(StoreRefusalSchema.parse(value)); }
/** Run one operation, preserving unclassified failures as thrown errors.
 * @param operation - The substrate operation.
 * @returns An ok result or a typed operational refusal.
 */
export async function runOperation<T>(operation: () => Promise<T>): Promise<StoreResult<T>> {
  try { return { status: "ok", result: await operation() }; }
  catch (error) {
    if (error instanceof OperationRefusal) return { status: "refused", refusal: error.refusal };
    if (error instanceof ArcError) throw error;
    throw new ArcError("Operational state could not be read or written", "store.operation-failed", { cause: error });
  }
}
/** Refuse an interim capability with its assigned recovery class.
 * @param issue - The named unsupported call case.
 * @param condition - Observed unsupported operation.
 * @param remedy - What the caller can do instead.
 * @returns Never; the operation returns this refusal.
 */
export function unsupported(issue: UnsupportedCase, condition: string, remedy: string): never {
  return refuse({ code: "unsupported", class: UNSUPPORTED_CASES[issue], case: issue, condition, remedy: { text: remedy } });
}
/** Refuse a missing record with an actionable creation or selection route.
 * @param reference - Missing logical record.
 * @param remedy - Creation or lookup repair text.
 * @returns Never; the operation returns this refusal.
 */
export function notFound(reference: RecordReference, remedy = "Create the record, then read it again."): never {
  return refuse({ code: "not-found", class: "recoverable", reference,
    condition: `${reference.kind} for ${reference.owner.name} was not found`, remedy: { text: remedy } });
}
/** Recognize only the filesystem's typed missing-path error.
 * @param error - Filesystem rejection.
 * @returns Whether the path is absent.
 */
export function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
