/** Typed Candidate attestation, review-response lineage, and currentness projection. */

import { z } from "zod";

import {
  canonicalize,
  canonicalDigest,
  sortByCanonicalBytes,
} from "../canonical/canonical-json.js";
import { SlugSchema } from "../kernel/schema/slug.js";

const CandidateSemanticsSchema = z.literal("candidate-attestation/v1");
const CandidateCanonicalDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const CandidateGitObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
const CandidatePathSchema = z.string().min(1).refine(
  (value) => !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes(".."),
  "must be a repository-relative POSIX path",
);
const CandidateSubjectTreatmentSchema = z.enum(["reviewable", "operational", "candidate-projection"]);
const CandidateTreeEntryModeSchema = z.union([
  z.string().regex(/^[0-7]{6}$/u),
  z.literal("absent"),
]);
const CandidateSubjectEntrySchema = z.strictObject({
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

export const CandidateAttestationV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: CandidateSemanticsSchema,
  candidateId: CandidateCanonicalDigestSchema,
  workUnit: SlugSchema,
  subjectDigest: CandidateCanonicalDigestSchema,
  baseRevision: CandidateGitObjectIdSchema,
  attestedBy: z.string().trim().min(1),
  attestedAt: z.iso.datetime(),
  verificationEvidenceRef: z.string().trim().min(1),
  /** The Candidate this root replaces, present only on a re-rooted lineage. */
  supersedes: CandidateCanonicalDigestSchema.optional(),
});
export type CandidateAttestationV1 = z.infer<typeof CandidateAttestationV1Schema>;

export const CandidateLineageTargetSchema = z.strictObject({
  revision: CandidateGitObjectIdSchema,
  subject: CandidateSubjectSnapshotSchema,
});
export type CandidateLineageTarget = z.infer<typeof CandidateLineageTargetSchema>;
export const CandidateVerificationApplicabilitySchema = z.enum(["targeted", "focused", "full"]);
export type CandidateVerificationApplicability = z.infer<typeof CandidateVerificationApplicabilitySchema>;

export const CandidateReviewResponseEvidenceV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: CandidateSemanticsSchema,
  candidateId: CandidateCanonicalDigestSchema,
  responseId: CandidateCanonicalDigestSchema,
  oldTarget: CandidateLineageTargetSchema,
  newTarget: CandidateLineageTargetSchema,
  dispositionId: CandidateCanonicalDigestSchema,
  approvedBy: z.string().trim().min(1),
  appliedBy: z.string().trim().min(1),
  applicability: CandidateVerificationApplicabilitySchema,
  verificationEvidenceRefs: z.array(z.string().trim().min(1)).min(1),
  implementationChanged: z.boolean(),
});
export type CandidateReviewResponseEvidenceV1 = z.infer<typeof CandidateReviewResponseEvidenceV1Schema>;

export const CandidateLineageAttestationV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: CandidateSemanticsSchema,
  candidateId: CandidateCanonicalDigestSchema,
  target: CandidateLineageTargetSchema,
  attestedBy: z.string().trim().min(1),
  attestedAt: z.iso.datetime(),
  verificationEvidenceRef: z.string().trim().min(1),
});
export type CandidateLineageAttestationV1 = z.infer<typeof CandidateLineageAttestationV1Schema>;

