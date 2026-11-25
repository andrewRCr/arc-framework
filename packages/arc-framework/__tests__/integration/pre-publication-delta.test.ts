/** Candidate delta reviews after an exact applicability selection advances the same root. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { GitExec } from "../../src/lib/git/exec.js";
import { handleAttest } from "../../src/handlers/lifecycle-delivery-review.js";
import { handleCandidateApplicabilityResolve } from "../../src/handlers/candidate.js";
import { handleReviewLocalPrepare } from "../../src/handlers/review.js";
import { readCandidateRecordVersioned } from "../../src/lib/work-unit/candidate-record-store.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { createRepositoryReviewResultReader } from "../../src/scripts/review-gate/hosts/local/review-result-reader-composition.js";
import { createIntegrationCheckpointDependencies } from "../../src/scripts/integration/checkpoint-composition.js";
import { LocalPrepareEnvelopeSchema } from "../../src/scripts/review-gate/core/review-command-envelope.js";
import { createPrePublicationCompositionDependencies } from "../../src/scripts/review-gate/policy/pre-publication-composition.js";
import { composePrePublicationReviewRequest } from "../../src/scripts/review-gate/policy/pre-publication-request.js";
import { resolveReviewPolicy } from "../../src/scripts/review-gate/policy/review-policy-driver.js";
import { deriveReviewNextPassContext } from "../../src/scripts/review-gate/policy/review-next-pass.js";
import { projectPrePublicationReview } from "../../src/scripts/review-gate/policy/pre-publication-procedure.js";
import { prepareLocalReview } from "../../src/scripts/review-gate/runtime/local-prepare.js";
import { createLocalPrepareDependencies } from "../../src/scripts/review-gate/runtime/local-prepare-composition.js";
import { createRespondDependencies } from "../../src/scripts/review-gate/runtime/respond-composition.js";
import { responsePolicyRequestFixture } from "../fixtures/review-response-policy.js";
import { runHandlerAt } from "../helpers/handler.js";
import { inProcessReview, localReviewResult } from "../helpers/in-process-review.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { makeGitExec } from "../helpers/integration.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => removeGitBackedDir(root))); });

async function candidateDelta(fullFinal = false, choice: "covered" | "targeted-check" | "changed" = "covered") {
  const cwd = await createTempRepoCore({ prefix: "arc-pre-publication-delta-", identity: "andrew" });
  roots.push(cwd);
  const realExec = makeGitExec(cwd);
  const exec: GitExec = (command, args, options) => command === "gh"
    ? args[0] === "pr" && args[1] === "list" ? Promise.resolve({ stdout: "[]", stderr: "" })
      : Promise.reject(new Error(`Unexpected host invocation: ${args.join(" ")}`))
    : realExec(command, args, options);
  const git = async (...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"),
    "branch.base: main\nreview.standard_sources: [codex-pr, delegated-agent]\nreview.standard_max_passes: 4\n");
  await writeFile(join(cwd, "source.ts"), "export const value = 0;\n");
  await git("add", "."); await git("commit", "-m", "base");
  const base = await git("rev-parse", "HEAD");
  await git("switch", "-c", "feat/example");
  await mkdir(join(cwd, ".arc/active"), { recursive: true });
  await writeFile(join(cwd, ".arc/active/meta-example.md"), makeMetaFixture("example", {
    owner: "andrew", branch: "feat/example", workClass: "Light", taskList: "tasks-example.md" }));
  await writeFile(join(cwd, ".arc/active/tasks-example.md"), "# Task List: Example\n\n- [x] Verification complete\n");
  await writeFile(join(cwd, "source.ts"), "export const value = 1;\n");
  await git("add", "."); await git("commit", "-m", "contribution");
  const attested = await runHandlerAt(cwd, () => handleAttest("example", { json: true }));
  expect(attested.exitCode, attested.stderr || attested.stdout).toBe(0);
  await git("add", "."); await git("commit", "-m", "record candidate");
  const candidate = (await readCandidateRecordVersioned(cwd, "example")).record;
  if (candidate === null) throw new Error("expected Candidate record");
  const routingFacts = { contentKind: "code-bearing", reviewRisk: fullFinal ? "sensitive" : "routine", changeDeterminacy: "ordinary",
    ownership: "self", surfaceAuthority: "ordinary" };
  const prepare = async () => {
    const output: string[] = []; const exits: number[] = [];
    await handleReviewLocalPrepare("-", { resolveRoot: () => cwd,
      readText: async () => JSON.stringify({ schemaVersion: 1, evaluatorIdentity: "independent-reviewer", routingFacts }),
      prepare: input => prepareLocalReview(input, createLocalPrepareDependencies({ cwd, exec })),
      write: text => output.push(text), setExitCode: code => exits.push(code) });
    expect(exits, output.join("")).toEqual([]);
    return LocalPrepareEnvelopeSchema.parse(JSON.parse(output.join("")));
  };
  const first = await prepare();
  if (first.state !== "ready") throw new Error("expected first complete review");
  await inProcessReview.attest(cwd, localReviewResult(first.payload, "first-review", []));
  await writeFile(join(cwd, "source.ts"), "export const value = 2;\n");
  await git("commit", "-am", "plain successor after convergence");
  const checkpoint = createIntegrationCheckpointDependencies({ cwd, exec });
  const decision = await checkpoint.readCandidate("example", base);
  if (decision === null || !("state" in decision) || decision.state !== "decision-required") {
    throw new Error(`expected Candidate applicability decision: ${JSON.stringify(decision)}`);
  }
  const selector = await checkpoint.composeCandidateApplicabilityResolutionSelector("example", decision);
  const selected = await runHandlerAt(cwd, () => handleCandidateApplicabilityResolve("example", "-", undefined, {
    readText: async () => JSON.stringify({ ...selector, selectedBy: "andrew", choice,
      ...(choice === "targeted-check" ? { targetedEvidenceRef: "test://targeted-check" } : {}) }),
  }));
  expect(selected.exitCode, selected.stderr || selected.stdout).toBe(0);
  expect(JSON.parse(selected.stdout)).toMatchObject({ state: "resolved",
    nextAction: choice === "changed" ? "establish-new-root" : "commit-selection" });
  await git("add", ".");
  await git("commit", "-m", "record applicability selection");
  if (choice === "changed") {
    const rerooted = await runHandlerAt(cwd, () => handleAttest("example", { json: true, newRoot: true,
      expectedCandidate: candidate.attestation.candidateId, expectedSubject: selector.currentTarget.subject.subjectDigest }));
    expect(rerooted.exitCode, rerooted.stderr || rerooted.stdout).toBe(0);
    expect(JSON.parse(rerooted.stdout)).toMatchObject({ status: "attested" });
    await git("add", "."); await git("commit", "-m", "record new Candidate root");
  }
  const current = (await readCandidateRecordVersioned(cwd, "example")).record;
  if (choice === "changed") expect(current?.attestation.candidateId).not.toBe(candidate.attestation.candidateId);
  else expect(current?.attestation.candidateId).toBe(candidate.attestation.candidateId);
  const remote = join(await git("rev-parse", "--git-common-dir"), "fixture-origin.git");
  await git("init", "--bare", remote);
  await git("remote", "add", "origin", "git@github.com:owner/repo.git");
  await git("config", `url.${remote}.insteadOf`, "git@github.com:owner/repo.git");
  const reader = createRepositoryReviewResultReader(new RepositoryGitCommonStatePublisher(exec, cwd));
  return { cwd, exec, prepare, routingFacts, candidate, current, first, reader };
}

async function compose(fixture: Awaited<ReturnType<typeof candidateDelta>>, lanes?: unknown) {
  const composed = await composePrePublicationReviewRequest({ workUnit: "example",
    changeSet: { changeSetState: "known", ...fixture.routingFacts }, lanes }, createPrePublicationCompositionDependencies(fixture));
  if (composed.status !== "composed") throw new Error(composed.reason);
  return composed.request;
}

describe("pre-publication delta coverage", () => {
  it("prepares the same Candidate's full-final delta without a coverage choice", async () => {
    const fixture = await candidateDelta(true);
    const prepared = await fixture.prepare();
    expect(prepared).toMatchObject({ state: "ready", payload: { reviewerPayload: { correctionScope: {
      predecessorProducerId: fixture.first.payload.operationId,
      predecessorHeadSha: fixture.first.payload.target.headSha,
    } } } });
    if (prepared.state !== "ready") throw new Error("expected delta preparation");
    await inProcessReview.attest(fixture.cwd, localReviewResult(prepared.payload, "full-final-delta", []));
    expect(resolveReviewPolicy((await compose(fixture)).standard)).toMatchObject({
      state: "awaiting-change-request", payload: { waitingSources: ["codex-pr"] },
    });
  });

  it.each(["covered", "targeted-check"] as const)("selects a local delta after %s advances the same Candidate despite hosted rank", async choice => {
    const fixture = await candidateDelta(false, choice);
    const composed = await composePrePublicationReviewRequest({ workUnit: "example",
      changeSet: { changeSetState: "known", ...fixture.routingFacts } },
      createPrePublicationCompositionDependencies(fixture));
    expect(composed.status).toBe("composed");
    if (composed.status !== "composed") throw new Error(composed.reason);
    expect(composed.request.routingFacts.changeSetState).toBe("known");
    expect(resolveReviewPolicy(composed.request.standard)).toMatchObject({ state: "ready", nextAction: "local-prepare",
      payload: { sourceId: "delegated-agent" } });
    expect(projectPrePublicationReview(composed.request, { reviewedHead: composed.request.standard.target.headSha,
      nextAction: { kind: "continue-pre-publication-review", command: "arc review pre-publication example",
        interactionText: "Resume Candidate review." }, projectionDisposition: "keep-staged-until-publication" }).reservation)
      .toBeNull();
  });

  it("re-confirms a converged Candidate delta in pre-publication and respond", async () => {
    const fixture = await candidateDelta();
    const prepared = await fixture.prepare();
    if (prepared.state !== "ready") throw new Error("expected delta preparation");
    await inProcessReview.attest(fixture.cwd, localReviewResult(prepared.payload, "delta-review", []));
    const delta = await fixture.reader.readResult(prepared.payload.operationId);
    expect(delta.admission.effectiveCoverage).toBe("incremental");
    const request = await compose(fixture);
    expect(resolveReviewPolicy(request.standard)).toMatchObject({ state: "pass-complete", nextAction: "none" });
    const policyRequest = responsePolicyRequestFixture({ repository: `local/${delta.repositoryId}`,
      headSha: delta.target.headSha, sourceId: "delegated-agent", reviewOperationId: delta.producerId,
      completedPasses: 2, standardReview: request.standard.standardReview });
    await expect(createRespondDependencies(fixture).resolvePolicy({ ...policyRequest,
      attempts: [{ sourceId: "delegated-agent", outcome: "clean", reviewOperationId: delta.producerId }] }, delta.target))
      .resolves.toMatchObject({ state: "pass-complete", payload: { verifiedTerminalSignal: { coverageAdequate: true } } });
  });

  it("runs complete coverage after changed roots a new Candidate and rejects the old delta basis", async () => {
    const fixture = await candidateDelta(false, "changed");
    const request = await compose(fixture);
    expect(resolveReviewPolicy(request.standard)).toMatchObject({ state: "awaiting-change-request",
      payload: { waitingSources: ["codex-pr"] } });
    const prepared = await fixture.prepare();
    if (prepared.state !== "ready") throw new Error("expected complete preparation");
    expect(prepared.payload.reviewerPayload.correctionScope).toBeUndefined();
    await inProcessReview.attest(fixture.cwd, localReviewResult(prepared.payload, "new-root-review", []));
    expect((await fixture.reader.readResult(prepared.payload.operationId)).admission.effectiveCoverage).toBe("complete");
    const dependencies = createPrePublicationCompositionDependencies(fixture);
    if (fixture.current === null) throw new Error("expected new Candidate root");
    await expect(deriveReviewNextPassContext({ completePasses: 2, completedPasses: 2,
      predecessor: await fixture.reader.readResult(fixture.first.payload.operationId), currentTarget: request.target,
      currentLineage: { kind: "candidate", candidateId: fixture.current.attestation.candidateId },
      standardReview: request.standard.standardReview, resultReader: dependencies.resultReader,
      dispositionStore: dependencies.dispositionStore, readResponsePerformance: dependencies.readResponsePerformance,
      rangeProof: fixture, deltaAdmission: { sources: ["codex-pr", "delegated-agent"], surface: "pre-publication" },
    })).resolves.toMatchObject({ incremental: null });
  });

  it("carries authorization for an additional complete pass after the Candidate delta closes", async () => {
    const fixture = await candidateDelta();
    const prepared = await fixture.prepare();
    if (prepared.state !== "ready") throw new Error("expected delta preparation");
    await inProcessReview.attest(fixture.cwd, localReviewResult(prepared.payload, "delta-review", []));
    const delta = await fixture.reader.readResult(prepared.payload.operationId);
    const authorization = { headSha: delta.target.headSha, precedingProducerId: delta.producerId,
      completedPasses: 2, nextPass: 3 };
    const request = await compose(fixture, { standard: { additionalPassAuthorization: authorization } });
    expect(resolveReviewPolicy(request.standard)).toMatchObject({ state: "awaiting-change-request",
      payload: { waitingSources: ["codex-pr"] } });
    expect(request.standard.additionalPassAuthorization).toMatchObject({ precedingProducerId: delta.producerId,
      completedPasses: 2, nextPass: 3,
      target: { headSha: delta.target.headSha, pullRequest: null }, lane: "standard" });
  });
});
