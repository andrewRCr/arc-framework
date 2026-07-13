import { describe, expect, it } from "vitest";

import type { ReviewRequest } from "../../../../../src/scripts/review-gate/core/execution.js";
import { createReceipt } from "../../../../../src/scripts/review-gate/core/request-key.js";
import { serializeReceiptComment } from "../../../../../src/scripts/review-gate/hosts/github/receipt-comment.js";
import { buildCodexReviewCommand } from "../../../../../src/scripts/review-gate/providers/codex/adapter.js";
import { computePolicyVersion } from "../../../../../src/scripts/review-gate/core/identity.js";
import { createHostedProviderProbePolicy } from "../../../../../src/scripts/review-gate/policy/self-hosting/qualification.js";
import { SELF_HOSTING_POLICY } from "../../../../../src/scripts/review-gate/policy/self-hosting/schema.js";
import {
  deriveQualificationCellResult,
  type QualificationRawRecord,
} from "../../../../../src/scripts/review-gate/runtime/qualification-evidence.js";
import type { QualificationCellId, QualificationScope } from "../../../../../src/scripts/review-gate/runtime/qualification-contract.js";
import { qualificationScope } from "./qualification-fixtures.js";

function request(scope: QualificationScope, cellId: QualificationCellId, sourceIdentity: string): ReviewRequest {
  const cell = scope.cellScopes[cellId];
  const codex = sourceIdentity === "codex-pr";
  return {
    schemaVersion: 1,
    repositoryId: scope.repositoryId,
    changeRequestId: cell.changeRequestId,
    changeSetId: "f".repeat(64),
    policyVersion: computePolicyVersion({
      policy: createHostedProviderProbePolicy(
        SELF_HOSTING_POLICY,
        codex ? "codex" : "coderabbit",
        codex ? scope.guidanceDigests.codex ?? null : null,
      ),
    }),
    semanticsVersion: "review-gate/v1",
    rubricVersion: scope.rubricVersion,
    requirementId: "analysis",
    sourceIdentity,
    coverage: "full",
    coverageFromSha: "0".repeat(40),
    coverageThroughSha: cell.headSha,
    generation: 1,
    actorIdentity: scope.controllerBotUserId,
    requestMechanism: codex ? "user-trigger" : "automatic",
    requiredActorIdentity: codex ? scope.expectedActorIdentity : scope.controllerBotUserId,
    requestCommand: codex ? buildCodexReviewCommand(scope.guidanceDigests.codex ?? "") : null,
  };
}

function receipts(scope: QualificationScope, cellId: QualificationCellId, sourceIdentity: string): Record<string, unknown>[] {
  const requested = request(scope, cellId, sourceIdentity);
  const reserved = createReceipt({
    eventId: `${cellId}:reserved`, previousLedgerVersion: 0, action: "reserved", request: requested,
    result: null, evidenceUrlOrId: null, findingIds: [],
    payload: { kind: "reservation", reservedAt: null, pendingProjectionRef: null },
  });
  const acknowledged = createReceipt({
    eventId: `${cellId}:acknowledged`, previousLedgerVersion: 1, action: "acknowledged", request: requested,
    result: null, evidenceUrlOrId: "https://github.com/o/r/issues/7#issuecomment-101", findingIds: [],
    payload: {
      kind: "acknowledgement",
      acknowledgedAt: "2026-07-12T20:01:00Z",
      acknowledgementRef: "https://github.com/o/r/issues/7#issuecomment-101",
      trigger: {
        mechanism: requested.requestMechanism,
        eventKind: sourceIdentity === "codex-pr" ? "comment" : "label",
        eventId: "101",
        actorIdentity: requested.requiredActorIdentity,
        occurredAt: "2026-07-12T20:01:00Z",
        headSha: requested.coverageThroughSha,
        contentDigest: "a".repeat(64),
      },
    },
  });
  return [reserved, acknowledged].map((receipt, index) => ({
    node_id: `receipt-${index + 1}`,
    body: serializeReceiptComment({ ledgerVersion: index + 1, receipt }),
    created_at: `2026-07-12T20:0${index}:00Z`,
    updated_at: `2026-07-12T20:0${index}:00Z`,
    performed_via_github_app: { id: Number(scope.controllerAppId) },
    user: { id: Number(scope.controllerBotUserId) },
  }));
}

