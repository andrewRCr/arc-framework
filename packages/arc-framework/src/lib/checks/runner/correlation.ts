/** Correlate runner claims with a fixed plan before they can qualify check evidence. */
import type { z } from "zod";
import { CancelResultSchema, PrepareResultSchema, ReleaseResultSchema, SettledRunResultSchema,
  type Invocation, type OutcomeParams, type OutputParams, type PrepareParams, type PrepareResult, type Probe, type QualifiedRuntime,
  type RecoveryParams, type RunGroupParams, type RunnerReply, type RunnerRequest, type RunParams,
  type SettledRunResult, type TerminalOutcome } from "./contract.js";

const resultSchemas = { "check/prepare": PrepareResultSchema, "check/run": SettledRunResultSchema,
  "check/runGroup": SettledRunResultSchema, "check/cancel": CancelResultSchema, "check/release": ReleaseResultSchema };

/** Operation-specific payloads after matching a reply to its request. */
export type RunnerResultByMethod = { [Method in keyof typeof resultSchemas]: z.infer<(typeof resultSchemas)[Method]> };

/** Match a reply to its request and validate the operation-specific result. */
export function decodeRunnerReply<Request extends RunnerRequest>(
  request: Request, reply: RunnerReply,
): RunnerResultByMethod[Request["method"]] {
  if (reply.id !== request.id) throw protocolError("reply does not match its request ID");
  if ("error" in reply) throw protocolError(`returned JSON-RPC error ${reply.error.code}`);
  const parsed = resultSchemas[request.method].safeParse(reply.result);
  if (!parsed.success) throw protocolError("reply result does not match its operation");
  validateReplyEcho(request, parsed.data);
  return parsed.data as RunnerResultByMethod[Request["method"]];
}

function validateReplyEcho(request: RunnerRequest, result: RunnerResultByMethod[keyof RunnerResultByMethod]): void {
  if ("planId" in request.params && "planId" in result && request.params.planId !== result.planId) {
    throw protocolError("reply belongs to another attempt");
  }
  if ("contextId" in request.params && "contextId" in result && request.params.contextId !== result.contextId) {
    throw protocolError("reply belongs to another context");
  }
  if (!("invocationIds" in result)) return;
  const expected = request.method === "check/run" ? [request.params.invocationId]
    : request.method === "check/runGroup" ? request.params.invocationIds : [];
  if (!exactIds(new Set(expected), result.invocationIds)) throw protocolError("reply has conflicting invocation coverage");
}

/** Independently indexed invocation/probe namespaces for one caller-known attempt. */
export interface RunnerPlanIndex {
  readonly planId: string;
  readonly sourceDigest: string;
  readonly invocations: ReadonlyMap<string, Invocation>;
  readonly probes: ReadonlyMap<string, Probe>;
}

/** One invocation's qualified execution environment and exact requested probe output. */
export interface QualifiedInvocationRuntime {
  readonly identity: string;
  readonly probes: ReadonlyMap<string, string>;
}

/** Complete known qualification in fixed invocation order. */
export type KnownRunnerRuntime = ReadonlyMap<string, QualifiedInvocationRuntime>;

/** A source-confirmed context with required attempt recovery and optional reusable qualification. */
export interface PreparedRunnerContext {
  readonly plan: RunnerPlanIndex;
  readonly contextId: string;
  readonly supportsRunGroup: boolean;
  readonly runtime: KnownRunnerRuntime | undefined;
}

/** Index one fixed plan without conflating invocation and probe identity namespaces. */
export function indexRunnerPlan(plan: PrepareParams): RunnerPlanIndex {
  return { planId: plan.planId, sourceDigest: plan.source.digest,
    invocations: uniqueById(plan.invocations, "invocation"),
    probes: uniqueById([...plan.probes.global, ...plan.probes.check], "probe"),
  };
}

/** Validate claimed-known coverage, or leave execution unqualified when explicitly unknown. */
export function qualifyRunnerRuntime(plan: RunnerPlanIndex, runtime: QualifiedRuntime): KnownRunnerRuntime | undefined {
  if (runtime.kind === "unknown") return undefined;
  if (!exactIds(plan.invocations, runtime.bindings.map(binding => binding.invocationId))) {
    throw protocolError("has incomplete or conflicting runtime invocation coverage");
  }
  const bindings = new Map(runtime.bindings.map(binding => [binding.invocationId, binding]));
  const qualified = new Map<string, QualifiedInvocationRuntime>();
  for (const id of plan.invocations.keys()) {
    const binding = requiredValue(bindings, id);
    if (!exactIds(plan.probes, binding.probes.map(probe => probe.id))) {
      throw protocolError("has incomplete or conflicting runtime probe coverage");
    }
    const stdout = new Map(binding.probes.map(probe => [probe.id, probe.stdout]));
    qualified.set(id, { identity: binding.identity, probes: new Map([...plan.probes.keys()].map(probeId => [probeId, requiredValue(stdout, probeId)])) });
  }
  return qualified;
}

