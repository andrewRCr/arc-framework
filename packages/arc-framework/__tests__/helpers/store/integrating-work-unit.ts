/**
 * An attested work unit moved to Integrating in a temporary repository's ref store, as a test finds it after `arc attest`.
 * Benchmarks seed through it too, so it imports nothing that loads Vitest.
 */
import { setMetaCurrentWorkflow, setMetaState } from "../../../src/lib/active/meta-reader.js";
import { SlugSchema, canonicalize } from "../../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { IntegrationBoundaryLocusV2Schema } from
  "../../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { readStoreRecord, seedStore } from "./seed-store.js";

/** The attested Candidate's coordinates, as its stored boundary names them. */
export interface IntegratedCandidate {
  readonly candidateId: string;
  readonly candidateSubjectDigest: string | null;
}

/**
 * Move a work unit `arc attest` has attested to Integrating under `integrate-work-unit`, and, given its idempotent push,
 * replace its stored boundary with the one publication leaves pending at that push.
 * @param root - The repository's checkout.
 * @param slug - The work unit's slug.
 * @param options - The identity the writes run as, and the push publication resumes at, when it is pending.
 * @returns The attested Candidate's coordinates.
 */
export async function integrateAttestedWorkUnit(root: string, slug: string, options: {
  readonly identity: string;
  readonly publicationPush?: string;
}): Promise<IntegratedCandidate> {
  const identity = SlugSchema.parse(options.identity);
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name: slug });
  const meta = await readStoreRecord(root, identity, recordReferences["work-item/meta"](owner));
  const boundary = await readStoreRecord(root, identity, recordReferences["review/integration-boundary"](owner));
  const { candidateId, candidateSubjectDigest } = IntegrationBoundaryLocusV2Schema.parse(JSON.parse(boundary.content));
  const pending = options.publicationPush === undefined ? [] : [{
    reference: boundary.reference, expected: boundary.version,
    content: canonicalize(IntegrationBoundaryLocusV2Schema.parse({
      schemaVersion: 2, mode: "integration-boundary", workUnit: slug, candidateId, candidateSubjectDigest,
      terminus: null, deliveryReviewTermini: [], locus: "publication-pending",
      nextAction: {
        kind: "continue-publication", command: options.publicationPush,
        interactionText: "Resume publication at the idempotent push, then resolve or open the change request.",
      },
      reservation: null, readinessBinding: null,
    })),
  }];
  await seedStore(root, identity, [
    { reference: meta.reference, expected: meta.version, placement: { kind: "active" },
      content: setMetaCurrentWorkflow(setMetaState(meta.content, "Integrating"), "integrate-work-unit") },
    ...pending,
  ]);
  return { candidateId, candidateSubjectDigest };
}
