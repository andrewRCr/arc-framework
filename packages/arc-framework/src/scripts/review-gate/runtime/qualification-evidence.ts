/** Cell-specific derivation of sanitized qualification results from canonical GitHub records. */

import { validateReceiptLedger, type ReceiptLedgerResult } from "../core/receipt-ledger.js";
import { computeRequestKey } from "../core/request-key.js";
import { computePolicyVersion } from "../core/identity.js";
import { parseGateStateMarker } from "../hosts/github/check-runs.js";
import { parseReceiptComment } from "../hosts/github/receipt-comment.js";
import type { ReviewReceipt, ReviewRequest } from "../core/execution.js";
import {
  normalizeCodeRabbitRun,
  type CodeRabbitCapabilities,
  type CodeRabbitRunContext,
  type CodeRabbitSignal,
} from "../providers/coderabbit/adapter.js";
import {
  isCodeRabbitCleanReviewBody,
  parseCodeRabbitFindingSeverity,
} from "../providers/coderabbit/github-observation.js";
import {
  buildCodexReviewCommand,
  normalizeCodexRun,
  type CodexCapabilities,
  type CodexRunContext,
  type CodexSignal,
} from "../providers/codex/adapter.js";
import {
  parseCodexCommitMarkers,
  parseCodexFindingSeverity,
} from "../providers/codex/github-observation.js";
import { createHostedProviderProbePolicy } from "../policy/self-hosting/qualification.js";
import { SELF_HOSTING_POLICY } from "../policy/self-hosting/schema.js";
import {
  QUALIFICATION_EXPECTED_OUTCOMES,
  QUALIFICATION_RUBRIC_DIMENSIONS,
  type QualificationCellId,
  type QualificationCellResult,
  type QualificationScope,
} from "./qualification-contract.js";

export interface QualificationRawRecord {
  path: string;
  value: unknown;
}

export interface QualificationDispatchProof {
  expectedEvent: "workflow_dispatch" | "repository_dispatch";
  priorRunIds: string[];
  actorIdentity: string;
}

type JsonRecord = Record<string, unknown>;
type QualificationLedger = ReceiptLedgerResult & { durableRecordIds: string[] };

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function objects(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.flatMap(objects);
  const current = record(value);
  if (current === null) return [];
  return [current, ...Object.values(current).flatMap(objects)];
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : null;
}

function nested(input: JsonRecord, key: string): JsonRecord | null {
  return record(input[key]);
}

function actorId(input: JsonRecord): string | null {
  return text(nested(input, "user")?.id
    ?? nested(input, "actor")?.id
    ?? nested(input, "creator")?.id
    ?? nested(input, "author")?.databaseId
    ?? nested(input, "author")?.id);
}

function appId(input: JsonRecord): string | null {
  return text(nested(input, "app")?.id ?? nested(input, "performed_via_github_app")?.id);
}

function repositoryUrl(scope: QualificationScope): string {
  return `https://github.com/${scope.repositoryRef}/`;
}

function expectedWorkflowPath(cellId: QualificationCellId): string {
  if (cellId === "token-stateless" || cellId === "token-classic") return "review-gate-qualify.yml";
  if (cellId === "repair-authority") return "review-gate-repair.yml";
  return "review-gate.yml";
}

