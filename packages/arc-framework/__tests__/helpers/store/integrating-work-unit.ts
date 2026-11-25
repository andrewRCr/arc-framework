/**
 * An attested work unit moved to Integrating in a temporary repository's ref store.
 * Benchmarks seed through it too, so it imports nothing that loads Vitest.
 */
import { openPublicationReviewContext } from "../../../src/handlers/lifecycle-publication-boundary.js";
import { setMetaCurrentWorkflow, setMetaState } from "../../../src/lib/active/meta-reader.js";
import { gitExec } from "../../../src/lib/io-context.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { writeSubmissionBoundary } from "../../../src/lib/store/kinds/review/integration-boundary/access.js";
import type { StoreRecord } from "../../../src/lib/store/read.js";
import { CandidatePublishReadyBoundaryV2Schema, IntegrationBoundaryLocusV2Schema, type IntegrationBoundaryLocusV2 } from
  "../../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { resolveReviewInvocation } from "../../../src/scripts/review-gate/runtime/invocation.js";
import { runArcNoTty } from "../../e2e/helpers.js";
import { readStoreRecord, seedStore } from "./seed-store.js";

/** The attested Candidate's coordinates, as its stored boundary names them. */
export interface IntegratedCandidate {
  readonly candidateId: string;
  readonly candidateSubjectDigest: string | null;
}

/**
 * Move an attested work unit to Integrating, optionally using native publication to leave a resumable claim.
 * @param root - The attested work unit's checkout.
 * @param slug - The work unit's slug.
 * @param options - The fixture identity and whether to leave a pending publication.
 * @returns The attested Candidate's coordinates.
 */
export async function integrateAttestedWorkUnit(root: string, slug: string, options: {
  readonly identity: string;
  readonly publicationPending?: boolean;
}): Promise<IntegratedCandidate> {
  const identity = SlugSchema.parse(options.identity);
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name: slug });
  const record = await readStoreRecord(root, identity, recordReferences["review/integration-boundary"](owner));
  const attested = IntegrationBoundaryLocusV2Schema.parse(JSON.parse(record.content));
  if (options.publicationPending === true) {
    await leavePublicationPending(root, record, attested);
  } else {
    const meta = await readStoreRecord(root, identity, recordReferences["work-item/meta"](owner));
    await seedStore(root, identity, [{ reference: meta.reference, expected: meta.version, placement: { kind: "active" },
      content: setMetaCurrentWorkflow(setMetaState(meta.content, "Integrating"), "integrate-work-unit") }]);
  }
  return { candidateId: attested.candidateId, candidateSubjectDigest: attested.candidateSubjectDigest };
}

async function leavePublicationPending(root: string, record: StoreRecord, attested: IntegrationBoundaryLocusV2): Promise<void> {
  const { workUnit, candidateId, candidateSubjectDigest } = attested;
  const owner = record.reference.owner;
  const invocation = resolveReviewInvocation({ cwd: root, exec: gitExec, workItem: owner });
  const review = await openPublicationReviewContext({ cwd: root, exec: gitExec, invocation, candidateId });
  const readiness = await review.readReadinessBinding();
  if (readiness.status !== "complete") throw new Error(readiness.condition);

  // Seed settled review with the live readiness proof. The publish command writes the pending claim.
  const ready = CandidatePublishReadyBoundaryV2Schema.parse({
    schemaVersion: 2, mode: "pre-publication-review", workUnit, candidateId, candidateSubjectDigest,
    locus: "candidate-publish-ready", reservation: null, readinessBinding: readiness.digest,
    nextAction: { kind: "publish-candidate", command: `arc publish ${workUnit}`, interactionText: "Publish the Candidate." },
  });
  await writeSubmissionBoundary(root, ready, record.version, { store: invocation.store, owner });
  const published = await runArcNoTty(["publish", workUnit, "--json"], root);
  if (published.exitCode !== 0) {
    throw new Error(`Fixture publication did not leave a pending claim: ${published.stdout}${published.stderr}`);
  }
  const result = JSON.parse(published.stdout) as { status: string; boundary?: unknown };
  const boundary = IntegrationBoundaryLocusV2Schema.parse(result.boundary);
  if (result.status !== "published" || boundary.locus !== "publication-pending" || boundary.readinessBinding !== readiness.digest) {
    throw new Error(`Fixture publication did not preserve the readiness binding: ${published.stdout}`);
  }
}
