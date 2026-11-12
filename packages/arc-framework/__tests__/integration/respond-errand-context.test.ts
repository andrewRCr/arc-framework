/** Real branch repair keeps an Errand's initial response bound through the default handler composition. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { createFrontlineFixture } from "../fixtures/frontline-review.js";
import { frontlineOutcome } from "../fixtures/review-outcome.js";
import { withReviewReport } from "../fixtures/review-report-input.js";
import { responsePolicyRequestFixture } from "../fixtures/review-response-policy.js";
import { ReviewOutcomeSchema } from "../../src/lib/store/kinds/review/outcome/schema.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { TransientIdentityRecordSchema } from "../../src/lib/errand/identity-record.js";
import { createLocalPrepareDependencies } from "../../src/scripts/review-gate/runtime/local-prepare-composition.js";
import { respondToReviewCommand } from "../../src/scripts/review-gate/runtime/respond-command.js";
import { createRespondDependencies } from "../../src/scripts/review-gate/runtime/respond-composition.js";
import { createReviewCompositionContext } from "../../src/scripts/review-gate/runtime/composition-context.js";
import { bindReviewSourceReferenceForInvocation } from "../../src/scripts/review-gate/runtime/source-invocation.js";
import { LocalFrontlineOutcomeStore } from "../../src/scripts/review-gate/hosts/local/frontline-outcome-store.js";
import { approveDispositionState } from "../../src/scripts/review-gate/core/dispositions.js";
import { laneProgressOperationId } from "../../src/scripts/review-gate/lane-progress.js";
import { handleReviewRespond } from "../../src/handlers/review.js";

async function scenario(arm: "inRepo" | "native") {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const input = h[arm], { cwd, exec } = input;
  const git = async (...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  const projectId = "123e4567-e89b-42d3-a456-426614174099", claimId = "1".repeat(32), branch = "chore/repair";
  await h.reference.seedProject(projectId);
  await git("config", "arc.identity", "andrew");
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\nreview.frontline_sources: [coderabbit-cli]\n");
  await writeFile(join(cwd, ".gitignore"), ".arc/system/.internal/\n.arc/user/\n");
  await writeFile(join(cwd, "example.ts"), "export const value = 0;\n");
  await git("add", ".");
  await git("commit", "-m", "Configure review");
  await git("switch", "-c", branch);
  await writeFile(join(cwd, "example.ts"), "export const value = 1;\n");
  await git("commit", "-am", "Reviewed change");
  const createdAt = "2026-11-11T18:00:00Z";
  const errand = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand", slug: "repair",
    claimId, intent: "Repair example", owner: "andrew", origin: "description", originEntry: null, branch,
    state: "open", savedHead: null, changeRequest: null, createdAt, updatedAt: createdAt });
  if (errand.kind !== "errand") throw new Error("Expected Errand");
  const primary = await h.reference.seedErrand(errand);
  if (arm === "inRepo") await h.seedErrandRef(errand, "andrew", cwd);
  await writeWorktreeMarker(cwd, { spawnedByArc: false, spawningIdentity: "andrew", createdAt, provisioning: "ready",
    createdFor: { kind: "errand", slug: "repair", claimId } });
  const invocation = { ...input, ...(arm === "native" ? { workItem: primary.reference.owner } : {}) };
  const target = await createLocalPrepareDependencies(invocation).deriveTarget(projectId);
  const lineage = { kind: "head-bound" as const, vehicleKind: "errand" as const, vehicleIdentity: claimId, headSha: target.headSha };
  const findings = [{ findingId: "finding-1", severity: "major" as const, locus: "example.ts:1", evidenceUrlOrId: "source:example.ts:1", sourceOrdinal: 1 }];
  const { publisher, family } = createReviewCompositionContext(invocation);
  let operationId: string, durableRef: string;
  if (family.mode === "stored") {
    const outcome = ReviewOutcomeSchema.parse(frontlineOutcome({ target, lineage, findings }));
    await family.ports.outcomes.create(outcome);
    operationId = durableRef = outcome.attemptId;
  } else {
    const f = createFrontlineFixture(target, { lineage, findings });
    await family.ports.inFlight.publishOperation(f.run, 0);
    await family.ports.inFlight.publishOperation({ ...f.lane, operationId: laneProgressOperationId({
      lane: "frontline", repositoryId: projectId, headSha: target.headSha, lineage }) }, 0);
    durableRef = (await new LocalFrontlineOutcomeStore(publisher).appendOutcome(f.outcomeRecord, 0)).outcomeRef;
    operationId = f.run.operationId;
  }
  const outcomeRef = await bindReviewSourceReferenceForInvocation(invocation, { kind: "frontline", operationId, durableRef });
  const source = { kind: "frontline", outcomeRef };
  const request = { schemaVersion: 1, source, proposal: { proposedVerification: "full",
    severityGatingPolicy: { minorGating: "record-only" }, findings: [{ findingId: "finding-1", sourceVerification: "verified",
      verificationRefs: ["source:example.ts:1"], verifiedSeverity: "major", disposition: "fix", title: "Repair the value",
      issue: "The value needs repair.", rationale: "The source confirms this.", recommendation: "Correct the value.", openQuestions: [] }] } };
  const invoke = async (body: unknown, beforeLock?: () => Promise<void>) => {
    let output = "";
    const exits: number[] = [];
    const scheduled = beforeLock === undefined ? {} : { respond: async (request: unknown) => {
      const dependencies = createRespondDependencies(invocation);
      return respondToReviewCommand(request, { ...dependencies, withOperationLock: async (operationId, action) => {
        await beforeLock();
        return dependencies.withOperationLock(operationId, action);
      } });
    } };
    await handleReviewRespond("-", { ...scheduled, resolveRoot: () => cwd, readText: async () => JSON.stringify(withReviewReport(body)),
      write: text => { output += text; }, setExitCode: code => exits.push(code) }, undefined, invocation);
    return { result: JSON.parse(output), exits };
  };
  const readRecord = () => createRespondDependencies(invocation).dispositionStore.readDispositionRecord(operationId);
  const approvalRequest = async () => {
    const proposal = await invoke(request);
    expect(proposal.exits, JSON.stringify(proposal.result)).toEqual([]);
    expect(proposal.result.state).toBe("awaiting-approval");
    const dispositions = approveDispositionState({ proposed: proposal.result.payload.proposal, approvedBy: "andrew", approvedAt: createdAt });
    return { schemaVersion: 1, source, dispositions, policyRequest: responsePolicyRequestFixture({ headSha: target.headSha,
      lane: "frontline", sourceId: "coderabbit-cli", reviewOperationId: operationId }) };
  };
  const approve = async (supplied?: Awaited<ReturnType<typeof approvalRequest>>) => {
    const approval = supplied ?? await approvalRequest();
    const response = await invoke(approval);
    expect(response.exits, JSON.stringify(response.result)).toEqual([]);
    expect(response.result.state).toBe("ready-to-fix");
    expect((await readRecord())?.errand).toEqual({ key: "repair", claimId, branch });
    return approval;
  };
  return { git, cwd, target, branch, request, invoke, readRecord, approve, approvalRequest };
}

it.each(["inRepo", "native"] as const)("refuses detached and foreign branches, then approves on the owning branch (%s)", async arm => {
  const s = await scenario(arm);
  for (const args of [["switch", "--detach", s.target.headSha], ["switch", "-c", "chore/other", s.target.headSha]]) {
    await s.git(...args);
    const refusal = await s.invoke(s.request);
    expect(refusal.exits).toEqual([1]);
    expect(refusal.result).toMatchObject({ error: { code: "invalid-input" }, remedy: { argv: ["arc", "locus", "--json"],
      text: expect.stringContaining("Switch") } });
    expect(await s.readRecord()).toBeNull();
  }
  await s.git("switch", s.branch);
  await s.approve();
}, 30_000);

it.each(["inRepo", "native"] as const)("stops a commit-first response and continues after preserving and restoring the same branch (%s)", async arm => {
  const s = await scenario(arm);
  await writeFile(join(s.cwd, "example.ts"), "export const value = 2;\n");
  await s.git("commit", "-am", "Premature fix");
  const fixedHead = await s.git("rev-parse", "HEAD");
  const refusal = await s.invoke(s.request);
  expect(refusal.exits).toEqual([]);
  expect(refusal.result).toMatchObject({ state: "stale-target", nextAction: "stop", payload: {
    attemptedTarget: { headSha: s.target.headSha }, currentTarget: { headSha: fixedHead }, errand: { branch: s.branch },
    detail: expect.stringContaining("before applying and committing") } });
  expect(await s.readRecord()).toBeNull();
  // Explicit fixture authorization: preserve the premature commit before restoring this same unpublished branch.
  await s.git("update-ref", "refs/test/preserved-fix", fixedHead);
  await s.git("reset", "--hard", s.target.headSha);
  expect(await s.git("branch", "--show-current")).toBe(s.branch);
  const approval = await s.approve();
  await s.git("cherry-pick", "refs/test/preserved-fix");
  const performed = await s.invoke({ ...approval, verifiedFix: { applicability: "full", verificationEvidenceRefs: ["test://full"] } });
  expect(performed.exits, JSON.stringify(performed.result)).toEqual([]);
  expect(performed.result.state).toBe("errand-advanced");
}, 30_000);

it.each(["inRepo", "native"] as const)("refuses an approval when its owning branch changes before the lock, then retries (%s)", async arm => {
  const s = await scenario(arm), approval = await s.approvalRequest();
  const refused = await s.invoke(approval, async () => { await s.git("switch", "-c", "chore/other", s.target.headSha); });
  expect(refused.exits).toEqual([1]);
  expect(refused.result).toMatchObject({ error: { code: "invalid-input" }, remedy: { argv: ["arc", "locus", "--json"] } });
  expect(await s.readRecord()).toBeNull();
  await s.git("switch", s.branch);
  await s.approve(approval);
}, 30_000);