function workflowRun(
  scope: QualificationScope,
  cellId: QualificationCellId,
  all: JsonRecord[],
  dispatchProof?: QualificationDispatchProof,
): JsonRecord {
  const expectedPath = expectedWorkflowPath(cellId);
  const matches = all.filter((item) => text(item.head_sha) === scope.defaultBranchSha
    && (text(item.head_branch) === null || text(item.head_branch) === scope.defaultBranch)
    && text(item.conclusion) === "success"
    && (text(item.path)?.endsWith(expectedPath) ?? false)
    && (cellId !== "event-repair" || text(item.event) === "schedule")
    && (dispatchProof === undefined || (text(item.event) === dispatchProof.expectedEvent
      && !dispatchProof.priorRunIds.includes(text(item.id) ?? "")
      && actorId(item) === dispatchProof.actorIdentity))
    && (text(item.html_url)?.startsWith(`${repositoryUrl(scope)}actions/runs/`) ?? false))
    .sort((left, right) => (text(right.created_at) ?? "").localeCompare(text(left.created_at) ?? "")
      || Number(right.id ?? 0) - Number(left.id ?? 0));
  if (dispatchProof !== undefined && matches.length !== 1) {
    throw new Error("qualification-evidence-workflow-run-ambiguous");
  }
  const latest = matches[0];
  if (latest === undefined) throw new Error("qualification-evidence-workflow-run-missing");
  return latest;
}

function receiptLedger(scope: QualificationScope, cellId: QualificationCellId, all: JsonRecord[]): QualificationLedger {
  const cellScope = scope.cellScopes[cellId];
  const envelopes = all.flatMap((item) => {
    const body = text(item.body);
    const nodeId = text(item.node_id);
    const createdAt = text(item.created_at);
    const updatedAt = text(item.updated_at);
    if (body === null || nodeId === null || createdAt === null || updatedAt === null
      || appId(item) !== scope.controllerAppId) return [];
    const parsed = parseReceiptComment({
      body,
      commentNodeId: nodeId,
      createdAt,
      updatedAt,
      expectedRepositoryId: scope.repositoryId,
      expectedChangeRequestId: cellScope.changeRequestId,
    });
    if (parsed.kind === "invalid") throw new Error(`qualification-evidence-receipt-invalid:${parsed.reason}`);
    return parsed.kind === "receipt" ? [parsed.envelope] : [];
  });
  const unique = [...new Map(envelopes.map((item) => [item.durableRecordId, item])).values()];
  if (unique.length === 0) throw new Error("qualification-evidence-receipts-missing");
  const anchorVersion = Math.max(...unique.map((item) => item.ledgerVersion));
  const ledger = validateReceiptLedger({ envelopes: unique, anchorVersion, anchorCount: unique.length });
  if (!ledger.valid) throw new Error(`qualification-evidence-ledger-invalid:${ledger.errors.join(",")}`);
  return { ...ledger, durableRecordIds: unique.map((item) => item.durableRecordId) };
}

function controllerChecks(scope: QualificationScope, cellId: QualificationCellId, all: JsonRecord[]): Array<{ raw: JsonRecord; state: ReturnType<typeof parseGateStateMarker> }> {
  const cellScope = scope.cellScopes[cellId];
  return all.flatMap((item) => {
    const output = nested(item, "output");
    const summary = text(output?.summary);
    if (summary === null
      || appId(item) !== scope.controllerAppId
      || text(item.head_sha) !== cellScope.headSha
      || !(text(item.html_url)?.startsWith(repositoryUrl(scope)) ?? false)) return [];
    try {
      return [{ raw: item, state: parseGateStateMarker(summary) }];
    } catch {
      return [];
    }
  });
}

function ledgerBoundChecks(
  checks: ReturnType<typeof controllerChecks>,
  ledger: QualificationLedger,
): ReturnType<typeof controllerChecks> {
  return checks.filter((item) => item.state.ledgerVersion === ledger.ledgerVersion
    && item.state.receiptRefs.length > 0
    && item.state.receiptRefs.every((reference) => ledger.durableRecordIds.includes(reference)));
}

function exactActorComment(all: JsonRecord[], actor: string, body: string): JsonRecord | null {
  const matches = all.filter((item) => actorId(item) === actor && text(item.body) === body && text(item.id) !== null);
  return matches.length === 1 ? matches[0] as JsonRecord : null;
}

function reviewHead(item: JsonRecord): string | null {
  return text(item.commit_id ?? item.head_sha);
}

