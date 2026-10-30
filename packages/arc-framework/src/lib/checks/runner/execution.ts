/** Prepare one selected check with owned source, explicit bindings and runner lifetime. */
import type { CheckDeclaration } from "../declaration.js";
import type { CapturedEnvironmentInputs } from "../environment-inputs.js";
import type { ResolvedCheckRequest } from "../resolve-request.js";
import type { CheckExecutionPlan } from "./planning.js";
import type { FrozenSourcePresentation } from "./source-presentation.js";
import type { SourcePresentationIndex } from "./source-scope.js";
import type { SourceMaterializationIO } from "./source-materialize.js";
import type { MachineCheckRunnerConfiguration } from "./machine-config.js";
import type { KnownRunnerRuntime } from "./correlation.js";
import type { CancelResult, PrepareParams, SettledRunResult, TerminalOutcome } from "./contract.js";
import type { CheckRunnerProcess, CheckRunnerProcessInput, CheckRunnerProcessExit } from "./session-process.js";
import { randomUUID } from "node:crypto";
import { createExecaGitExec, createExecaRawGitExec } from "../../git/process-executor.js";
import { nodeSourcePresentationIO } from "./source-io.js";
import { CapturedInputPreparationError, captureCheckExecutionInputs } from "./execution-inputs.js";
import { prepareCapturedCheckExecution } from "./execution-prepare.js";
import { createExecutionAttemptControl, type ExecutionAttemptControl } from "./execution-attempt.js";
import { interruptibleCaptureIO } from "./execution-capture-io.js";

/** Captured inputs available while a consumer forms its entire immutable execution plan. */
export interface CapturedCheckPlanContext {
  readonly source: Pick<FrozenSourcePresentation, "root" | "manifest" | "codePaths">;
  readonly environment: CapturedEnvironmentInputs["bindings"];
  readonly paths: readonly string[];
}

/** Native selection and optional consumer plan construction, before any adapter preparation. */
export interface PrepareSelectedCheckExecutionInput {
  readonly callerRoot: string;
  readonly request: ResolvedCheckRequest;
  readonly check: CheckDeclaration["checks"][string];
  readonly paths: readonly string[];
  readonly configuration: MachineCheckRunnerConfiguration;
  readonly globalRuntimeInputs?: readonly (readonly string[])[];
  readonly environment?: NodeJS.ProcessEnv;
  readonly buildPlan?: (context: CapturedCheckPlanContext) => CheckExecutionPlan | Promise<CheckExecutionPlan>;
  /** Best-effort parent display after required protocol output collection. */
  readonly onOutput?: (output: { readonly invocationId: string; readonly stream: "stdout" | "stderr"; readonly bytes: Uint8Array }) => void | Promise<void>;
  readonly onDiagnostic?: (bytes: Uint8Array) => void | Promise<void>;
}

/** Source filesystem/Git operations and an injectable adapter process boundary. */
export interface CheckExecutionIO extends SourceMaterializationIO {
  readonly launch?: (input: CheckRunnerProcessInput) => CheckRunnerProcess;
}

/** Locations and provider guidance needed to settle a capture whose use remains uncertain. */
export interface RetainedCheckExecution {
  readonly planId: string;
  readonly contextId?: string;
  /** The configured adapter's complete literal argv. */
  readonly adapter: readonly string[];
  readonly sourceRoot: string;
  readonly manifest: string;
  readonly environmentFiles: readonly string[];
  readonly recovery?: string;
}

/** Disposal proof or the retained resources whose settlement still needs inspection. */
export type CheckExecutionClosure =
  | { readonly status: "closed"; readonly exit: CheckRunnerProcessExit; readonly cleanupWarning?: string;
    /** Why the adapter never started, when no process could own the inputs. */
    readonly unstarted?: string }
  | { readonly status: "uncertain"; readonly reason: string; readonly retained: RetainedCheckExecution; readonly exit?: CheckRunnerProcessExit };