function check(scope: QualificationScope, cellId: QualificationCellId, conclusion: "pending" | "success" | "failure") {
  const marker = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    conclusion,
    blockerCodes: conclusion === "success" ? [] : ["review-pending"],
    ledgerVersion: 2,
    receiptRefs: ["receipt-1", "receipt-2"],
  }), "utf8").toString("base64url");
  return {
    id: 55,
    head_sha: scope.cellScopes[cellId].headSha,
    html_url: "https://github.com/o/r/checks/55",
    app: { id: Number(scope.controllerAppId) },
    output: { summary: `<!-- arc-review-gate-state:v1:${marker} -->` },
  };
}

function records(
  scope: QualificationScope,
  cellId: QualificationCellId,
  sourceIdentity: string,
  providerArtifacts: unknown[],
  conclusion: "pending" | "success" | "failure",
): QualificationRawRecord[] {
  return [{
    path: "repos/o/r/qualification-bundle",
    value: {
      workflow_runs: [{
        id: 44,
        head_sha: scope.defaultBranchSha,
        head_branch: scope.defaultBranch,
        conclusion: "success",
        event: "workflow_dispatch",
        created_at: "2026-07-12T20:03:00Z",
        updated_at: "2026-07-12T20:04:00Z",
        html_url: "https://github.com/o/r/actions/runs/44",
        path: ".github/workflows/review-gate.yml",
      }],
      comments: [...receipts(scope, cellId, sourceIdentity), ...providerArtifacts],
      check_runs: [check(scope, cellId, conclusion)],
    },
  }];
}

