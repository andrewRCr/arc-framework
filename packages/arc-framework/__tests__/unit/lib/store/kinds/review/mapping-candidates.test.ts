/** Candidate import retains complete source versions and shared response evidence. */
import { expect, it } from "vitest";
import { mapReviewRecords } from "../../../../../../src/lib/store/kinds/review/mapping.js";
import { createCandidateAttestation, createCandidateSubjectSnapshot, createCandidateReviewResponseEvidence,
  createCandidateLineageAttestation, CandidateManagedRecordV1Schema } from "../../../../../../src/lib/work-unit/candidate-attestation.js";
import { canonicalDigest } from "../../../../../../src/lib/kernel/index.js";
import { candidateRecordFixture } from "../../../../../fixtures/review-candidate.js";
import { createLocalMappingFixture, mappingErrand } from "../../../../../fixtures/review-mapping.js";
import { approvedRecord } from "../../../../../fixtures/review-response-proof.js";
import { assertReviewMapping } from "../../../../../helpers/store/assert-review-mapping.js";
import type { ReviewMappingInput } from "../../../../../../src/lib/store/kinds/review/mapping-types.js";

it("replays every whole Candidate version and joins a repeated response to one evidence record", async () => {
  const { record: original } = candidateRecordFixture();
  const initial = CandidateManagedRecordV1Schema.parse({ ...original, transitions: [], lineageAttestations: [],
    attestation: createCandidateAttestation({ ...original.attestation, subject: original.subject, baseRevision: "c".repeat(40) }) });
  const imported: Pick<ReviewMappingInput, "candidates" | "workItems"> = {
    workItems: [{ kind: "work-unit", slug: "example", uid: mappingErrand.uid, live: true }],
    candidates: [{ workItem: mappingErrand.uid, versions: [{ commit: "a".repeat(40), content: JSON.stringify(initial) }], boundary: null }] };
  const fixture = await createLocalMappingFixture({ imported,
    lineage: { kind: "candidate", candidateId: initial.attestation.candidateId }, vehicle: { kind: "work-unit", identity: "example" } });
  await fixture.conclude();
  const producer = await fixture.resultReader.readResult(fixture.state.operationId);
  const approval = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
  const dispositionId = approval.approvedDispositionLineage[0]!.approvedDisposition.dispositionSet.dispositionSetId;
  const subject = createCandidateSubjectSnapshot([{ ...initial.subject.entries[0]!, digest: canonicalDigest({ source: "fixed" }) }]);
  const response = createCandidateReviewResponseEvidence({ candidateId: initial.attestation.candidateId,
    oldTarget: { revision: initial.attestation.baseRevision, subject: initial.subject },
    newTarget: { revision: "e".repeat(40), subject }, dispositionId, approvedBy: "andrew", appliedBy: "author-1",
    applicability: "full", verificationEvidenceRefs: ["verification://fix"], implementationChanged: true });
  const responded = CandidateManagedRecordV1Schema.parse({ ...initial, transitions: [response] });
  const attestation = createCandidateLineageAttestation({ candidateId: initial.attestation.candidateId, responseId: response.responseId,
    target: response.newTarget, scope: "full", attestedBy: "andrew", attestedAt: "2026-10-19T13:05:00Z",
    verificationEvidenceRef: "verification://convergence" });
  const converged = CandidateManagedRecordV1Schema.parse({ ...responded, lineageAttestations: [attestation] });
  const versions = [initial, responded, converged].map((record, index) => ({ commit: String(index + 1).repeat(40),
    content: JSON.stringify(record, null, 2) + "\n" }));
  imported.candidates[0]!.versions = versions;
  const { recordLaneResponsePerformance } = await import("../../../../../../src/scripts/review-gate/lane-progress.js");
  await recordLaneResponsePerformance(fixture.dependencies.operationStore, { lane: "standard", repositoryId: producer.repositoryId,
    headSha: producer.target.headSha, lineage: producer.admission.lineage, attemptId: producer.producerId,
    dispositionSetId: dispositionId, producedHeadSha: response.newTarget.revision, candidateResponseId: response.responseId,
    now: "2026-10-19T13:04:00Z" });
  const input = fixture.input();
  input.gate.push({ path: "arc/review-gate/evidence/disposition-candidate.json", bytes: new TextEncoder().encode(JSON.stringify({
    ...approval, candidate: { workUnit: "example", candidateId: initial.attestation.candidateId } })) });
  const result = mapReviewRecords(input);
  const candidates = result.records.filter(({ reference }) => reference.kind === "review/candidate");
  expect(candidates).toHaveLength(1);
  expect(candidates[0]!.reference).toEqual({ kind: "review/candidate", owner: { type: "work-item", name: "example", uid: mappingErrand.uid } });
  expect(candidates[0]!.contents).toEqual(versions.map(({ content }) => content));
  expect(result.records.filter(({ reference }) => reference.kind === "review/evidence").map(({ reference }) => reference.key))
    .toEqual([dispositionId]);
  expect(result.listing.filter(({ source }) => source.includes("@"))).toEqual(versions.map(({ commit }) => ({
    source: expect.stringContaining(`@${commit}`), outcome: "mapped", records: [candidates[0]!.reference] })));
  await assertReviewMapping(result);
});

