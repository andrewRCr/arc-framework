/** Production-checked operational records shared by review test checkouts. */
import { canonicalize } from "../../../src/lib/kernel/index.js";
import { createLifecycleHarness } from "./lifecycle-harness.js";
import { serializeCandidateManagedRecord, type CandidateManagedRecordV1 } from "../../../src/lib/work-unit/candidate-attestation.js";
import { IntegrationBoundaryLocusV2Schema, type IntegrationBoundaryLocusV2 } from "../../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { serializeTransientIdentityRecord, type TransientIdentityRecord } from "../../../src/lib/errand/identity-record.js";
import { OwnerIdentitySchema, recordReferences, type OwnerIdentity } from "../../../src/lib/store/identity.js";
import { createProjectIdentityReader } from "../../../src/lib/store/project-identity.js";

/** Seed review records through production schemas and semantic write admission. */
export function createReviewHarness() {
  const lifecycle = createLifecycleHarness();
  const seedCandidate = (owner: OwnerIdentity, candidate: CandidateManagedRecordV1) =>
    lifecycle.seed(recordReferences["review/candidate"](owner), serializeCandidateManagedRecord(candidate));
  const seedBoundary = (owner: OwnerIdentity, boundary: IntegrationBoundaryLocusV2) =>
    lifecycle.seed(recordReferences["review/integration-boundary"](owner), canonicalize(IntegrationBoundaryLocusV2Schema.parse(boundary)));
  return { ...lifecycle, projectId: createProjectIdentityReader(lifecycle.store), seedCandidate, seedBoundary,
    seedProject: async (projectId: string) => lifecycle.seed(recordReferences["project-registry/identity"](
      OwnerIdentitySchema.parse({ type: "project", name: "test-project", uid: projectId })), "{}"),
    seedErrand: async (record: Extract<TransientIdentityRecord, { kind: "errand" }>) => lifecycle.seed(
      recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: record.slug })),
      serializeTransientIdentityRecord(record), { kind: "active" }),
    seedReviewWorkUnit: async (candidate: CandidateManagedRecordV1, boundary: IntegrationBoundaryLocusV2) => {
      const meta = await lifecycle.seedMeta(candidate.attestation.workUnit);
      await seedCandidate(meta.reference.owner, candidate);
      await seedBoundary(meta.reference.owner, boundary);
      return meta;
    },
  };
}
