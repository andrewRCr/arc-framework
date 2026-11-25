/** Native frontline response uses portable results through the default command composition. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { frontlineOutcome } from "../fixtures/review-outcome.js";
import { ReviewOutcomeSchema } from "../../src/lib/store/kinds/review/outcome/schema.js";
import { withReviewReport } from "../fixtures/review-report-input.js";
import { responsePolicyRequestFixture } from "../fixtures/review-response-policy.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { TransientIdentityRecordSchema } from "../../src/lib/errand/identity-record.js";
import { createLocalPrepareDependencies } from "../../src/scripts/review-gate/runtime/local-prepare-composition.js";
import { createReviewCompositionContext } from "../../src/scripts/review-gate/runtime/composition-context.js";
import { bindReviewSourceReferenceForInvocation } from "../../src/scripts/review-gate/runtime/source-invocation.js";
import { createRepositoryReviewResultReader } from "../../src/scripts/review-gate/hosts/local/review-result-reader-composition.js";
import { frontlinePhaseClosed, settledFrontlineAdviceReader } from "../../src/scripts/review-gate/policy/frontline-phase.js";
import { approveDispositionState } from "../../src/scripts/review-gate/core/dispositions.js";
import { RespondEnvelopeSchema, ReduceEnvelopeSchema } from "../../src/scripts/review-gate/core/review-command-envelope.js";
import { bindNativeReviewOperationReference } from "../../src/scripts/review-gate/core/review-operation-reference.js";
import { handleReviewRespond, handleReviewReduce } from "../../src/handlers/review.js";

it("reduces and settles a native frontline source through defaults without execution files", async () => {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec } = h.native;
  const git = async (...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  const projectId = "123e4567-e89b-42d3-a456-426614174099", claimId = "1".repeat(32), branch = "chore/repair";
  await h.reference.seedProject(projectId);
  await git("config", "arc.identity", "andrew");
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\nreview.frontline_sources: [coderabbit-cli]\n");
  await writeFile(join(cwd, ".gitignore"), ".arc/system/.internal/\n.arc/user/\n");
  await writeFile(join(cwd, "example.ts"), "export const value = 0;\n");
  await git("add", ".");
  await git("commit", "-m", "Configure frontline review");
  await git("switch", "-c", branch);
  await writeFile(join(cwd, "example.ts"), "export const value = 1;\n");
  await git("commit", "-am", "Repair example");
  const createdAt = "2026-10-20T18:00:00Z";
  const errand = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand", slug: "repair",
    claimId, intent: "Repair example", owner: "andrew", origin: "description", originEntry: null, branch,
    state: "open", savedHead: null, changeRequest: null, createdAt, updatedAt: createdAt });
  if (errand.kind !== "errand") throw new Error("expected Errand");
  const primary = await h.reference.seedErrand(errand);
  await writeWorktreeMarker(cwd, { spawnedByArc: false, spawningIdentity: "andrew", createdAt, provisioning: "ready",
    createdFor: { kind: "errand", slug: "repair", claimId } });
  const invocation = { ...h.native, workItem: primary.reference.owner };
  const prepare = createLocalPrepareDependencies(invocation);
  const target = await prepare.deriveTarget(projectId);
  const lineage = { kind: "head-bound" as const, vehicleKind: "errand" as const, vehicleIdentity: claimId, headSha: target.headSha };
  const outcome = ReviewOutcomeSchema.parse(frontlineOutcome({ target, lineage, findings: [{ findingId: "finding-1", severity: "major",
    locus: "example.ts:1", evidenceUrlOrId: "source:example.ts:1", sourceOrdinal: 1 }] }));
  const { publisher, family } = createReviewCompositionContext(invocation);
  const reader = createRepositoryReviewResultReader(publisher, invocation);
  const window = () => frontlinePhaseClosed(family.ports.inFlight, { repositoryId: projectId, lineages: [lineage],
    readSettledFindingsAdvice: settledFrontlineAdviceReader(reader, family.ports.dispositions) });
  if (family.mode !== "stored") throw new Error("expected native records");
  await family.ports.outcomes.create(outcome);
  expect(await window()).toBe(false);
  const outcomeRef = await bindReviewSourceReferenceForInvocation(invocation, { kind: "frontline",
    operationId: outcome.attemptId, durableRef: outcome.attemptId });
  const operationRef = bindNativeReviewOperationReference({ repositoryId: projectId, workItem: primary.reference.owner,
    operationId: outcome.attemptId });
  const reduce = async () => {
    let output = "";
    const exits: number[] = [];
    await handleReviewReduce("-", { resolveRoot: () => cwd,
      readText: async () => JSON.stringify({ schemaVersion: 1, operationId: outcome.attemptId, operationRef }),
      write: text => { output += text; }, setExitCode: code => exits.push(code) }, undefined, h.native);
    expect(exits, output).toEqual([]);
    return ReduceEnvelopeSchema.parse(JSON.parse(output));
  };
  expect(await reduce()).toMatchObject({ state: "findings", payload: { persistedVersion: 0, operationRef,
    responseSource: { kind: "frontline", outcomeRef } } });
  const invoke = async (request: unknown) => {
    let output = "";
    const exits: number[] = [];
    await handleReviewRespond("-", { resolveRoot: () => cwd, readText: async () => JSON.stringify(withReviewReport(request)),
      write: text => { output += text; }, setExitCode: code => exits.push(code) }, undefined, h.native);
    expect(exits, output).toEqual([]);
    return RespondEnvelopeSchema.parse(JSON.parse(output));
  };
  const source = { kind: "frontline", outcomeRef };
  const proposal = await invoke({ schemaVersion: 1, source, proposal: { proposedVerification: "full",
    severityGatingPolicy: { minorGating: "record-only" }, findings: [{ findingId: "finding-1", sourceVerification: "not-supported",
      verificationRefs: ["source:example.ts:1"], verifiedSeverity: null, disposition: "reject", title: "Unsupported claim",
      issue: "The review claims the value is invalid.", rationale: "The changed value is required.",
      recommendation: "Reject this finding.", openQuestions: [] }] } });
  if (proposal.state !== "awaiting-approval") throw new Error(JSON.stringify(proposal));
  const dispositions = approveDispositionState({ proposed: proposal.payload.proposal, approvedBy: "andrew", approvedAt: createdAt });
  const approved = await invoke({ schemaVersion: 1, source, dispositions,
    policyRequest: responsePolicyRequestFixture({ headSha: target.headSha, lane: "frontline", sourceId: "coderabbit-cli",
      reviewOperationId: outcome.attemptId }) });
  expect(approved.state).toBe("settled");
  expect(await window()).toBe(true);
  const beforeReduction = await h.reference.store.version();
  expect(await reduce()).toMatchObject({ state: "advisory-complete", payload: { persistedVersion: 0, operationRef,
    frontlineOutcomeRef: outcomeRef, frontlineFollowUp: { action: "stop", reason: "no-approved-material-fix" } } });
  expect(await h.reference.store.version()).toEqual(beforeReduction);
  expect(await publisher.list({ root: "review-gate", namespace: "in-flight" })).toEqual([]);
  expect(await publisher.list({ root: "review-gate", namespace: "outcomes" })).toEqual([]);
  expect(await publisher.list({ root: "review-gate", namespace: "evidence" })).toEqual([]);
}, 30_000);
