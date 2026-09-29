/** Cycle-free Candidate evidence schemas shared by lineage and applicability reducers. */

import { z } from "zod";

import { PathTreatmentSchema } from "../evidence-applicability/path-treatment.js";
import { CanonicalDigestSchema } from "../kernel/schema/vocabulary.js";

export const CandidateCanonicalDigestSchema = CanonicalDigestSchema;
export const CandidateGitObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
export const CandidatePathSchema = z.string().min(1)
  .refine(
    (value) => !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes(".."),
    "must be a repository-relative POSIX path",
  )
  .refine((value) => value.normalize("NFC") === value, "must use NFC-normalized repository path bytes");
export const CandidateSubjectTreatmentSchema = PathTreatmentSchema;
const CandidateTreeEntryModeSchema = z.union([
  z.string().regex(/^[0-7]{6}$/u),
  z.literal("absent"),
]);
export const CandidateSubjectEntrySchema = z.strictObject({
  path: CandidatePathSchema,
  digest: CandidateCanonicalDigestSchema,
  mode: CandidateTreeEntryModeSchema,
  treatment: CandidateSubjectTreatmentSchema,
});
export const CandidateSubjectSnapshotSchema = z.strictObject({
  entries: z.array(CandidateSubjectEntrySchema),
  subjectDigest: CandidateCanonicalDigestSchema,
});
export type CandidateSubjectSnapshot = z.infer<typeof CandidateSubjectSnapshotSchema>;

export const CandidateLineageTargetSchema = z.strictObject({
  revision: CandidateGitObjectIdSchema,
  subject: CandidateSubjectSnapshotSchema,
});
export type CandidateLineageTarget = z.infer<typeof CandidateLineageTargetSchema>;

export const CandidateVerificationApplicabilitySchema = z.enum(["targeted", "focused", "full"]);
export type CandidateVerificationApplicability = z.infer<typeof CandidateVerificationApplicabilitySchema>;

export const CandidateSubjectDeltaSchema = z.strictObject({
  added: z.array(CandidatePathSchema),
  removed: z.array(CandidatePathSchema),
  changed: z.array(CandidatePathSchema),
});
export type CandidateSubjectDelta = z.infer<typeof CandidateSubjectDeltaSchema>;
