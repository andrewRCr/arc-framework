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
import { describeRecordConflicts } from "../../../../../../src/lib/store/conflict-diagnostics.js";
import { StoreRefusalError } from "../../../../../../src/lib/store/refusal-error.js";
import { ReviewFactVersionConflictError } from "../../../../../../src/lib/store/kinds/review/errors.js";
import { recordKey } from "../../../../../helpers/store/model.js";
import { reviewFactListingError } from "../../../../../../src/lib/store/kinds/review/fact-access.js";

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
  lifecycleSuccess(await h.store.push());
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
  lifecycleSuccess(await h.store.push());
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

it.each(["outcome", "evidence", "decision"] as const)("refuses a conflicted %s listing as a typed recoverable refusal and resumes after resolution", async kind => {
  const h = await conflicted(kind);
  expect(h.record.conflicts.length).toBeGreaterThan(0);
  const refused = await h.list();
  expect(refused).toMatchObject({ status: "incomplete", reason: expect.stringContaining("Resolve the named conflict records"),
    refusal: { code: "record-malformed", class: "recoverable", rule: "review.record-conflict",
      remedy: { text: "Resolve the named conflict records, then retry." } } });
  if (refused.status === "complete") throw new Error("Expected a conflicted listing");
  for (const reference of h.record.conflicts) expect(refused.reason).toContain(JSON.stringify(reference));
  expect(reviewFactListingError(refused)).toBeInstanceOf(StoreRefusalError);
  await h.repair();
  const listed = await h.list();
  expect(listed).toMatchObject({ status: "complete", records: [{ reference: h.record.reference,
    value: JSON.parse(h.record.content) }] });
});

it("refuses an unreadable native listing as a typed recoverable refusal and lists once readable", async () => {
  const h = createReviewHarness(), owner = (await h.seedMeta("example")).reference.owner;
  const outcomes = createReviewOutcomePort(h.store, owner);
  h.store.state.unreadable.add("review");
  const refused = await outcomes.list();
  expect(refused).toMatchObject({ status: "unavailable",
    refusal: { code: "record-malformed", class: "recoverable", rule: "review.listing-unreadable" } });
  if (refused.status === "complete") throw new Error("Expected an unreadable listing");
  expect(reviewFactListingError(refused)).toMatchObject({ offBranch: true, refusal: refused.refusal });
  h.store.state.unreadable.clear();
  expect(await outcomes.list()).toEqual({ status: "complete", records: [] });
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

it("keeps a conflicted single read's store refusal typed, with today's message", async () => {
  const h = await conflicted("evidence");
  const key = (JSON.parse(h.record.content) as { dispositionSet: { dispositionSetId: string } }).dispositionSet.dispositionSetId;
  const error = await h.evidence.read(key).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(StoreRefusalError);
  const refusal = (error as StoreRefusalError).refusal;
  expect(refusal).toMatchObject({ code: "record-malformed", class: "recoverable", reference: h.record.reference });
  expect((error as Error).message).toBe(`Review record has unresolved conflicts.${describeRecordConflicts(h.record.conflicts)}`);
});

it("refuses a native point read whose content its schema rejects as a malformed record, and reads once restored", async () => {
  const h = createReviewHarness(), candidate = candidateFixture(), primary = await h.seedMeta("example");
  const owner = primary.reference.owner;
  const outcome = ReviewOutcomeSchema.parse(localOutcome({ lineage: { kind: "candidate", candidateId: candidate.attestation.candidateId },
    vehicle: { kind: "work-unit", identity: "example" }, outcome: "clean", findings: [] }));
  const outcomes = createReviewOutcomePort(h.store, owner);
  const stored = await outcomes.create(outcome);
  const raw = h.store.state.records.get(recordKey(stored.reference));
  if (raw === undefined) throw new Error("Missing stored outcome fixture");
  const valid = raw.content;
  raw.content = JSON.stringify({ ...JSON.parse(valid) as object, outcome: "unknown" });
  const key = stored.reference.key;
  if (typeof key !== "string") throw new Error("Expected a keyed outcome reference");
  await expect(outcomes.read(key)).rejects.toMatchObject({ offBranch: true, refusal: { code: "record-malformed",
    class: "recoverable", reference: stored.reference, condition: expect.stringContaining("outcome"),
    remedy: { text: "Restore a valid version of the record, then retry." } } });
  raw.content = valid;
  await expect(outcomes.read(key)).resolves.toMatchObject({ version: stored.version,
    value: { attemptId: outcome.attemptId, outcome: "clean" } });
});

it.each(["create", "advance"] as const)("refuses a stale fact %s with its typed version conflict", async write => {
  const h = createReviewHarness(), candidate = candidateFixture(), owner = (await h.seedMeta("example")).reference.owner;
  await h.seedCandidate(owner, candidate);
  const outcome = ReviewOutcomeSchema.parse(localOutcome({ lineage: { kind: "candidate", candidateId: candidate.attestation.candidateId },
    vehicle: { kind: "work-unit", identity: "example" }, outcome: "findings", findings: [{ findingId: "finding-1",
      severity: "major", locus: "src/main.ts:1", evidenceUrlOrId: "finding:1", sourceOrdinal: 1 }] }));
  await createReviewOutcomePort(h.store, owner).create(outcome);
  const evidence = createReviewEvidencePort(h.store, owner), value = reviewEvidenceFixture(outcome);
  const created = await evidence.create(value);
  const at = (approvedAt: string) => ({ ...value, approval: { ...value.approval, approvedAt } });
  if (write === "advance") await evidence.advance(at("2026-10-19T13:00:00Z"), created.version);
  const stale = write === "create" ? evidence.create(value) : evidence.advance(at("2026-10-19T14:00:00Z"), created.version);
  const error = await stale.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(ReviewFactVersionConflictError);
  expect((error as ReviewFactVersionConflictError).refusal).toMatchObject({ code: "version-conflict", class: "recoverable" });
});
