/** Native attestation publication rolls back every record when any exact basis has moved. */
import { boundaryV2Fixture } from "../../../fixtures/review-boundary.js";
import { IntegrationBoundaryLocusV2Schema } from "../../../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { expect, it } from "vitest";
import { createReviewHarness } from "../../../helpers/store/review-harness.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { candidateFixture } from "../../../helpers/store/tracked-write-fixture.js";
import { writeStoredAttestation, type StoredAttestationInput } from "../../../../src/lib/store/attest-publication.js";
import { runAttest, type AttestContext } from "../../../../src/lib/work-unit/verbs/attest.js";
import { projectCandidateReviewBoundary } from "../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { projectDurableCandidateTarget } from "../../../helpers/candidate.js";
import { readCandidateRecordVersioned } from "../../../../src/lib/store/kinds/review/candidate/access.js";
import { readAttestInput } from "../../../../src/lib/store/attest-input.js";
import { validateManagedPath } from "../../../../src/lib/kernel/index.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { readSubmissionBoundaryVersioned } from "../../../../src/lib/store/kinds/review/integration-boundary/access.js";
import { createCandidateSubjectSnapshot, createCandidateReviewResponseEvidence } from "../../../../src/lib/work-unit/candidate-attestation.js";
import { canonicalDigest } from "../../../../src/lib/kernel/canonical/canonical-json.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { writeCandidateRecord } from "../../../../src/lib/store/kinds/review/candidate/access.js";
import { ParsedMetaRecordSchema } from "../../../../src/lib/active/meta-schema.js";
import { writeMetaNextAction, type MetaRenderOverrides } from "../../../../src/lib/store/kinds/meta/writers.js";

async function fixture(fields: MetaRenderOverrides = {}, seedCandidate = false, lifecycle: "Active" | "Integrating" | "Shipped" = "Active") {
  const h = createReviewHarness(), record = candidateFixture();
  const primary = await h.seedMeta("example", { state: lifecycle,
    currentWorkflow: lifecycle === "Integrating" ? "integrate-work-unit" : lifecycle === "Shipped" ? null : "process-task-loop",
    taskList: "tasks-example.md", ...fields }, lifecycle === "Shipped"
      ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } : { kind: "active" });
  await h.seed(recordReferences["work-item/task-list"](primary.reference.owner),
    "# Task List: example\n\n## **Phase 1:** Build\n\n### `[x]` **1.1 Build**\n");
  if (seedCandidate) await h.seedCandidate(primary.reference.owner, record);
  const admitted = await readAttestInput({ cwd: "/no-projected-files", store: h.store,
    activeMetaPath: name => validateManagedPath(`.arc/active/meta-${name}.md`),
    readFile: async () => { throw new Error("No projected files"); }, readArchivedMeta: async () => undefined,
  }, "example", lifecycle === "Shipped");
  if (admitted.status !== "ready" || admitted.primary === undefined) throw new Error("Expected stored attestation inputs");
  let selected = admitted.primary;
  let target = { revision: record.attestation.baseRevision, subject: record.subject };
  let snapshot = await readSubmissionBoundaryVersioned("/no-projected-files", "example", { store: h.store, owner: selected.reference.owner });
  let beforeWrite: ((publication: StoredAttestationInput["publication"]) => Promise<void>) | undefined;
  const context: AttestContext = { boundarySchemaVersion: 2, actor: "andrew", now: () => "2026-08-12T14:00:00.000Z",
    verificationEvidenceRef: () => "tasks-example.md#verification",
    readRecord: name => readCandidateRecordVersioned("/no-projected-files", name, { store: h.store, owner: selected.reference.owner }),
    currentTarget: async () => target,
    effectiveTarget: (name, candidate) => projectDurableCandidateTarget({ cwd: "/no-projected-files", name, record: candidate }),
    inspectReRootReviewAuthority: async () => null,
    publish: async publication => {
      const projected = projectCandidateReviewBoundary({ workUnit: publication.name, candidateId: publication.candidateId,
        candidateSubjectDigest: publication.candidateSubjectDigest }, 2);
      const boundaryMatches = snapshot.boundary?.candidateId === publication.candidateId
        && snapshot.boundary.candidateSubjectDigest === publication.candidateSubjectDigest;
      const boundary = publication.repairCurrent && boundaryMatches && snapshot.boundary !== null ? snapshot.boundary : projected;
      const input: StoredAttestationInput = { store: h.store, primary: selected, publication, boundary,
        expectedBoundaryVersion: snapshot.version, boundaryMatches,
        nextAction: boundaryMatches || lifecycle === "Shipped" ? publication.nextAction : boundary.nextAction.interactionText };
      const concurrent = beforeWrite;
      beforeWrite = undefined;
      await concurrent?.(publication);
      return lifecycleSuccess(await writeStoredAttestation(input));
    } };
  return { ...h, primary, record,
    attest: (options: { newRoot?: boolean; verificationEvidenceRef?: string } = {}) => runAttest(context,
      { name: "example", lifecycle, ...options }),
    target: (next: typeof target) => { target = next; },
    beforeWrite: (concurrent: NonNullable<typeof beforeWrite>) => { beforeWrite = concurrent; },
    rebind: async () => {
      selected = lifecycleSuccess(await h.store.read({ reference: primary.reference }));
      snapshot = await readSubmissionBoundaryVersioned("/no-projected-files", "example", { store: h.store, owner: selected.reference.owner });
    } };
}

