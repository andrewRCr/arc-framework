/** Emitted frontline forms consume the approved-fix decision already recorded on their native owner. */
import { expect, it, onTestFinished } from "vitest";
import { createNativeConditionalAdmissionFixture } from "../../../../fixtures/native-conditional-pass.js";
import { createFrontlineFixture } from "../../../../fixtures/frontline-review.js";
import { boundaryContinuation } from "../../../../fixtures/review-boundary.js";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { createReviewCompositionContext } from "../../../../../src/scripts/review-gate/runtime/composition-context.js";
import { createRepositoryReviewResultReader } from "../../../../../src/scripts/review-gate/hosts/local/review-result-reader-composition.js";
import { bindReviewPolicyEvidence } from "../../../../../src/scripts/review-gate/policy/review-policy-evidence.js";
import { PrePublicationReviewRequestSchema, projectPrePublicationReview } from "../../../../../src/scripts/review-gate/policy/pre-publication-procedure.js";
import { deriveReviewNextPassContext } from "../../../../../src/scripts/review-gate/policy/review-next-pass.js";
import { projectStandardReviewObligation } from "../../../../../src/scripts/review-gate/policy/standard-review-projection.js";
import { resolveReviewRouting } from "../../../../../src/scripts/review-gate/policy/routing.js";
import { resolveFrontlineCommand } from "../../../../../src/scripts/review-gate/policy/frontline-command.js";
import { FrontlineSourceRegistry } from "../../../../../src/scripts/review-gate/policy/frontline-source.js";
import { settledFrontlineAdviceReader } from "../../../../../src/scripts/review-gate/policy/frontline-phase.js";
import { confirmCurrentDispositionSet } from "../../../../../src/scripts/review-gate/hosts/local/disposition-record-store.js";
import { readLaneProgress, readLaneResponsePerformance } from "../../../../../src/scripts/review-gate/lane-progress.js";
import { projectReviewPolicyAttempt } from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { createPrePublicationCompositionDependencies } from "../../../../../src/scripts/review-gate/policy/pre-publication-composition.js";

