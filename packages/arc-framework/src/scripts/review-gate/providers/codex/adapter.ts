/** Hosted Codex request, observation, and substantive-evidence adapter. */

import type { ReviewRequest, SourceCapacity } from "../../core/execution.js";
import { parseEvidence, type Evidence, type FindingSeverity } from "../../core/evidence.js";
import type {
  ProviderObservation,
  RequestAcknowledgement,
  ReviewProviderAdapter,
} from "../../core/ports.js";
import { computeRequestKey } from "../../core/request-key.js";
import { CODEX_RUBRIC_VERSION } from "./guidance.js";

export interface CodexCapabilities {
  resolvedGuidance: boolean;
  actorRequiredRequest: boolean;
  exactFullCoverage: boolean;
  durableFindings: boolean;
  durableCleanResults: boolean;
  connectedAccountTerminal: boolean;
}

export interface CodexRunContext {
  requestIdentity: string;
  requirementId: string;
  policyVersion: string;
  rubricVersion: string;
  baseRef: string;
  diffBaseSha: string;
  headSha: string;
  changeSetId: string;
  coverage: "full" | "incremental";
  coverageFromSha: string;
  coverageThroughSha: string;
  reviewRunId: string;
  observedAt: string;
  triggerEventId: string;
  triggerOccurredAt: string;
  guidanceDigest: string;
}

export type CodexSignal =
  | {
    kind: "review";
    nodeId: string;
    state: "COMMENTED" | "CHANGES_REQUESTED" | "APPROVED";
    headSha: string;
    botUserId: string;
    url: string;
    observedAt: string;
  }
  | {
    kind: "finding";
    findingId: string;
    commentNodeId: string;
    threadNodeId: string;
    reviewNodeId: string;
    botUserId: string;
    locus: string;
    severity: FindingSeverity;
    url: string;
  }
  | {
    kind: "issue-comment";
    nodeId: string;
    appId: string;
    botUserId: string;
    body: string;
    createdAt: string;
    updatedAt: string;
    resolvedCommitSha: string | null;
    url: string;
  };

export type CodexTriggerOutcome =
  | ({ kind: "acknowledged" } & Omit<RequestAcknowledgement, "requestIdentity">)
  | { kind: "rejected"; reason: string }
  | { kind: "ambiguous" };

export interface CodexApi {
  validateCurrent(request: ReviewRequest): Promise<"current" | "replay" | "stale">;
  resolveRequestGuidance(request: ReviewRequest): Promise<
    | { qualified: true; guidanceDigest: string }
    | { qualified: false; reasons: string[] }
  >;
  acknowledgeUserTrigger(request: ReviewRequest): Promise<CodexTriggerOutcome>;
  readRunContext(requestIdentity: string): Promise<CodexRunContext>;
  readSignals(requestIdentity: string): Promise<CodexSignal[]>;
  readCapacity(): Promise<"not-observable" | "lookup-failed" | "exhausted">;
}

export interface CodexRunResult {
  state: "queued" | "clean" | "findings" | "unavailable";
  qualifying: boolean;
  evidence: Evidence | null;
  reasons: string[];
}

export class CodexRequestError extends Error {
  readonly code: string;
  readonly effectAmbiguous: boolean;

  constructor(code: string, effectAmbiguous = false) {
    super(code);
    this.name = "CodexRequestError";
    this.code = code;
    this.effectAmbiguous = effectAmbiguous;
  }
}

/** Exact hosted-Codex trigger carrying the rubric and effective guidance identity. */
export function buildCodexReviewCommand(guidanceDigest: string): string {
  return [
    "@codex review",
    "",
    `Rubric: ${CODEX_RUBRIC_VERSION}`,
    `Guidance-Digest: ${guidanceDigest}`,
    "Focus: intent/scope; correctness/failure behavior; trust/compatibility; verification; coherence/maintainability.",
  ].join("\n");
}

function evidenceFrom(
  context: CodexRunContext,
  result: "clean" | "findings",
  evidenceUrlOrId: string,
  findings: Array<{ findingId: string; severity: FindingSeverity; locus: string; evidenceUrlOrId: string }>,
  observedAt: string,
): Evidence {
  return parseEvidence({
    schemaVersion: 1,
    requirementId: context.requirementId,
    sourceKind: "agent",
    sourceIdentity: "codex-pr",
    result,
    evidenceUrlOrId,
    reviewRunId: context.reviewRunId,
    policyVersion: context.policyVersion,
    rubricVersion: context.rubricVersion,
    coverage: context.coverage,
    coverageFromSha: context.coverageFromSha,
    coverageThroughSha: context.coverageThroughSha,
    baseRef: context.baseRef,
    diffBaseSha: context.diffBaseSha,
    changeSetId: context.changeSetId,
    headSha: context.headSha,
    findings,
    closures: [],
    observedAt,
  });
}

