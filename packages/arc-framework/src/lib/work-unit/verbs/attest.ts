/** Candidate proposal orchestration over storage-neutral repository boundaries. */

import { z } from "zod";

import {
  CandidateManagedRecordV1Schema,
  CandidateLineageTargetSchema,
  createCandidateAttestation,
  createCandidateLineageAttestation,
  type CandidateManagedRecordV1,
  type CandidateLineageTarget,
} from "../candidate-attestation.js";
import {
  projectCandidateReRootContinuation,
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

export const AttestResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("attested"),
    operation: z.enum(["root", "re-root", "convergence"]),
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
    expectedBlocked?: { candidateId: string; subjectDigest: string };
  },
): Promise<AttestResult> {
  const name = SlugSchema.parse(params.name);
  const expectedBlocked = params.expectedBlocked === undefined
    ? undefined
    : AttestExpectedBlockedSchema.parse(params.expectedBlocked);
  const orientation = ATTESTED_ORIENTATION[params.lifecycle];
  const current = CandidateLineageTargetSchema.parse(await context.currentTarget(name));
  const existing = await context.readRecord(name);
  if (existing.record !== null) {
    const record = CandidateManagedRecordV1Schema.parse(existing.record);
    const currentness = projectStagedCandidateCurrentness({
      record,
      staged: current,
      committed: await context.effectiveTarget(name, record),
    });
    if (currentness.status === "blocked") {
      if (params.newRoot !== true) {
        return {
          status: "blocked",
          candidateId: currentness.candidateId,
          delta: currentness.delta,
          nextAction: "establish-new-root",
          recommendedActionText: "Run full work-unit verification, then establish a new Candidate lineage root.",
          continuation: projectCandidateReRootContinuation({
            name,
            candidateId: currentness.candidateId,
            subjectDigest: current.subject.subjectDigest,
          }),
        };
      }
      if (expectedBlocked !== undefined && expectedBlocked.candidateId !== currentness.candidateId) {
        return reRootRefusal("re-root-candidate-mismatch");
      }
      if (expectedBlocked !== undefined && expectedBlocked.subjectDigest !== current.subject.subjectDigest) {
        return reRootRefusal("re-root-subject-mismatch");
      }
      return establishRoot(context, name, current, orientation, currentness.candidateId, existing.version);
    }
    if (expectedBlocked !== undefined) return reRootRefusal("re-root-no-longer-blocked");
    if (currentness.convergenceVerification === "satisfied") {
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
    const lineageAttestation = createCandidateLineageAttestation({
      candidateId: currentness.candidateId,
      target: { revision: currentness.recognizedRevision, subject: current.subject },
      attestedBy: context.actor,
      attestedAt: context.now(),
      verificationEvidenceRef: context.verificationEvidenceRef(name),
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
    return { status: "attested", operation: "convergence", ...published };
  }

  if (expectedBlocked !== undefined) return reRootRefusal("re-root-candidate-mismatch");

  return establishRoot(context, name, current, orientation, undefined, existing.version);
}

function reRootRefusal(
  reason: "re-root-candidate-mismatch" | "re-root-subject-mismatch" | "re-root-no-longer-blocked",
): AttestResult {
  return {
    status: "refused",
    reason,
    recommendedActionText: "Run fresh full work-unit verification before requesting another Candidate root.",
  };
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
