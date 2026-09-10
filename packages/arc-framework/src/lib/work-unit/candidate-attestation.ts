/** Typed Candidate attestation, review-response lineage, and currentness projection. */

import { z } from "zod";

import {
  canonicalize,
  canonicalDigest,
  sortByCanonicalBytes,
} from "../canonical/canonical-json.js";
import { PathTreatmentSchema } from "../evidence-applicability/path-treatment.js";
import { SlugSchema } from "../kernel/schema/slug.js";
import { ReviewContributionApplicabilitySelectorSchema } from "./review-applicability-selector.js";

const CandidateSemanticsSchema = z.literal("candidate-attestation/v1");
const CandidateCanonicalDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const CandidateGitObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
const CandidatePathSchema = z.string().min(1)
  .refine(
    (value) => !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes(".."),
    "must be a repository-relative POSIX path",
  )
  .refine((value) => value.normalize("NFC") === value, "must use NFC-normalized repository path bytes");
const CandidateSubjectTreatmentSchema = PathTreatmentSchema;
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
  transitionKind: z.literal("review-response"),
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
  approvedVerification: CandidateVerificationApplicabilitySchema.optional(),
  verificationEvidenceRefs: z.array(z.string().trim().min(1)).min(1),
  implementationChanged: z.boolean(),
});
export type CandidateReviewResponseEvidenceV1 = z.infer<typeof CandidateReviewResponseEvidenceV1Schema>;

export const CandidateVerificationResponseEvidenceV1Schema = z.strictObject({
  transitionKind: z.literal("verification-response"),
  schemaVersion: z.literal(1),
  semanticsVersion: CandidateSemanticsSchema,
  candidateId: CandidateCanonicalDigestSchema,
  verificationId: CandidateCanonicalDigestSchema,
  oldTarget: CandidateLineageTargetSchema,
  newTarget: CandidateLineageTargetSchema,
  authorityRef: CandidateCanonicalDigestSchema,
  verifiedBy: z.string().trim().min(1),
  verifiedAt: z.iso.datetime(),
  applicability: CandidateVerificationApplicabilitySchema,
  verificationEvidenceRefs: z.array(z.string().trim().min(1)).min(1),
  implementationChanged: z.boolean(),
});
export type CandidateVerificationResponseEvidenceV1 = z.infer<
  typeof CandidateVerificationResponseEvidenceV1Schema
>;

const CandidateApplicabilitySelectionCommon = {
  transitionKind: z.literal("applicability-selection"),
  schemaVersion: z.literal(1),
  semanticsVersion: CandidateSemanticsSchema,
  candidateId: CandidateCanonicalDigestSchema,
  priorTarget: CandidateLineageTargetSchema,
  currentTarget: CandidateLineageTargetSchema,
  projectionDigest: CandidateCanonicalDigestSchema,
  residualDigest: CandidateCanonicalDigestSchema,
  selectedBy: z.string().trim().min(1),
};
export const CandidateApplicabilitySelectionV1Schema = z.discriminatedUnion("choice", [
  z.strictObject({
    ...CandidateApplicabilitySelectionCommon,
    choice: z.literal("covered"),
  }),
  z.strictObject({
    ...CandidateApplicabilitySelectionCommon,
    choice: z.literal("targeted-check"),
    targetedEvidenceRef: z.string().trim().min(1),
  }),
  z.strictObject({
    ...CandidateApplicabilitySelectionCommon,
    choice: z.literal("changed"),
  }),
]);
export type CandidateApplicabilitySelectionV1 = z.infer<typeof CandidateApplicabilitySelectionV1Schema>;

export const CandidateReviewApplicabilitySelectionV1Schema = z.strictObject({
  transitionKind: z.literal("review-applicability-selection"),
  schemaVersion: z.literal(1),
  semanticsVersion: CandidateSemanticsSchema,
  candidateId: CandidateCanonicalDigestSchema,
  selector: ReviewContributionApplicabilitySelectorSchema,
  projectionDigest: CandidateCanonicalDigestSchema,
  residualDigest: CandidateCanonicalDigestSchema,
  selectedBy: z.string().trim().min(1),
  selectedAt: z.iso.datetime({ offset: true }),
  choice: z.enum(["covered", "review-required"]),
});
export type CandidateReviewApplicabilitySelectionV1 = z.infer<
  typeof CandidateReviewApplicabilitySelectionV1Schema
