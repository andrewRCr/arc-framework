/** Structured code traceability and write provenance, never commit conventions. */

import { z } from "zod";
import { RecordReferenceSchema } from "./identity.js";

/** Git object identity used at repository lookup seams. */
export const CommitShaSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
/** One code capture; a merge commit has no patch identity. */
export const CommitCaptureSchema = z.strictObject({ sha: CommitShaSchema, patchId: CommitShaSchema.optional() });
/** A stored code capture. */
export type CommitCapture = z.infer<typeof CommitCaptureSchema>;
const captures = z.array(CommitCaptureSchema).refine(
  (values) => new Set(values.map((value) => value.sha)).size === values.length,
  "One task cannot capture the same commit twice",
);
/** Base links read without a family-specific parser. */
export const LinksSchema = z.strictObject({
  branch: z.strictObject({ repository: z.string().min(1), ref: z.string().min(1) }).optional(),
  changeRequest: z.strictObject({ repository: z.string().min(1), number: z.number().int().positive() }).optional(),
  landingCommit: CommitCaptureSchema.optional(),
  taskCaptures: z.record(z.string().regex(/^\d+(?:\.[A-Za-z0-9]+)+$/u), captures).optional(),
});
/** Whole-value traceability replacement, including the empty clear value. */
export type Links = z.infer<typeof LinksSchema>;
/** Only the caller's facts: backend identity and batch fields cannot be supplied. */
export const CallerProvenanceSchema = z.strictObject({
  verb: z.string().trim().min(1),
  lifecycleAction: z.string().trim().min(1),
  codeHead: CommitShaSchema.optional(),
});
/** The provenance supplied by a verb. */
export type CallerProvenance = z.infer<typeof CallerProvenanceSchema>;
/** Backend-enriched provenance, or a commit message preserved by the interim backend. */
export const StoredProvenanceSchema = z.union([
  CallerProvenanceSchema.extend({ reference: RecordReferenceSchema, ownerUid: z.uuid().optional(), batchId: z.string().min(1).optional() }),
  z.strictObject({ message: z.string() }),
]);
/** History provenance as stored, with no implied review evidence. */
export type StoredProvenance = z.infer<typeof StoredProvenanceSchema>;
