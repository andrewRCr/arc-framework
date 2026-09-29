/** Typed Candidate attestation, review-response lineage, and currentness projection. */

import { z } from "zod";

import {
  canonicalize,
  canonicalDigest,
  sortByCanonicalBytes,
  type CanonicalDigest,
} from "../kernel/canonical/canonical-json.js";
import { composeEvidenceDelta, reduceEvidenceApplicability } from "../evidence-applicability/index.js";
import { SlugSchema } from "../kernel/schema/slug.js";
import { ReviewContributionApplicabilitySelectorSchema } from "./review-applicability-selector.js";
import {
  CandidateCanonicalDigestSchema,
  CandidateGitObjectIdSchema,
  CandidateLineageTargetSchema,
  CandidateSubjectDeltaSchema,
  CandidateSubjectEntrySchema,
  CandidateSubjectSnapshotSchema,
  CandidateSubjectTreatmentSchema,
  CandidateVerificationApplicabilitySchema,
  type CandidateLineageTarget,
  type CandidateSubjectDelta,
  type CandidateSubjectSnapshot,
  type CandidateVerificationApplicability,
} from "./candidate-evidence.js";

export {
  CandidateLineageTargetSchema,
  CandidateSubjectDeltaSchema,
  CandidateSubjectSnapshotSchema,
  CandidateVerificationApplicabilitySchema,
};
export type {
  CandidateLineageTarget,
  CandidateSubjectDelta,
  CandidateSubjectSnapshot,
  CandidateVerificationApplicability,
};

const CandidateSemanticsSchema = z.literal("candidate-attestation/v1");

/** Reserved action placeholder that must be replaced before evidence enters a Candidate record. */
export const CANDIDATE_VERIFICATION_EVIDENCE_PLACEHOLDER = "{verificationEvidenceRef}" as const;

/** Fresh verification evidence reference accepted by Candidate attestation boundaries. */
export const CandidateVerificationEvidenceRefSchema = z.string().trim().min(1).refine(
  (value) => value !== CANDIDATE_VERIFICATION_EVIDENCE_PLACEHOLDER,
  "verification evidence placeholder must be replaced with a fresh evidence reference",
);

export const CandidateAttestationV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: CandidateSemanticsSchema,
  candidateId: CandidateCanonicalDigestSchema,
  workUnit: SlugSchema,
  subjectDigest: CandidateCanonicalDigestSchema,
  baseRevision: CandidateGitObjectIdSchema,
  attestedBy: z.string().trim().min(1),
  attestedAt: z.iso.datetime(),
  verificationEvidenceRef: CandidateVerificationEvidenceRefSchema,
  /** The Candidate this root replaces, present only on a re-rooted lineage. */
  supersedes: CandidateCanonicalDigestSchema.optional(),
});
export type CandidateAttestationV1 = z.infer<typeof CandidateAttestationV1Schema>;


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

/** A validated older root whose review budget survives an explicit Candidate re-root. */
export interface CandidateSupersessionAncestor {
  candidateId: string;
  baseRevision: string;
  /** Exact commit carrying this predecessor record, when resolved from repository history. */
  recordRevision?: string;
  reviewResponseCount: number;
  /** Disposition identities let lane owners distinguish frontline from standard responses. */
  reviewDispositionIds?: readonly string[];
}

/** Refuse a missing, cyclic, or out-of-order Candidate supersession chain. */
export class CandidateSupersessionResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CandidateSupersessionResolutionError";
  }
}