>;

export const CandidateLineageTransitionV1Schema = z.discriminatedUnion("transitionKind", [
  CandidateReviewResponseEvidenceV1Schema,
  CandidateVerificationResponseEvidenceV1Schema,
  CandidateApplicabilitySelectionV1Schema,
  CandidateReviewApplicabilitySelectionV1Schema,
]);
export type CandidateLineageTransitionV1 = z.infer<typeof CandidateLineageTransitionV1Schema>;

/** Select the approved review-response arm from an ordered Candidate transition sequence. */
export function candidateReviewResponses(
  record: Pick<CandidateManagedRecordV1, "transitions">,
): CandidateReviewResponseEvidenceV1[] {
  return record.transitions.filter((transition): transition is CandidateReviewResponseEvidenceV1 =>
    transition.transitionKind === "review-response");
}

/** Select target-neutral review-applicability authority from an ordered Candidate sequence. */
export function candidateReviewApplicabilitySelections(
  record: Pick<CandidateManagedRecordV1, "transitions">,
): CandidateReviewApplicabilitySelectionV1[] {
  return record.transitions.filter((transition): transition is CandidateReviewApplicabilitySelectionV1 =>
    transition.transitionKind === "review-applicability-selection");
}

export const CandidateLineageAttestationV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: CandidateSemanticsSchema,
  candidateId: CandidateCanonicalDigestSchema,
  target: CandidateLineageTargetSchema,
  attestedBy: z.string().trim().min(1),
  attestedAt: z.iso.datetime(),
  verificationEvidenceRef: z.string().trim().min(1),
  scope: z.enum(["focused", "full"]),
});
export type CandidateLineageAttestationV1 = z.infer<typeof CandidateLineageAttestationV1Schema>;

