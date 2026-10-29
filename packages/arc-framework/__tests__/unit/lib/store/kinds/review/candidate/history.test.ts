/** Candidate history retains versions a path-following store history can omit. */
import { expect, it, onTestFinished } from "vitest";
import { readRepositoryCandidateSupersessionChain, readRepositoryCandidateRecordRevision } from
  "../../../../../../../src/lib/store/kinds/review/candidate/history.js";
import { createStore } from "../../../../../../../src/lib/store/create.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../../../../src/lib/store/identity.js";
import { createCandidateAttestation, serializeCandidateManagedRecord } from
  "../../../../../../../src/lib/work-unit/candidate-attestation.js";
import { candidateFixture } from "../../../../../../helpers/store/tracked-write-fixture.js";
import { scriptGitExec, scriptGitExecInput } from "../../../../../../helpers/git-exec-fake.js";
import { testStorePorts } from "../../../../../../helpers/store/in-repo-ports.js";
import { success } from "../../../../../../helpers/store/suite-tools.js";
import { createReviewHarness } from "../../../../../../helpers/store/review-harness.js";
import { lifecycleSuccess } from "../../../../../../helpers/store/lifecycle-harness.js";
import { writeCandidateRecord } from "../../../../../../../src/lib/store/kinds/review/candidate/access.js";
import { createLocalReviewCandidateReader } from "../../../../../../../src/scripts/review-gate/runtime/local-prepare-composition.js";
import { createReviewCheckout } from "../../../../../../helpers/store/review-checkout.js";
import { createLocalReviewPreparationFixture } from "../../../../../../fixtures/local-review-preparation.js";
import { prepareLocalReview } from "../../../../../../../src/scripts/review-gate/runtime/local-prepare.js";
import { createReviewCompositionContext } from "../../../../../../../src/scripts/review-gate/runtime/composition-context.js";
import { createReviewReceipt } from "../../../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { readCandidateInheritedLaneProgress, recordLocalReceiptConclusion } from "../../../../../../../src/scripts/review-gate/lane-progress.js";

const oid = (character: string) => character.repeat(40);
const path = ".arc/system/.internal/candidates/example.json";
const merge = oid("d"), older = oid("a"), head = oid("e");

function fixture() {
  const grandparent = candidateFixture();
  const predecessor = { ...grandparent, attestation: createCandidateAttestation({ ...grandparent.attestation,
    subject: grandparent.subject, baseRevision: oid("b"), attestedAt: "2026-08-13T14:00:00Z",
    supersedes: grandparent.attestation.candidateId }) };
  const current = { ...predecessor, attestation: createCandidateAttestation({ ...predecessor.attestation,
    subject: predecessor.subject, baseRevision: oid("c"), attestedAt: "2026-08-14T14:00:00Z",
    supersedes: predecessor.attestation.candidateId }) };
  const grandparentContent = serializeCandidateManagedRecord(grandparent);
  const { exec } = scriptGitExec([
    { match: ["log", "HEAD", "--format=%H", "--", path], responses: [{ stdout: `${merge}\n${older}\n` }] },
    { match: ["log", head, "--format=%H", "--", path], responses: [{ stdout: `${merge}\n${older}\n` }] },
    { match: ["show", `${merge}:${path}`], responses: [{ stdout: serializeCandidateManagedRecord(predecessor) }] },
    { match: ["show", `${older}:${path}`], responses: [{ stdout: grandparentContent }] },
    { match: ["log", "--follow", "--topo-order", "--format=%H", "HEAD", "--", `:(literal)${path}`],
      responses: [{ stdout: `${older}\n` }] },
    { match: ["ls-tree", "-z", older, "--", `:(literal)${path}`],
      responses: [{ stdout: `100644 blob ${oid("f")}\t${path}\0` }] },
    { match: ["diff-tree", "--root", "--no-commit-id", "-r", "-M", "--name-status", "-z", older],
      responses: [{ stdout: "" }] },
  ]);
  const { exec: execInput } = scriptGitExecInput([
    { match: ["show", `${older}:${path}`], responses: [grandparentContent] },
    { match: ["cat-file", "commit", older], responses: [`tree ${oid("f")}\n\nInitial Candidate\n`] },
  ]);
  return { grandparent, predecessor, current, grandparentContent, exec,
    store: createStore(testStorePorts("/candidate", exec, execInput)) };
}

it("retains the linked version introduced by a merge commit instead of using the store's path-following history", async () => {
  const h = fixture();
  const reference = recordReferences["review/candidate"](OwnerIdentitySchema.parse({ type: "work-item", name: "example" }));
  expect(success(await h.store.history({ reference })).map((entry) => entry.content)).toEqual([h.grandparentContent]);
  await expect(readRepositoryCandidateSupersessionChain({ cwd: "/candidate", workUnit: "example", record: h.current, exec: h.exec }))
    .resolves.toEqual([
      { candidateId: h.predecessor.attestation.candidateId, baseRevision: h.predecessor.attestation.baseRevision,
        recordRevision: merge, reviewResponseCount: 0 },
      { candidateId: h.grandparent.attestation.candidateId, baseRevision: h.grandparent.attestation.baseRevision,
        recordRevision: older, reviewResponseCount: 0 },
    ]);
});

it("locates a Candidate's merge-introduced record revision at the review head", async () => {
  const h = fixture();
  await expect(readRepositoryCandidateRecordRevision({ cwd: "/candidate", workUnit: "example",
    candidateId: h.predecessor.attestation.candidateId, reviewHeadSha: head, exec: h.exec })).resolves.toBe(merge);
});

