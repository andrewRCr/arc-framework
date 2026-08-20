/** Candidate proposal orchestration over storage-neutral repository boundaries. */

import { z } from "zod";

import {
  CandidateManagedRecordV1Schema,
  CandidateLineageTargetSchema,
  createCandidateAttestation,
  createCandidateLineageAttestation,
  projectCandidateCurrentness,
  type CandidateManagedRecordV1,
  type CandidateLineageTarget,
} from "../candidate-attestation.js";
import type { VersionedCandidateRecord } from "../candidate-record-store.js";
import { SlugSchema } from "../../kernel/schema/slug.js";
import {
  IntegrationBoundaryLocusSchema,
  projectCandidateReviewBoundary,
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
    candidateId: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
    delta: z.strictObject({
      added: z.array(z.string()),
      removed: z.array(z.string()),
      changed: z.array(z.string()),
    }),
    nextAction: z.string().trim().min(1),
  }),
]);
export type AttestResult = z.infer<typeof AttestResultSchema>;

export interface AttestContext {
  actor: string;
  now(): string;
  verificationEvidenceRef(name: string): string;
  readRecord(name: string): Promise<VersionedCandidateRecord>;
  currentTarget(name: string): Promise<CandidateLineageTarget>;
  publish(input: {
    name: string;
    record: CandidateManagedRecordV1;
    candidateId: string;
    candidateSubjectDigest: string;
    currentWorkflow: string;
    nextAction: string;
    expectedRecordVersion: string | null;
  }): Promise<{ recordPath: string; metaPath: string }>;
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
  params: { name: string; lifecycle: keyof typeof ATTESTED_ORIENTATION; newRoot?: boolean },
): Promise<AttestResult> {
  const name = SlugSchema.parse(params.name);
  const orientation = ATTESTED_ORIENTATION[params.lifecycle];
  const current = CandidateLineageTargetSchema.parse(await context.currentTarget(name));
  const existing = await context.readRecord(name);
  if (existing.record !== null) {
    const record = CandidateManagedRecordV1Schema.parse(existing.record);
    const currentness = projectCandidateCurrentness({ record, current });
    if (currentness.status === "blocked") {
      if (params.newRoot !== true) {
        return {
          status: "blocked",
          candidateId: currentness.candidateId,
          delta: currentness.delta,
          nextAction: currentness.nextAction,
        };
      }
      return establishRoot(context, name, current, orientation, currentness.candidateId, existing.version);
    }
    if (currentness.convergenceVerification === "satisfied") {
      await context.publish({
        name,
        record,
        candidateId: currentness.candidateId,
        candidateSubjectDigest: current.subject.subjectDigest,
        expectedRecordVersion: existing.version,
        ...orientation,
      });
      return {
        status: "unchanged",
        locus: projectCandidateReviewBoundary({
          workUnit: name,
          candidateId: currentness.candidateId,
          candidateSubjectDigest: current.subject.subjectDigest,
        }),
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
    const locus = projectCandidateReviewBoundary({
      workUnit: name,
      candidateId: currentness.candidateId,
      candidateSubjectDigest: current.subject.subjectDigest,
    });
    const published = await context.publish({
      name,
      record: nextRecord,
      candidateId: currentness.candidateId,
      candidateSubjectDigest: current.subject.subjectDigest,
      expectedRecordVersion: existing.version,
      ...orientation,
    });
    return { status: "attested", operation: "convergence", ...published, locus };
  }

  return establishRoot(context, name, current, orientation, undefined, existing.version);
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
    responses: [],
    lineageAttestations: [],
  });
  const locus = projectCandidateReviewBoundary({
    workUnit: name,
    candidateId: attestation.candidateId,
    candidateSubjectDigest: current.subject.subjectDigest,
  });
  const published = await context.publish({
    name,
    record,
    candidateId: attestation.candidateId,
    candidateSubjectDigest: current.subject.subjectDigest,
    expectedRecordVersion,
    ...orientation,
  });
  return {
    status: "attested",
    operation: supersedes === undefined ? "root" : "re-root",
    ...published,
    locus,
  };
}