export const CandidateManagedRecordV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: CandidateSemanticsSchema,
  attestation: CandidateAttestationV1Schema,
  subject: CandidateSubjectSnapshotSchema,
  transitions: z.array(CandidateLineageTransitionV1Schema),
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
  const reviewApplicabilityKeys = new Set<string>();
  for (const [index, transition] of record.transitions.entries()) {
    if (transition.candidateId !== record.attestation.candidateId) {
      context.addIssue({
        code: "custom",
        path: ["transitions", index, "candidateId"],
        message: "must match the attestation",
      });
    }
    if (transition.transitionKind === "review-response" || transition.transitionKind === "verification-response") {
      validateSubject(transition.oldTarget.subject, ["transitions", index, "oldTarget", "subject"]);
      validateSubject(transition.newTarget.subject, ["transitions", index, "newTarget", "subject"]);
      const responseDigestMatches = (() => {
        if (transition.transitionKind === "review-response") {
          const { responseId, ...fields } = transition;
          return responseId === canonicalDigest({ domain: "arc.candidate.review-response/v1", ...fields });
        }
        const { verificationId, ...fields } = transition;
        return verificationId === canonicalDigest({
          domain: "arc.candidate.verification-response/v1",
          ...fields,
        });
      })();
      if (!responseDigestMatches) {
        context.addIssue({
          code: "custom",
          path: [
            "transitions",
            index,
            transition.transitionKind === "review-response" ? "responseId" : "verificationId",
          ],
          message: "must match the canonical response payload",
        });
      }
      if (transition.transitionKind === "verification-response"
        && !candidateTargetsEqual(transition.oldTarget, priorTarget)) {
        context.addIssue({
          code: "custom",
          path: ["transitions", index, "oldTarget"],
          message: "must continue the durable Candidate target",
        });
      }
      const changed = candidateSubjectsDiffer(transition.oldTarget.subject, transition.newTarget.subject);
      if (transition.implementationChanged !== changed) {
        context.addIssue({
          code: "custom",
          path: ["transitions", index, "implementationChanged"],
          message: "must match the canonical reviewable-subject delta",
        });
      }
      // The response write verifies its exact old target against the effective
      // Candidate projection. Once approved, that evidence is authoritative for
      // re-anchoring after an intentionally ephemeral machine carry.
      priorTarget = transition.newTarget;
      recognizedSubjects.add(transition.oldTarget.subject.subjectDigest);
      recognizedSubjects.add(transition.newTarget.subject.subjectDigest);
      continue;
    }
    if (transition.transitionKind === "review-applicability-selection") {
      const authorityKey = canonicalize({
        candidateId: transition.candidateId,
        selector: transition.selector,
        projectionDigest: transition.projectionDigest,
        residualDigest: transition.residualDigest,
      });
      if (reviewApplicabilityKeys.has(authorityKey)) {
        context.addIssue({
          code: "custom",
          path: ["transitions", index],
          message: "duplicates an exact review-applicability authority binding",
        });
      }
      reviewApplicabilityKeys.add(authorityKey);
      continue;
    }
    validateSubject(transition.priorTarget.subject, ["transitions", index, "priorTarget", "subject"]);
    validateSubject(transition.currentTarget.subject, ["transitions", index, "currentTarget", "subject"]);
    if (!candidateTargetsEqual(transition.priorTarget, priorTarget)) {
      context.addIssue({
        code: "custom",
        path: ["transitions", index, "priorTarget"],
        message: "must continue the durable Candidate target",
      });
    }
    if (transition.choice !== "changed") {
      priorTarget = transition.currentTarget;
      recognizedSubjects.add(transition.currentTarget.subject.subjectDigest);
    }
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
    const requiredScope = requiredConvergenceScopeAtSubject(
      record.transitions,
      attestation.target.subject.subjectDigest,
    );
    if (requiredScope !== null && !candidateConvergenceScopeCovers(attestation.scope, requiredScope)) {
      context.addIssue({
        code: "custom",
        path: ["lineageAttestations", index, "scope"],
        message: `must satisfy the ${requiredScope} convergence requirement at the attested subject`,
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
 * Canonicalize one Candidate subject while excluding evidence-neutral projections from its digest.
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
  approvedVerification?: CandidateVerificationApplicability;
  verificationEvidenceRefs: readonly string[];
  implementationChanged: boolean;
}

export interface CreateCandidateVerificationResponseEvidenceInput {
  candidateId: string;
  oldTarget: z.input<typeof CandidateLineageTargetSchema>;
  newTarget: z.input<typeof CandidateLineageTargetSchema>;
  authorityRef: string;
  verifiedBy: string;
  verifiedAt: string;
  applicability: CandidateVerificationApplicability;
  verificationEvidenceRefs: readonly string[];
  implementationChanged: boolean;
}

/** Bind one typed scoped-verification continuation to an exact Candidate delta. */
export function createCandidateVerificationResponseEvidence(
  input: CreateCandidateVerificationResponseEvidenceInput,
): CandidateVerificationResponseEvidenceV1 {
  const fields = {
    transitionKind: "verification-response" as const,
    schemaVersion: 1 as const,
    semanticsVersion: "candidate-attestation/v1" as const,
    candidateId: input.candidateId,
    oldTarget: CandidateLineageTargetSchema.parse(input.oldTarget),
    newTarget: CandidateLineageTargetSchema.parse(input.newTarget),
    authorityRef: CandidateCanonicalDigestSchema.parse(input.authorityRef),
    verifiedBy: input.verifiedBy,
    verifiedAt: input.verifiedAt,
    applicability: input.applicability,
    verificationEvidenceRefs: [...input.verificationEvidenceRefs],
    implementationChanged: input.implementationChanged,
  };
  return CandidateVerificationResponseEvidenceV1Schema.parse({
    ...fields,
    verificationId: canonicalDigest({ domain: "arc.candidate.verification-response/v1", ...fields }),
  });
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
    transitionKind: "review-response" as const,
    schemaVersion: 1 as const,
    semanticsVersion: "candidate-attestation/v1" as const,
    candidateId: input.candidateId,
    oldTarget: CandidateLineageTargetSchema.parse(input.oldTarget),
    newTarget: CandidateLineageTargetSchema.parse(input.newTarget),
    dispositionId: input.dispositionId,
    approvedBy: input.approvedBy,
    appliedBy: input.appliedBy,
    applicability: input.applicability,
    ...(input.approvedVerification === undefined
      ? {}
      : { approvedVerification: CandidateVerificationApplicabilitySchema.parse(input.approvedVerification) }),
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
  scope: "focused" | "full";
}

/** Record scoped convergence verification over one recognized Candidate lineage head. */
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
    scope: input.scope,
  });
}

