/** Production-constructed clean frontline records shared by handler and CLI tests. */

import type { LaneSubjectLineage } from "../../src/scripts/review-gate/core/lane-admission.js";
import type { NormalizedReviewFinding } from "../../src/scripts/review-gate/core/finding-records.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import { createFrontlineAdmission } from "../../src/scripts/review-gate/core/frontline-admission.js";
import { createFrontlineOutcomeRecord } from "../../src/scripts/review-gate/core/advisory-records.js";
import { createReviewTarget } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import type { ReviewTarget } from "../../src/scripts/review-gate/core/gate-contract-v2-schema.js";
import { FrontlineRunStateSchema, LaneProgressStateSchema } from
  "../../src/scripts/review-gate/core/operation-state-schema.js";
import { LocalReviewResultReader } from "../../src/scripts/review-gate/hosts/local/review-result-reader.js";
import { normalizeFrontlineOutcome } from "../../src/scripts/review-gate/policy/frontline-outcome.js";
import { reduceReviewRouting } from "../../src/scripts/review-gate/policy/routing.js";

export function createFrontlineFixture(target: ReviewTarget = createReviewTarget({
  schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set", repositoryId: "repo-1",
  baseRef: "main", diffBaseSha: "a".repeat(40), diffBaseTree: "b".repeat(40),
  headSha: "c".repeat(40), headTree: "d".repeat(40),
}), options: { lineage?: LaneSubjectLineage; findings?: readonly NormalizedReviewFinding[] } = {}) {
  const source = { sourceId: "coderabbit-cli", kind: "command" as const, executable: "reviewer", argv: ["--plain"] };
  const lineage = options.lineage ?? { kind: "head-bound" as const, vehicleKind: "review-target" as const,
    vehicleIdentity: target.targetId, headSha: target.headSha };
  const facts = { schemaVersion: 1, changeSetState: "known", contentKind: "code-bearing", reviewRisk: "routine",
    changeDeterminacy: "atomic", ownership: "self", surfaceAuthority: "ordinary",
    assurance: { workContext: "errand", workClass: "none" },
    activity: { selfReview: true, frontlineReview: true } } as const;
  const admission = createFrontlineAdmission({ lineage, target,
    routing: { facts, decision: reduceReviewRouting(facts) },
    frontlineReview: { schemaVersion: 1, semanticsVersion: "frontline-review/v1", action: "attempt",
      reasons: ["routine-code"], source, maxPasses: 2, promptText: "Review the complete target." },
    logicalPass: 1, retryGeneration: 0, maxPasses: 2 });
  const outcome = normalizeFrontlineOutcome({ providerResult: options.findings === undefined ? { kind: "clean" }
    : { kind: "findings", findings: options.findings.map((finding, index) => ({ ...finding, sourceOrdinal: index + 1 })) }, source, target, pass: 1, maxPasses: 2 });
  const outcomeRecord = createFrontlineOutcomeRecord({ schemaVersion: 1, semanticsVersion: "review-advisory/v1",
    repositoryId: target.repositoryId, operationId: admission.operationId, sourceIdentity: source.sourceId,
    executableIdentity: { digest: canonicalDigest({ executable: source.executable }), qualifiedVersion: "reviewer/1.0.0" },
    outcome });
  const run = FrontlineRunStateSchema.parse({ schemaVersion: 1, semanticsVersion: "review-operation/v1",
    operationId: admission.operationId, updatedAt: "2026-10-13T00:00:00Z", kind: "frontline-run",
    repositoryId: target.repositoryId, targetId: target.targetId, sourceIdentity: source.sourceId, lineage,
    logicalPass: 1, retryGeneration: 0, outcome: outcome.outcome, policyVersion: admission.policyVersion,
    sourceBindingId: canonicalDigest({ domain: "arc.review-gate.frontline-source-binding/v1", source }) });
  const lane = LaneProgressStateSchema.parse({ schemaVersion: 1, semanticsVersion: "review-operation/v1",
    operationId: "lane-progress-frontline", updatedAt: "2026-10-13T00:01:00Z", kind: "lane-progress",
    lane: "frontline", repositoryId: target.repositoryId, lineage, completedPasses: 1,
    attempts: [{ attemptId: admission.operationId, logicalPass: 1, retryGeneration: 0, changeRequestId: null,
      headSha: target.headSha, terminalProducer: true, sourceId: source.sourceId, outcome: outcome.outcome,
      frontline: { admission, effectiveCoverage: "complete" } }] });
  const reader = new LocalReviewResultReader({
    operationIndex: { readOperationSnapshot: async () => ({ status: "complete",
      records: [{ version: 1, state: run }, { version: 1, state: lane }] }) },
    receiptIndex: { readReceiptEntries: async () => [], readReceiptReference: async () => null },
    sourceStore: { readSource: async () => null, appendSource: async () => { throw new Error("not used"); } },
    outcomeStore: { readOutcome: async () => ({ version: 1, record: outcomeRecord,
      outcomeRef: "git-common:review-gate/outcomes/frontline.json#1" }),
      appendOutcome: async () => { throw new Error("not used"); } },
  });
  return { admission, outcomeRecord, run, lane, reader };
}

/** Create a clean producer with the default frontline context. */
export function createCleanFrontlineFixture(target?: ReviewTarget) { return createFrontlineFixture(target); }
