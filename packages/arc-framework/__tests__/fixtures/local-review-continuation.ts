import type { LocalReviewCoverageAdmission } from "../../src/scripts/review-gate/core/local-review-coverage.js";
import { withReviewNextPassContext } from "./review-next-pass.js";
/** Producer-derived local retry histories and exact receipt reads. */

import { createLocalReviewPreparationFixture } from "./local-review-preparation.js";
import { createReviewReceipt, createReviewTarget } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import type { ReviewTarget } from "../../src/scripts/review-gate/core/gate-contract-v2-schema.js";
import type { LocalReviewState } from "../../src/scripts/review-gate/core/operation-state-schema.js";
import { LocalReviewResultReader } from "../../src/scripts/review-gate/hosts/local/review-result-reader.js";
import { recordLocalReceiptConclusion } from "../../src/scripts/review-gate/lane-progress.js";
import { assertStandardReviewExecutionAdmission } from "../../src/scripts/review-gate/policy/review-execution-admission.js";
import { prepareLocalReview } from "../../src/scripts/review-gate/runtime/local-prepare.js";

export async function createLocalContinuationFixture(scopeMode: "whole-target" | "chunked" = "whole-target",
  workClass: "Light" | "Heavy" = "Heavy", initialTarget?: ReviewTarget, maxPasses = 2) {
  const fixture = createLocalReviewPreparationFixture();
  fixture.dependencies.composeAssurance = async () => ({ ...await fixture.composeAssurance(),
    assurance: { workContext: "work-unit", workClass } });
  let target = initialTarget ?? fixture.changeSetTarget;
  const receipts: ReturnType<typeof createReviewReceipt>[] = [];
  fixture.deriveTarget.mockImplementation(async () => target);
  fixture.dependencies.confirmTarget = async (attempted) => attempted.targetId === target.targetId
    ? { state: "current", target }
    : { state: "stale-target", attemptedTarget: attempted, currentTarget: target };
  fixture.dependencies.validatePolicyAdmission = async ({ standardReview, completedPasses, attempts, judgment }) => ({
    state: "ready", coverageAdmission: { requestedCoverage: "complete" },
    pass: assertStandardReviewExecutionAdmission(withReviewNextPassContext({
      target: { repository: "owner/repository", pullRequest: null, headSha: target.headSha },
      frontlineActive: false, standardReview, completedPasses, attempts,
      sources: ["delegated-agent"], maxPasses,
      expectedSourceId: "delegated-agent", expectedNextAction: "local-prepare",
      judgment: { ...judgment, invocation: { mode: "force", sourceId: "delegated-agent" } },
    })).payload.pass,
  });
  const input = {
    schemaVersion: 1 as const, evaluatorIdentity: "evaluator-1",
    routingFacts: {
      contentKind: "code-bearing", reviewRisk: "routine", changeDeterminacy: "ordinary",
      ownership: "self", surfaceAuthority: "ordinary",
    } as const,
    policyJudgment: { scopeMode },
  };
  async function prepare(coverageAdmission?: LocalReviewCoverageAdmission): Promise<LocalReviewState> {
    const prepared = await prepareLocalReview({ ...input, ...(coverageAdmission === undefined ? {} : { coverageAdmission }) }, fixture.dependencies);
    const state = fixture.published();
    if (prepared.state !== "ready" || state?.kind !== "local-review") throw new Error("local admission not ready");
    return state;
  }
  const original = await prepare();
  async function moveBase(seed = "9"): Promise<LocalReviewState> {
    const { targetId: _targetId, ...coordinates } = target;
    void _targetId;
    target = createReviewTarget({ ...coordinates, diffBaseSha: seed.repeat(40), diffBaseTree: seed.repeat(40) });
    return prepare();
  }
  async function moveHead(seed = "e", coverageAdmission?: LocalReviewCoverageAdmission): Promise<LocalReviewState> {
    const { targetId: ignored, ...coordinates } = target;
    void ignored;
    target = createReviewTarget({ ...coordinates, headSha: seed.repeat(40), headTree: seed.repeat(40) });
    return prepare(coverageAdmission);
  }
  async function conclude(state: LocalReviewState, result: "clean" | "findings" | "failed") {
    const receipt = createReviewReceipt({
      target: state.target, requirement: state.requirement, request: state.request,
      applicabilityId: null, reviewRunId: `run-${state.retryGeneration}`,
      evaluatorIdentity: state.request.evaluatorIdentity,
      attestingRuntimeIdentity: state.attestation.runtimeIdentity,
      attestationMechanism: state.attestation.mechanism, providerEventIdentity: null,
      result, findings: result === "findings" ? [{
        findingId: "finding-1", severity: "major", locus: "src/example.ts:1",
        evidenceUrlOrId: "finding-1", sourceOrdinal: 1,
      }] : [],
    });
    receipts.push(receipt);
    await recordLocalReceiptConclusion(fixture.dependencies.operationStore, { state, receipt, now: fixture.dependencies.now() });
    fixture.dependencies.readReceipts = async (targetId) => ({
      ledgerVersion: receipts.length, receipts: receipts.filter((item) => item.targetId === targetId),
    });
    return receipt;
  }
  const resultReader = new LocalReviewResultReader({
    operationIndex: { readOperationSnapshot: async () => ({ status: "complete", records: [...fixture.operations.values()] }) },
    sourceStore: fixture.dependencies.sourceStore,
    receiptIndex: {
      readReceiptEntries: async (targetId) => receipts.flatMap((receipt, index) => receipt.targetId === targetId ? [{
        receipt, durableEvidenceRef: `git-common:review-gate/evidence/receipts-v2.json#${index + 1}`,
      }] : []),
      readReceiptReference: async (ref) => receipts[Number(ref.split("#").at(-1)) - 1] ?? null,
    },
    outcomeStore: {
      readOutcome: async () => ({ version: 0, record: null, outcomeRef: null }),
      appendOutcome: async () => { throw new Error("unexpected frontline outcome"); },
    },
  });
  return { ...fixture, input, original, moveBase, moveHead, prepare, conclude, resultReader, currentTarget: () => target };
}