export const CandidateManagedRecordV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: CandidateSemanticsSchema,
  attestation: CandidateAttestationV1Schema,
  subject: CandidateSubjectSnapshotSchema,
  responses: z.array(CandidateReviewResponseEvidenceV1Schema),
  lineageAttestations: z.array(CandidateLineageAttestationV1Schema),
}).superRefine((record, context) => {
  const validateSubject = (subject: CandidateSubjectSnapshot, path: (string | number)[]) => {
    const subjectPaths = subject.entries.map(({ path: entryPath }) => entryPath);
    if (new Set(subjectPaths).size !== subjectPaths.length) {
      context.addIssue({ code: "custom", path: [...path, "entries"], message: "paths must be unique" });
      return;
    }
    const recomputedSubject = createCandidateSubjectSnapshot(subject.entries);
    if (recomputedSubject.subjectDigest !== subject.subjectDigest) {
      context.addIssue({
        code: "custom",
        path: [...path, "subjectDigest"],
        message: "must match the canonical reviewable entries",
      });
    }
  };
  validateSubject(record.subject, ["subject"]);
  if (record.attestation.subjectDigest !== record.subject.subjectDigest) {
    context.addIssue({ code: "custom", path: ["subject", "subjectDigest"], message: "must match the attestation" });
  }
  const { candidateId, ...attestationFields } = record.attestation;
  if (candidateId !== canonicalDigest({ domain: "arc.candidate.attestation/v1", ...attestationFields })) {
    context.addIssue({
      code: "custom",
      path: ["attestation", "candidateId"],
      message: "must match the canonical attestation payload",
    });
  }
  let priorTarget: CandidateLineageTarget = {
    revision: record.attestation.baseRevision,
    subject: record.subject,
  };
  const recognizedSubjects = new Set([record.subject.subjectDigest]);
  for (const [index, response] of record.responses.entries()) {
    validateSubject(response.oldTarget.subject, ["responses", index, "oldTarget", "subject"]);
    validateSubject(response.newTarget.subject, ["responses", index, "newTarget", "subject"]);
    if (response.candidateId !== record.attestation.candidateId) {
      context.addIssue({ code: "custom", path: ["responses", index, "candidateId"], message: "must match the attestation" });
    }
    const { responseId, ...responseFields } = response;
    if (responseId !== canonicalDigest({ domain: "arc.candidate.review-response/v1", ...responseFields })) {
      context.addIssue({
        code: "custom",
        path: ["responses", index, "responseId"],
        message: "must match the canonical response payload",
      });
    }
    // Operational-only revisions are intentionally absent from the reviewable
    // lineage. A response may therefore start from a later revision than the
    // preceding record, but it must start from the exact recognized subject.
    if (response.oldTarget.subject.subjectDigest !== priorTarget.subject.subjectDigest) {
      context.addIssue({
        code: "custom",
        path: ["responses", index, "oldTarget"],
        message: "must continue the preceding Candidate lineage subject",
      });
    }
    const changed = candidateSubjectsDiffer(response.oldTarget.subject, response.newTarget.subject);
    if (response.implementationChanged !== changed) {
      context.addIssue({
        code: "custom",
        path: ["responses", index, "implementationChanged"],
        message: "must match the canonical reviewable-subject delta",
      });
    }
    priorTarget = response.newTarget;
    recognizedSubjects.add(response.newTarget.subject.subjectDigest);
  }
  for (const [index, attestation] of record.lineageAttestations.entries()) {
    validateSubject(attestation.target.subject, ["lineageAttestations", index, "target", "subject"]);
    if (attestation.candidateId !== record.attestation.candidateId) {
      context.addIssue({
        code: "custom",
        path: ["lineageAttestations", index, "candidateId"],
        message: "must match the root attestation",
      });
    }
    if (!recognizedSubjects.has(attestation.target.subject.subjectDigest)) {
      context.addIssue({
        code: "custom",
        path: ["lineageAttestations", index, "target", "subject"],
        message: "must attest a recognized Candidate lineage subject",
      });
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
  mode: string;
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
    .map(({ path, digest, mode }) => ({ path, digest, mode }));
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
  /** The Candidate this root replaces, supplied only when re-rooting a blocked lineage. */
  supersedes?: string;
}

/**
 * Create one deterministic Candidate lineage root from full-verification evidence.
 *
 * @param input - Work-unit identity, normalized subject, revision, actor, time, evidence reference, and
 *   any superseded Candidate this root replaces.
 * @returns The strict Candidate attestation.
 */
export function createCandidateAttestation(input: CreateCandidateAttestationInput): CandidateAttestationV1 {
  const subject = CandidateSubjectSnapshotSchema.parse(input.subject);
  const fields = {
    schemaVersion: 1 as const,
    semanticsVersion: "candidate-attestation/v1" as const,
    workUnit: SlugSchema.parse(input.workUnit),
    subjectDigest: subject.subjectDigest,
    baseRevision: CandidateGitObjectIdSchema.parse(input.baseRevision),
    attestedBy: input.attestedBy,
    attestedAt: input.attestedAt,
    verificationEvidenceRef: input.verificationEvidenceRef,
    // Omitted rather than undefined: the digest input is canonical plain data, which has no undefined.
    ...(input.supersedes === undefined
      ? {}
      : { supersedes: CandidateCanonicalDigestSchema.parse(input.supersedes) }),
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

export interface CreateCandidateLineageAttestationInput {
  candidateId: string;
  target: z.input<typeof CandidateLineageTargetSchema>;
  attestedBy: string;
  attestedAt: string;
  verificationEvidenceRef: string;
}

/** Record full verification over one recognized Candidate lineage head. */
export function createCandidateLineageAttestation(
  input: CreateCandidateLineageAttestationInput,
): CandidateLineageAttestationV1 {
  return CandidateLineageAttestationV1Schema.parse({
    schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1",
    candidateId: input.candidateId,
    target: input.target,
    attestedBy: input.attestedBy,
    attestedAt: input.attestedAt,
    verificationEvidenceRef: input.verificationEvidenceRef,
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
    if (response.oldTarget.subject.subjectDigest !== subject.subjectDigest) {
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
  // Convergence is a claim about content: a lineage attestation records that full verification ran
  // over one exact reviewable subject. Keying it to the subject alone is what lets it survive the
  // head movement `recognizedRevision` already absorbs — an attestation written at the recognized
  // head could never equal the response revision it was confirming, and pinning either revision
  // would break again at the next operational-only advance. The revision stays recorded as
  // provenance for which head carried the verification.
  const convergenceSatisfied = !implementationChanged || record.lineageAttestations.some((attestation) =>
    attestation.target.subject.subjectDigest === subject.subjectDigest);
  return {
    status: "current",
    candidateId: record.attestation.candidateId,
    recognizedRevision: operationalOnlyAdvance ? current.revision : revision,
    implementationChanged,
    convergenceVerification: convergenceSatisfied ? "satisfied" : "pending",
  };
}

function blockedProjection(
  candidateId: string,
  recognizedRevision: string,
  current: z.infer<typeof CandidateLineageTargetSchema>,
  recognized: CandidateSubjectSnapshot,
): Extract<CandidateCurrentnessProjection, { status: "blocked" }> {
  return {
    status: "blocked",
    candidateId,
    recognizedRevision,
    currentRevision: current.revision,
    delta: diffCandidateSubjectSnapshots(recognized, current.subject),
    nextAction: "Run full work-unit verification to establish a new Candidate lineage root.",
  };
}

export const CandidateSubjectDeltaSchema = z.strictObject({
  added: z.array(CandidatePathSchema),
  removed: z.array(CandidatePathSchema),
  changed: z.array(CandidatePathSchema),
});
export type CandidateSubjectDelta = z.infer<typeof CandidateSubjectDeltaSchema>;

/** Compute the exact reviewable path delta between two Candidate subjects. */
export function diffCandidateSubjectSnapshots(
  oldSubjectInput: z.input<typeof CandidateSubjectSnapshotSchema>,
  newSubjectInput: z.input<typeof CandidateSubjectSnapshotSchema>,
): CandidateSubjectDelta {
  const oldSubject = CandidateSubjectSnapshotSchema.parse(oldSubjectInput);
  const newSubject = CandidateSubjectSnapshotSchema.parse(newSubjectInput);
  const prior = new Map(
    oldSubject.entries
      .filter(({ treatment }) => treatment === "reviewable")
      .map((entry) => [entry.path, `${entry.mode}\0${entry.digest}`]),
  );
  const next = new Map(
    newSubject.entries
      .filter(({ treatment }) => treatment === "reviewable")
      .map((entry) => [entry.path, `${entry.mode}\0${entry.digest}`]),
  );
  return CandidateSubjectDeltaSchema.parse({
    added: [...next.keys()].filter((path) => !prior.has(path)).sort(),
    removed: [...prior.keys()].filter((path) => !next.has(path)).sort(),
    changed: [...next.keys()].filter((path) => prior.has(path) && prior.get(path) !== next.get(path)).sort(),
  });
}

function candidateSubjectsDiffer(
  left: CandidateSubjectSnapshot,
  right: CandidateSubjectSnapshot,
): boolean {
  const delta = diffCandidateSubjectSnapshots(left, right);
  return delta.added.length > 0 || delta.removed.length > 0 || delta.changed.length > 0;
}