function ownedProviderRequest(
  scope: QualificationScope,
  cellId: QualificationCellId,
  sourceIdentity: string,
  ledger: ReceiptLedgerResult,
): ReviewReceipt {
  const cellScope = scope.cellScopes[cellId];
  const acknowledgement = ledger.receipts.find((item) => item.action === "acknowledged"
    && item.request.sourceIdentity === sourceIdentity
    && item.request.coverageThroughSha === cellScope.headSha
    && item.payload.kind === "acknowledgement");
  if (acknowledgement === undefined) {
    throw new Error(`qualification-evidence-${sourceIdentity}-owned-request-missing`);
  }
  if (ledger.receipts.some((item) => item.action === "contaminated"
    && item.request.sourceIdentity === sourceIdentity
    && item.request.generation === acknowledgement.request.generation)) {
    throw new Error(`qualification-evidence-${sourceIdentity}-request-contaminated`);
  }
  const provider = sourceIdentity === scope.sourceIdentities.coderabbit ? "coderabbit"
    : sourceIdentity === scope.sourceIdentities.codex ? "codex" : null;
  if (provider === null) throw new Error("qualification-evidence-provider-identity-unknown");
  const expectedPolicyVersion = computePolicyVersion({
    policy: createHostedProviderProbePolicy(
      SELF_HOSTING_POLICY,
      provider,
      provider === "codex" ? scope.guidanceDigests.codex ?? null : null,
    ),
  });
  if (acknowledgement.request.policyVersion !== expectedPolicyVersion) {
    throw new Error(`qualification-evidence-${sourceIdentity}-probe-policy-mismatch`);
  }
  return acknowledgement;
}

const PROBE_CODERABBIT_CAPABILITIES: CodeRabbitCapabilities = {
  resolvedConfiguration: true,
  exclusiveLabelTrigger: true,
  labelOneShot: true,
  fullReviewCommand: true,
  exactCoverage: true,
  durableFindings: true,
  durableCleanResults: true,
  sourceConfirmedClosures: true,
};

function controllerProjectionSupports(
  cellId: QualificationCellId,
  checks: ReturnType<typeof controllerChecks>,
): boolean {
  const expectsSuccess = cellId === "coderabbit-clean" || cellId === "codex-clean";
  return checks.some((item) => expectsSuccess
    ? item.state.conclusion === "success"
    : item.state.conclusion !== "success");
}

function runObservedAt(run: JsonRecord): string {
  const observedAt = text(run.updated_at ?? run.created_at);
  if (observedAt === null) throw new Error("qualification-evidence-workflow-time-missing");
  return observedAt;
}

function acknowledgementContext(
  scope: QualificationScope,
  cellId: QualificationCellId,
  receipt: ReviewReceipt,
  run: JsonRecord,
): Omit<CodeRabbitRunContext, "trigger"> {
  const cellScope = scope.cellScopes[cellId];
  return {
    requestIdentity: computeRequestKey(receipt.request),
    requirementId: receipt.request.requirementId,
    policyVersion: receipt.request.policyVersion,
    rubricVersion: receipt.request.rubricVersion,
    baseRef: scope.defaultBranch,
    diffBaseSha: receipt.request.coverageFromSha,
    headSha: cellScope.headSha,
    changeSetId: receipt.request.changeSetId,
    coverage: receipt.request.coverage,
    coverageFromSha: receipt.request.coverageFromSha,
    coverageThroughSha: receipt.request.coverageThroughSha,
    reviewRunId: text(run.id) ?? computeRequestKey(receipt.request),
    observedAt: runObservedAt(run),
  };
}

function githubNodeId(item: JsonRecord): string | null {
  return text(item.node_id ?? item.id);
}

function githubUrl(item: JsonRecord): string | null {
  return text(item.html_url ?? item.url);
}

