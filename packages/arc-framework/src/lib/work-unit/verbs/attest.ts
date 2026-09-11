/** Candidate proposal orchestration over storage-neutral repository boundaries. */

import { z } from "zod";

import {
  CandidateManagedRecordV1Schema,
  CandidateLineageTargetSchema,
  candidatePendingConvergenceResponseId,
  candidateConvergenceScopeCovers,
  createCandidateAttestation,
  createCandidateLineageAttestation,
  type CandidateManagedRecordV1,
  type CandidateLineageTarget,
} from "../candidate-attestation.js";
import {
  projectStagedCandidateCurrentness,
  type CandidateEffectiveTargetProjection,
} from "../candidate-effective-target.js";
import type { VersionedCandidateRecord } from "../candidate-record-store.js";
import { SlugSchema } from "../../kernel/schema/slug.js";
import {
  IntegrationBoundaryLocusSchema,
  type IntegrationBoundaryLocus,
} from "../../../scripts/review-gate/policy/integration-boundary-locus.js";

const ATTESTED_ORIENTATION = {
  Active: {
    currentWorkflow: "prepare-work-unit",
    nextAction: "Candidate review pending — run pre-publication review",
  },
  Integrating: {
    currentWorkflow: "integrate-work-unit",
    nextAction: "Candidate review pending — resume integration review",
  },
  Shipped: {
    currentWorkflow: "[none]",
    nextAction: "[none]",
  },
} as const;

const CandidateDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

const AttestExpectedBlockedSchema = z.strictObject({
  candidateId: CandidateDigestSchema,
  subjectDigest: CandidateDigestSchema,
});

const AttestReRootContinuationSchema = z.strictObject({
  argv: z.tuple([
    z.literal("arc"),
    z.literal("attest"),
    SlugSchema,
    z.literal("--new-root"),
    z.literal("--expected-candidate"),
    CandidateDigestSchema,
    z.literal("--expected-subject"),
    CandidateDigestSchema,
    z.literal("--json"),
  ]),
});
const AttestRefreshActionSchema = z.strictObject({
  kind: z.literal("refresh-attestation"),
  attestArgv: z.tuple([
    z.literal("arc"),
    z.literal("attest"),
    SlugSchema,
    z.literal("--json"),
  ]),
});

const AttestScopeSchema = z.enum(["focused", "full"]);
const AttestConvergenceVerificationActionSchema = z.strictObject({
  kind: z.literal("run-verification"),
  scope: AttestScopeSchema,
  verificationKind: z.enum(["focused", "tier-3"]),
  verificationEvidenceRequired: z.literal(true),
  attestArgv: z.tuple([
    z.literal("arc"),
    z.literal("attest"),
    SlugSchema,
    z.literal("--scope"),
    AttestScopeSchema,
    z.literal("--verification-evidence-ref"),
    z.literal("{verificationEvidenceRef}"),
    z.literal("--json"),
  ]),
}).superRefine((action, context) => {
  const expectedKind = action.scope === "focused" ? "focused" : "tier-3";
  if (action.verificationKind !== expectedKind) {
    context.addIssue({
      code: "custom",
      path: ["verificationKind"],
      message: "must match the required convergence scope",
    });
  }
  if (action.attestArgv[4] !== action.scope) {
    context.addIssue({
      code: "custom",
      path: ["attestArgv", 4],
      message: "must match the required convergence scope",
    });
  }
});
const AttestRootVerificationActionSchema = z.strictObject({
  kind: z.literal("run-verification"),
  scope: z.literal("full"),
  verificationKind: z.literal("tier-3"),
  verificationEvidenceRequired: z.literal(false),
  attestArgv: z.union([
    z.tuple([
      z.literal("arc"), z.literal("attest"), SlugSchema,
      z.literal("--scope"), z.literal("full"), z.literal("--json"),
    ]),
    z.tuple([
      z.literal("arc"), z.literal("attest"), SlugSchema, z.literal("--new-root"),
      z.literal("--scope"), z.literal("full"), z.literal("--json"),
    ]),
  ]),
});
const AttestVerificationActionSchema = z.discriminatedUnion("verificationEvidenceRequired", [
  AttestConvergenceVerificationActionSchema,
  AttestRootVerificationActionSchema,
]);

