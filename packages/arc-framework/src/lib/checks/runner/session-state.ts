/** Attempt and context authority retained independently of transport diagnostics. */
import type { CancelParams, RecoveryParams, RunParams, RunGroupParams, RunnerNotification, RunnerRequest, TerminalOutcome } from "./contract.js";
import { RunnerExecution, callerRequestError, indexRunnerPlan, validateRunnerPreparation, validateRunnerRecovery,
  type KnownRunnerRuntime, type PreparedRunnerContext, type RunnerPlanIndex, type RunnerResultByMethod } from "./correlation.js";

/** Ordered application state for one adapter process and its fixed attempt. */
export class RunnerConversationState {
  private phase: "new" | "preparing" | "ready" | "unavailable" | "releasing" | "released" = "new";
  private plan: RunnerPlanIndex | undefined;
  private guidance: Readonly<RecoveryParams> | undefined;
  private context: PreparedRunnerContext | undefined;
  private execution: RunnerExecution | undefined;
  private readonly used = new Set<string>();
  private readonly outcomes = new Map<string, Readonly<TerminalOutcome>>();
  private warning: string | undefined;

  /** Recovery retained before accepting any ready context. */
  get recovery(): Readonly<RecoveryParams> | undefined { return this.guidance; }

  /** Immutable terminal observations remain available after a transport fault. */
  get observedOutcomes(): ReadonlyMap<string, Readonly<TerminalOutcome>> { return new Map(this.outcomes); }

  /** Context that can be released after preparation and execution have settled. */
  get releaseContextId(): string | undefined { return this.phase === "ready" && this.execution === undefined ? this.context?.contextId : undefined; }

  /** Terminal reply arm already observed before process closure. */
  get closureKind(): "context" | "no-context" | undefined {
    return this.phase === "released" ? "context" : this.phase === "unavailable" ? "no-context" : undefined;
  }

  /** Work or lifetime operations that still need their own terminal reply. */
  get hasOutstandingWork(): boolean { return this.phase === "preparing" || this.phase === "releasing" || this.execution !== undefined; }

  /** Disposable cleanup trouble after the adapter proved context settlement. */
  get cleanupWarning(): string | undefined { return this.warning; }

  /** Complete per-invocation qualification, absent for explicitly unknown runtime. */
  get runtime(): KnownRunnerRuntime | undefined { return this.context?.runtime; }

  /** Validate an operation before its request can reach the adapter. */
  begin(request: RunnerRequest): void {
    if (request.method === "check/prepare") {
      if (this.phase !== "new") throw callerRequestError("preparation was already requested");
      const plan = indexRunnerPlan(request.params);
      this.plan = plan;
      this.phase = "preparing";
      return;
    }
    if (this.phase === "new") throw callerRequestError("requires preparation as its first request");
    if (request.method === "check/cancel") { this.cancel(request.params); return; }
    if (this.phase !== "ready" || this.context === undefined) throw callerRequestError("requires a ready context");
    if (request.params.contextId !== this.context.contextId) throw callerRequestError("operation belongs to another context");
    if (this.execution !== undefined) throw callerRequestError("already has an outstanding execution request");
    if (request.method === "check/release") { this.phase = "releasing"; return; }
    this.startExecution(request.params);
  }

  /** Validate and retain protocol notifications before required delivery. */
  notify(notification: RunnerNotification): void {
    if (notification.method === "check/recovery") {
      if (this.plan === undefined || this.phase !== "preparing") throw conversationError("recovery is outside preparation");
      validateRunnerRecovery(this.plan, notification.params);
      if (this.guidance !== undefined) throw conversationError("received duplicate recovery instructions");
      this.guidance = Object.freeze({ ...notification.params });
      return;
    }
    if (this.execution === undefined) throw conversationError("received execution data without an outstanding request");
    if (notification.method === "check/output") { this.execution.acceptOutput(notification.params); return; }
    this.execution.acceptOutcome(notification.params);
    this.outcomes.set(notification.params.invocationId, Object.freeze({ ...notification.params.outcome }));
  }

  /** Apply a structurally correlated result before resolving its caller. */
  reply(request: RunnerRequest, result: RunnerResultByMethod[RunnerRequest["method"]]): void {
    if (request.method === "check/prepare" && "status" in result) {
      if (this.plan === undefined) throw conversationError("preparation has no fixed plan");
      this.context = validateRunnerPreparation(this.plan, result, this.guidance);
      this.phase = this.context === undefined ? "unavailable" : "ready";
    } else if ((request.method === "check/run" || request.method === "check/runGroup") && "outputComplete" in result) {
      if (this.execution === undefined) throw conversationError("settlement has no outstanding execution");
      this.execution.settle(result);
      this.execution = undefined;
    } else if (request.method === "check/release" && "released" in result) {
      this.phase = "released";
      this.warning = result.cleanupWarning;
    }
  }

  private startExecution(request: RunParams | RunGroupParams): void {
    if (this.context === undefined) throw callerRequestError("requires a ready context");
    const execution = new RunnerExecution(this.context, request);
    const ids = "invocationIds" in request ? request.invocationIds : [request.invocationId];
    if (ids.some(id => this.used.has(id))) throw callerRequestError("invocation was already requested for execution");
    this.execution = execution;
    for (const id of ids) this.used.add(id);
  }

  private cancel(request: CancelParams): void {
    if (this.plan === undefined || request.planId !== this.plan.planId) throw callerRequestError("cancellation belongs to another attempt");
    if (request.contextId !== undefined && request.contextId !== this.context?.contextId) throw callerRequestError("cancellation belongs to another context");
    if (this.phase !== "preparing" && this.phase !== "ready") throw callerRequestError("cancellation is outside an active attempt");
  }
}

function conversationError(detail: string): Error {
  return new Error(`Runner protocol ${detail}; repair the runner and retry the check request.`);
}