function pinnedComment(
  signal: Extract<CodexSignal, { kind: "issue-comment" }>,
  context: CodexRunContext,
  expected: { appId: string; botUserId: string },
): boolean {
  return signal.appId === expected.appId
    && signal.botUserId === expected.botUserId
    && signal.createdAt === signal.updatedAt
    && signal.createdAt >= context.triggerOccurredAt
    && signal.nodeId !== context.triggerEventId
    && signal.url.length > 0;
}

function connectedAccountResponse(body: string): boolean {
  return /^Codex Review:\s*$/mu.test(body)
    && /Connect your ChatGPT account to use Codex\./u.test(body)
    && /https:\/\/chatgpt\.com\/codex\/settings\/connectors\b/u.test(body);
}

function cleanResponse(
  signal: Extract<CodexSignal, { kind: "issue-comment" }>,
  context: CodexRunContext,
): boolean {
  if (!/^Codex Review:\s*$/mu.test(signal.body)) return false;
  if (!/^Didn't find any major issues\.\s*$/mu.test(signal.body)) return false;
  const markers = [...signal.body.matchAll(/^Reviewed commit:\s*`?([a-f0-9]{7,40})`?\s*$/gimu)];
  return markers.length === 1 && signal.resolvedCommitSha === context.headSha;
}

/** Normalize only durable exact-head Codex artifacts from the owned request window. */
export function normalizeCodexRun(
  context: CodexRunContext,
  signals: CodexSignal[],
  capabilities: CodexCapabilities,
  expected: { appId: string; botUserId: string },
): CodexRunResult {
  const exactCoverage = capabilities.exactFullCoverage
    && context.coverage === "full"
    && context.coverageFromSha === context.diffBaseSha
    && context.coverageThroughSha === context.headSha
    && context.guidanceDigest.length === 64;
  const comments = signals.filter((signal): signal is Extract<CodexSignal, { kind: "issue-comment" }> =>
    signal.kind === "issue-comment" && pinnedComment(signal, context, expected));
  const unavailable = comments.filter((comment) => connectedAccountResponse(comment.body));
  const cleanComments = comments.filter((comment) => cleanResponse(comment, context));
  if (unavailable.length + cleanComments.length > 1) {
    return { state: "queued", qualifying: false, evidence: null, reasons: ["ambiguous-terminal-comments"] };
  }
  if (unavailable.length === 1) {
    return {
      state: "unavailable",
      qualifying: capabilities.connectedAccountTerminal,
      evidence: null,
      reasons: capabilities.connectedAccountTerminal ? ["terminal-capability-has-no-satisfying-evidence"] : ["connected-account-parser-only"],
    };
  }

  const reviews = signals.filter((signal): signal is Extract<CodexSignal, { kind: "review" }> =>
    signal.kind === "review");
  const findings = signals.filter((signal): signal is Extract<CodexSignal, { kind: "finding" }> =>
    signal.kind === "finding");
  if (findings.length > 0) {
    const matchingReviews = reviews.filter((candidate) => candidate.state === "COMMENTED"
      && candidate.headSha === context.headSha
      && candidate.botUserId === expected.botUserId
      && candidate.observedAt >= context.triggerOccurredAt);
    const review = matchingReviews[0];
    const valid = matchingReviews.length === 1 && review !== undefined
      && exactCoverage
      && capabilities.durableFindings
      && findings.every((finding) => finding.botUserId === expected.botUserId
        && finding.reviewNodeId === review.nodeId
        && finding.findingId === finding.threadNodeId
        && finding.commentNodeId.length > 0
        && finding.locus.length > 0
        && finding.url.length > 0);
    if (!valid) {
      return { state: "findings", qualifying: false, evidence: null, reasons: ["finding-artifact-unqualified"] };
    }
    return {
      state: "findings",
      qualifying: true,
      evidence: evidenceFrom(context, "findings", review.url, findings.map((finding) => ({
        findingId: finding.findingId,
        severity: finding.severity,
        locus: finding.locus,
        evidenceUrlOrId: finding.url,
      })), review.observedAt),
      reasons: [],
    };
  }

  const clean = cleanComments[0];
  if (clean !== undefined) {
    if (!exactCoverage || !capabilities.durableCleanResults) {
      return { state: "clean", qualifying: false, evidence: null, reasons: ["clean-artifact-unqualified"] };
    }
    return {
      state: "clean",
      qualifying: true,
      evidence: evidenceFrom(context, "clean", clean.url, [], clean.createdAt),
      reasons: [],
    };
  }
  return { state: "queued", qualifying: false, evidence: null, reasons: ["result-unproven"] };
}

/** Neutral provider-port implementation for hosted Codex. */
export class CodexProviderAdapter implements ReviewProviderAdapter {
  private readonly api: CodexApi;
  private readonly capabilities: CodexCapabilities;
  private readonly expected: { appId: string; botUserId: string };

  constructor(input: {
    api: CodexApi;
    capabilities: CodexCapabilities;
    expectedAppId: string;
    expectedBotUserId: string;
  }) {
    this.api = input.api;
    this.capabilities = input.capabilities;
    this.expected = { appId: input.expectedAppId, botUserId: input.expectedBotUserId };
  }

  async readCapacity(sourceIdentity: string): Promise<SourceCapacity> {
    const observed = await this.api.readCapacity();
    return {
      schemaVersion: 1,
      sourceIdentity,
      status: observed === "exhausted" ? "exhausted" : "unknown",
      reason: observed === "exhausted" ? "provider-reported" : observed,
      provenance: observed === "exhausted" ? "owned request rejected for provider capacity" : "no identity-bound lookup",
      observedAt: new Date().toISOString(),
    };
  }

  async qualifyRequest(request: ReviewRequest): Promise<{ qualified: boolean; reason: string }> {
    if (!this.capabilities.resolvedGuidance) return { qualified: false, reason: "guidance-unresolved" };
    if (!this.capabilities.actorRequiredRequest || request.requestMechanism !== "user-trigger") {
      return { qualified: false, reason: "actor-required-request-unqualified" };
    }
    if (request.coverage !== "full" || request.requestCommand === null) {
      return { qualified: false, reason: "full-review-request-required" };
    }
    const guidance = await this.api.resolveRequestGuidance(request);
    if (!guidance.qualified) return { qualified: false, reason: guidance.reasons[0] ?? "guidance-unresolved" };
    if (request.requestCommand !== buildCodexReviewCommand(guidance.guidanceDigest)) {
      return { qualified: false, reason: "guidance-command-mismatch" };
    }
    return { qualified: true, reason: "qualified" };
  }

  async request(request: ReviewRequest): Promise<RequestAcknowledgement> {
    const current = await this.api.validateCurrent(request);
    if (current !== "current") throw new CodexRequestError(current);
    const qualification = await this.qualifyRequest(request);
    if (!qualification.qualified) throw new CodexRequestError(qualification.reason);
    const outcome = await this.api.acknowledgeUserTrigger(request);
    if (outcome.kind === "ambiguous") throw new CodexRequestError("ambiguous-delivery", true);
    if (outcome.kind === "rejected") throw new CodexRequestError(`pre-effect-rejection:${outcome.reason}`);
    if (
      outcome.trigger.eventKind !== "comment"
      || outcome.trigger.actorIdentity !== request.requiredActorIdentity
      || outcome.trigger.headSha !== request.coverageThroughSha
      || outcome.trigger.occurredAt !== outcome.acknowledgedAt
    ) throw new CodexRequestError("trigger-provenance-mismatch", true);
    return {
      requestIdentity: computeRequestKey(request),
      acknowledgedAt: outcome.acknowledgedAt,
      trigger: outcome.trigger,
      ...(outcome.durableRef === undefined ? {} : { durableRef: outcome.durableRef }),
    };
  }

  async observe(requestIdentity: string): Promise<ProviderObservation[]> {
    const [context, signals] = await Promise.all([
      this.api.readRunContext(requestIdentity),
      this.api.readSignals(requestIdentity),
    ]);
    return signals.map((signal, index) => ({
      schemaVersion: 1,
      requestIdentity,
      sourceIdentity: "codex-pr",
      observedAt: new Date().toISOString(),
      opaqueRef: JSON.stringify({ index, context, signal }),
    }));
  }

  normalizeEvidence(observations: ProviderObservation[]): Promise<Evidence[]> {
    const first = observations[0];
    if (first === undefined) return Promise.resolve([]);
    const decoded = observations.map((observation) => JSON.parse(observation.opaqueRef) as {
      context?: CodexRunContext;
      signal?: CodexSignal;
    });
    const context = decoded[0]?.context;
    if (context === undefined || decoded.some((item) => item.signal === undefined)) {
      throw new Error("Codex observation is malformed");
    }
    const result = normalizeCodexRun(
      context,
      decoded.map((item) => item.signal as CodexSignal),
      this.capabilities,
      this.expected,
    );
    return Promise.resolve(result.evidence === null ? [] : [result.evidence]);
  }
}