function cellPullUrl(scope: QualificationScope, cellId: QualificationCellId, url: string): boolean {
  return url.startsWith(`${repositoryUrl(scope)}pull/${scope.cellScopes[cellId].pullRequestNumber}`);
}

function reviewState(item: JsonRecord): "COMMENTED" | "CHANGES_REQUESTED" | "APPROVED" | null {
  const state = text(item.state)?.toUpperCase();
  return state === "COMMENTED" || state === "CHANGES_REQUESTED" || state === "APPROVED" ? state : null;
}

function codeRabbitSignals(
  scope: QualificationScope,
  cellId: QualificationCellId,
  all: JsonRecord[],
): CodeRabbitSignal[] {
  const botUserId = scope.providerBotUserIds.coderabbit;
  const signals: CodeRabbitSignal[] = [];
  for (const item of all) {
    const state = reviewState(item);
    const headSha = reviewHead(item);
    const nodeId = githubNodeId(item);
    const url = githubUrl(item);
    if (state !== null && headSha !== null && nodeId !== null && url !== null
      && cellPullUrl(scope, cellId, url) && actorId(item) === botUserId) {
      signals.push({ kind: "review", nodeId, state, headSha, botUserId, url });
      if (state === "APPROVED" && isCodeRabbitCleanReviewBody(text(item.body) ?? "")) {
        signals.push({ kind: "clean", reviewNodeId: nodeId, botUserId, headSha, url });
      }
    }
    const appOwnerId = text(nested(nested(item, "app") ?? {}, "owner")?.id);
    if (text(item.name) === "CodeRabbit" && appOwnerId === botUserId && headSha !== null) {
      const status = text(item.status);
      const conclusion = text(item.conclusion);
      const summary = text(nested(item, "output")?.summary) ?? "";
      if (status === "completed" && /\b(?:quota|rate[ -]?limit)\b/iu.test(summary)) {
        signals.push({ kind: "quota-rejected", detail: "provider quota reported by CodeRabbit check" });
      } else if (status !== "completed" || conclusion === null) {
        signals.push({ kind: "status", state: "pending", headSha });
      } else {
        signals.push({ kind: "status", state: conclusion === "success" ? "success" : "failure", headSha });
      }
    }
  }
  for (const thread of all) {
    const threadId = text(thread.id);
    const commentNodes = nested(thread, "comments")?.nodes;
    if (threadId === null || !Array.isArray(commentNodes)) continue;
    for (const value of commentNodes) {
      const comment = record(value);
      if (comment === null || actorId(comment) !== botUserId) continue;
      const severity = parseCodeRabbitFindingSeverity(text(comment.body) ?? "");
      const commentNodeId = githubNodeId(comment);
      const reviewNodeId = text(nested(comment, "pullRequestReview")?.id ?? comment.review_id);
      const commitSha = text(nested(comment, "commit")?.oid ?? comment.commit_id);
      const line = text(comment.line ?? comment.originalLine ?? comment.original_line);
      const path = text(comment.path);
      const findingUrl = githubUrl(comment);
      if (severity !== null && commentNodeId !== null && reviewNodeId !== null && findingUrl !== null
        && cellPullUrl(scope, cellId, findingUrl)
        && commitSha === scope.cellScopes[cellId].headSha
        && line !== null && path !== null) {
        signals.push({
          kind: "finding", findingId: threadId, commentNodeId, threadNodeId: threadId,
          reviewNodeId, botUserId, locus: `${path}:${line}`, severity, url: findingUrl,
        });
      }
    }
  }
  return signals;
}