/** Follow only explicit `attestation.supersedes` links through older versions of this work unit. */
export function resolveCandidateSupersessionAncestors(
  current: CandidateManagedRecordV1,
  historicalNewestFirst: readonly CandidateManagedRecordV1[],
): readonly CandidateSupersessionAncestor[] {
  const currentId = current.attestation.candidateId;
  const currentIndex = historicalNewestFirst.findIndex((record) =>
    record.attestation.candidateId === currentId);
  let searchFrom = currentIndex < 0 ? 0 : currentIndex + 1;
  let predecessorId = current.attestation.supersedes;
  const seen = new Set([currentId]);
  const ancestors: CandidateSupersessionAncestor[] = [];
  while (predecessorId !== undefined) {
    if (seen.has(predecessorId)) {
      throw new CandidateSupersessionResolutionError("Candidate supersession contains a cycle.");
    }
    const index = historicalNewestFirst.findIndex((record, position) =>
      position >= searchFrom
      && record.attestation.candidateId === predecessorId
      && record.attestation.workUnit === current.attestation.workUnit);
    if (index < 0) {
      throw new CandidateSupersessionResolutionError(
        `Superseded Candidate ${predecessorId} is absent from reachable record history. Restore its history and retry pre-publication review.`,
      );
    }
    const predecessor = historicalNewestFirst[index];
    if (predecessor === undefined) {
      throw new CandidateSupersessionResolutionError("Superseded Candidate history changed during resolution.");
    }
    const reviewResponses = candidateReviewResponses(predecessor);
    ancestors.push({
      candidateId: predecessorId,
      baseRevision: predecessor.attestation.baseRevision,
      reviewResponseCount: reviewResponses.length,
      ...(reviewResponses.length === 0
        ? {}
        : { reviewDispositionIds: reviewResponses.map((response) => response.dispositionId) }),
    });
    seen.add(predecessorId);
    predecessorId = predecessor.attestation.supersedes;
    searchFrom = index + 1;
  }
  return ancestors;
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
  /** Exact review-response occurrence whose pending convergence this evidence satisfies. */
  responseId: CandidateCanonicalDigestSchema,
  target: CandidateLineageTargetSchema,
  attestedBy: z.string().trim().min(1),
  attestedAt: z.iso.datetime(),
  verificationEvidenceRef: CandidateVerificationEvidenceRefSchema,
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
  const usedVerificationEvidenceRefs = new Set([record.attestation.verificationEvidenceRef]);
  for (const [index, transition] of record.transitions.entries()) {
    if (transition.candidateId !== record.attestation.candidateId) {
      context.addIssue({
        code: "custom",
        path: ["transitions", index, "candidateId"],
        message: "must match the attestation",
      });
    }
    if (transition.transitionKind === "review-response" || transition.transitionKind === "verification-response") {
      for (const evidenceRef of transition.verificationEvidenceRefs) {
        usedVerificationEvidenceRefs.add(evidenceRef);
      }
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
    if (usedVerificationEvidenceRefs.has(attestation.verificationEvidenceRef)) {
      context.addIssue({
        code: "custom",
        path: ["lineageAttestations", index, "verificationEvidenceRef"],
        message: "must be fresh within the managed Candidate record",
      });
    }
    usedVerificationEvidenceRefs.add(attestation.verificationEvidenceRef);
    const requiredScope = requiredConvergenceScopeAtResponse(
      record.transitions,
      record.lineageAttestations.filter((_other, otherIndex) => otherIndex !== index),
      {
        revision: record.attestation.baseRevision,
        subject: record.subject,
      },
      attestation.responseId,
      attestation.target.subject.subjectDigest,
    );
    if (requiredScope === null) {
      context.addIssue({
        code: "custom",
        path: ["lineageAttestations", index, "responseId"],
        message: "must identify the exact pending review-response occurrence",
      });
    } else if (!candidateConvergenceScopeCovers(attestation.scope, requiredScope)) {
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
  responseId: string;
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
    responseId: input.responseId,
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

export const CandidateConvergenceProjectionSchema = z.union([
  z.strictObject({
    convergenceVerification: z.literal("satisfied"),
    convergenceScope: z.null(),
  }),
  z.strictObject({
    convergenceVerification: z.literal("pending"),
    convergenceScope: z.enum(["focused", "full"]),
  }),
]);
export type CandidateConvergenceProjection = z.infer<typeof CandidateConvergenceProjectionSchema>;

const SATISFIED_CONVERGENCE = {
  convergenceVerification: "satisfied",
  convergenceScope: null,
} as const satisfies CandidateConvergenceProjection;

type CandidateConvergenceReduction =
  | (Extract<CandidateConvergenceProjection, { convergenceVerification: "satisfied" }> & {
      pendingResponseId: null;
    })
  | (Extract<CandidateConvergenceProjection, { convergenceVerification: "pending" }> & {
      pendingResponseId: string;
    });

const SATISFIED_CONVERGENCE_REDUCTION = {
  ...SATISFIED_CONVERGENCE,
  pendingResponseId: null,
} as const satisfies CandidateConvergenceReduction;

function reduceReviewResponseConvergence(
  current: CandidateConvergenceReduction,
  transition: CandidateReviewResponseEvidenceV1,
): CandidateConvergenceReduction {
  const result = reduceEvidenceApplicability(composeEvidenceDelta({
    cause: "approved-fix",
    response: {
      candidateId: transition.candidateId,
      dispositionId: transition.dispositionId,
      oldTarget: transition.oldTarget,
      newTarget: transition.newTarget,
      applicability: transition.applicability,
      ...(transition.approvedVerification === undefined
        ? {}
        : { approvedVerification: transition.approvedVerification }),
    },
    delta: diffCandidateSubjectSnapshots(transition.oldTarget.subject, transition.newTarget.subject),
  }), "verification");
  if (result.verdict === "carries") return current;
  if (result.verdict === "fresh") {
    return {
      convergenceVerification: "pending",
      convergenceScope: "full",
      pendingResponseId: transition.responseId,
    };
  }
  return {
    convergenceVerification: "pending",
    convergenceScope: current.convergenceVerification === "pending" && current.convergenceScope === "full"
      ? "full"
      : "focused",
    pendingResponseId: transition.responseId,
  };
}

function requiredConvergenceScopeAtResponse(
  transitions: readonly CandidateLineageTransitionV1[],
  otherAttestations: readonly CandidateLineageAttestationV1[],
  rootTarget: CandidateLineageTarget,
  responseId: string,
  subjectDigest: string,
): "focused" | "full" | null {
  let target = rootTarget;
  let convergence: CandidateConvergenceReduction = SATISFIED_CONVERGENCE_REDUCTION;
  for (const transition of transitions) {
    if (transition.transitionKind === "verification-response") {
      convergence = SATISFIED_CONVERGENCE_REDUCTION;
    } else if (transition.transitionKind === "review-response") {
      convergence = applyLineageAttestations(otherAttestations, target, convergence);
      convergence = reduceReviewResponseConvergence(convergence, transition);
    }
    if (transition.transitionKind === "review-response" || transition.transitionKind === "verification-response") {
      target = transition.newTarget;
    } else if (transition.transitionKind === "applicability-selection" && transition.choice !== "changed") {
      target = transition.currentTarget;
    }
    if (convergence.convergenceVerification === "pending"
      && convergence.pendingResponseId === responseId
      && target.subject.subjectDigest === subjectDigest) {
      return convergence.convergenceScope;
    }
    convergence = applyLineageAttestations(otherAttestations, target, convergence);
  }
  return null;
}

export type CandidateCurrentnessProjection =
  | ({
      status: "current";
      candidateId: CanonicalDigest;
      recognizedRevision: string;
      implementationChanged: boolean;
    } & CandidateConvergenceProjection)
  | {
      status: "blocked";
      candidateId: CanonicalDigest;
      recognizedRevision: string;
      currentRevision: string;
      delta: { added: string[]; removed: string[]; changed: string[] };
      nextAction: "Run full work-unit verification to establish a new Candidate lineage root.";
    };

export type CandidateDurableBaselineProjection = {
  candidateId: CanonicalDigest;
  target: CandidateLineageTarget;
  implementationChanged: boolean;
  selectedChange: CandidateApplicabilitySelectionV1 | null;
} & CandidateConvergenceProjection;

type CandidateDurableBaselineReduction = Omit<CandidateDurableBaselineProjection,
  "convergenceVerification" | "convergenceScope"> & CandidateConvergenceReduction;

/** Reduce the storage-neutral Candidate root and ordered authority transitions to one durable baseline. */
export function reduceCandidateDurableBaseline(
  input: CandidateManagedRecordV1,
): CandidateDurableBaselineProjection {
  const record = CandidateManagedRecordV1Schema.parse(input);
  const reduction = reduceCandidateDurableBaselineRecord(record);
  const common = {
    candidateId: reduction.candidateId,
    target: reduction.target,
    implementationChanged: reduction.implementationChanged,
    selectedChange: reduction.selectedChange,
  };
  return reduction.convergenceVerification === "satisfied"
    ? { ...common, convergenceVerification: "satisfied", convergenceScope: null }
    : {
        ...common,
        convergenceVerification: "pending",
        convergenceScope: reduction.convergenceScope,
      };
}

/** Identify the exact review-response occurrence awaiting convergence evidence. */
export function candidatePendingConvergenceResponseId(
  input: CandidateManagedRecordV1,
): string | null {
  const record = CandidateManagedRecordV1Schema.parse(input);
  return reduceCandidateDurableBaselineRecord(record).pendingResponseId;
}

function reduceCandidateDurableBaselineRecord(
  record: CandidateManagedRecordV1,
): CandidateDurableBaselineReduction {
  let target: CandidateLineageTarget = {
    revision: record.attestation.baseRevision,
    subject: record.subject,
  };
  let implementationChanged = false;
  let convergence: CandidateConvergenceReduction = SATISFIED_CONVERGENCE_REDUCTION;
  let selectedChange: CandidateApplicabilitySelectionV1 | null = null;
  for (const transition of record.transitions) {
    if (transition.transitionKind === "review-response") {
      convergence = applyLineageAttestations(record.lineageAttestations, target, convergence);
      convergence = reduceReviewResponseConvergence(convergence, transition);
      target = transition.newTarget;
      convergence = applyLineageAttestations(record.lineageAttestations, target, convergence);
      implementationChanged ||= transition.implementationChanged;
      selectedChange = null;
      continue;
    }
    if (transition.transitionKind === "verification-response") {
      target = transition.newTarget;
      implementationChanged ||= transition.implementationChanged;
      convergence = SATISFIED_CONVERGENCE_REDUCTION;
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
    convergence = applyLineageAttestations(record.lineageAttestations, target, convergence);
    selectedChange = null;
  }
  convergence = applyLineageAttestations(record.lineageAttestations, target, convergence);
  return {
    candidateId: record.attestation.candidateId,
    target,
    implementationChanged,
    selectedChange,
    ...convergence,
  };
}

function applyLineageAttestations(
  lineageAttestations: readonly CandidateLineageAttestationV1[],
  target: CandidateLineageTarget,
  convergence: CandidateConvergenceReduction,
): CandidateConvergenceReduction {
  if (convergence.convergenceVerification === "satisfied") return convergence;
  return lineageAttestations.some((attestation) =>
    attestation.responseId === convergence.pendingResponseId
      && attestation.target.subject.subjectDigest === target.subject.subjectDigest
      && candidateConvergenceScopeCovers(attestation.scope, convergence.convergenceScope))
    ? SATISFIED_CONVERGENCE_REDUCTION
    : convergence;
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
  const convergence = CandidateConvergenceProjectionSchema.parse({
    convergenceVerification: baseline.convergenceVerification,
    convergenceScope: baseline.convergenceScope,
  });
  return {
    status: "current",
    candidateId: record.attestation.candidateId,
    recognizedRevision: operationalOnlyAdvance ? current.revision : revision,
    implementationChanged,
    ...convergence,
  };
}

function blockedProjection(
  candidateId: CanonicalDigest,
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
