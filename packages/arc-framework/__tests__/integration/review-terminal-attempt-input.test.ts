import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { createReviewRequirement } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { ReviewCommandErrorEnvelopeSchema } from "../../src/scripts/review-gate/core/review-command-envelope.js";
import { createHostedAdmission } from "../../src/scripts/review-gate/hosted/request.js";
import { resolveRepositoryIdentity } from "../../src/scripts/review-gate/hosts/local/git-common-state.js";
import { LocalReviewOperationStateStore } from "../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import { deriveLocalReviewTarget } from "../../src/scripts/review-gate/hosts/local/repository-target.js";
import { laneProgressOperationId } from "../../src/scripts/review-gate/lane-progress.js";
import { ReviewPolicyCommandRequestSchema } from "../../src/scripts/review-gate/policy/review-policy-driver.js";
import { STANDARD_REVIEW_RUBRIC_IDENTITY } from "../../src/scripts/review-gate/policy/standard-review.js";
import { createCleanFrontlineFixture } from "../fixtures/frontline-review.js";
import { LocalFrontlineOutcomeStore } from "../../src/scripts/review-gate/hosts/local/frontline-outcome-store.js";
import { responsePolicyRequestFixture } from "../fixtures/review-response-policy.js";
import { createHostedTerminalAttemptFixture, publishHostedTerminalProgressFixture } from "../fixtures/hosted-review.js";
import { makeGitExec } from "../helpers/integration.js";
import { runCli } from "../helpers/run-cli.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => removeGitBackedDir(root)));
});

