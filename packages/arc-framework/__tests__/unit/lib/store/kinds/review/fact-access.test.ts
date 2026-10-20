/** Typed fact listings retain sync conflicts before approval metadata is discarded. */
import { expect, it } from "vitest";
import { createReviewHarness } from "../../../../../helpers/store/review-harness.js";
import { createMemoryRemote } from "../../../../../helpers/store/sync.js";
import { ReferenceBackend } from "../../../../../helpers/store/reference-backend.js";
import { lifecycleSuccess } from "../../../../../helpers/store/lifecycle-harness.js";
import { candidateFixture } from "../../../../../helpers/store/tracked-write-fixture.js";
import { localOutcome } from "../../../../../fixtures/review-outcome.js";
import { reviewEvidenceFixture } from "../../../../../fixtures/review-evidence.js";
import { approvedFixDecision } from "../../../../../fixtures/review-decision.js";
import { createReviewOutcomePort } from "../../../../../../src/lib/store/kinds/review/outcome/access.js";
import { createReviewEvidencePort } from "../../../../../../src/lib/store/kinds/review/evidence/access.js";
import { createReviewDecisionPort } from "../../../../../../src/lib/store/kinds/review/decision/access.js";
import { ReviewOutcomeSchema } from "../../../../../../src/lib/store/kinds/review/outcome/schema.js";
import type { RecordReference } from "../../../../../../src/lib/store/identity.js";

type Kind = "outcome" | "evidence" | "decision";
async function conflicted(kind: Kind) {
  const h = createReviewHarness(), candidate = candidateFixture(), primary = await h.seedMeta("example");
  const owner = primary.reference.owner;
  await h.seedCandidate(owner, candidate);
  const outcome = ReviewOutcomeSchema.parse(localOutcome({ lineage: { kind: "candidate", candidateId: candidate.attestation.candidateId },
    vehicle: { kind: "work-unit", identity: "example" }, outcome: "findings", findings: [{ findingId: "finding-1",
      severity: "major", locus: "src/main.ts:1", evidenceUrlOrId: "finding:1", sourceOrdinal: 1 }] }));
  const outcomes = createReviewOutcomePort(h.store, owner), evidence = createReviewEvidencePort(h.store, owner);
  const decisions = createReviewDecisionPort(h.store, owner);
  if (kind !== "outcome") await outcomes.create(outcome);
  const remote = createMemoryRemote();
  h.store.context.publication.remote = remote;
  lifecycleSuccess(await h.store.sync());
  const writer = new ReferenceBackend({ state: remote.state, registry: h.store.context.registry });
  let reference: RecordReference;
  if (kind === "outcome") {
    reference = (await outcomes.create(outcome)).reference;
    await createReviewOutcomePort(writer, owner).create({ ...outcome, endedAt: "2026-10-19T14:00:00Z" });
  } else if (kind === "evidence") {
    const value = reviewEvidenceFixture(outcome);
    reference = (await evidence.create(value)).reference;
    await createReviewEvidencePort(writer, owner).create({ ...value,
      approval: { ...value.approval, approvedAt: "2026-10-19T14:00:00Z" } });
  } else {
    const value = approvedFixDecision(outcome);
    reference = (await decisions.create(value)).reference;
    await createReviewDecisionPort(writer, owner).create({ ...value, decidedAt: "2026-10-19T14:00:00Z" });
  }
  lifecycleSuccess(await h.store.sync());
  const record = lifecycleSuccess(await h.store.read({ reference }));
  return { record, evidence, outcome, list: () => kind === "outcome" ? outcomes.list()
    : kind === "evidence" ? evidence.list() : decisions.list(), repair: async () => {
      for (const reference of record.conflicts) {
        const conflict = lifecycleSuccess(await h.store.read({ reference }));
        lifecycleSuccess(await h.store.write({ action: "remove", reference, expected: conflict.version,
          resolves: [reference], provenance: { verb: "resolve", lifecycleAction: "edit" } }));
      }
    } };
}

it.each(["outcome", "evidence", "decision"] as const)("refuses a conflicted %s listing and resumes after resolution", async kind => {
  const h = await conflicted(kind);
  expect(h.record.conflicts.length).toBeGreaterThan(0);
  const refused = await h.list();
  expect(refused).toMatchObject({ status: "incomplete", reason: expect.stringContaining("Resolve the named conflict records") });
  for (const reference of h.record.conflicts) expect(refused.status === "complete" ? "" : refused.reason)
    .toContain(JSON.stringify(reference));
  await h.repair();
  const listed = await h.list();
  expect(listed).toMatchObject({ status: "complete", records: [{ reference: h.record.reference,
    value: JSON.parse(h.record.content) }] });
});

it.each(["single", "listing"] as const)("keeps conflicted evidence out of the %s composed approval read", async mode => {
  const h = await conflicted("evidence");
  expect(h.record.conflicts.length).toBeGreaterThan(0);
  const read = () => mode === "single" ? h.evidence.readDispositionRecord(h.outcome.attemptId)
    : h.evidence.listDispositionRecords();
  for (const reference of h.record.conflicts) await expect(read()).rejects.toThrow(JSON.stringify(reference));
  await h.repair();
  const expected = { operationId: h.outcome.attemptId };
  expect(await read()).toMatchObject(mode === "single" ? expected : [expected]);
});
