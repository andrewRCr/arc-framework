/** Default incremental policy resolves its Candidate through the stored adopted branch. */
import { boundWorkUnitSubject } from "../helpers/store/bound-checkout.js";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { localOutcome } from "../fixtures/review-outcome.js";
import { collectGitCandidateSubject } from "../../src/lib/work-unit/git-candidate-subject.js";
import { createCandidateAttestation } from "../../src/lib/work-unit/candidate-attestation.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { createReviewOutcomePort } from "../../src/lib/store/kinds/review/outcome/access.js";
import { ReviewOutcomeSchema } from "../../src/lib/store/kinds/review/outcome/schema.js";
import { createReviewCompositionContext } from "../../src/scripts/review-gate/runtime/composition-context.js";
import { deriveLocalReviewTarget } from "../../src/scripts/review-gate/hosts/local/repository-target.js";
import { readLaneProgress } from "../../src/scripts/review-gate/lane-progress.js";
import { projectReviewPolicyAttempt, ReviewResolveEnvelopeSchema } from "../../src/scripts/review-gate/policy/review-policy-driver.js";
import { handleReviewResolve } from "../../src/handlers/review.js";

it("accepts an incremental chain through the default Candidate applicability callback without a projected meta", async () => {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec } = h.native;
  const git = async (...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  const projectId = "123e4567-e89b-42d3-a456-426614174099", branch = "topic/opaque";
  await h.reference.seedProject(projectId);
  const primary = await h.reference.seedMeta("example", { owner: "andrew", branch: null, workClass: "Light" }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: branch, linkedAs: "adopted", excluded: [] }],
  });
  await git("config", "arc.identity", "andrew");
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"),
    "branch.base: main\nreview.standard_sources: [delegated-agent]\nreview.standard_max_passes: 3\n");
  await writeFile(join(cwd, ".gitignore"), ".arc/system/.internal/\n.arc/user/\n");
  await writeFile(join(cwd, "example.ts"), "export const value = 0;\n");
  await git("add", ".");
  await git("commit", "-m", "Configure incremental review");
  const base = await git("rev-parse", "HEAD");
  await git("switch", "-c", branch);
  await writeFile(join(cwd, "example.ts"), "export const value = 1;\n");
  await git("commit", "-am", "Implement example");
  await writeWorktreeMarker(cwd, { spawnedByArc: false, spawningIdentity: "andrew", createdAt: "2026-10-20T15:00:00Z",
    createdFor: boundWorkUnitSubject(primary) });
  const collected = await collectGitCandidateSubject({ cwd, name: "example", baseBranch: "main", exec });
  if (collected.status !== "collected") throw new Error(collected.detail);
  const attestation = createCandidateAttestation({ workUnit: "example", subject: collected.target.subject,
    baseRevision: base, attestedBy: "andrew", attestedAt: "2026-10-20T15:00:00Z", verificationEvidenceRef: "test://verified" });
  await h.reference.seedCandidate(primary.reference.owner, { schemaVersion: 1, semanticsVersion: "candidate-attestation/v1",
    attestation, subject: collected.target.subject, transitions: [], lineageAttestations: [] });
  const target = await deriveLocalReviewTarget({ cwd, exec, repositoryId: projectId, baseRef: "main" });
  const lineage = { kind: "candidate" as const, candidateId: attestation.candidateId };
  const options = { target, lineage, vehicle: { kind: "work-unit" as const, identity: "example" }, retrigger: "incremental" as const };
  const predecessor = ReviewOutcomeSchema.parse(localOutcome(options));
  const current = ReviewOutcomeSchema.parse(localOutcome({ ...options, logicalPass: 2,
    coverageAdmission: { requestedCoverage: "incremental", correctionScope: { schemaVersion: 1,
      predecessorProducerId: predecessor.attemptId, predecessorHeadSha: target.headSha,
      basisHeadSha: target.headSha, headSha: target.headSha, requiredFindings: [] } } }));
  const outcomes = createReviewOutcomePort(h.reference.store, primary.reference.owner);
  await outcomes.create(predecessor);
  await outcomes.create(current);
  const context = createReviewCompositionContext({ ...h.native, workItem: primary.reference.owner });
  const lane = await readLaneProgress(context.family.ports.inFlight, { lane: "standard", repositoryId: projectId,
    headSha: target.headSha, lineage });
  if (lane.status !== "recorded") throw new Error("Expected the produced native lane");
  const { obligation, reasons, rubricVersion, rubricDigest, retrigger, count } = current.requirement!;
  const request = { schemaVersion: 1, lane: "standard",
    target: { repository: "owner/repo", pullRequest: 42, headSha: target.headSha },
    standardReview: { obligation, reasons, rubricVersion, rubricDigest, retrigger, count },
    completedPasses: lane.completedPasses, attempts: lane.attempts.filter(attempt => attempt.logicalPass === 2).map(projectReviewPolicyAttempt) };
  let output = "";
  const exits: number[] = [];
  await handleReviewResolve("-", { resolveRoot: () => cwd, readText: async () => JSON.stringify(request),
    write: text => { output += text; }, setExitCode: code => exits.push(code) }, undefined,
  { store: h.reference.store, projectId: h.reference.projectId });
  expect(exits, output).toEqual([]);
  expect(ReviewResolveEnvelopeSchema.parse(JSON.parse(output))).toMatchObject({ state: "pass-complete",
    payload: { pass: 2, completedPasses: 2, verifiedTerminalSignal: { coverageAdequate: true } } });
  await expect(access(join(cwd, ".arc/active/meta-example.md"))).rejects.toMatchObject({ code: "ENOENT" });
}, 30_000);