it("leaves the entire Store unchanged on a stale primary and succeeds after rereading its basis", async () => {
  const h = await fixture(), primary = h.primary;
  lifecycleSuccess(await h.store.write({ ...recordPut(primary, { content: writeMetaNextAction(primary.content, "Concurrent orientation") }),
    provenance: { verb: "attest", lifecycleAction: "attest" } }));
  const version = lifecycleSuccess(await h.store.version());
  await expect(h.attest()).rejects.toThrow("version-conflict");
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
  for (const reference of [recordReferences["review/candidate"](primary.reference.owner),
    recordReferences["review/integration-boundary"](primary.reference.owner)]) {
    expect(await h.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  }
  await h.rebind();
  expect(await h.attest()).toMatchObject({ status: "attested" });
  const references = [primary.reference, recordReferences["review/candidate"](primary.reference.owner),
    recordReferences["review/integration-boundary"](primary.reference.owner)];
  const histories = await Promise.all(references.map(async reference => lifecycleSuccess(await h.store.history({ reference }))));
  const provenance = histories[0]?.[0]?.provenance;
  if (provenance === undefined || !("batchId" in provenance)) throw new Error("Missing atomic publication provenance");
  for (const history of histories) expect(history[0]?.provenance).toMatchObject({ batchId: provenance.batchId });
});

it("writes the native Candidate and boundary while preserving retired metadata fields", async () => {
  const h = await fixture({ lastCompleted: "Legacy completed pointer", nextTask: "Legacy next pointer" });
  const result = await h.attest();
  expect(result).toMatchObject({ status: "attested", locus: { schemaVersion: 2, locus: "candidate-review-pending" } });
  if (result.status !== "attested") throw new Error("Expected root attestation");
  const meta = lifecycleSuccess(await h.store.read({ reference: h.primary.reference }));
  expect(ParsedMetaRecordSchema.parse(meta.fields)).toMatchObject({ currentWorkflow: "prepare-work-unit",
    nextAction: result.locus.nextAction.interactionText, lastCompleted: "Legacy completed pointer",
    nextTask: "Legacy next pointer", candidateId: null });
  const stored = await readSubmissionBoundaryVersioned("/no-projected-files", "example", { store: h.store, owner: h.primary.reference.owner });
  expect(stored.boundary).toEqual(result.locus);
});
it("preserves both orientation fields when repairing a matching Candidate boundary", async () => {
  const h = await fixture();
  await h.attest();
  const prior = lifecycleSuccess(await h.store.read({ reference: h.primary.reference }));
  lifecycleSuccess(await h.store.write({ ...recordPut(prior, { content: writeMetaNextAction(prior.content, "Keep this chosen continuation") }),
    provenance: { verb: "attest", lifecycleAction: "attest" } }));
  await h.rebind();
  const before = lifecycleSuccess(await h.store.read({ reference: h.primary.reference })).content;
  expect(await h.attest()).toMatchObject({ status: "unchanged", locus: { schemaVersion: 2 } });
  expect(lifecycleSuccess(await h.store.read({ reference: h.primary.reference })).content).toBe(before);
});
it("replaces the next action when repairing a Candidate whose boundary is absent", async () => {
  const h = await fixture({ nextAction: "An old continuation" }, true);
  const result = await h.attest();
  expect(result).toMatchObject({ status: "unchanged", locus: { schemaVersion: 2 } });
  if (result.status !== "unchanged") throw new Error("Expected Candidate repair");
  const meta = lifecycleSuccess(await h.store.read({ reference: h.primary.reference }));
  expect(meta.fields).toMatchObject({ nextAction: result.locus.nextAction.interactionText, candidateId: null });
});

it.each(["candidate", "boundary"] as const)("refuses a concurrent %s write without partial publication and succeeds on a fresh invocation", async kind => {
  const h = await fixture({}, kind === "boundary");
  let version: string | undefined;
  h.beforeWrite(async publication => {
    if (kind === "candidate") await h.seedCandidate(h.primary.reference.owner, publication.record);
    else await h.seedBoundary(h.primary.reference.owner, projectCandidateReviewBoundary({ workUnit: publication.name,
      candidateId: publication.candidateId, candidateSubjectDigest: publication.candidateSubjectDigest }, 2));
    version = lifecycleSuccess(await h.store.version());
  });
  await expect(h.attest()).rejects.toThrow("version-conflict");
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
  await h.rebind();
  expect(await h.attest()).toMatchObject({ status: "unchanged", locus: { schemaVersion: 2 } });
});

function changedTarget() {
  return { revision: "b".repeat(40), subject: createCandidateSubjectSnapshot([{ path: "src/example.ts", mode: "100644",
    digest: canonicalDigest({ value: 2 }), treatment: "reviewable" }]) };
}
it("re-roots a shipped stored owner without projected files and retains its superseded Candidate", async () => {
  const h = await fixture({}, true, "Shipped");
  h.target(changedTarget());
  const result = await h.attest({ newRoot: true });
  expect(result).toMatchObject({ status: "attested", operation: "re-root", locus: { schemaVersion: 2 } });
  const stored = await readCandidateRecordVersioned("/no-projected-files", "example", { store: h.store, owner: h.primary.reference.owner });
  expect(stored.record?.attestation.supersedes).toBe(h.record.attestation.candidateId);
  expect(stored.record?.subject).toEqual(changedTarget().subject);
});
it("renews an Integrating Candidate after fresh full convergence evidence and reports merge verification", async () => {
  const h = await fixture({}, true, "Integrating"), target = changedTarget();
  const current = await readCandidateRecordVersioned("/no-projected-files", "example", { store: h.store, owner: h.primary.reference.owner });
  const response = createCandidateReviewResponseEvidence({ candidateId: h.record.attestation.candidateId,
    oldTarget: { revision: h.record.attestation.baseRevision, subject: h.record.subject }, newTarget: target,
    dispositionId: canonicalDigest({ dispositions: "native-integrating-fix" }), approvedBy: "andrew", appliedBy: "codex",
    applicability: "full", approvedVerification: "full", verificationEvidenceRefs: ["verification://reviewed-fix"], implementationChanged: true });
  await writeCandidateRecord("/no-projected-files", "example", { ...h.record, transitions: [response] }, current.version,
    { store: h.store, owner: h.primary.reference.owner });
  h.target(target);
  const version = lifecycleSuccess(await h.store.version());
  expect(await h.attest()).toMatchObject({ status: "refused", reason: "verification-evidence-required",
    nextAction: { kind: "run-verification", verificationKind: "merge" } });
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
  expect(await h.attest({ verificationEvidenceRef: "verification://fresh-native-convergence" })).toMatchObject({
    status: "attested", operation: "convergence", locus: { schemaVersion: 2 } });
  const stored = await readCandidateRecordVersioned("/no-projected-files", "example", { store: h.store, owner: h.primary.reference.owner });
  expect(stored.record?.lineageAttestations).toHaveLength(1);
  expect(stored.record?.lineageAttestations[0]).toMatchObject({ scope: "full",
    verificationEvidenceRef: "verification://fresh-native-convergence" });
});

it("keeps an Active Candidate's matching native readiness binding through unchanged attestation repair", async () => {
  const h = await fixture({}, true), readinessBinding = canonicalDigest({ readiness: 1 });
  const boundary = IntegrationBoundaryLocusV2Schema.parse({ ...boundaryV2Fixture("candidate-publish-ready"),
    candidateId: h.record.attestation.candidateId, candidateSubjectDigest: h.record.subject.subjectDigest,
    reservation: null, readinessBinding });
  await h.seedBoundary(h.primary.reference.owner, boundary);
  await h.rebind();
  expect(await h.attest()).toMatchObject({ status: "unchanged", locus: { schemaVersion: 2,
    locus: "candidate-publish-ready", readinessBinding } });
  expect((await readSubmissionBoundaryVersioned("/no-projected-files", "example", { store: h.store,
    owner: h.primary.reference.owner })).boundary).toEqual(boundary);
});
