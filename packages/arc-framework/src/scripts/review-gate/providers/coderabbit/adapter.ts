/** CodeRabbit request, observation, and shadow-evidence adapter. */

import type { ReviewRequest, SourceCapacity } from "../../core/execution.js";
import type { Evidence, FindingSeverity } from "../../core/evidence.js";
import type {
  ProviderObservation,
  RequestAcknowledgement,
  ReviewProviderAdapter,
} from "../../core/ports.js";
import { parseEvidence } from "../../core/evidence.js";
import { computeRequestKey } from "../../core/request-key.js";

/** Probe-backed capabilities selected before request reservation. */
export interface CodeRabbitCapabilities {
  resolvedConfiguration: boolean;
  exclusiveLabelTrigger: boolean;
  labelOneShot: boolean;
  fullReviewCommand: boolean;
  exactCoverage: boolean;
  durableFindings: boolean;
  durableCleanResults: boolean;
  sourceConfirmedClosures: boolean;
}

/** Live-probe result: useful shadow findings, but no qualifying clean/closure path. */
export const CODERABBIT_SHADOW_CAPABILITIES: CodeRabbitCapabilities = {
  resolvedConfiguration: false,
  exclusiveLabelTrigger: false,
  labelOneShot: true,
  fullReviewCommand: true,
  exactCoverage: true,
  durableFindings: true,
  durableCleanResults: false,
  sourceConfirmedClosures: false,
};

/** One provider trigger result; ambiguous delivery is never retried or rerouted. */
export type TriggerOutcome =
  | {
    kind: "acknowledged";
    acknowledgedAt: string;
    trigger: RequestAcknowledgement["trigger"];
    durableRef?: string;
  }
  | { kind: "rejected"; reason: string }
  | { kind: "ambiguous" };

/** Provider-specific injected boundary. */
export interface CodeRabbitApi {
  validateCurrent(request: ReviewRequest): Promise<"current" | "replay" | "stale">;
  applyTriggerLabel(request: ReviewRequest): Promise<TriggerOutcome>;
  requestFullReview(request: ReviewRequest): Promise<TriggerOutcome>;
  removeTriggerLabel(request: ReviewRequest): Promise<void>;
  readRunContext(requestIdentity: string): Promise<CodeRabbitRunContext>;
  readSignals(requestIdentity: string): Promise<CodeRabbitSignal[]>;
  readCapacity(): Promise<"not-observable" | "lookup-failed" | "exhausted">;
}

/** Raw provider signals after GitHub transport validation. */
export type CodeRabbitSignal =
  | { kind: "status"; state: "pending" | "success" | "failure"; headSha: string }
  | { kind: "walkthrough"; text: string; mutable: boolean }
  | {
    kind: "review";
    nodeId: string;
    state: "COMMENTED" | "CHANGES_REQUESTED" | "APPROVED";
    headSha: string;
    botUserId: string;
    url: string;
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
    kind: "clean";
    reviewNodeId: string;
    botUserId: string;
    headSha: string;
    url: string;
  }
  | { kind: "thread-resolution"; threadNodeId: string; resolvedByBotUserId: string }
  | { kind: "quota-rejected"; detail: string };

/** Exact run/coverage identities supplied by canonical host state. */
export interface CodeRabbitRunContext {
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
  trigger: "controller" | "direct";
}

/** Reduced provider state plus any qualifying durable finding evidence. */
export interface CodeRabbitRunResult {
  state: "queued" | "running" | "clean" | "findings" | "failed" | "unavailable";
  qualifying: boolean;
  evidence: Evidence | null;
  receiptAction: "attested" | "unadmitted";
  reasons: string[];
}

/** Request failure retaining whether an effect may have happened. */
export class CodeRabbitRequestError extends Error {
  readonly code: string;
  readonly effectAmbiguous: boolean;

  constructor(code: string, effectAmbiguous = false) {
    super(code);
    this.name = "CodeRabbitRequestError";
    this.code = code;
    this.effectAmbiguous = effectAmbiguous;
  }
}

export type CodeRabbitRequestMechanism = "label" | "full-review-command";