export const AttestResultSchema = z.union([
  z.strictObject({
    status: z.literal("attested"),
    operation: z.enum(["root", "re-root"]),
    recordPath: z.string().trim().min(1),
    metaPath: z.string().trim().min(1),
    locus: IntegrationBoundaryLocusSchema,
  }),
  z.strictObject({
    status: z.literal("attested"),
    operation: z.literal("convergence"),
    scope: AttestScopeSchema,
    verificationEvidenceRef: z.string().trim().min(1),
    recordPath: z.string().trim().min(1),
    metaPath: z.string().trim().min(1),
    locus: IntegrationBoundaryLocusSchema,
  }),
  z.strictObject({
    status: z.literal("unchanged"),
    locus: IntegrationBoundaryLocusSchema,
  }),
  z.strictObject({
    status: z.literal("blocked"),
    candidateId: CandidateDigestSchema,
    delta: z.strictObject({
      added: z.array(z.string()),
      removed: z.array(z.string()),
      changed: z.array(z.string()),
    }),
    nextAction: z.literal("establish-new-root"),
    recommendedActionText: z.string().trim().min(1),
    continuation: AttestReRootContinuationSchema,
  }),
  z.strictObject({
    status: z.literal("refused"),
    reason: z.enum([
      "re-root-candidate-mismatch",
      "re-root-subject-mismatch",
      "re-root-no-longer-blocked",
    ]),
    expected: AttestExpectedBlockedSchema,
    observed: z.strictObject({
      candidateId: CandidateDigestSchema.nullable(),
      subjectDigest: CandidateDigestSchema,
    }),
    nextAction: AttestRefreshActionSchema,
    recommendedActionText: z.string().trim().min(1),
  }),
  z.strictObject({
    status: z.literal("refused"),
    reason: z.enum([
      "verification-evidence-required",
      "verification-evidence-reused",
      "verification-evidence-inapplicable",
      "verification-scope-insufficient",
      "focused-scope-inapplicable",
    ]),
    candidateId: CandidateDigestSchema.nullable(),
    subjectDigest: CandidateDigestSchema,
    requestedScope: AttestScopeSchema,
    requiredScope: AttestScopeSchema,
    verificationEvidenceProvided: z.boolean(),
    nextAction: AttestVerificationActionSchema,
    recommendedActionText: z.string().trim().min(1),
  }),
]);
export type AttestResult = z.infer<typeof AttestResultSchema>;

export interface AttestContext {
  actor: string;
  now(): string;
  verificationEvidenceRef(name: string): string;
  readRecord(name: string): Promise<VersionedCandidateRecord>;
  currentTarget(name: string): Promise<CandidateLineageTarget>;
  effectiveTarget(name: string, record: CandidateManagedRecordV1): Promise<CandidateEffectiveTargetProjection>;
  publish(input: {
    name: string;
    record: CandidateManagedRecordV1;
    candidateId: string;
    candidateSubjectDigest: string;
    currentWorkflow: string;
    nextAction: string;
    expectedRecordVersion: string | null;
    repairCurrent: boolean;
  }): Promise<{ recordPath: string; metaPath: string; locus: IntegrationBoundaryLocus }>;
}

/**
 * Attest the current verified work-unit subject, its recognized converged lineage head, or — on
 * deliberate `newRoot` invocation over a blocked lineage — a new root that supersedes it.
 *
 * `newRoot` is the escape from an unexplained delta, which no lineage advance can absorb: the operator
 * re-runs full verification and asks for a fresh root. It never repairs the blocked record, and it is
 * opt-in so the default response to an unexplained delta stays the blocked envelope carrying the exact
 * delta. A lineage that is not blocked ignores it and takes its ordinary arm, which is what keeps a
 * repeated same-target invocation a no-op.
 */
