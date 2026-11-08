/** Portable local inputs and ready receipts for atomic prepared-projection admission. */
import { z } from "zod";
import { isManagedPath, SlugSchema } from "../kernel/index.js";
import { RecordReferenceSchema, RecordVersionSchema, sameReference } from "./identity.js";
import { RemedySchema } from "./refusal.js";
import { LocusTokenSchema } from "../locus/schema/limits.js";
import { BlobIdSchema, FileRenderingSchema, RecordEntrySchema } from "./projection/index-schema.js";

const path = z.string().refine(isManagedPath, "Expected a repository-relative path");
const exactReference = RecordReferenceSchema.refine(reference => reference.owner.type === "person" || reference.owner.uid !== undefined,
  "Prepared projection subjects require an exact generation");
const mark = z.strictObject({ reason: z.string().min(1), remedy: RemedySchema });
const decimal = z.string().regex(/^(?:0|[1-9][0-9]*)$/u);
const stat = z.strictObject({ type: z.enum(["file", "symlink", "other"]), size: decimal, mtimeNs: decimal, ino: decimal });
const subject = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("work-unit"), name: SlugSchema, uid: z.uuid().optional() }),
  z.strictObject({ kind: z.literal("errand"), slug: SlugSchema, claimId: LocusTokenSchema }),
  z.strictObject({ kind: z.literal("groom"), slug: SlugSchema, claimId: LocusTokenSchema }),
  z.strictObject({ kind: z.literal("housekeep"), slug: SlugSchema, claimId: LocusTokenSchema }),
  z.strictObject({ kind: z.literal("partial-errand"), slug: SlugSchema, claimId: z.null() }),
  z.strictObject({ kind: z.literal("branch"), ref: z.string().min(1) }),
]);
const marker = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("current"), subject, provisioning: z.enum(["pending", "ready"]).nullable(), husk: z.boolean() }),
  z.strictObject({ kind: z.literal("manual-only"), reason: z.enum(["legacy-transient", "unknown-provisioning", "malformed-ownership"]), husk: z.boolean() }),
]);
const adoption = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("write-back"), stub: z.literal(true).optional() }),
  z.strictObject({ kind: z.literal("read-back"), read: z.strictObject({ stat, blob: BlobIdSchema }), retained: mark.optional() }),
]);
const basis = RecordEntrySchema.pick({ reference: true, written: true, base: true, markers: true, notices: true,
  unshown: true, persisted: true, inProgress: true, copies: true }).extend({ adoption: adoption.nullable() });
const selectedBase = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("stored"), version: RecordVersionSchema, blob: BlobIdSchema }),
  z.strictObject({ kind: z.literal("copy"), blob: BlobIdSchema }),
  z.strictObject({ kind: z.literal("empty") }),
]);
const resolution = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("stored"), reference: exactReference }),
  z.strictObject({ kind: z.literal("hold"), token: z.string().min(1) }),
]);

/** Closed JSON capsule replayed against the publishing attempt's immutable before view. */
export const ProjectionAdmissionSchema = z.strictObject({
  version: z.literal(1), mutationIndex: z.literal(0), editingIdentity: SlugSchema,
  selection: z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("indexed"), reference: exactReference }),
    z.strictObject({ kind: z.literal("unindexed") })]),
  local: z.strictObject({ path, source: z.enum(["file", "aside"]), layoutActive: z.enum(["nested", "flat"]),
    viewInFlight: z.strictObject({ mode: z.enum(["mine", "cohort", "all"]), pins: z.array(SlugSchema) }),
    claim: SlugSchema.nullable(), marker: marker.nullable(),
    indexedMetadata: z.array(z.strictObject({ path, reference: exactReference })),
    prospectiveMetadata: z.array(z.strictObject({ path, content: z.string().nullable() })) }),
  input: z.strictObject({ format: z.enum(["sha1", "sha256"]),
    file: z.strictObject({ content: z.string(), stamp: BlobIdSchema.nullable(), mtimeNs: decimal }),
    basis: basis.nullable(), base: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("stamp"), stamp: BlobIdSchema.nullable() }),
      z.strictObject({ kind: z.literal("blob"), blob: BlobIdSchema })]).nullable(),
    rendering: FileRenderingSchema.nullable(), resolution: resolution.nullable(), recoveringBase: z.boolean(),
    retainedBases: z.array(z.strictObject({ name: z.string().min(1), content: z.string() })) }),
  prepared: z.strictObject({ reference: exactReference, selectedBase, stamp: BlobIdSchema.nullable(), takenIn: z.string(),
    retained: mark.nullable(), historicalInputs: z.array(z.strictObject({ reference: exactReference,
      version: RecordVersionSchema, blob: BlobIdSchema })) }),
}).superRefine((request, context) => {
  const invalid = (message: string): void => { context.addIssue({ code: "custom", message }); };
  if (request.local.source === "aside" && request.input.resolution !== null) invalid("Aside copies cannot resolve explicitly");
  if (request.selection.kind === "indexed") {
    if (!request.input.basis || !request.input.base
      || !sameReference(request.selection.reference, request.input.basis.reference)
      || !sameReference(request.selection.reference, request.prepared.reference)) invalid("Indexed input must retain its exact basis");
  } else if (request.input.basis !== null || request.input.base !== null || request.input.rendering !== null
    || request.input.resolution !== null || request.input.recoveringBase) invalid("New adoption cannot assert an indexed basis");
  for (const values of [request.local.indexedMetadata, request.local.prospectiveMetadata]) {
    if (new Set(values.map(value => value.path)).size !== values.length) invalid("Duplicate local candidate paths");
  }
  if (new Set(request.input.retainedBases.map(value => value.name)).size !== request.input.retainedBases.length) invalid("Duplicate retained copies");
});
/** A validated, ephemeral admission request; embedded local stats use decimal strings. */
export type ProjectionAdmission = z.infer<typeof ProjectionAdmissionSchema>;