it.each(["schema", "supersession"])("lists a Candidate version refused by today's %s reader", async (refusal) => {
  const { parseCandidateManagedRecord, resolveCandidateSupersessionAncestors } = await import(
    "../../../../../../src/lib/work-unit/candidate-attestation.js");
  const { record } = candidateRecordFixture();
  const invalid = refusal === "schema" ? "{}" : JSON.stringify({ ...record, transitions: [], lineageAttestations: [],
    attestation: createCandidateAttestation({ ...record.attestation, subject: record.subject,
      supersedes: canonicalDigest({ missing: "Candidate" }) }) });
  const parsed = parseCandidateManagedRecord(invalid);
  if (refusal === "schema") expect(parsed).toBeNull();
  else {
    expect(parsed).not.toBeNull();
    expect(() => resolveCandidateSupersessionAncestors(parsed!, [])).toThrow("absent from reachable record history");
  }
  const result = mapReviewRecords({ projectId: "repo-1", gate: [],
    workItems: [{ kind: "work-unit", slug: "example", uid: mappingErrand.uid, live: true }],
    candidates: [{ workItem: mappingErrand.uid, versions: [{ commit: "a".repeat(40), content: invalid }], boundary: null }] });
  expect(result.records).toEqual([]);
  expect(result.listing).toEqual([{ source: expect.stringContaining(`@${"a".repeat(40)}`), outcome: "left-behind",
    reason: expect.stringContaining(refusal === "schema" ? "malformed" : "supersession"), records: [] }]);
  await assertReviewMapping(result);
});

it("preserves the repository path log's supersession identities and inherited response budgets", async () => {
  const { readRepositoryCandidateSupersessionChain } = await import("../../../../../../src/lib/store/kinds/review/candidate/history.js");
  const { resolveCandidateSupersessionAncestors } = await import("../../../../../../src/lib/work-unit/candidate-attestation.js");
  const { resolveCandidateRecordRelativePath } = await import("../../../../../../src/lib/store/kinds/review/paths.js");
  const { scriptGitExec } = await import("../../../../../helpers/git-exec-fake.js");
  const { record: older } = candidateRecordFixture();
  const parent = CandidateManagedRecordV1Schema.parse({ ...older, transitions: [], lineageAttestations: [],
    attestation: createCandidateAttestation({ ...older.attestation, subject: older.subject, baseRevision: "b".repeat(40),
      supersedes: older.attestation.candidateId }) });
  const current = CandidateManagedRecordV1Schema.parse({ ...parent,
    attestation: createCandidateAttestation({ ...parent.attestation, subject: parent.subject, baseRevision: "c".repeat(40),
      supersedes: parent.attestation.candidateId }) });
  const versions = [older, parent, current].map((record, index) => ({ commit: String(index + 1).repeat(40), content: JSON.stringify(record) }));
  const path = resolveCandidateRecordRelativePath("example");
  const { exec } = scriptGitExec([{ match: ["log", "HEAD", "--format=%H", "--", path], responses: [{
    stdout: [...versions].reverse().map(({ commit }) => commit).join("\n") }] },
  ...versions.map(({ commit, content }) => ({ match: ["show", `${commit}:${path}`], responses: [{ stdout: content }] }))]);
  const native = await readRepositoryCandidateSupersessionChain({ cwd: "/candidate", workUnit: "example", record: current, exec });
  const result = mapReviewRecords({ projectId: "repo-1", gate: [],
    workItems: [{ kind: "work-unit", slug: "example", uid: mappingErrand.uid, live: true }],
    candidates: [{ workItem: mappingErrand.uid, versions, boundary: null }] });
  const contents = result.records.find(({ reference }) => reference.kind === "review/candidate")!.contents;
  const mapped = contents.map((content) => CandidateManagedRecordV1Schema.parse(JSON.parse(content)));
  const ancestors = resolveCandidateSupersessionAncestors(mapped.at(-1)!, [...mapped].reverse());
  expect(ancestors).toEqual(native.map(({ recordRevision: ignored, ...facts }) => { void ignored; return facts; }));
  expect(ancestors.map(({ candidateId }) => candidateId)).toEqual([parent.attestation.candidateId, older.attestation.candidateId]);
  expect(ancestors[1]?.reviewResponseCount).toBe(1);
  await assertReviewMapping(result);
});