/** Per-request terminal observations, retaining valid outcomes when required work is incomplete. */
export type CheckExecutionRunResult =
  | { readonly status: "settled"; readonly settlement: SettledRunResult; readonly outcomes: ReadonlyMap<string, Readonly<TerminalOutcome>> }
  | { readonly status: "incomplete"; readonly reason: string; readonly outcomes: ReadonlyMap<string, Readonly<TerminalOutcome>> };

/** One valid prepared context and its fixed inputs, qualification and lifetime owner. */
export interface PreparedCheckExecution {
  readonly planId: string;
  readonly contextId: string;
  readonly source: PrepareParams["source"];
  readonly sourceIndex: SourcePresentationIndex;
  readonly plan: CheckExecutionPlan;
  readonly environment: CapturedEnvironmentInputs["bindings"];
  readonly environmentIdentity: string;
  readonly runtime: KnownRunnerRuntime | undefined;
  readonly supportsRunGroup: boolean;
  readonly observedOutcomes: ReadonlyMap<string, Readonly<TerminalOutcome>>;
  run(invocationId: string): Promise<CheckExecutionRunResult>;
  runGroup(invocationIds: readonly string[]): Promise<CheckExecutionRunResult>;
  cancel(): Promise<CancelResult | undefined>;
  terminate(): void;
  close(): Promise<CheckExecutionClosure>;
}

/** Preparation never grants execution authority after unavailability or uncertain lifetime. */
export type CheckExecutionPreparation =
  | { readonly status: "ready"; readonly execution: PreparedCheckExecution }
  | { readonly status: "unavailable"; readonly reason: string; readonly remedy: string; readonly cleanupWarning?: string;
    /** Whether the caller's inputs or the configured runner refused before a context existed. */
    readonly origin: "inputs" | "runner" }
  | { readonly status: "uncertain"; readonly reason: string; readonly retained: RetainedCheckExecution };

/** Preparation promise with interruption and inspection available before a context is granted. */
export interface CheckExecutionAttempt extends Promise<CheckExecutionPreparation> {
  readonly planId: string;
  readonly retained: RetainedCheckExecution | undefined;
  cancel(): Promise<CancelResult | undefined>;
  terminate(): void;
}

/** Capture and prepare one selected check without giving callers provider-specific ownership work. */
export function prepareSelectedCheckExecution(input: PrepareSelectedCheckExecutionInput,
  io: CheckExecutionIO = { git: createExecaGitExec(), gitRaw: createExecaRawGitExec(), source: nodeSourcePresentationIO }): CheckExecutionAttempt {
  const control = createExecutionAttemptControl(randomUUID());
  const preparation = prepareSelectedAttempt(input, io, control);
  return Object.defineProperties(preparation, { planId: { value: control.planId },
    retained: { get: () => control.retained }, cancel: { value: () => control.cancel() },
    terminate: { value: () => { control.terminate(); } } }) as CheckExecutionAttempt;
}

async function prepareSelectedAttempt(input: PrepareSelectedCheckExecutionInput, io: CheckExecutionIO,
  control: ExecutionAttemptControl): Promise<CheckExecutionPreparation> {
  const [executable, ...args] = input.configuration.argv;
  const selected = { ...input, configuration: { file: input.configuration.file, argv: [executable, ...args] as [string, ...string[]] } };
  let captured;
  try { captured = await captureCheckExecutionInputs(selected, interruptibleCaptureIO(io, control.signal)); }
  catch (cause) { return { status: "unavailable", origin: "inputs", reason: control.cancelled ? "Selected input capture was cancelled before runner preparation." : cause instanceof Error ? cause.message : "Selected inputs could not be captured.",
    remedy: control.cancelled ? "Retry the check with a fresh attempt when ready."
      : "Repair the check declaration, selected source or explicit inputs and retry; keep the check native if fixed inputs cannot be established.",
    ...(cause instanceof CapturedInputPreparationError && cause.cleanupWarning !== undefined ? { cleanupWarning: cause.cleanupWarning } : {}) }; }
  return prepareCapturedCheckExecution(captured, selected, io, control);
}