/** Decide whether supplied convergence evidence is at least as broad as the required scope. */
export function candidateConvergenceScopeCovers(
  supplied: "focused" | "full",
  required: "focused" | "full",
): boolean {
  return supplied === "full" || required === "focused";
}

function requiredConvergenceScopeAtSubject(
  transitions: readonly CandidateLineageTransitionV1[],
  subjectDigest: string,
): "focused" | "full" | null {
  let required: "focused" | "full" | null = null;
  let result: "focused" | "full" | null = null;
  for (const transition of transitions) {
    if (transition.transitionKind === "verification-response") {
      required = null;
    } else if (transition.transitionKind === "review-response" && transition.implementationChanged) {
      const approved = transition.approvedVerification ?? "full";
      if (approved === "full" || (approved === "focused" && required === null)) required = approved;
    }
    if ((transition.transitionKind === "review-response" || transition.transitionKind === "verification-response")
      && transition.newTarget.subject.subjectDigest === subjectDigest) {
      if (required === "full" || (required === "focused" && result === null)) result = required;
    }
  }
  return result;
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

export interface CandidateDurableBaselineProjection {
  candidateId: string;
  target: CandidateLineageTarget;
  implementationChanged: boolean;
  verificationCompleted: boolean;
  selectedChange: CandidateApplicabilitySelectionV1 | null;
}

/** Reduce the storage-neutral Candidate root and ordered authority transitions to one durable baseline. */
export function reduceCandidateDurableBaseline(
  input: CandidateManagedRecordV1,
): CandidateDurableBaselineProjection {
  const record = CandidateManagedRecordV1Schema.parse(input);
  let target: CandidateLineageTarget = {
    revision: record.attestation.baseRevision,
    subject: record.subject,
  };
  let implementationChanged = false;
  let verificationCompleted = true;
  let selectedChange: CandidateApplicabilitySelectionV1 | null = null;
  for (const transition of record.transitions) {
    if (transition.transitionKind === "review-response") {
      target = transition.newTarget;
      implementationChanged ||= transition.implementationChanged;
      if (transition.implementationChanged) verificationCompleted = false;
      selectedChange = null;
      continue;
    }
    if (transition.transitionKind === "verification-response") {
      target = transition.newTarget;
      implementationChanged ||= transition.implementationChanged;
      verificationCompleted = true;
      selectedChange = null;
      continue;
    }
    if (transition.transitionKind === "review-applicability-selection") continue;
    if (!candidateTargetsEqual(transition.priorTarget, target)) {
      throw new Error("Candidate applicability selection does not continue the durable target");
    }
    if (transition.choice === "changed") {
      selectedChange = transition;
      continue;
    }
    target = transition.currentTarget;
    selectedChange = null;
  }
  return {
    candidateId: record.attestation.candidateId,
    target,
    implementationChanged,
    verificationCompleted,
    selectedChange,
  };
}

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
  const baseline = reduceCandidateDurableBaseline(record);
  const { revision, subject } = baseline.target;
  const { implementationChanged } = baseline;
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
  const convergenceSatisfied = baseline.verificationCompleted || record.lineageAttestations.some((attestation) =>
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

function candidateTargetsEqual(left: CandidateLineageTarget, right: CandidateLineageTarget): boolean {
  return left.revision === right.revision
    && left.subject.subjectDigest === right.subject.subjectDigest;
}