function codexSignals(
  scope: QualificationScope,
  cellId: QualificationCellId,
  all: JsonRecord[],
): CodexSignal[] {
  const botUserId = scope.providerBotUserIds.codex;
  const expectedAppId = scope.providerAppIds.codex ?? "";
  const headSha = scope.cellScopes[cellId].headSha;
  const signals: CodexSignal[] = [];
  for (const item of all) {
    const state = reviewState(item);
    const reviewSha = reviewHead(item);
    const nodeId = githubNodeId(item);
    const url = githubUrl(item);
    const observedAt = text(item.submitted_at ?? item.created_at);
    if (state !== null && reviewSha !== null && nodeId !== null && url !== null && cellPullUrl(scope, cellId, url)
      && observedAt !== null && actorId(item) === botUserId) {
      signals.push({ kind: "review", nodeId, state, headSha: reviewSha, botUserId, url, observedAt });
    }
    const body = text(item.body);
    const createdAt = text(item.created_at);
    const updatedAt = text(item.updated_at);
    if (body !== null && nodeId !== null && url !== null && cellPullUrl(scope, cellId, url)
      && createdAt !== null && updatedAt !== null
      && actorId(item) === botUserId && appId(item) === expectedAppId) {
      const markers = parseCodexCommitMarkers(body);
      const commitProven = all.some((candidate) => text(candidate.sha) === headSha
        && (githubUrl(candidate)?.includes(`/commit/${headSha}`) ?? false));
      const resolvedCommitSha = markers.length === 1
        && (markers[0] === headSha || (headSha.startsWith(markers[0] ?? "") && commitProven)) ? headSha : null;
      signals.push({
        kind: "issue-comment", nodeId, appId: expectedAppId, botUserId, body,
        createdAt, updatedAt, resolvedCommitSha, url,
      });
    }
  }
  for (const thread of all) {
    const threadId = text(thread.id);
    const commentNodes = nested(thread, "comments")?.nodes;
    if (threadId === null || !Array.isArray(commentNodes)) continue;
    for (const value of commentNodes) {
      const comment = record(value);
      if (comment === null || actorId(comment) !== botUserId) continue;
      const severity = parseCodexFindingSeverity(text(comment.body) ?? "");
      const commentNodeId = githubNodeId(comment);
      const reviewNodeId = text(nested(comment, "pullRequestReview")?.id ?? comment.review_id);
      const commitSha = text(nested(comment, "commit")?.oid ?? comment.commit_id);
      const line = text(comment.line ?? comment.originalLine ?? comment.original_line);
      const path = text(comment.path);
      const findingUrl = githubUrl(comment);
      if (severity !== null && commentNodeId !== null && reviewNodeId !== null && commitSha === headSha
        && findingUrl !== null
        && cellPullUrl(scope, cellId, findingUrl)
        && line !== null && path !== null) {
        signals.push({
          kind: "finding", findingId: threadId, commentNodeId, threadNodeId: threadId,
          reviewNodeId, botUserId, locus: `${path}:${line}`, severity, url: findingUrl,
        });
      }
    }
  }
  return signals;
}