export async function runAttest(
  context: AttestContext,
  params: {
    name: string;
    lifecycle: keyof typeof ATTESTED_ORIENTATION;
    newRoot?: boolean;
    scope?: "focused" | "full";
    verificationEvidenceRef?: string;
    expectedBlocked?: { candidateId: string; subjectDigest: string };
  },
): Promise<AttestResult> {
  const name = SlugSchema.parse(params.name);
  const expectedBlocked = params.expectedBlocked === undefined
    ? undefined
    : AttestExpectedBlockedSchema.parse(params.expectedBlocked);
  const orientation = ATTESTED_ORIENTATION[params.lifecycle];
  const requestedScope = AttestScopeSchema.parse(params.scope ?? "full");
  const verificationEvidenceRef = params.verificationEvidenceRef === undefined
    ? undefined
    : z.string().trim().min(1).parse(params.verificationEvidenceRef);
  const current = CandidateLineageTargetSchema.parse(await context.currentTarget(name));
  const existing = await context.readRecord(name);
  const refuseStaleReRoot = (
    reason: "re-root-candidate-mismatch" | "re-root-subject-mismatch" | "re-root-no-longer-blocked",
    expected: { candidateId: string; subjectDigest: string },
    observedCandidateId: string | null,
  ): AttestResult => reRootRefusal({
    reason,
    name,
    expected,
    observed: {
      candidateId: observedCandidateId,
      subjectDigest: current.subject.subjectDigest,
    },
  });
  if (existing.record !== null) {
    const record = CandidateManagedRecordV1Schema.parse(existing.record);
    const currentness = projectStagedCandidateCurrentness({
      record,
      staged: current,
      committed: await context.effectiveTarget(name, record),
    });
    if (currentness.status === "blocked") {
      if (requestedScope === "focused") {
        return scopedRefusal({
          reason: "focused-scope-inapplicable",
          name,
          candidateId: currentness.candidateId,
          subjectDigest: current.subject.subjectDigest,
          requestedScope,
          requiredScope: "full",
          verificationEvidenceRef,
          newRoot: true,
        });
      }
      if (verificationEvidenceRef !== undefined) {
        return scopedRefusal({
          reason: "verification-evidence-inapplicable",
          name,
          candidateId: currentness.candidateId,
          subjectDigest: current.subject.subjectDigest,
          requestedScope,
          requiredScope: "full",
          verificationEvidenceRef,
          newRoot: true,
        });
      }
      if (params.newRoot !== true) {
        return {
          status: "blocked",
          candidateId: currentness.candidateId,
          delta: currentness.delta,
          nextAction: "establish-new-root",
          recommendedActionText: "Run full work-unit verification, then establish a new Candidate lineage root.",
          continuation: {
            argv: [
              "arc",
              "attest",
              name,
              "--new-root",
              "--expected-candidate",
              currentness.candidateId,
              "--expected-subject",
              current.subject.subjectDigest,
              "--json",
            ],
          },
        };
      }
      if (expectedBlocked !== undefined && expectedBlocked.candidateId !== currentness.candidateId) {
        return refuseStaleReRoot("re-root-candidate-mismatch", expectedBlocked, currentness.candidateId);
      }
      if (expectedBlocked !== undefined && expectedBlocked.subjectDigest !== current.subject.subjectDigest) {
        return refuseStaleReRoot("re-root-subject-mismatch", expectedBlocked, currentness.candidateId);
      }
      return establishRoot(context, name, current, orientation, currentness.candidateId, existing.version);
    }
    if (expectedBlocked !== undefined) {
      return refuseStaleReRoot("re-root-no-longer-blocked", expectedBlocked, currentness.candidateId);
    }
    if (currentness.convergenceVerification === "satisfied") {
      if (requestedScope === "focused" || verificationEvidenceRef !== undefined) {
        return scopedRefusal({
          reason: requestedScope === "focused"
            ? "focused-scope-inapplicable"
            : "verification-evidence-inapplicable",
          name,
          candidateId: currentness.candidateId,
          subjectDigest: current.subject.subjectDigest,
          requestedScope,
          requiredScope: "full",
          verificationEvidenceRef,
          newRoot: false,
        });
      }
      const published = await context.publish({
        name,
        record,
        candidateId: currentness.candidateId,
        candidateSubjectDigest: current.subject.subjectDigest,
        expectedRecordVersion: existing.version,
        repairCurrent: true,
        ...orientation,
      });
      return {
        status: "unchanged",
        locus: published.locus,
      };
    }
    const requiredScope = currentness.convergenceScope;
    if (!candidateConvergenceScopeCovers(requestedScope, requiredScope)) {
      return scopedRefusal({
        reason: "verification-scope-insufficient",
        name,
        candidateId: currentness.candidateId,
        subjectDigest: current.subject.subjectDigest,
        requestedScope,
        requiredScope,
        verificationEvidenceRef,
        newRoot: false,
      });
    }
    if (verificationEvidenceRef === undefined) {
      return scopedRefusal({
        reason: "verification-evidence-required",
        name,
        candidateId: currentness.candidateId,
        subjectDigest: current.subject.subjectDigest,
        requestedScope,
        requiredScope,
        verificationEvidenceRef,
        newRoot: false,
      });
    }
    if (verificationEvidenceRef === record.attestation.verificationEvidenceRef
      || record.transitions.some((transition) =>
        (transition.transitionKind === "review-response"
          || transition.transitionKind === "verification-response")
        && transition.verificationEvidenceRefs.includes(verificationEvidenceRef))
      || record.lineageAttestations.some((attestation) =>
        attestation.verificationEvidenceRef === verificationEvidenceRef)) {
      return scopedRefusal({
        reason: "verification-evidence-reused",
        name,
        candidateId: currentness.candidateId,
        subjectDigest: current.subject.subjectDigest,
        requestedScope,
        requiredScope,
        verificationEvidenceRef,
        newRoot: false,
      });
    }
    const responseId = candidatePendingConvergenceResponseId(record);
    if (responseId === null) {
      throw new Error("Pending Candidate convergence must identify its review-response occurrence");
    }
    const lineageAttestation = createCandidateLineageAttestation({
      candidateId: currentness.candidateId,
      responseId,
      target: { revision: currentness.recognizedRevision, subject: current.subject },
      attestedBy: context.actor,
      attestedAt: context.now(),
      verificationEvidenceRef,
      scope: requestedScope,
    });
    const nextRecord = CandidateManagedRecordV1Schema.parse({
      ...record,
      lineageAttestations: [...record.lineageAttestations, lineageAttestation],
    });
    const published = await context.publish({
      name,
      record: nextRecord,
      candidateId: currentness.candidateId,
      candidateSubjectDigest: current.subject.subjectDigest,
      expectedRecordVersion: existing.version,
      repairCurrent: false,
      ...orientation,
    });
    return {
      status: "attested",
      operation: "convergence",
      scope: requestedScope,
      verificationEvidenceRef,
      ...published,
    };
  }

  if (expectedBlocked !== undefined) {
    return refuseStaleReRoot("re-root-candidate-mismatch", expectedBlocked, null);
  }
  if (requestedScope === "focused" || verificationEvidenceRef !== undefined) {
    return scopedRefusal({
      reason: requestedScope === "focused"
        ? "focused-scope-inapplicable"
        : "verification-evidence-inapplicable",
      name,
      candidateId: null,
      subjectDigest: current.subject.subjectDigest,
      requestedScope,
      requiredScope: "full",
      verificationEvidenceRef,
      newRoot: false,
    });
  }

  return establishRoot(context, name, current, orientation, undefined, existing.version);
}

