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
import { SlugSchema } from "../../kernel/schema/slug.js";

export const CandidatePrePublicationLocusSchema = z.strictObject({
  kind: z.enum(["candidate-review-pending", "candidate-submit-ready"]),
  workUnit: SlugSchema,
  candidateId: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  nextAction: z.strictObject({
    command: z.string().trim().min(1),
    interactionText: z.string().trim().min(1),
  }),
});
export type CandidatePrePublicationLocus = z.infer<typeof CandidatePrePublicationLocusSchema>;

export const ProposeResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("attested"),
    operation: z.enum(["root", "re-root", "convergence"]),
    recordPath: z.string().trim().min(1),
    metaPath: z.string().trim().min(1),
    locus: CandidatePrePublicationLocusSchema,
  }),
  z.strictObject({
    status: z.literal("unchanged"),
    locus: CandidatePrePublicationLocusSchema,
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
export type ProposeResult = z.infer<typeof ProposeResultSchema>;

export interface ProposeContext {
  actor: string;
  now(): string;
  verificationEvidenceRef(name: string): string;
  readRecord(name: string): Promise<CandidateManagedRecordV1 | null>;
  currentTarget(name: string): Promise<CandidateLineageTarget>;
  publish(input: {
    name: string;
    record: CandidateManagedRecordV1;
    candidateId: string;
    nextAction: string;
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
export async function runPropose(
  context: ProposeContext,
  params: { name: string; newRoot?: boolean },
): Promise<ProposeResult> {
  const name = SlugSchema.parse(params.name);
  const current = CandidateLineageTargetSchema.parse(await context.currentTarget(name));
  const existing = await context.readRecord(name);
  if (existing !== null) {
    const record = CandidateManagedRecordV1Schema.parse(existing);
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
      return establishRoot(context, name, current, currentness.candidateId);
    }
    if (currentness.convergenceVerification === "satisfied") {
      return {
        status: "unchanged",
        locus: locusFor(
          name,
          currentness.candidateId,
          record.responses.length === 0 ? "candidate-review-pending" : "candidate-submit-ready",
        ),
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
    const locus = locusFor(name, currentness.candidateId, "candidate-submit-ready");
    const published = await context.publish({
      name,
      record: nextRecord,
      candidateId: currentness.candidateId,
      nextAction: "Candidate submit ready — run arc submit",
    });
    return { status: "attested", operation: "convergence", ...published, locus };
  }

  return establishRoot(context, name, current, undefined);
}

/** Attest one fresh lineage root over the current target, recording any Candidate it supersedes. */
async function establishRoot(
  context: ProposeContext,
  name: string,
  current: CandidateLineageTarget,
  supersedes: string | undefined,
): Promise<ProposeResult> {
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
  const locus = locusFor(name, attestation.candidateId, "candidate-review-pending");
  const published = await context.publish({
    name,
    record,
    candidateId: attestation.candidateId,
    nextAction: "Candidate review pending — run pre-publication review",
  });
  return {
    status: "attested",
    operation: supersedes === undefined ? "root" : "re-root",
    ...published,
    locus,
  };
}

function locusFor(
  workUnit: string,
  candidateId: string,
  kind: CandidatePrePublicationLocus["kind"],
): CandidatePrePublicationLocus {
  return CandidatePrePublicationLocusSchema.parse({
    kind,
    workUnit,
    candidateId,
    nextAction: kind === "candidate-review-pending"
      ? {
          command: `arc review pre-publication ${workUnit} --json`,
          interactionText: "Run the configured pre-publication review procedure.",
        }
      : {
          command: `arc submit ${workUnit} --json`,
          interactionText: "Submit the current Candidate for publication.",
        },
  });
}