function proveCodeRabbit(
  scope: QualificationScope,
  cellId: QualificationCellId,
  all: JsonRecord[],
  ledger: ReceiptLedgerResult,
  checks: ReturnType<typeof controllerChecks>,
  run: JsonRecord,
): boolean {
  if (cellId === "coderabbit-label-trigger" || cellId === "coderabbit-command-trigger") {
    const owned = ownedProviderRequest(scope, cellId, scope.sourceIdentities.coderabbit ?? "", ledger);
    const expectedEvent = cellId === "coderabbit-label-trigger" ? "label" : "comment";
    if (owned.payload.kind !== "acknowledgement" || owned.payload.trigger.eventKind !== expectedEvent) return false;
    const triggerEventId = owned.payload.trigger.eventId;
    if (cellId === "coderabbit-command-trigger") {
      const comment = exactActorComment(all, scope.expectedActorIdentity, "@coderabbitai full review");
      return comment !== null && text(comment.id) === triggerEventId
        && cellPullUrl(scope, cellId, githubUrl(comment) ?? "")
        && checks.some((item) => item.state.receiptRefs.length > 0);
    }
    return all.some((item) => text(item.event) === "labeled"
      && text(nested(item, "label")?.name) === "arc-review-gate"
      && text(item.id) === triggerEventId
      && actorId(item) === scope.controllerBotUserId)
      && checks.some((item) => item.state.receiptRefs.length > 0);
  }
  const receipt = ownedProviderRequest(scope, cellId, scope.sourceIdentities.coderabbit ?? "", ledger);
  const signals = codeRabbitSignals(scope, cellId, all);
  if (signals.length === 0) throw new Error("qualification-evidence-coderabbit-artifact-missing");
  const result = normalizeCodeRabbitRun(
    { ...acknowledgementContext(scope, cellId, receipt, run), trigger: "controller" },
    signals,
    PROBE_CODERABBIT_CAPABILITIES,
    scope.providerBotUserIds.coderabbit,
  );
  const cellScope = scope.cellScopes[cellId];
  const stale = signals.some((signal) => (signal.kind === "review" || signal.kind === "clean")
    && signal.headSha !== cellScope.headSha);
  const exactHeadArtifact = signals.some((signal) => (signal.kind === "review" || signal.kind === "clean")
    && signal.headSha === cellScope.headSha);
  if (!controllerProjectionSupports(cellId, checks)) return false;
  if (cellId === "coderabbit-clean") return result.state === "clean" && result.qualifying;
  if (cellId === "coderabbit-findings") return result.state === "findings" && result.qualifying;
  if (cellId === "coderabbit-stale") return stale && !result.qualifying && result.evidence === null;
  return exactHeadArtifact && result.state === "queued" && !result.qualifying;
}

function proveCodex(
  scope: QualificationScope,
  cellId: QualificationCellId,
  all: JsonRecord[],
  ledger: ReceiptLedgerResult,
  checks: ReturnType<typeof controllerChecks>,
  run: JsonRecord,
): boolean {
  if (cellId === "codex-comment-trigger") {
    const acknowledgement = ownedProviderRequest(scope, cellId, scope.sourceIdentities.codex ?? "", ledger);
    if (acknowledgement.payload.kind !== "acknowledgement"
      || acknowledgement.payload.trigger.eventKind !== "comment") return false;
    const comment = exactActorComment(all, scope.expectedActorIdentity, buildCodexReviewCommand(scope.guidanceDigests.codex ?? ""));
    return comment !== null && text(comment.id) === acknowledgement.payload.trigger.eventId
      && cellPullUrl(scope, cellId, githubUrl(comment) ?? "")
      && checks.some((item) => item.state.receiptRefs.length > 0);
  }
  const receipt = ownedProviderRequest(scope, cellId, scope.sourceIdentities.codex ?? "", ledger);
  if (receipt.payload.kind !== "acknowledgement") throw new Error("qualification-evidence-codex-acknowledgement-missing");
  if (receipt.payload.trigger.occurredAt === null) throw new Error("qualification-evidence-codex-trigger-time-missing");
  const baseContext = acknowledgementContext(scope, cellId, receipt, run);
  const context: CodexRunContext = {
    ...baseContext,
    triggerEventId: receipt.payload.trigger.eventId,
    triggerOccurredAt: receipt.payload.trigger.occurredAt,
    guidanceDigest: scope.guidanceDigests.codex ?? "",
  };
  const signals = codexSignals(scope, cellId, all);
  if (signals.length === 0) throw new Error("qualification-evidence-codex-artifact-missing");
  const capabilities: CodexCapabilities = {
    resolvedGuidance: true,
    actorRequiredRequest: true,
    exactFullCoverage: true,
    durableFindings: true,
    durableCleanResults: true,
    connectedAccountTerminal: scope.terminalUnavailableMode === "terminal",
  };
  const result = normalizeCodexRun(context, signals, capabilities, {
    appId: scope.providerAppIds.codex ?? "",
    botUserId: scope.providerBotUserIds.codex,
  });
  const cellScope = scope.cellScopes[cellId];
  const stale = signals.some((signal) => signal.kind === "review" && signal.headSha !== cellScope.headSha);
  const exactHeadArtifact = signals.some((signal) => (signal.kind === "review" && signal.headSha === cellScope.headSha)
    || (signal.kind === "issue-comment" && signal.resolvedCommitSha === cellScope.headSha));
  if (!controllerProjectionSupports(cellId, checks)) return false;
  if (cellId === "codex-clean") return result.state === "clean" && result.qualifying;
  if (cellId === "codex-findings") return result.state === "findings" && result.qualifying;
  if (cellId === "codex-stale") return stale && result.state === "queued" && !result.qualifying;
  if (cellId === "codex-connected-account") {
    return result.state === "unavailable"
      && (scope.terminalUnavailableMode === "parser-only" || result.qualifying);
  }
  return exactHeadArtifact && result.state === "queued" && !result.qualifying;
}

