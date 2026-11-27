import { afterEach, expect, it } from "vitest";

import { SlugSchema } from "../../src/lib/kernel/index.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { CandidateManagedRecordV1Schema } from "../../src/lib/work-unit/candidate-attestation.js";
import { IntegrationBoundaryLocusV2Schema } from "../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { createHarness, roots } from "../fixtures/review-fan-out-harness.js";
import { cleanupTempDir } from "../helpers/integration.js";
import { readStoreRecord } from "../helpers/store/seed-store.js";

afterEach(async () => { await Promise.all(roots.splice(0).map(cleanupTempDir)); });

it("seeds the delivery Candidate and publication boundary under the work item's ref-store identity", async () => {
  const harness = await createHarness(undefined, { baseWithRenameHistory: true });
  const { store, owner } = harness.reviewRecords;
  expect(store.capabilities.stateOffBranch).toBe(true);
  if (owner?.type !== "work-item" || owner.uid === undefined) throw new Error("Expected a seeded work item's UID");

  const identity = SlugSchema.parse("andrew");
  const candidate = await readStoreRecord(harness.root, identity, recordReferences["review/candidate"](owner));
  const boundary = await readStoreRecord(harness.root, identity, recordReferences["review/integration-boundary"](owner));
  const candidateRecord = CandidateManagedRecordV1Schema.parse(JSON.parse(candidate.content));
  expect(candidateRecord).toMatchObject({ attestation: { workUnit: harness.plan.workUnitId } });
  expect(IntegrationBoundaryLocusV2Schema.parse(JSON.parse(boundary.content))).toMatchObject({
    schemaVersion: 2,
    workUnit: harness.plan.workUnitId,
    locus: "delivery-status-required",
    reservation: { target: { kind: "delivery", planId: harness.plan.planId, workUnitId: harness.plan.workUnitId } },
    candidateId: candidateRecord.attestation.candidateId,
    candidateSubjectDigest: candidateRecord.subject.subjectDigest,
  });
});
