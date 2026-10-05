/** Version-bound mutations and all-or-nothing batch result validation. */

import { z } from "zod";
import { RecordReferenceSchema, RecordVersionSchema, sameReference } from "./identity.js";
import { CallerProvenanceSchema, LinksSchema } from "./links.js";
import { WritePlacementSchema } from "./placement.js";

const reference = { reference: RecordReferenceSchema };
const resolves = z.array(RecordReferenceSchema).refine(
  (values) => values.every((value) => value.kind.endsWith("/conflict-record")),
  "Resolution names conflict records by reference",
);
const mutation = {
  ...reference, expected: RecordVersionSchema.nullable(), resolves: resolves.optional(),
};
/** One mutation, without batch-level provenance. Content absence is explicit removal. */
export const MutationSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("put"), ...mutation, content: z.string(), placement: WritePlacementSchema.optional(), links: LinksSchema.optional() }),
  z.strictObject({ action: z.literal("remove"), ...reference, expected: RecordVersionSchema, resolves: resolves.optional() }),
]).superRefine((value, context) => {
  if (value.action === "remove") return;
  const primary = value.reference.kind === "work-item/meta" || value.reference.kind === "work-item/record";
  if (primary && value.placement === undefined) context.addIssue({ code: "custom", message: "Primary records require placement" });
  if (!primary && (value.placement !== undefined || value.links !== undefined)) {
    context.addIssue({ code: "custom", message: "Only primary records carry placement or links on writes" });
  }
  if (value.reference.kind === "work-item/record" && value.placement?.kind === "backlog") {
    context.addIssue({ code: "custom", message: "Errands cannot enter backlog" });
  }
});
/** One mutation inside an atomic batch. */
export type Mutation = z.infer<typeof MutationSchema>;
/** A mutation and the caller's provenance. */
export const WriteInputSchema = z.record(z.string(), z.unknown()).transform((input, context) => {
  const { provenance, ...mutationInput } = input;
  const mutationResult = MutationSchema.safeParse(mutationInput);
  const provenanceResult = CallerProvenanceSchema.safeParse(provenance);
  if (!mutationResult.success || !provenanceResult.success) {
    context.addIssue({ code: "custom", message: "Expected a validated mutation and caller provenance" });
    return z.NEVER;
  }
  return { ...mutationResult.data, provenance: provenanceResult.data };
});
/** A version-bound record write. */
export type WriteInput = Mutation & { provenance: z.infer<typeof CallerProvenanceSchema> };
/** One atomic batch under a single caller provenance. */
export const BatchInputSchema = z.strictObject({ writes: z.array(MutationSchema).min(1), provenance: CallerProvenanceSchema })
  .refine((value) => {
    return value.writes.every((write, index) => !value.writes.slice(0, index)
      .some((other) => sameReference(write.reference, other.reference)));
  }, "A batch names each record at most once");
/** An all-or-nothing write request. */
export type BatchInput = z.infer<typeof BatchInputSchema>;
/** Applied mutation; removals return no record version. */
export const WriteResultSchema = z.strictObject({
  reference: RecordReferenceSchema,
  version: RecordVersionSchema.optional(),
  conflicts: z.array(RecordReferenceSchema),
});
/** One applied write's exact mutation basis and newly created conflicts. */
export type WriteResult = z.infer<typeof WriteResultSchema>;

function matchesMutationReference(result: WriteResult, input: Mutation): boolean {
  if (input.action === "put" && result.reference.kind !== input.reference.kind) return false;
  if (sameReference(result.reference, input.reference)) return true;
  const requested = input.reference.owner;
  const resolved = result.reference.owner;
  if (requested.type === "person" || resolved.type === "person" || requested.uid !== undefined
    || requested.type !== resolved.type || requested.name !== resolved.name) return false;
  return sameReference(result.reference, { ...input.reference, owner: resolved });
}

/** Bind a write result to its mutation, including removal's absence of a version.
 * @param input - Original mutation.
 * @returns A validator for this exact mutation's success result.
 */
export function writeResultSchema(input: Mutation) {
  return WriteResultSchema.refine((result) => matchesMutationReference(result, input)
    && (input.action === "put" ? result.version !== undefined : result.version === undefined),
  "A put returns its version and a removal returns none");
}
/** Batch result shape; input-bound validation additionally forbids a partial set. */
export const BatchResultSchema = z.strictObject({ batchId: z.string().min(1), writes: z.array(WriteResultSchema).min(1) })
  .refine((result) => result.writes.every((write,index) => !result.writes.slice(0,index)
    .some((other) => sameReference(write.reference,other.reference))),
  "An atomic batch returns each canonical record at most once");
/** One complete batch result. */
export type BatchResult = z.infer<typeof BatchResultSchema>;

/** Bind a batch result to exactly the requested mutations.
 * @param input - Original atomic request.
 * @returns A validator refusing omissions, additions, and partial application.
 */
export function batchResultSchema(input: BatchInput) {
  return BatchResultSchema.refine((result) => result.writes.length === input.writes.length
    && result.writes.every((write, index) => {
      const mutation = input.writes[index];
      return mutation !== undefined && writeResultSchema(mutation).safeParse(write).success;
    }),
  "An atomic batch returns every requested write or refuses");
}