function hasReceipt(ledger: ReceiptLedgerResult, actions: string[]): boolean {
  return ledger.receipts.some((item) => actions.includes(item.action));
}

function recordTimestamp(item: JsonRecord): string | null {
  return text(item.completed_at ?? item.updated_at ?? item.created_at ?? item.started_at);
}

function settledForEveryProvider(
  scope: QualificationScope,
  ledger: ReceiptLedgerResult,
  dispositions: string[],
): boolean {
  return [scope.sourceIdentities.coderabbit, scope.sourceIdentities.codex].every((sourceIdentity) =>
    ledger.receipts.some((item) => dispositions.includes(item.action)
      && item.request.sourceIdentity === sourceIdentity)
    && ledger.receipts.some((item) => item.action === "conversation-resolved"
      && item.request.sourceIdentity === sourceIdentity));
}

/** Prove the exact cell scope already has a durable reservation and App-authored pending projection. */
export function assertQualificationPending(
  scope: QualificationScope,
  cellId: QualificationCellId,
  records: QualificationRawRecord[],
  expectedRequestKey?: string,
): ReviewRequest {
  const all = records.flatMap((item) => objects(item.value));
  const ledger = receiptLedger(scope, cellId, all);
  const checks = ledgerBoundChecks(controllerChecks(scope, cellId, all), ledger);
  const reservation = ledger.receipts.find((item) => item.action === "reserved"
    && (expectedRequestKey === undefined || computeRequestKey(item.request) === expectedRequestKey));
  if (reservation === undefined
    || !checks.some((item) => item.state.conclusion === "pending" && item.state.receiptRefs.length > 0)) {
    throw new Error("qualification-evidence-pending-unconfirmed");
  }
  return reservation.request;
}

function proveController(scope: QualificationScope, cellId: QualificationCellId, all: JsonRecord[], ledger: ReceiptLedgerResult, run: JsonRecord): boolean {
  const cellScope = scope.cellScopes[cellId];
  const checks = controllerChecks(scope, cellId, all);
  switch (cellId) {
    case "pending-first":
      return hasReceipt(ledger, ["reserved"])
        && checks.some((item) => item.state.conclusion === "pending" && item.state.receiptRefs.length > 0);
    case "provider-fallback": return hasReceipt(ledger, ["source-superseded"]);
    case "await-ci":
      return all.some((item) => text(item.name) === "ci-ok"
        && appId(item) === scope.actionsAppId
        && text(item.head_sha) === cellScope.headSha
        && text(item.status) === "completed");
    case "await-review": return checks.length > 0;
    case "event-repair": {
      const runStartedAt = text(run.run_started_at ?? run.created_at);
      return text(run.event) === "schedule"
        && runStartedAt !== null
        && checks.some((item) => (recordTimestamp(item.raw) ?? "") >= runStartedAt)
        && all.some((item) => appId(item) === scope.controllerAppId
          && text(item.body)?.includes("arc-review-gate:receipt") === true
          && (recordTimestamp(item) ?? "") >= runStartedAt);
    }
    case "finding-fix": return settledForEveryProvider(scope, ledger, ["fixed"]);
    case "finding-nonfix": return settledForEveryProvider(scope, ledger, ["deferred", "rejected"]);
    case "provider-closure": return hasReceipt(ledger, ["provider-closed"]) && hasReceipt(ledger, ["conversation-resolved"]);
    case "ledger-reconstruction": return ledger.receipts.length > 1;
    case "token-stateless":
    case "token-classic":
      return (text(run.path)?.endsWith("review-gate-qualify.yml") ?? false)
        && all.some((item) => (text(item.name)?.startsWith("review-gate-token-qualification-") ?? false)
          && item.expired === false);
    case "repair-authority":
      return (text(run.path)?.endsWith("review-gate-repair.yml") ?? false)
        && all.some((item) => text(item.context) === "review-repair-ok"
          && actorId(item) === scope.actionsBotUserId
          && text(item.state) === "success"
          && (text(item.target_url)?.includes(`/actions/runs/${text(run.id) ?? ""}`) ?? false));
    default: return false;
  }
}

