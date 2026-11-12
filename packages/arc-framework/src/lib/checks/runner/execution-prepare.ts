/** Validate captured inputs around adapter preparation and transfer their settled lifetime. */
import { batchPortableCheckPaths } from "../batching.js";
import { createCheckRunnerSession, type CheckRunnerSession } from "./session.js";
import { PrepareParamsSchema, type OutputParams, type PrepareParams, type PrepareResult } from "./contract.js";
import { indexRunnerPlan } from "./correlation.js";
import { verifySourcePresentation } from "./source-verify.js";
import { verifyCapturedEnvironment } from "./environment-verify.js";
import { indexSourcePresentation } from "./source-scope.js";
import { createExecutionLifetime, disposeSettledExecutionInputs, type ExecutionLifetime } from "./execution-lifetime.js";
import { runPreparedInvocations } from "./execution-run.js";
import type { CheckExecutionPlan } from "./planning.js";
import type { ExecutionAttemptControl } from "./execution-attempt.js";
import type { CapturedCheckExecutionInputs } from "./execution-inputs.js";
import type { CheckExecutionIO, CheckExecutionPreparation, PrepareSelectedCheckExecutionInput,
  PreparedCheckExecution, RetainedCheckExecution } from "./execution.js";

/** Prepare already-owned inputs through one conversation; callers retain no parallel cleanup authority. */
export async function prepareCapturedCheckExecution(inputs: CapturedCheckExecutionInputs,
  input: PrepareSelectedCheckExecutionInput, io: CheckExecutionIO, control: ExecutionAttemptControl): Promise<CheckExecutionPreparation> {
  const planId = control.planId;
  let session: CheckRunnerSession | undefined;
  let launching = false;
  let lifetime: ExecutionLifetime | undefined;
  let contextId: string | undefined;
  control.bindCaptured(() => retainedExecution(inputs, input, planId, contextId, session));
  const dispose = async () => { await inputs.dispose(); control.releaseCaptured(); };
  try {
    control.signal.throwIfAborted();
    const fixed = fixedPreparation(inputs, planId);
    const { params } = fixed;
    await verifySourcePresentation(params.source, io.source);
    await verifyCapturedEnvironment(params.environment, io.source);
    control.signal.throwIfAborted();
    launching = true;
    session = createCheckRunnerSession({ argv: input.configuration.argv, cwd: input.callerRoot, launch: io.launch,
      onDiagnostic: input.onDiagnostic, onNotification: notification => {
        if (notification.method === "check/output") displayOutput(input, notification.params);
      } });
    const conversation = session;
    lifetime = createExecutionLifetime({ session, dispose,
      retained: () => retainedExecution(inputs, input, planId, contextId, conversation) });
    const preparing = session.request({ method: "check/prepare", params });
    control.attachSession(session);
    const result = await preparing;
    if (result.status === "ready") {
      contextId = result.contextId;
      control.signal.throwIfAborted();
      const manifest = await verifySourcePresentation(params.source, io.source);
      await verifyCapturedEnvironment(params.environment, io.source);
      control.signal.throwIfAborted();
      // A protocol failure during re-verification revokes the granted context before callers can use it.
      if (session.failure !== undefined) throw session.failure;
      const execution = preparedExecution(inputs, fixed, result, session, lifetime, manifest, control);
      return { status: "ready", execution };
    }
    const closure = await lifetime.close();
    if (closure.status === "uncertain") return closure;
    return { status: "unavailable", origin: "runner", reason: result.reason, remedy: result.remedy,
      ...(closure.cleanupWarning === undefined ? {} : { cleanupWarning: closure.cleanupWarning }) };
  } catch (cause) {
    return failedPreparation({ cause, lifetime, session, launching, control, dispose,
      retained: () => retainedExecution(inputs, input, planId, contextId, session) });
  }
}

/** Settle a preparation that threw; only an uncertain adapter lifetime keeps the captured inputs. */
async function failedPreparation(failure: { cause: unknown; lifetime: ExecutionLifetime | undefined;
  session: CheckRunnerSession | undefined; launching: boolean; control: ExecutionAttemptControl; dispose: () => Promise<void>;
  retained: () => RetainedCheckExecution }): Promise<CheckExecutionPreparation> {
  const { cause, lifetime, session, launching, control, dispose } = failure;
  const closure = lifetime === undefined ? undefined : await lifetime.close();
  if (closure?.status === "uncertain") return closure;
  const locations = failure.retained();
  const cleanupWarning = session === undefined
    ? await disposeSettledExecutionInputs(dispose, [locations.sourceRoot, locations.manifest, ...locations.environmentFiles])
    : closure?.cleanupWarning;
  const reason = control.cancelled ? "Runner preparation was cancelled and settled."
    : closure?.status === "closed" && closure.unstarted !== undefined ? closure.unstarted : preparationFailure(cause);
  return { status: "unavailable", origin: launching ? "runner" : "inputs", reason,
    remedy: control.cancelled ? "Retry the check with a fresh attempt when ready."
      : "Repair the runner or captured inputs and retry with a fresh attempt; keep the check native if preparation cannot be honored.",
    ...(cleanupWarning === undefined ? {} : { cleanupWarning }) };
}