async function storedFixture() {
  const h = fixture(), native = createReviewHarness(), primary = await native.seedMeta("example");
  const grandparent = await native.seedCandidate(primary.reference.owner, h.grandparent);
  lifecycleSuccess(await native.store.write({ action: "remove", reference: grandparent.reference,
    expected: grandparent.version, provenance: { verb: "remove", lifecycleAction: "remove" } }));
  const predecessor = await native.seedCandidate(primary.reference.owner, h.predecessor);
  await writeCandidateRecord("/unavailable", "example", h.current, predecessor.version,
    { store: native.store, owner: primary.reference.owner });
  const storedCurrent = lifecycleSuccess(await native.store.read({ reference: predecessor.reference }));
  const input = { cwd: "/unavailable", workUnit: "example", record: h.current, exec: scriptGitExec([]).exec,
    store: native.store, workItem: primary.reference.owner };
  return { ...h, native, primary, input, predecessorVersion: predecessor.version,
    grandparentVersion: grandparent.version, currentVersion: storedCurrent.version };
}

it("walks the same native supersession chain across a removal and retains each store version", async () => {
  const h = await storedFixture();
  const repository = await readRepositoryCandidateSupersessionChain({ cwd: "/candidate", workUnit: "example",
    record: h.current, exec: h.exec });
  await expect(readRepositoryCandidateSupersessionChain(h.input)).resolves.toEqual(repository.map((ancestor, index) => ({
    ...ancestor, recordRevision: index === 0 ? h.predecessorVersion : h.grandparentVersion,
  })));
});

it("locates the exact Candidate record's store version without reading a Git path", async () => {
  const h = await storedFixture();
  await expect(readRepositoryCandidateRecordRevision({ ...h.input,
    candidateId: h.predecessor.attestation.candidateId, reviewHeadSha: head })).resolves.toBe(h.predecessorVersion);
});

it("retains native history when local preparation reads Candidate ancestors", async () => {
  const h = await storedFixture();
  await expect(createLocalReviewCandidateReader(h.input).readSupersessionAncestors("example", h.current.attestation.candidateId))
    .resolves.toEqual(await readRepositoryCandidateSupersessionChain(h.input));
});

it("refuses a malformed linked historical version and walks it after repair", async () => {
  const h = await storedFixture();
  const damaged = new Proxy(h.native.store, { get(target, key) {
    if (key !== "history") return Reflect.get(target, key, target) as unknown;
    return async (input: Parameters<typeof target.history>[0]) => {
      const result = await target.history(input);
      return result.status === "refused" ? result : { ...result, result: result.result.map(entry =>
        entry.version === h.currentVersion ? { ...entry,
          content: JSON.stringify({ ...h.predecessor, subject: {} }) } : entry) };
    };
  } });
  await expect(readRepositoryCandidateSupersessionChain({ ...h.input, store: damaged }))
    .rejects.toThrow(`store version ${h.currentVersion}`);
  await expect(readRepositoryCandidateSupersessionChain(h.input)).resolves.toHaveLength(2);
});

it("names the clone's pending predecessor and inherits its pass after the review ends", async () => {
  const h = await storedFixture(), repositoryId = "123e4567-e89b-42d3-a456-426614174099";
  await h.native.seedProject(repositoryId);
  const checkout = await createReviewCheckout(h.native);
  onTestFinished(checkout.cleanup);
  const prepared = createLocalReviewPreparationFixture({ repositoryId });
  prepared.resolveLineage.mockResolvedValue({ kind: "candidate", candidateId: h.predecessor.attestation.candidateId });
  const result = await prepareLocalReview({ schemaVersion: 1, evaluatorIdentity: "evaluator-1",
    routingFacts: { contentKind: "code-bearing", reviewRisk: "routine", changeDeterminacy: "ordinary",
      ownership: "self", surfaceAuthority: "ordinary" }, policyJudgment: { scopeMode: "whole-target" } }, prepared.dependencies);
  const local = prepared.published(), lane = prepared.laneProgress();
  if (result.state !== "ready" || local?.kind !== "local-review" || lane?.kind !== "lane-progress") {
    throw new Error(JSON.stringify(result));
  }
  const { family } = createReviewCompositionContext({ ...checkout, workItem: h.primary.reference.owner });
  await family.ports.inFlight.publishOperation(local, 0);
  await family.ports.inFlight.publishOperation(lane, 0);
  const input = { lane: "standard" as const, repositoryId, headSha: local.target.headSha,
    ancestors: await readRepositoryCandidateSupersessionChain(h.input) };
  await expect(readCandidateInheritedLaneProgress(family.ports.inFlight, input))
    .rejects.toThrow(`Finish or resume attempt ${local.operationId} on this clone`);
  const receipt = createReviewReceipt({ target: local.target, requirement: local.requirement, request: local.request,
    applicabilityId: null, reviewRunId: "completed-predecessor", evaluatorIdentity: local.request.evaluatorIdentity,
    attestingRuntimeIdentity: local.attestation.runtimeIdentity, attestationMechanism: local.attestation.mechanism,
    providerEventIdentity: null, result: "clean", findings: [] });
  await recordLocalReceiptConclusion(family.ports.inFlight, { state: local, receipt, now: local.updatedAt });
  await expect(readCandidateInheritedLaneProgress(family.ports.inFlight, input))
    .resolves.toMatchObject({ inheritedCompletedPasses: 1, inheritedCompletePasses: 1 });
});
