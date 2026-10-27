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
import type { PrepareParams, TerminalOutcome } from "./contract.js";
import type { CheckRunnerProcess, CheckRunnerProcessInput, CheckRunnerProcessExit } from "./session-process.js";
import { randomUUID } from "node:crypto";
import { createExecaGitExec, createExecaRawGitExec } from "../../git/process-executor.js";
import { nodeSourcePresentationIO } from "./source-io.js";
import { CapturedInputPreparationError, captureCheckExecutionInputs } from "./execution-inputs.js";
import { prepareCapturedCheckExecution } from "./execution-prepare.js";

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
  readonly adapter: string;
  readonly sourceRoot: string;
  readonly manifest: string;
  readonly environmentFiles: readonly string[];
  readonly recovery?: string;
}

/** Disposal proof or the retained resources whose settlement still needs inspection. */
export type CheckExecutionClosure =
  | { readonly status: "closed"; readonly exit: CheckRunnerProcessExit; readonly cleanupWarning?: string }
  | { readonly status: "uncertain"; readonly reason: string; readonly retained: RetainedCheckExecution; readonly exit?: CheckRunnerProcessExit };

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
  close(): Promise<CheckExecutionClosure>;
}

/** Preparation never grants execution authority after unavailability or uncertain lifetime. */
export type CheckExecutionPreparation =
  | { readonly status: "ready"; readonly execution: PreparedCheckExecution }
  | { readonly status: "unavailable"; readonly reason: string; readonly remedy: string; readonly cleanupWarning?: string }
  | { readonly status: "uncertain"; readonly reason: string; readonly retained: RetainedCheckExecution };

/** Capture and prepare one selected check without giving callers provider-specific ownership work. */
export async function prepareSelectedCheckExecution(input: PrepareSelectedCheckExecutionInput,
  io: CheckExecutionIO = { git: createExecaGitExec(), gitRaw: createExecaRawGitExec(), source: nodeSourcePresentationIO }): Promise<CheckExecutionPreparation> {
  const planId = randomUUID();
  const [executable, ...args] = input.configuration.argv;
  const selected = { ...input, configuration: { file: input.configuration.file, argv: [executable, ...args] as [string, ...string[]] } };
  let captured;
  try { captured = await captureCheckExecutionInputs(selected, io); }
  catch (cause) { return { status: "unavailable", reason: cause instanceof Error ? cause.message : "Selected inputs could not be captured.",
    remedy: "Repair the selected source or explicit inputs and retry; keep the check native if fixed inputs cannot be established.",
    ...(cause instanceof CapturedInputPreparationError && cause.cleanupWarning !== undefined ? { cleanupWarning: cause.cleanupWarning } : {}) }; }
  return prepareCapturedCheckExecution(captured, selected, io, planId);
}