function fixedPreparation(inputs: CapturedCheckExecutionInputs, planId: string): { params: PrepareParams; plan: CheckExecutionPlan } {
  const source = inputs.source;
  const parsed = PrepareParamsSchema.safeParse({ protocolVersion: 1, planId,
    source: { root: source.root, manifest: source.manifestPath, digest: source.digest, coordinates: source.manifest.coordinates },
    environment: inputs.environment.bindings, invocations: inputs.plan.invocations, probes: inputs.plan.probes });
  if (!parsed.success) throw new Error("Captured execution plan is invalid; repair the plan and retry the check request.");
  const params = parsed.data;
  indexRunnerPlan(params);
  for (const invocation of params.invocations) {
    batchPortableCheckPaths(invocation.argv, [], invocation.shell);
    Object.freeze(invocation.argv);
    if (invocation.commandContent?.merged !== undefined) Object.freeze(invocation.commandContent.merged);
    if (invocation.commandContent !== undefined) Object.freeze(invocation.commandContent);
    Object.freeze(invocation);
  }
  for (const probe of [...params.probes.global, ...params.probes.check]) {
    batchPortableCheckPaths(probe.argv, []);
    Object.freeze(probe.argv); Object.freeze(probe);
  }
  Object.freeze(params.invocations); Object.freeze(params.probes.global); Object.freeze(params.probes.check); Object.freeze(params.probes);
  Object.freeze(params.source.coordinates.merged); Object.freeze(params.source.coordinates); Object.freeze(params.source);
  Object.values(params.environment).forEach(Object.freeze); Object.freeze(params.environment);
  const coordinates = inputs.plan.coordinates?.map(({ batch, shard }) => Object.freeze({ batch,
    ...(shard === undefined ? {} : { shard: Object.freeze({ ...shard }) }),
  }));
  return { params: Object.freeze(params), plan: Object.freeze({ invocations: params.invocations, probes: params.probes,
    ...(coordinates === undefined ? {} : { coordinates: Object.freeze(coordinates) }) }) };
}

function preparedExecution(inputs: CapturedCheckExecutionInputs, fixed: { params: PrepareParams; plan: CheckExecutionPlan },
  result: Extract<PrepareResult, { status: "ready" }>, session: CheckRunnerSession, lifetime: ExecutionLifetime,
  manifest: Awaited<ReturnType<typeof verifySourcePresentation>>, control: ExecutionAttemptControl): PreparedCheckExecution {
  const { params, plan } = fixed;
  return Object.freeze({ planId: params.planId, contextId: result.contextId, source: params.source,
    sourceIndex: indexSourcePresentation({ manifest, codePaths: inputs.source.codePaths }),
    plan,
    environment: params.environment, environmentIdentity: inputs.environment.identity,
    runtime: session.runtime, supportsRunGroup: result.capabilities.runGroup,
    get observedOutcomes() { return session.observedOutcomes; }, close: () => lifetime.close(),
    cancel: () => control.cancel(), terminate: () => { control.terminate(); },
    run: (id: string) => runPreparedInvocations(session, result.contextId, id, control),
    runGroup: (ids: readonly string[]) => runPreparedInvocations(session, result.contextId, ids, control) });
}

function retainedExecution(inputs: CapturedCheckExecutionInputs, input: PrepareSelectedCheckExecutionInput,
  planId: string, contextId: string | undefined, session?: CheckRunnerSession): RetainedCheckExecution {
  return { planId, ...(contextId === undefined ? {} : { contextId }), adapter: input.configuration.argv,
    sourceRoot: inputs.source.root, manifest: inputs.source.manifestPath,
    environmentFiles: Object.values(inputs.environment.bindings).flatMap(binding => binding.kind === "file" && binding.state === "file" ? [binding.path] : []),
    ...(session?.recovery === undefined ? {} : { recovery: session.recovery.instructions }) };
}

function displayOutput(input: PrepareSelectedCheckExecutionInput, output: OutputParams): void {
  const bytes = Buffer.from(output.dataBase64, "base64");
  try { void Promise.resolve(input.onOutput?.({ invocationId: output.invocationId, stream: output.stream, bytes })).catch(() => undefined); }
  catch { /* Parent output presentation is best effort after required protocol collection. */ }
}

function preparationFailure(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Runner preparation could not establish fixed captured inputs.";
}
