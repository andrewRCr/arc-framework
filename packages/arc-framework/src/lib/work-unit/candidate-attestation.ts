/** Typed Candidate attestation, review-response lineage, and currentness projection. */

import { z } from "zod";

import {
  canonicalize,
  canonicalDigest,
  sortByCanonicalBytes,
} from "../canonical/canonical-json.js";
import { SlugSchema } from "../kernel/schema/slug.js";
import {
  GitObjectIdSchema,
  ReviewCanonicalDigestSchema,
} from "../../scripts/review-gate/core/gate-contract-v2-schema.js";

const CandidateSemanticsSchema = z.literal("candidate-attestation/v1");
const CandidatePathSchema = z.string().min(1).refine(
  (value) => !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes(".."),
  "must be a repository-relative POSIX path",
);
const CandidateSubjectTreatmentSchema = z.enum(["reviewable", "operational", "candidate-projection"]);
const CandidateSubjectEntrySchema = z.strictObject({
  path: CandidatePathSchema,
  digest: ReviewCanonicalDigestSchema,
  treatment: CandidateSubjectTreatmentSchema,
});
export const CandidateSubjectSnapshotSchema = z.strictObject({
  entries: z.array(CandidateSubjectEntrySchema),
  subjectDigest: ReviewCanonicalDigestSchema,
});
export type CandidateSubjectSnapshot = z.infer<typeof CandidateSubjectSnapshotSchema>;

export const CandidateAttestationV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: CandidateSemanticsSchema,
  candidateId: ReviewCanonicalDigestSchema,
  workUnit: SlugSchema,
  subjectDigest: ReviewCanonicalDigestSchema,
  baseRevision: GitObjectIdSchema,
  attestedBy: z.string().trim().min(1),
  attestedAt: z.iso.datetime(),
  verificationEvidenceRef: z.string().trim().min(1),
});
export type CandidateAttestationV1 = z.infer<typeof CandidateAttestationV1Schema>;

const CandidateLineageTargetSchema = z.strictObject({
  revision: GitObjectIdSchema,
  subject: CandidateSubjectSnapshotSchema,
});
export const CandidateVerificationApplicabilitySchema = z.enum(["targeted", "focused", "full"]);
export type CandidateVerificationApplicability = z.infer<typeof CandidateVerificationApplicabilitySchema>;

export const CandidateReviewResponseEvidenceV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: CandidateSemanticsSchema,
  candidateId: ReviewCanonicalDigestSchema,
  responseId: ReviewCanonicalDigestSchema,
  oldTarget: CandidateLineageTargetSchema,
  newTarget: CandidateLineageTargetSchema,
  dispositionId: ReviewCanonicalDigestSchema,
  approvedBy: z.string().trim().min(1),
  appliedBy: z.string().trim().min(1),
  applicability: CandidateVerificationApplicabilitySchema,
  verificationEvidenceRefs: z.array(z.string().trim().min(1)).min(1),
  implementationChanged: z.boolean(),
});
export type CandidateReviewResponseEvidenceV1 = z.infer<typeof CandidateReviewResponseEvidenceV1Schema>;

export const CandidateManagedRecordV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: CandidateSemanticsSchema,
  attestation: CandidateAttestationV1Schema,
  subject: CandidateSubjectSnapshotSchema,
  responses: z.array(CandidateReviewResponseEvidenceV1Schema),
}).superRefine((record, context) => {
  if (record.attestation.subjectDigest !== record.subject.subjectDigest) {
    context.addIssue({ code: "custom", path: ["subject", "subjectDigest"], message: "must match the attestation" });
  }
  for (const [index, response] of record.responses.entries()) {
    if (response.candidateId !== record.attestation.candidateId) {
      context.addIssue({ code: "custom", path: ["responses", index, "candidateId"], message: "must match the attestation" });
    }
  }
});
export type CandidateManagedRecordV1 = z.infer<typeof CandidateManagedRecordV1Schema>;