/** Accept recovery instructions only for the caller-known attempt. */
export function validateRunnerRecovery(plan: RunnerPlanIndex, recovery: RecoveryParams): void {
  if (recovery.planId !== plan.planId) throw protocolError("recovery belongs to another attempt");
}

/** Validate the ready or unavailable arm without treating unknown runtime as unavailable execution. */
export function validateRunnerPreparation(plan: RunnerPlanIndex, result: PrepareResult, recovery?: RecoveryParams): PreparedRunnerContext | undefined {
  if (result.planId !== plan.planId) throw protocolError("preparation belongs to another attempt");
  if (recovery !== undefined) validateRunnerRecovery(plan, recovery);
  if (result.status === "unavailable") return undefined;
  if (recovery === undefined) throw protocolError("ready context is missing required attempt recovery");
  if (result.sourceDigest !== plan.sourceDigest) throw protocolError("ready context confirms another source");
  return { plan, contextId: result.contextId, supportsRunGroup: result.capabilities.runGroup,
    runtime: qualifyRunnerRuntime(plan, result.runtime) };
}

/** Correlate immutable outcomes and settlement for one fixed execution request. */
export class RunnerExecution {
  private readonly ids: ReadonlySet<string>;
  private readonly contextId: string;
  private readonly completed = new Map<string, Readonly<TerminalOutcome>>();
  private state: "open" | "settled" | "failed" = "open";

  constructor(context: PreparedRunnerContext, request: RunParams | RunGroupParams) {
    if (request.contextId !== context.contextId) throw protocolError("execution belongs to another context");
    const group = "invocationIds" in request;
    if (group && !context.supportsRunGroup) throw protocolError("group execution was not advertised");
    const ids = group ? request.invocationIds : [request.invocationId];
    if (new Set(ids).size !== ids.length || ids.some(id => !context.plan.invocations.has(id))) {
      throw protocolError("execution contains duplicate or unplanned invocation IDs");
    }
    this.contextId = context.contextId;
    this.ids = new Set(ids);
  }

  /** Validate the source of one required output chunk. */
  acceptOutput(output: OutputParams): void { this.assertIdentity(output); }

  /** Retain one immutable terminal outcome for a requested invocation. */
  acceptOutcome(notification: OutcomeParams): void {
    this.assertIdentity(notification);
    if (this.completed.has(notification.invocationId)) this.fail("received a duplicate terminal outcome");
    this.completed.set(notification.invocationId, Object.freeze({ ...notification.outcome }));
  }

  /** Retain observed outcomes for incomplete-execution diagnostics. */
  get observedOutcomes(): ReadonlyMap<string, Readonly<TerminalOutcome>> { return new Map(this.completed); }

  /** Accept settlement only after the complete requested outcome set. */
  settle(result: SettledRunResult): ReadonlyMap<string, Readonly<TerminalOutcome>> {
    this.assertOpen();
    if (result.contextId !== this.contextId) this.fail("settlement belongs to another context");
    if (!exactIds(this.ids, result.invocationIds)) this.fail("settled reply has conflicting invocation coverage");
    if (!exactIds(this.ids, [...this.completed.keys()])) this.fail("settlement is missing requested terminal outcomes");
    this.state = "settled";
    return new Map([...this.ids].map(id => [id, requiredValue(this.completed, id)]));
  }

  private assertOpen(): void {
    if (this.state === "failed") throw protocolError("execution already failed");
    if (this.state === "settled") this.fail("received data after execution settled");
  }

  private assertIdentity(input: { contextId: string; invocationId: string }): void {
    this.assertOpen();
    if (input.contextId !== this.contextId) this.fail("execution data belongs to another context");
    if (!this.ids.has(input.invocationId)) this.fail("execution data names an unrequested invocation");
  }

  private fail(detail: string): never {
    this.state = "failed";
    throw protocolError(detail);
  }
}

function exactIds(expected: { readonly size: number; has(id: string): boolean }, actual: readonly string[]): boolean {
  return actual.length === expected.size && new Set(actual).size === expected.size && actual.every(id => expected.has(id));
}

function requiredValue<T>(indexed: ReadonlyMap<string, T>, id: string): T {
  const value = indexed.get(id);
  if (value === undefined) throw protocolError("has missing indexed coverage");
  return value;
}

function protocolError(detail: string): Error {
  return new Error(`Runner protocol ${detail}; repair the runner and retry the check request.`);
}

function uniqueById<T extends { id: string }>(items: readonly T[], kind: string): Map<string, T> {
  const indexed = new Map<string, T>();
  for (const item of items) {
    if (indexed.has(item.id)) throw protocolError(`has a duplicate ${kind} identity`);
    indexed.set(item.id, item);
  }
  return indexed;
}