/** Select the one supported request mechanism before the reservation is written. */
export function selectCodeRabbitRequestMechanism(
  request: ReviewRequest,
  capabilities: CodeRabbitCapabilities,
): CodeRabbitRequestMechanism {
  if (!capabilities.resolvedConfiguration) throw new CodeRabbitRequestError("configuration-unresolved");
  if (request.coverage !== "full") throw new CodeRabbitRequestError("incremental-request-unsupported");
  if (request.generation === 0) {
    if (!capabilities.exclusiveLabelTrigger || !capabilities.labelOneShot) {
      throw new CodeRabbitRequestError("label-trigger-unqualified");
    }
    return "label";
  }
  if (!capabilities.fullReviewCommand) throw new CodeRabbitRequestError("full-review-command-unqualified");
  return "full-review-command";
}

/** Neutral provider-port implementation with CodeRabbit behavior kept inside. */
export class CodeRabbitProviderAdapter implements ReviewProviderAdapter {
  private readonly api: CodeRabbitApi;
  private readonly capabilities: CodeRabbitCapabilities;
  private readonly expectedBotUserId: string;

  constructor(input: {
    api: CodeRabbitApi;
    capabilities: CodeRabbitCapabilities;
    expectedBotUserId: string;
  }) {
    this.api = input.api;
    this.capabilities = input.capabilities;
    this.expectedBotUserId = input.expectedBotUserId;
  }

  async readCapacity(sourceIdentity: string): Promise<SourceCapacity> {
    const observed = await this.api.readCapacity();
    return {
      schemaVersion: 1,
      sourceIdentity,
      status: observed === "exhausted" ? "exhausted" : "unknown",
      reason: observed === "exhausted" ? "provider-reported" : observed,
      provenance: observed === "exhausted" ? "request rejected for provider quota" : "no identity-bound numeric lookup",
      observedAt: new Date().toISOString(),
    };
  }

  qualifyRequest(request: ReviewRequest): Promise<{ qualified: boolean; reason: string }> {
    try {
      selectCodeRabbitRequestMechanism(request, this.capabilities);
      return Promise.resolve({ qualified: true, reason: "qualified" });
    } catch (error) {
      return Promise.resolve({
        qualified: false,
        reason: error instanceof CodeRabbitRequestError ? error.code : "request-unqualified",
      });
    }
  }

  async request(request: ReviewRequest): Promise<RequestAcknowledgement> {
    const current = await this.api.validateCurrent(request);
    if (current !== "current") throw new CodeRabbitRequestError(current);
    const mechanism = selectCodeRabbitRequestMechanism(request, this.capabilities);
    const outcome = mechanism === "label"
      ? await this.api.applyTriggerLabel(request)
      : await this.api.requestFullReview(request);
    if (outcome.kind === "ambiguous") throw new CodeRabbitRequestError("ambiguous-delivery", true);
    if (outcome.kind === "rejected") throw new CodeRabbitRequestError(`pre-effect-rejection:${outcome.reason}`);
    if (
      outcome.trigger.actorIdentity !== request.requiredActorIdentity
      || outcome.trigger.headSha !== request.coverageThroughSha
      || outcome.trigger.occurredAt !== outcome.acknowledgedAt
    ) throw new CodeRabbitRequestError("trigger-provenance-mismatch", true);
    if (mechanism === "label") {
      try {
        await this.api.removeTriggerLabel(request);
      } catch {
        // The request is already acknowledged; label cleanup is best-effort.
      }
    }
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
      sourceIdentity: "coderabbit-pr",
      observedAt: new Date().toISOString(),
      opaqueRef: JSON.stringify({ index, context, signal }),
    }));
  }

  normalizeEvidence(observations: ProviderObservation[]): Promise<Evidence[]> {
    const first = observations[0];
    if (first === undefined) return Promise.resolve([]);
    const decoded = observations.map((observation) => {
      const parsed = JSON.parse(observation.opaqueRef) as { signal?: CodeRabbitSignal };
      if (parsed.signal === undefined) throw new Error("CodeRabbit observation is malformed");
      return parsed.signal;
    });
    const context = decodeContext(first);
    const result = normalizeCodeRabbitRun(context, decoded, this.capabilities, this.expectedBotUserId);
    return Promise.resolve(result.evidence === null ? [] : [result.evidence]);
  }
}

function decodeContext(observation: ProviderObservation): CodeRabbitRunContext {
  const parsed = JSON.parse(observation.opaqueRef) as { context?: CodeRabbitRunContext };
  if (parsed.context === undefined) throw new Error("CodeRabbit observation context is missing");
  return parsed.context;
}

