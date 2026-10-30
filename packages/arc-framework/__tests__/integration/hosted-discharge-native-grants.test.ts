/** Native hosted discharge releases or reopens a clean terminal review by the extra-pass grants its owner stored. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { bindNativeReviewPorts } from "../helpers/store/native-review-ports.js";
import { collectGitCandidateSubject } from "../../src/lib/work-unit/git-candidate-subject.js";
import { createCandidateAttestation } from "../../src/lib/work-unit/candidate-attestation.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { createReviewDecisionPort } from "../../src/lib/store/kinds/review/decision/access.js";
import { createReviewRequirement, createReviewTarget } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { acknowledgeHostedRequest, recordHostedAwaitAttempt, recordHostedRequestAdmission }
  from "../../src/scripts/review-gate/lane-progress.js";
import { hostedLaneAttemptId } from "../../src/scripts/review-gate/hosted/request.js";
import { createStandardReviewReservation } from "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { createHostedReservationDischargeReader } from "../../src/scripts/review-gate/policy/hosted-reservation-discharge.js";
import { STANDARD_REVIEW_RUBRIC_IDENTITY } from "../../src/scripts/review-gate/policy/standard-review.js";
import { resolveNativeExtraPassJudgment } from "../../src/scripts/review-gate/runtime/native-extra-pass.js";
import { readNativeDecisionSubject } from "../../src/scripts/review-gate/runtime/native-policy-grants.js";
import { handleReviewHostedAwait } from "../../src/handlers/review.js";
import type { HostedProcessRunner } from "../../src/scripts/review-gate/hosted/gh-process.js";

// Admit and acknowledge one hosted request for a work unit's Candidate, configured to one standard pass.
async function hostedReview() {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec } = h.native, store = h.reference.store;
  const git = async (...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  const projectId = "123e4567-e89b-42d3-a456-426614174099", name = "example", branch = "feat/example";
  await h.reference.seedProject(projectId);
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"),
    "branch.base: main\nreview.standard_sources: [codex-pr]\nreview.standard_max_passes: 1\n");
  await writeFile(join(cwd, ".gitignore"), ".arc/system/.internal/\n.arc/user/\n");
  await writeFile(join(cwd, "example.ts"), "export const value = 0;\n");
  await git("add", "."); await git("commit", "-m", "Configure project");
  const baseRevision = await git("rev-parse", "HEAD");
  await git("switch", "-c", branch);
  await writeFile(join(cwd, "example.ts"), "export const value = 1;\n");
  await git("commit", "-am", "Implement example");
  const headSha = await git("rev-parse", "HEAD");
  const collected = await collectGitCandidateSubject({ cwd, name, baseBranch: "main", exec });
  if (collected.status !== "collected") throw new Error(collected.detail);
  const candidate = { schemaVersion: 1 as const, semanticsVersion: "candidate-attestation/v1" as const,
    subject: collected.target.subject, attestation: createCandidateAttestation({ workUnit: name,
      subject: collected.target.subject, baseRevision: collected.target.revision, attestedBy: "andrew",
      attestedAt: "2026-10-30T15:00:00Z", verificationEvidenceRef: "test://verified" }), transitions: [], lineageAttestations: [] };
  const primary = await h.reference.seedMeta(name, { owner: "andrew", branch: null }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: branch, linkedAs: "adopted", excluded: [] }],
  });
  await h.reference.seedCandidate(primary.reference.owner, candidate);
  const owner = primary.reference.owner;
  const ports = bindNativeReviewPorts({ store, owner, publisher: new RepositoryGitCommonStatePublisher(exec, cwd),
    projectId: h.reference.projectId });
  const lineage = { kind: "candidate" as const, candidateId: candidate.attestation.candidateId };
  const target = { repository: "owner/repository", pullRequest: 42, headSha };
  const reviewTarget = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
    repositoryId: projectId, baseRef: "main", diffBaseSha: baseRevision,
    diffBaseTree: await git("rev-parse", `${baseRevision}^{tree}`), headSha, headTree: await git("rev-parse", `${headSha}^{tree}`) });
  const obligation = { obligation: "required" as const, reasons: ["sensitive-change-set" as const],
    rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version, rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest,
    retrigger: "full-final" as const, count: 1 as const };
  const requirement = createReviewRequirement({ target: reviewTarget, projection: obligation,
    acceptableSources: [{ sourceKind: "hosted", qualifier: "codex-pr" }], initialAdmission: "automatic" });
  if (requirement === null) throw new Error("Expected a review requirement");
  const admitted = await recordHostedRequestAdmission(ports.inFlight, { repositoryId: projectId, lineage,
    request: { schemaVersion: 1, target, provider: "codex-pr", coverage: "complete" }, reviewTarget, requirement,
    actorIdentity: "test-reviewer", authorizeCapacity: async () => undefined, now: "2026-10-30T15:01:00.000Z" });
  if (admitted.state !== "admitted") throw new Error(JSON.stringify(admitted));
  const handle = { schemaVersion: 1 as const, provider: "codex-pr" as const, requestedCoverage: "complete" as const,
    effectiveCoverage: "complete" as const, target, admission: admitted.admission,
    artifact: { kind: "issue-comment" as const, id: "request-1", url: "https://example.test/request-1",
      createdAt: "2026-10-30T15:01:00.000Z" } };
  await acknowledgeHostedRequest(ports.inFlight, { admission: admitted.admission, handle, now: handle.artifact.createdAt });
  const reservation = createStandardReviewReservation({ candidateId: lineage.candidateId, sourceId: "codex-pr",
    sources: ["codex-pr"], repository: target.repository, headSha, obligation });
  const reader = createHostedReservationDischargeReader({ ...h.native, workItem: owner });
  const discharge = () => reader({ reservation, approvedHead: headSha, baseRevision,
    changeRequest: { repository: target.repository, pullRequest: target.pullRequest }, candidate });
  const subject = await readNativeDecisionSubject({ ...h.native, workItem: owner, target: reviewTarget, lineage,
    baseBranch: "main", workUnit: name, candidate });
  const grant = (extra: Pick<Parameters<typeof resolveNativeExtraPassJudgment>[0], "additionalPassAuthorization">) =>
    resolveNativeExtraPassJudgment({ facts: { decisions: createReviewDecisionPort(store, owner), readProjectId: h.reference.projectId },
      repositoryId: projectId, subject, lane: "standard", policyTarget: target,
      completedPasses: 1, actor: "andrew", now: "2026-10-30T15:03:00Z", ...extra });
  return { h, ports, projectId, branch, baseRevision, headSha, target, handle, discharge, grant };
}

it("discharges a clean terminal pass at the ceiling, then admits another pass once its owner stores an additional-pass "
  + "grant", async () => {
  const { ports, projectId, target, handle, discharge, grant } = await hostedReview();
  await recordHostedAwaitAttempt(ports.inFlight, { repositoryId: projectId, now: "2026-10-30T15:02:00.000Z",
    result: { schemaVersion: 1, mode: "review-hosted-await", handle, state: "clean", nextAction: "complete",
      reviewUrl: "https://example.test/clean-1" } });

  expect(await discharge()).toMatchObject({ discharged: true, nextSource: null });
  await grant({ additionalPassAuthorization: { target, lane: "standard", precedingProducerId: hostedLaneAttemptId(handle),
    completedPasses: 1, nextPass: 2 } });
  expect(await discharge()).toMatchObject({ discharged: false, nextSource: "codex-pr", terminalPolicyState: "ready",
    detail: "The recorded extra-pass judgment admits another review.", requestCoverage: "complete", completedPasses: 1,
    terminalAttempt: { sourceId: "codex-pr", outcome: "clean", reviewOperationId: hostedLaneAttemptId(handle) } });
}, 40_000);

it("follows the pending await a native discharge emits, from a checkout naming no work item, to its clean verdict",
  async () => {
    const { h, branch, baseRevision, headSha, target, discharge } = await hostedReview();
    const pending = await discharge();
    expect(pending).toMatchObject({ discharged: false, nextSource: null, awaitAction: { operationRef: expect.any(String) } });
    const hostedRunner: HostedProcessRunner = { run: async args => {
      const endpoint = args[1] ?? "";
      const value = endpoint === `repos/${target.repository}/pulls/42` ? { number: 42, state: "open", merged: false,
        draft: false, head: { ref: branch, sha: headSha, repo: { full_name: target.repository } },
        base: { ref: "main", sha: baseRevision, repo: { full_name: target.repository } } }
        : endpoint.startsWith(`repos/${target.repository}/issues/42/comments?`) ? [[{ node_id: "clean-comment",
          html_url: "https://example.test/clean-1", user: { id: 199175422 }, performed_via_github_app: { id: 1144995 },
          body: `Codex Review: didn't find any major issues\nReviewed commit: ${headSha}`,
          created_at: "2026-10-30T15:02:00Z", updated_at: "2026-10-30T15:02:00Z" }]]
        : endpoint.startsWith(`repos/${target.repository}/pulls/42/reviews?`) ? [[]]
        : endpoint === "graphql" ? { data: { repository: { pullRequest: {
          reviewThreads: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } } }
        : undefined;
      if (args[0] !== "api" || value === undefined) throw new Error(`Unexpected hosted command: ${args.join(" ")}`);
      return { stdout: JSON.stringify(value), stderr: "" };
    } };
    let output = "";
    await handleReviewHostedAwait("-", { readText: async () => JSON.stringify(pending.awaitAction),
      write: text => { output += text; }, setExitCode: () => undefined }, undefined, { ...h.native, hostedRunner });
    expect(JSON.parse(output)).toMatchObject({ state: "clean", nextAction: "complete" });
    expect(await discharge()).toMatchObject({ discharged: true, nextSource: null });
  }, 40_000);
