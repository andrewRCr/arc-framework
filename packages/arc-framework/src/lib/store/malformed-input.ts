/** Schema-valid input refusals preserve the failing operand without inventing a record identity. */
import type { ZodError } from "zod";
import { RecordReferenceSchema } from "./identity.js";
import type { StoreRefusal } from "./refusal.js";

/** Name the invalid write or indexed batch operand, retaining only its validated reference. */
export function malformedStoreInput(input: unknown, error: ZodError, operation: "write" | "batch"): StoreRefusal {
  const path = error.issues[0]?.path ?? [];
  const mutation = operation === "write" ? input : batchOperand(input, path);
  const reference = RecordReferenceSchema.safeParse(field(mutation, "reference"));
  const primary = reference.success && (reference.data.kind === "work-item/meta" || reference.data.kind === "work-item/record");
  const missingPlacement = primary && field(mutation, "action") === "put" && field(mutation, "placement") === undefined;
  const suffix = operation === "write" ? "" : path.map(part => typeof part === "number" ? `[${part}]` : `.${String(part)}`).join("");
  return { code: "record-malformed", class: "recoverable", ...reference.success ? { reference: reference.data } : {},
    rule: missingPlacement ? "store.primary-placement" : "store.mutation",
    condition: `${operation}${suffix}: ${missingPlacement ? "Primary records require placement" : error.message}`,
    remedy: { text: "Correct the named input operand, including any required primary placement, then retry the same operation." } };
}

function batchOperand(input: unknown, path: readonly PropertyKey[]): unknown {
  if ((path[0] !== "writes" && path[0] !== "observations") || typeof path[1] !== "number") return undefined;
  const collection = field(input, path[0]);
  return Array.isArray(collection) ? collection[path[1]] : undefined;
}

function field(value: unknown, name: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[name] : undefined;
}