it("admits the emitted frontline form past its configured ceiling through the existing approved-fix key", async () => {
  const lineage = { kind: "candidate" as const, candidateId: canonicalDigest({ candidate: "conditional-form" }) };
  const h = await createNativeConditionalAdmissionFixture("frontline", true, lineage, 1);
  onTestFinished(h.cleanup);
  const invocation = { cwd: h.cwd, exec: h.exec, store: h.f.h.store, workItem: h.f.primary.reference.owner, projectId: h.f.input.readProjectId };
  const context = createReviewCompositionContext(invocation), dispositions = context.family.ports.dispositions;
  const resultReader = createRepositoryReviewResultReader(h.publisher, invocation);
  const composition = createPrePublicationCompositionDependencies(invocation);
  expect(await composition.readSingletonFrontlinePhaseClosed!(lineage.candidateId, [], h.target.headSha)).toBe(false);
  const progress = await readLaneProgress(h.operations, { lane: "frontline", repositoryId: h.target.repositoryId,
    headSha: h.target.headSha, lineage });
  if (progress.status !== "recorded") throw new Error("Expected native frontline progress");
  const policyTarget = { repository: "owner/repo", pullRequest: null, headSha: h.target.headSha };
  const routingFacts = { schemaVersion: 1, changeSetState: "known", contentKind: "code-bearing", reviewRisk: "routine",
    changeDeterminacy: "ordinary", ownership: "self", surfaceAuthority: "ordinary",
    assurance: { workContext: "work-unit", workClass: "Light" }, activity: { selfReview: true, frontlineReview: true } };
  const standardReview = projectStandardReviewObligation(resolveReviewRouting(routingFacts).decision);
  const frontline = await bindReviewPolicyEvidence({ schemaVersion: 1, target: policyTarget, lane: "frontline",
    frontlineActive: true, standardReview, completedPasses: progress.completedPasses,
    attempts: progress.attempts.map(projectReviewPolicyAttempt), ceilingOverride: { target: policyTarget, lane: "frontline",
      exhaustedPassCount: progress.completedPasses, nextPass: progress.completedPasses + 1,
      conditionalPassAuthorizationId: h.authorizationId } }, { stateOffBranch: true,
    sources: [h.f.outcome.source.sourceId], maxPasses: 1, resultReader, dispositionStore: dispositions,
    confirmTarget: async () => h.target, readResponsePerformance: result => readLaneResponsePerformance(h.operations, result) });
  const nextPassContext = await deriveReviewNextPassContext({ predecessor: null, completedPasses: 0, completePasses: 0,
    currentTarget: h.target, currentLineage: lineage, standardReview, resultReader, dispositionStore: dispositions,
    readResponsePerformance: result => readLaneResponsePerformance(h.operations, result) });
  const request = PrePublicationReviewRequestSchema.parse({ schemaVersion: 1, workUnit: "example", candidateId: lineage.candidateId,
    reservationTarget: { kind: "pinned-head", repository: policyTarget.repository, headSha: h.target.headSha },
    target: h.target, selfReview: "settled", routingFacts, frontline,
    standard: { schemaVersion: 1, lane: "standard", target: policyTarget, standardReview, sources: ["codex-pr"], maxPasses: 1,
      completedPasses: 0, attempts: [], nextPassContext }, pendingResponse: { frontline: null, standard: null },
    candidate: { subjectDigest: canonicalDigest({ subject: 1 }), implementationChanged: false,
      convergenceVerification: "satisfied", convergenceScope: null } });
  const projected = projectPrePublicationReview(request, boundaryContinuation, { terminus: null, readinessBinding: null });
  if (projected.nextAction.kind !== "continue-pre-publication-review" || projected.nextAction.authorizationRequest === undefined) {
    throw new Error(JSON.stringify(projected));
  }
  for (const form of [projected.nextAction.request, projected.nextAction.authorizationRequest]) {
    expect(form).toHaveProperty("policyJudgment.ceilingOverride.conditionalPassAuthorizationId", h.authorizationId);
    expect(form).not.toHaveProperty("policyJudgment.ceilingOverride.decisionKey");
  }
  const source = createFrontlineFixture(h.target, { lineage }).admission.frontlineReview.source;
  if (source?.kind !== "command") throw new Error("Expected the configured command source");
  const dependencies = { operationStore: h.operations,
    preferences: { readDeveloperSourceIds: async () => [], readProjectSourceIds: async () => [source.sourceId] },
    registry: new FrontlineSourceRegistry([{ sourceId: source.sourceId, descriptor: { kind: "command", executable: source.executable, argv: source.argv } }]),
    resolveLineage: async () => lineage, resolveSupersessionAncestors: async () => [],
    withLaneOperationLock: async <T>(_id: string, action: () => Promise<T>) => action(),
    confirmDispositionSetCurrent: (producer: string, id: string) => confirmCurrentDispositionSet(dispositions, producer, id),
    readSettledFindingsAdvice: settledFrontlineAdviceReader(resultReader, dispositions), readMaxPasses: async () => 1,
    now: () => "2026-10-20T18:00:00Z" };
  const before = await h.f.input.decisions.list();
  const resolveInput = { ...projected.nextAction.authorizationRequest, target: h.target };
  const ready = await resolveFrontlineCommand(resolveInput, dependencies);
  expect(ready).toMatchObject({ state: "ready", nextAction: "run-frontline", payload: { pass: 2, maxPasses: 2 } });
  expect(await resolveFrontlineCommand(resolveInput, dependencies)).toMatchObject({ state: "ready", payload: {
    admission: { operationId: ready.payload.admission?.operationId } } });
  expect(await h.f.input.decisions.list()).toEqual(before);
});
