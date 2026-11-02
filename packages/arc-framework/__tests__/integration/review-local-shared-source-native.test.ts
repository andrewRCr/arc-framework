/** Terminal native owners retain a shared materialization until its last live review completes. */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { localReviewResult } from "../helpers/in-process-review.js";
import { handleReviewLocalPrepare, handleReviewLocalAttest, handleReviewLocalCancel } from "../../src/handlers/review.js";
import { LocalPrepareEnvelopeSchema } from "../../src/scripts/review-gate/core/review-command-envelope.js";
import { createReviewCompositionContext } from "../../src/scripts/review-gate/runtime/composition-context.js";
import { bindNativeReviewOperationReference } from "../../src/scripts/review-gate/core/review-operation-reference.js";
import { collectGitCandidateSubject } from "../../src/lib/work-unit/git-candidate-subject.js";
import { createCandidateAttestation } from "../../src/lib/work-unit/candidate-attestation.js";
import type { OwnerIdentity } from "../../src/lib/store/identity.js";
import { projectCandidateReviewBoundary } from "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";

async function fixture() {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec } = h.native;
  const git = async (...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  const repositoryId = "123e4567-e89b-42d3-a456-426614174099";
  await h.reference.seedProject(repositoryId);
  await git("config", "arc.identity", "andrew");
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"),
    "branch.base: main\nreview.standard_sources: [delegated-agent]\nreview.standard_max_passes: 4\n");
  await writeFile(join(cwd, ".gitignore"), ".arc/system/.internal/\n.arc/user/\n");
  await writeFile(join(cwd, "example.ts"), "export const value = 0;\n");
  await git("add", ".");
  await git("commit", "-m", "Configure review");
  const baseRevision = await git("rev-parse", "HEAD");
  await git("switch", "-c", "topic/opaque");
  await writeFile(join(cwd, "example.ts"), "export const value = 1;\n");
  await git("commit", "-am", "Implement example");
  const primary = await h.reference.seedMeta("example", { owner: "andrew", branch: null, workClass: "Light" }, { kind: "active" }, {
    branches: [{ repository: repositoryId, ref: "topic/opaque", linkedAs: "adopted", excluded: [] }],
  });
  const collected = await collectGitCandidateSubject({ cwd, name: "example", baseBranch: "main", exec });
  if (collected.status !== "collected") throw new Error(collected.detail);
  const attestation = createCandidateAttestation({ workUnit: "example", subject: collected.target.subject, baseRevision,
    attestedBy: "andrew", attestedAt: "2026-11-01T12:00:00Z", verificationEvidenceRef: "test://verified" });
  await h.reference.seedCandidate(primary.reference.owner, { schemaVersion: 1, semanticsVersion: "candidate-attestation/v1",
    attestation, subject: collected.target.subject, transitions: [], lineageAttestations: [] });
  await h.reference.seedBoundary(primary.reference.owner, projectCandidateReviewBoundary({ workUnit: "example",
    candidateId: attestation.candidateId, candidateSubjectDigest: collected.target.subject.subjectDigest }, 2));
  await writeWorktreeMarker(cwd, { spawnedByArc: false, spawningIdentity: "andrew", createdAt: "2026-11-01T12:00:00Z",
    createdFor: { kind: "work-unit", name: "example" } });
  const invoke = async (handler: typeof handleReviewLocalPrepare | typeof handleReviewLocalAttest | typeof handleReviewLocalCancel,
    request: unknown, workItem: OwnerIdentity = primary.reference.owner) => {
    let output = "";
    const exits: number[] = [];
    await handler("-", { resolveRoot: () => cwd, readText: async () => JSON.stringify(request),
      write: text => { output += text; }, setExitCode: code => exits.push(code) }, undefined, { ...h.native, workItem });
    expect(exits, output).toEqual([]);
    return JSON.parse(output) as { state: string };
  };
  const prepared = LocalPrepareEnvelopeSchema.parse(await invoke(handleReviewLocalPrepare, { schemaVersion: 1,
    evaluatorIdentity: "independent-reviewer", routingFacts: { contentKind: "code-bearing", reviewRisk: "routine",
      changeDeterminacy: "ordinary", ownership: "self", surfaceAuthority: "ordinary" } }));
  if (prepared.state !== "ready") throw new Error(JSON.stringify(prepared));
  const originalFamily = createReviewCompositionContext({ ...h.native, workItem: primary.reference.owner }).family;
  if (originalFamily.mode !== "stored") throw new Error("Expected stored review family");
  const original = originalFamily.ports;
  const snapshot = await original.inFlight.readOperationSnapshot();
  if (snapshot.status !== "complete") throw new Error(snapshot.reason);
  const sibling = await h.reference.seedMeta("other-review-owner", { owner: "andrew", branch: null, workClass: "Light" });
  const secondFamily = createReviewCompositionContext({ ...h.native, workItem: sibling.reference.owner }).family;
  if (secondFamily.mode !== "stored") throw new Error("Expected stored sibling review family");
  const second = secondFamily.ports;
  for (const { state } of snapshot.records) await second.inFlight.publishOperation({ ...state, workItem: sibling.reference.owner }, 0);
  const request = (workItem: OwnerIdentity) => ({ schemaVersion: 1, operationId: prepared.payload.operationId,
    operationRef: bindNativeReviewOperationReference({ repositoryId, workItem, operationId: prepared.payload.operationId }) });
  const pins = () => git("for-each-ref", "--format=%(refname)", `refs/arc/review/local/${prepared.payload.operationId}`,
    `refs/arc/review/local-scope/${prepared.payload.operationId}/`);
  return { ...h, git, invoke, prepared: prepared.payload, primary, sibling, original, second, request, pins };
}

it.each(["cancel", "attest", "failed-attest"] as const)("retains another owner's source after %s and releases after final cancellation", async action => {
  const h = await fixture(), root = h.prepared.reviewerPayload.reviewRoot;
  const retainedPins = await h.pins();
  expect(retainedPins).not.toBe("");
  const bytes = await readFile(join(root, "example.ts"), "utf8");
  const request = action === "cancel" ? h.request(h.primary.reference.owner)
    : { ...localReviewResult(h.prepared, "shared-source-result", []), ...h.request(h.primary.reference.owner),
      ...(action === "failed-attest" ? { result: { status: "failed", result: null, evaluatorIdentity: h.prepared.request.evaluatorIdentity,
        reviewRunId: "failed-shared-source", applicabilityId: null, findings: [] } } : {}) };
  const handler = action === "cancel" ? handleReviewLocalCancel : handleReviewLocalAttest;
  await h.invoke(handler, request);
  expect(await h.original.outcomes.read(h.prepared.operationId)).not.toBeNull();
  expect(await h.second.outcomes.read(h.prepared.operationId)).toBeNull();
  expect(await readFile(join(root, "example.ts"), "utf8")).toBe(bytes);
  expect(await h.pins()).toBe(retainedPins);
  await h.invoke(handler, request);
  expect(await h.pins()).toBe(retainedPins);
  await h.invoke(handleReviewLocalCancel, h.request(h.sibling.reference.owner), h.sibling.reference.owner);
  expect(await h.second.outcomes.read(h.prepared.operationId)).not.toBeNull();
  await expect(access(root)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await h.pins()).toBe("");
}, 60_000);