/** Derive one cell result; arbitrary nonempty records cannot supply semantic fields. */
export function deriveQualificationCellResult(
  scope: QualificationScope,
  cellId: QualificationCellId,
  records: QualificationRawRecord[],
  dispatchProof?: QualificationDispatchProof,
): Omit<QualificationCellResult, "rawCheckpointHash"> {
  const all = records.flatMap((item) => objects(item.value));
  const run = workflowRun(scope, cellId, all, dispatchProof);
  const cellScope = scope.cellScopes[cellId];
  const ledger = receiptLedger(scope, cellId, all);
  const checks = ledgerBoundChecks(controllerChecks(scope, cellId, all), ledger);
  const providerCell = cellId.startsWith("coderabbit-") || cellId.startsWith("codex-");
  const capabilityProven = cellId.startsWith("coderabbit-")
    ? proveCodeRabbit(scope, cellId, all, ledger, checks, run)
    : cellId.startsWith("codex-")
      ? proveCodex(scope, cellId, all, ledger, checks, run)
      : proveController(scope, cellId, all, ledger, run);
  if (!providerCell && !capabilityProven) throw new Error(`qualification-evidence-cell-unproven:${cellId}`);
  if (cellId === "codex-connected-account" && !capabilityProven) {
    throw new Error("qualification-evidence-connected-account-unproven");
  }
  const sourceIdentity = cellId.startsWith("coderabbit-") ? scope.sourceIdentities.coderabbit ?? ""
    : cellId.startsWith("codex-") ? scope.sourceIdentities.codex ?? "" : "arc-controller";
  const expectedOutcome = cellId === "codex-connected-account" && scope.terminalUnavailableMode === "terminal"
    ? "terminal-unavailable" : QUALIFICATION_EXPECTED_OUTCOMES[cellId];
  return {
    cellId,
    status: "passed",
    outcome: providerCell && !capabilityProven ? "unknown" : expectedOutcome,
    capabilityProven,
    repositoryId: scope.repositoryId,
    pullRequestNumber: cellScope.pullRequestNumber,
    headSha: cellScope.headSha,
    workflowSha: text(run.head_sha) ?? "",
    sourceIdentity,
    actorIdentity: scope.expectedActorIdentity,
    triggerPath: cellId === "coderabbit-label-trigger" ? "label"
      : ["coderabbit-command-trigger", "codex-comment-trigger"].includes(cellId) ? "comment" : null,
    evidenceRef: text(run.html_url) ?? "",
    rubricDimensions: providerCell ? [...QUALIFICATION_RUBRIC_DIMENSIONS] : [],
    admissibleActor: cellId === "codex-connected-account" && scope.terminalUnavailableMode === "terminal",
    fixture: false,
  };
}