describe("terminal attempt recovery through the CLI and repository records", () => {
  it.each(["short pass count", "duplicate source", "forced source", "grant progress"])("recovers %s through the unchanged terminal producer", async scenario => {
    const root = await createTempRepoCore({ prefix: "arc-terminal-input-", identity: "andrew" });
    roots.push(root);
    const exec = makeGitExec(root);
    await mkdir(join(root, ".arc/system"), { recursive: true });
    const provider = scenario === "forced source" ? "coderabbit-pr" : "codex-pr";
    await writeFile(join(root, ".arc/system/arc-config.yml"),
      "review.standard_sources: [codex-pr, coderabbit-pr]\nreview.standard_max_passes: 2\n");
    await exec("git", ["add", "."]);
    await exec("git", ["commit", "-m", "base"]);
    await exec("git", ["switch", "-c", "feature"]);
    await exec("git", ["commit", "--allow-empty", "-m", "review target"]);
    const publisher = new RepositoryGitCommonStatePublisher(exec, root);
    const repositoryId = await resolveRepositoryIdentity(publisher);
    const reviewTarget = await deriveLocalReviewTarget({ exec, cwd: root, baseRef: "main", repositoryId });
    const target = { repository: "owner/repo", pullRequest: 42, headSha: reviewTarget.headSha };
    const standardReview = {
      obligation: "required" as const, reasons: ["sensitive-change-set" as const],
      rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version, rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest,
      retrigger: "full-final" as const, count: 1 as const,
    };
    const requirement = createReviewRequirement({ target: reviewTarget, projection: standardReview,
      acceptableSources: [{ sourceKind: "hosted", qualifier: provider }], initialAdmission: "automatic" });
    if (requirement === null) throw new Error("expected hosted review requirement");
    const lineage = { kind: "head-bound" as const, vehicleKind: "review-target" as const,
      vehicleIdentity: reviewTarget.targetId, headSha: target.headSha };
    const store = new LocalReviewOperationStateStore(publisher);
    const operationId = laneProgressOperationId({ lane: "standard", repositoryId, headSha: target.headSha, lineage });
    let producerId = "";
    for (const logicalPass of [1, 2]) {
      const admission = createHostedAdmission({ schemaVersion: 1, repositoryId, lineage, logicalPass,
        sourceId: provider, target, requestedCoverage: "complete", reviewTarget, requirement,
        actorIdentity: "github-user-1" });
      const terminal = createHostedTerminalAttemptFixture({ admission, outcome: "clean" });
      producerId = terminal.attemptId;
      await publishHostedTerminalProgressFixture(store, { operationId, repositoryId, lineage, logicalPass,
        changeRequestId: "pull/42", headSha: target.headSha, sourceId: provider, outcome: "clean", terminal,
        now: "2026-10-13T00:00:00Z" });
    }
    const request = ReviewPolicyCommandRequestSchema.parse({ schemaVersion: 1, target, lane: "standard",
      frontlineActive: false, standardReview, completedPasses: scenario === "short pass count" ? 1 : scenario === "grant progress" ? 3 : 2,
      attempts: scenario !== "duplicate source"
        ? [{ sourceId: "codex-pr", outcome: "clean", reviewOperationId: producerId }]
        : [{ sourceId: "codex-pr", outcome: "rate-limited" },
          { sourceId: "coderabbit-pr", outcome: "clean", reviewOperationId: producerId }],
      scopeSelection: { mode: "whole-target", target }, invocation: { mode: "force", sourceId: "codex-pr" },
      ...(scenario === "grant progress" ? {
        ceilingOverride: { target, lane: "standard", exhaustedPassCount: 2, nextPass: 3 },
        additionalPassAuthorization: { target, lane: "standard", precedingProducerId: producerId, completedPasses: 3, nextPass: 4 },
      } : {}) });
    const input = join(root, ".git/terminal-request.json");
    await writeFile(input, JSON.stringify(request));
    const before = await store.readOperation(operationId);
    const refusal = await runCli(["review", "resolve", input], { cwd: root });
    expect(refusal.exitCode, refusal.stderr).toBe(1);
    const error = ReviewCommandErrorEnvelopeSchema.parse(JSON.parse(refusal.stdout));
    expect(error.error.code).toBe("invalid-input");
    if (!("remedy" in error) || error.remedy === undefined) throw new Error("expected a corrected-input remedy");
    expect(error.remedy.text).toContain(scenario === "short pass count" || scenario === "grant progress" ? "completedPasses to 2" : `sourceId to ${provider}`);
    expect(error.remedy.argv).toEqual(["arc", "review", "resolve", "-"]);
    const { invocation, ...expectedRequest } = request;
    delete expectedRequest.ceilingOverride;
    delete expectedRequest.additionalPassAuthorization;
    expect(error.remedy.stdin).toMatchObject({ ...expectedRequest, completedPasses: 2,
      attempts: [{ sourceId: provider, outcome: "clean", reviewOperationId: producerId }] });
    expect(ReviewPolicyCommandRequestSchema.parse(error.remedy.stdin).invocation)
      .toEqual(scenario === "forced source" ? undefined : invocation);
    if (scenario === "grant progress") {
      expect(error.remedy.stdin).not.toHaveProperty("ceilingOverride");
      expect(error.remedy.stdin).not.toHaveProperty("additionalPassAuthorization");
    }
    await writeFile(input, JSON.stringify(error.remedy.stdin));
    const replay = await runCli(["review", "resolve", input], { cwd: root });
    expect(replay.exitCode, replay.stderr).toBe(0);
    expect(JSON.parse(replay.stdout)).toMatchObject({ state: "pass-complete", nextAction: "none",
      payload: { completedPasses: 2, verifiedTerminalSignal: { coverageAdequate: true, confirmedFindingCount: 0 } } });
    expect(await store.readOperation(operationId)).toEqual(before);
  });

  it("replays a lane correction using its own configured ceiling and no wrong-lane grants", async () => {
    const root = await createTempRepoCore({ prefix: "arc-terminal-lane-", identity: "andrew" });
    roots.push(root);
    const exec = makeGitExec(root);
    await mkdir(join(root, ".arc/system"), { recursive: true });
    await writeFile(join(root, ".arc/system/arc-config.yml"),
      "review.standard_sources: [codex-pr]\nreview.standard_max_passes: 3\n"
      + "review.frontline_sources: [coderabbit-cli]\nreview.frontline_max_passes: 2\n");
    await exec("git", ["add", "."]);
    await exec("git", ["commit", "-m", "base"]);
    await exec("git", ["switch", "-c", "feature"]);
    await exec("git", ["commit", "--allow-empty", "-m", "review target"]);
    const publisher = new RepositoryGitCommonStatePublisher(exec, root);
    const repositoryId = await resolveRepositoryIdentity(publisher);
    const target = await deriveLocalReviewTarget({ exec, cwd: root, baseRef: "main", repositoryId });
    const { admission, run, lane, outcomeRecord } = createCleanFrontlineFixture(target);
    const store = new LocalReviewOperationStateStore(publisher);
    const outcomes = new LocalFrontlineOutcomeStore(publisher);
    await store.publishOperation(run, 0);
    await store.publishOperation(lane, 0);
    await outcomes.appendOutcome(outcomeRecord, 0);
    const request = responsePolicyRequestFixture({ headSha: target.headSha,
      sourceId: "codex-pr", reviewOperationId: admission.operationId });
    const input = join(root, ".git/terminal-request.json");
    await writeFile(input, JSON.stringify({ ...request, frontlineActive: true,
      attempts: request.attempts.map(attempt => ({ ...attempt, outcome: "clean" })),
      ceilingOverride: { target: request.target, lane: "standard", exhaustedPassCount: 0, nextPass: 1 },
      additionalPassAuthorization: { target: request.target, lane: "standard",
        precedingProducerId: admission.operationId, completedPasses: 1, nextPass: 2 } }));
    const before = await store.readOperationSnapshot();
    const outcomeBefore = await outcomes.readOutcome(admission.operationId);
    const refusal = await runCli(["review", "resolve", input], { cwd: root });
    expect(refusal.exitCode, refusal.stderr).toBe(1);
    const error = ReviewCommandErrorEnvelopeSchema.parse(JSON.parse(refusal.stdout));
    expect(error.error.code).toBe("invalid-input");
    if (!("remedy" in error) || error.remedy === undefined) throw new Error("expected a corrected-input remedy");
    expect(error.remedy.stdin).toMatchObject({ lane: "frontline", completedPasses: 1,
      attempts: [{ sourceId: "coderabbit-cli", reviewOperationId: admission.operationId, outcome: "clean" }] });
    expect(error.remedy.stdin).not.toHaveProperty("ceilingOverride");
    expect(error.remedy.stdin).not.toHaveProperty("additionalPassAuthorization");
    await writeFile(input, JSON.stringify(error.remedy.stdin));
    const replay = await runCli(["review", "resolve", input], { cwd: root });
    expect(replay.exitCode, replay.stderr).toBe(0);
    expect(JSON.parse(replay.stdout)).toMatchObject({ state: "pass-complete", nextAction: "none",
      payload: { lane: "frontline", completedPasses: 1,
        verifiedTerminalSignal: { confirmedFindingCount: 0, coverageAdequate: true } } });
    expect(await store.readOperationSnapshot()).toEqual(before);
    expect(await outcomes.readOutcome(admission.operationId)).toEqual(outcomeBefore);
  });

});