describe("qualification live-evidence derivation", () => {
  it("derives a Codex clean capability from the owned request, pinned artifact, and successful App projection", () => {
    const scope = qualificationScope();
    const cellId = "codex-clean";
    const body = [
      "Codex Review:",
      "Didn't find any major issues.",
      `Reviewed commit: ${scope.cellScopes[cellId].headSha}`,
    ].join("\n");
    const result = deriveQualificationCellResult(scope, cellId, records(scope, cellId, "codex-pr", [{
      id: 500,
      node_id: "IC_clean",
      html_url: `https://github.com/o/r/pull/${scope.cellScopes[cellId].pullRequestNumber}#issuecomment-500`,
      body,
      created_at: "2026-07-12T20:05:00Z",
      updated_at: "2026-07-12T20:05:00Z",
      performed_via_github_app: { id: Number(scope.providerAppIds.codex) },
      user: { id: Number(scope.providerBotUserIds.codex) },
    }], "success"));
    expect(result).toMatchObject({ outcome: "clean", capabilityProven: true, sourceIdentity: "codex-pr" });
  });

  it("records an observed but unproven CodeRabbit clean path as partial instead of enabling it", () => {
    const scope = qualificationScope();
    const cellId = "coderabbit-clean";
    const result = deriveQualificationCellResult(scope, cellId, records(scope, cellId, "coderabbit-pr", [{
      id: 600,
      node_id: "PRR_empty",
      html_url: `https://github.com/o/r/pull/${scope.cellScopes[cellId].pullRequestNumber}#pullrequestreview-600`,
      body: "Empty approval without the substantive clean marker",
      commit_id: scope.cellScopes[cellId].headSha,
      state: "APPROVED",
      user: { id: Number(scope.providerBotUserIds.coderabbit) },
    }], "pending"));
    expect(result).toMatchObject({ outcome: "unknown", capabilityProven: false, sourceIdentity: "coderabbit-pr" });
  });

  it("accepts CodeRabbit findings only when the production normalizer can correlate review and thread evidence", () => {
    const scope = qualificationScope();
    const cellId = "coderabbit-findings";
    const headSha = scope.cellScopes[cellId].headSha;
    const pullRequestNumber = scope.cellScopes[cellId].pullRequestNumber;
    const artifacts = [{
      id: 601,
      node_id: "PRR_findings",
      html_url: `https://github.com/o/r/pull/${pullRequestNumber}#pullrequestreview-601`,
      commit_id: headSha,
      state: "CHANGES_REQUESTED",
      user: { id: Number(scope.providerBotUserIds.coderabbit) },
    }, {
      id: "PRRT_finding",
      comments: { nodes: [{
        id: "PRRC_finding",
        body: "_🟠 Major_ Unsafe traversal",
        url: `https://github.com/o/r/pull/${pullRequestNumber}#discussion_r602`,
        path: "src/a.ts",
        line: 8,
        commit: { oid: headSha },
        pullRequestReview: { id: "PRR_findings" },
        author: { databaseId: Number(scope.providerBotUserIds.coderabbit) },
      }] },
    }];
    const result = deriveQualificationCellResult(
      scope,
      cellId,
      records(scope, cellId, "coderabbit-pr", artifacts, "failure"),
    );
    expect(result).toMatchObject({ outcome: "findings", capabilityProven: true, sourceIdentity: "coderabbit-pr" });
    const thread = artifacts[1] as { comments: { nodes: Array<{ commit: { oid: string } }> } };
    const comment = thread.comments.nodes[0];
    if (comment === undefined) throw new Error("missing test comment");
    comment.commit.oid = "f".repeat(40);
    expect(deriveQualificationCellResult(
      scope,
      cellId,
      records(scope, cellId, "coderabbit-pr", artifacts, "failure"),
    )).toMatchObject({ outcome: "unknown", capabilityProven: false });
  });

  it("records a pinned but semantically unknown Codex review through the production queued state", () => {
    const scope = qualificationScope();
    const cellId = "codex-unknown";
    const result = deriveQualificationCellResult(scope, cellId, records(scope, cellId, "codex-pr", [{
      id: 700,
      node_id: "PRR_unknown",
      html_url: `https://github.com/o/r/pull/${scope.cellScopes[cellId].pullRequestNumber}#pullrequestreview-700`,
      commit_id: scope.cellScopes[cellId].headSha,
      state: "COMMENTED",
      submitted_at: "2026-07-12T20:05:00Z",
      user: { id: Number(scope.providerBotUserIds.codex) },
    }], "failure"));
    expect(result).toMatchObject({ outcome: "unknown", capabilityProven: true, sourceIdentity: "codex-pr" });
  });

  it("binds scheduled event repair to fresh cell evidence instead of any non-manual run", () => {
    const scope = qualificationScope();
    const cellId = "event-repair";
    const live = records(scope, cellId, "coderabbit-pr", [], "pending");
    const value = live[0]?.value as {
      workflow_runs: Array<Record<string, unknown>>;
      check_runs: Array<Record<string, unknown>>;
    };
    const run = value.workflow_runs[0];
    const aggregate = value.check_runs[0];
    if (run === undefined || aggregate === undefined) throw new Error("missing event repair fixture");
    run.event = "schedule";
    run.created_at = "2026-07-12T19:59:00Z";
    run.updated_at = "2026-07-12T20:02:00Z";
    aggregate.updated_at = "2026-07-12T20:02:00Z";
    expect(deriveQualificationCellResult(scope, cellId, live)).toMatchObject({
      outcome: "repaired",
      capabilityProven: true,
    });
    run.event = "issue_comment";
    expect(() => deriveQualificationCellResult(scope, cellId, live)).toThrow(/workflow-run-missing/u);
  });

  it("rejects provider artifacts without an owned request or matching aggregate projection", () => {
    const scope = qualificationScope();
    const cellId = "codex-clean";
    const unrelated = records(scope, cellId, "codex-pr", [], "success");
    const value = unrelated[0]?.value as { comments: unknown[] };
    value.comments = value.comments.slice(0, 1);
    expect(() => deriveQualificationCellResult(scope, cellId, unrelated)).toThrow(/owned-request|artifact-missing/u);
  });
});