/** Parse one untrusted managed Candidate record. */
export function parseCandidateManagedRecord(content: string): CandidateManagedRecordV1 | null {
  let value: unknown;
  try {
    value = JSON.parse(content) as unknown;
  } catch {
    return null;
  }
  const parsed = CandidateManagedRecordV1Schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Serialize one validated managed Candidate record in canonical form. */
export function serializeCandidateManagedRecord(record: CandidateManagedRecordV1): string {
  return canonicalize(CandidateManagedRecordV1Schema.parse(record));
}

export interface CandidateSubjectEntryInput {
  path: string;
  digest: string;
  treatment: z.infer<typeof CandidateSubjectTreatmentSchema>;
}

/**
 * Canonicalize one Candidate subject while excluding code-owned operational projections from its digest.
 *
 * @param entries - Repository-relative content identities and their review treatment.
 * @returns A normalized snapshot and its reviewable-content digest.
 */
export function createCandidateSubjectSnapshot(
  entries: readonly CandidateSubjectEntryInput[],
): CandidateSubjectSnapshot {
  const parsed = entries.map((entry) => CandidateSubjectEntrySchema.parse(entry));
  const paths = parsed.map(({ path }) => path);
  if (new Set(paths).size !== paths.length) throw new Error("Candidate subject paths must be unique");
  const normalized = sortByCanonicalBytes(parsed);
  const reviewable = normalized
    .filter(({ treatment }) => treatment === "reviewable")
    .map(({ path, digest }) => ({ path, digest }));
  return CandidateSubjectSnapshotSchema.parse({
    entries: normalized,
    subjectDigest: canonicalDigest({ domain: "arc.candidate.subject/v1", entries: reviewable }),
  });
}

export interface CreateCandidateAttestationInput {
  workUnit: string;
  subject: CandidateSubjectSnapshot;
  baseRevision: string;
  attestedBy: string;
  attestedAt: string;
  verificationEvidenceRef: string;
}

/**
 * Create one deterministic Candidate lineage root from full-verification evidence.
 *
 * @param input - Work-unit identity, normalized subject, revision, actor, time, and evidence reference.
 * @returns The strict Candidate attestation.
 */
export function createCandidateAttestation(input: CreateCandidateAttestationInput): CandidateAttestationV1 {
  const subject = CandidateSubjectSnapshotSchema.parse(input.subject);
  const fields = {
    schemaVersion: 1 as const,
    semanticsVersion: "candidate-attestation/v1" as const,
    workUnit: SlugSchema.parse(input.workUnit),
    subjectDigest: subject.subjectDigest,
    baseRevision: GitObjectIdSchema.parse(input.baseRevision),
    attestedBy: input.attestedBy,
    attestedAt: input.attestedAt,
    verificationEvidenceRef: input.verificationEvidenceRef,
  };
  return CandidateAttestationV1Schema.parse({
    ...fields,
    candidateId: canonicalDigest({ domain: "arc.candidate.attestation/v1", ...fields }),
  });
}

export interface CreateCandidateReviewResponseEvidenceInput {
  candidateId: string;
  oldTarget: z.input<typeof CandidateLineageTargetSchema>;
  newTarget: z.input<typeof CandidateLineageTargetSchema>;
  dispositionId: string;
  approvedBy: string;
  appliedBy: string;
  applicability: CandidateVerificationApplicability;
  verificationEvidenceRefs: readonly string[];
  implementationChanged: boolean;
}

/**
 * Bind one approved review response and its primary-owned verification applicability to a Candidate lineage.
 *
 * @param input - Exact old/new targets, approval identity, applying actor, and verification evidence.
 * @returns A digest-identified response-evidence record.
 */
export function createCandidateReviewResponseEvidence(
  input: CreateCandidateReviewResponseEvidenceInput,
): CandidateReviewResponseEvidenceV1 {
  const fields = {
    schemaVersion: 1 as const,
    semanticsVersion: "candidate-attestation/v1" as const,
    candidateId: input.candidateId,
    oldTarget: CandidateLineageTargetSchema.parse(input.oldTarget),
    newTarget: CandidateLineageTargetSchema.parse(input.newTarget),
    dispositionId: input.dispositionId,
    approvedBy: input.approvedBy,
    appliedBy: input.appliedBy,
    applicability: input.applicability,
    verificationEvidenceRefs: [...input.verificationEvidenceRefs],
    implementationChanged: input.implementationChanged,
  };
  return CandidateReviewResponseEvidenceV1Schema.parse({
    ...fields,
    responseId: canonicalDigest({ domain: "arc.candidate.review-response/v1", ...fields }),
  });
}

export type CandidateCurrentnessProjection =
  | {
      status: "current";
      candidateId: string;
      recognizedRevision: string;
      implementationChanged: boolean;
      convergenceVerification: "satisfied" | "pending";
    }
  | {
      status: "blocked";
      candidateId: string;
      recognizedRevision: string;
      currentRevision: string;
      delta: { added: string[]; removed: string[]; changed: string[] };
      nextAction: "Run full work-unit verification to establish a new Candidate lineage root.";
    };

/**
 * Reduce approved response evidence to the recognized Candidate head and compare it with current content.
 *
 * @param input - The managed Candidate record and current repository subject.
 * @returns A current projection or a fail-closed unexplained-delta result.
 */
export function projectCandidateCurrentness(input: {
  record: CandidateManagedRecordV1;
  current: z.input<typeof CandidateLineageTargetSchema>;
}): CandidateCurrentnessProjection {
  const record = CandidateManagedRecordV1Schema.parse(input.record);
  const current = CandidateLineageTargetSchema.parse(input.current);
  let revision = record.attestation.baseRevision;
  let subject = record.subject;
  let implementationChanged = false;
  for (const response of record.responses) {
    if (response.oldTarget.revision !== revision
      || response.oldTarget.subject.subjectDigest !== subject.subjectDigest) {
      return blockedProjection(record.attestation.candidateId, revision, current, subject);
    }
    revision = response.newTarget.revision;
    subject = response.newTarget.subject;
    implementationChanged ||= response.implementationChanged;
  }
  if (current.subject.subjectDigest !== subject.subjectDigest) {
    return blockedProjection(record.attestation.candidateId, revision, current, subject);
  }
  const operationalOnlyAdvance = current.revision !== revision;
  return {
    status: "current",
    candidateId: record.attestation.candidateId,
    recognizedRevision: operationalOnlyAdvance ? current.revision : revision,
    implementationChanged,
    convergenceVerification: implementationChanged ? "pending" : "satisfied",
  };
}

function blockedProjection(
  candidateId: string,
  recognizedRevision: string,
  current: z.infer<typeof CandidateLineageTargetSchema>,
  recognized: CandidateSubjectSnapshot,
): Extract<CandidateCurrentnessProjection, { status: "blocked" }> {
  const prior = new Map(
    recognized.entries.filter(({ treatment }) => treatment === "reviewable").map((entry) => [entry.path, entry.digest]),
  );
  const next = new Map(
    current.subject.entries.filter(({ treatment }) => treatment === "reviewable").map((entry) => [entry.path, entry.digest]),
  );
  return {
    status: "blocked",
    candidateId,
    recognizedRevision,
    currentRevision: current.revision,
    delta: {
      added: [...next.keys()].filter((path) => !prior.has(path)).sort(),
      removed: [...prior.keys()].filter((path) => !next.has(path)).sort(),
      changed: [...next.keys()].filter((path) => prior.has(path) && prior.get(path) !== next.get(path)).sort(),
    },
    nextAction: "Run full work-unit verification to establish a new Candidate lineage root.",
  };
}