interface ScopedRefusalInput {
  reason:
    | "verification-evidence-required"
    | "verification-evidence-reused"
    | "verification-evidence-inapplicable"
    | "verification-scope-insufficient"
    | "focused-scope-inapplicable";
  name: string;
  candidateId: string | null;
  subjectDigest: string;
  requestedScope: "focused" | "full";
  requiredScope: "focused" | "full";
  verificationEvidenceRef: string | undefined;
  newRoot: boolean;
}

function scopedRefusal(input: ScopedRefusalInput): AttestResult {
  const convergence = input.reason === "verification-evidence-required"
    || input.reason === "verification-evidence-reused"
    || input.reason === "verification-scope-insufficient";
  const attestArgv = convergence
    ? [
        "arc", "attest", input.name, "--scope", input.requiredScope,
        "--verification-evidence-ref", "{verificationEvidenceRef}", "--json",
      ]
    : [
        "arc", "attest", input.name,
        ...(input.newRoot ? ["--new-root"] : []),
        "--scope", "full", "--json",
      ];
  return AttestResultSchema.parse({
    status: "refused",
    reason: input.reason,
    candidateId: input.candidateId,
    subjectDigest: input.subjectDigest,
    requestedScope: input.requestedScope,
    requiredScope: input.requiredScope,
    verificationEvidenceProvided: input.verificationEvidenceRef !== undefined,
    nextAction: {
      kind: "run-verification",
      scope: input.requiredScope,
      verificationKind: input.requiredScope === "focused" ? "focused" : "tier-3",
      verificationEvidenceRequired: convergence,
      attestArgv,
    },
    recommendedActionText: input.reason === "verification-evidence-required"
      ? `Run ${input.requiredScope} convergence verification and supply its fresh evidence reference.`
      : input.reason === "verification-evidence-reused"
        ? `Run ${input.requiredScope} convergence verification and supply a new evidence reference.`
      : input.reason === "verification-scope-insufficient"
        ? `Run full convergence verification; focused evidence cannot satisfy this Candidate subject.`
        : "Run full work-unit verification before attesting a Candidate root or re-root.",
  });
}