/** Reduce provider status/review/comment signals without granting them policy authority. */
export function normalizeCodeRabbitRun(
  context: CodeRabbitRunContext,
  signals: CodeRabbitSignal[],
  capabilities: CodeRabbitCapabilities,
  expectedBotUserId: string,
): CodeRabbitRunResult {
  const receiptAction = context.trigger === "direct" ? "unadmitted" : "attested";
  if (signals.some((signal) => signal.kind === "quota-rejected")) {
    return { state: "unavailable", qualifying: false, evidence: null, receiptAction, reasons: ["quota-rejected"] };
  }
  if (signals.some((signal) => signal.kind === "status" && signal.state === "failure")) {
    return { state: "failed", qualifying: false, evidence: null, receiptAction, reasons: ["provider-status-failure"] };
  }

  const reviews = signals.filter((signal): signal is Extract<CodeRabbitSignal, { kind: "review" }> =>
    signal.kind === "review");
  const findings = signals.filter((signal): signal is Extract<CodeRabbitSignal, { kind: "finding" }> =>
    signal.kind === "finding");
  const exactFullCoverage = context.coverage === "full"
    && context.coverageThroughSha === context.headSha
    && context.coverageFromSha === context.diffBaseSha;
  const findingReview = reviews.find((review) =>
    review.state === "CHANGES_REQUESTED"
    && review.headSha === context.headSha
    && review.botUserId === expectedBotUserId);

  if (findings.length > 0) {
    const reasons: string[] = [];
    if (!capabilities.exactCoverage || !exactFullCoverage) reasons.push("exact-coverage-unproven");
    if (!capabilities.durableFindings) reasons.push("durable-findings-unproven");
    if (findingReview === undefined || findingReview.nodeId.length === 0) reasons.push("authoritative-review-missing");
    for (const finding of findings) {
      if (
        finding.botUserId !== expectedBotUserId
        || finding.commentNodeId.length === 0
        || finding.threadNodeId.length === 0
        || finding.reviewNodeId !== findingReview?.nodeId
        || finding.locus.length === 0
        || finding.url.length === 0
      ) reasons.push(`invalid-finding:${finding.findingId}`);
    }
    if (reasons.length > 0 || findingReview === undefined) {
      return { state: "findings", qualifying: false, evidence: null, receiptAction, reasons };
    }
    const evidence = parseEvidence({
      schemaVersion: 1,
      requirementId: context.requirementId,
      sourceKind: "agent",
      sourceIdentity: "coderabbit-pr",
      result: "findings",
      evidenceUrlOrId: findingReview.url,
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
      findings: findings.map((finding) => ({
        findingId: finding.findingId,
        severity: finding.severity,
        locus: finding.locus,
        evidenceUrlOrId: finding.url,
      })),
      closures: [],
      observedAt: context.observedAt,
    });
    return { state: "findings", qualifying: true, evidence, receiptAction, reasons: [] };
  }

  const statusPending = signals.some((signal) => signal.kind === "status" && signal.state === "pending");
  if (statusPending) return { state: "running", qualifying: false, evidence: null, receiptAction, reasons: [] };
  const clean = signals.find((signal): signal is Extract<CodeRabbitSignal, { kind: "clean" }> =>
    signal.kind === "clean"
    && signal.botUserId === expectedBotUserId
    && signal.headSha === context.headSha
    && signal.reviewNodeId.length > 0
    && signal.url.length > 0);
  if (clean !== undefined) {
    const reasons: string[] = [];
    if (!capabilities.exactCoverage || !exactFullCoverage) reasons.push("exact-coverage-unproven");
    if (!capabilities.durableCleanResults) reasons.push("durable-clean-result-unproven");
    if (reasons.length > 0) {
      return { state: "clean", qualifying: false, evidence: null, receiptAction, reasons };
    }
    const evidence = parseEvidence({
      schemaVersion: 1,
      requirementId: context.requirementId,
      sourceKind: "agent",
      sourceIdentity: "coderabbit-pr",
      result: "clean",
      evidenceUrlOrId: clean.url,
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
      findings: [],
      closures: [],
      observedAt: context.observedAt,
    });
    return {
      state: "clean",
      qualifying: true,
      evidence,
      receiptAction,
      reasons: [],
    };
  }
  return { state: "queued", qualifying: false, evidence: null, receiptAction, reasons: ["result-unproven"] };
}
