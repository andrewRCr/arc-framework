/** Schema-backed pending bindings for lane admission and conditional authorization tests. */
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import type { LaneProgressState } from "../../src/scripts/review-gate/core/operation-state-schema.js";
import type { LaneSubjectLineage } from "../../src/scripts/review-gate/core/lane-admission.js";
import { createHostedHandleFixture } from "./hosted-review.js";

type Attempt = LaneProgressState["attempts"][number];

export function localPendingBinding(input: {
  operationId: string; headSha: string; repositoryId?: string; coverage?: "complete" | "incremental";
}): NonNullable<Attempt["local"]> {
  const handle = createHostedHandleFixture({ repositoryId: input.repositoryId, target: { repository: "owner/repo", pullRequest: 42, headSha: input.headSha } });
  const requestedCoverage = input.coverage ?? "complete";
  return { operationId: input.operationId, requestId: canonicalDigest(input),
    vehicle: { kind: "work-unit", identity: "example" }, target: handle.admission.reviewTarget,
    requestedCoverage, effectiveCoverage: null, scopeMode: "whole-target",
    ...(requestedCoverage === "complete" ? {} : { correctionScope: { schemaVersion: 1,
      predecessorProducerId: "attempt-1", predecessorHeadSha: "c".repeat(40), basisHeadSha: "c".repeat(40),
      headSha: input.headSha, requiredFindings: [] } }) };
}

export function hostedPendingBinding(input: {
  headSha: string; logicalPass: number; sourceId?: string; lineage?: LaneSubjectLineage;
}): NonNullable<Attempt["hosted"]> {
  const provider = input.sourceId === "codex-pr" ? "codex-pr" : "coderabbit-pr";
  const { admission } = createHostedHandleFixture({ provider, logicalPass: input.logicalPass, lineage: input.lineage,
    target: { repository: "owner/repo", pullRequest: 42, headSha: input.headSha } });
  return { admission, target: admission.target, requestedCoverage: admission.requestedCoverage,
    effectiveCoverage: null, reviewTarget: admission.reviewTarget, requirement: admission.requirement,
    actorIdentity: admission.actorIdentity, requestFailureReason: null, dispositionSetId: null,
    dispositionSetLineage: [], settledFindingIds: [], settlementEvidence: [] };
}