function reRootRefusal(input: {
  reason: "re-root-candidate-mismatch" | "re-root-subject-mismatch" | "re-root-no-longer-blocked";
  name: string;
  expected: { candidateId: string; subjectDigest: string };
  observed: { candidateId: string | null; subjectDigest: string };
}): AttestResult {
  return AttestResultSchema.parse({
    status: "refused",
    reason: input.reason,
    expected: input.expected,
    observed: input.observed,
    nextAction: {
      kind: "refresh-attestation",
      attestArgv: ["arc", "attest", input.name, "--json"],
    },
    recommendedActionText: "The bound re-root continuation is stale. Refresh Candidate attestation state.",
  });
}

/** Attest one fresh lineage root over the current target, recording any Candidate it supersedes. */
async function establishRoot(
  context: AttestContext,
  name: string,
  current: CandidateLineageTarget,
  orientation: (typeof ATTESTED_ORIENTATION)[keyof typeof ATTESTED_ORIENTATION],
  supersedes: string | undefined,
  expectedRecordVersion: string | null,
): Promise<AttestResult> {
  const attestation = createCandidateAttestation({
    workUnit: name,
    subject: current.subject,
    baseRevision: current.revision,
    attestedBy: context.actor,
    attestedAt: context.now(),
    verificationEvidenceRef: context.verificationEvidenceRef(name),
    ...(supersedes === undefined ? {} : { supersedes }),
  });
  const record = CandidateManagedRecordV1Schema.parse({
    schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1",
    attestation,
    subject: current.subject,
    transitions: [],
    lineageAttestations: [],
  });
  const published = await context.publish({
    name,
    record,
    candidateId: attestation.candidateId,
    candidateSubjectDigest: current.subject.subjectDigest,
    expectedRecordVersion,
    repairCurrent: false,
    ...orientation,
  });
  return {
    status: "attested",
    operation: supersedes === undefined ? "root" : "re-root",
    ...published,
  };
}
