/** Capture one selected check's source and explicit inputs before forming its complete plan. */
import { relative, resolve } from "node:path";
import { captureEnvironmentInputs, type CapturedEnvironmentInputs } from "../environment-inputs.js";
import { acquireSourceBoundary } from "./source-boundary.js";
import { freezeSelectedSource } from "./source-materialize.js";
import { addSourceGitMetadata } from "./source-git.js";
import { resolveSourceCwd } from "./source-cwd.js";
import { planCheckExecution, type CheckExecutionPlan } from "./planning.js";
import type { FrozenSourcePresentation } from "./source-presentation.js";
import type { CheckExecutionIO, PrepareSelectedCheckExecutionInput } from "./execution.js";
import { disposeSettledExecutionInputs } from "./execution-lifetime.js";

/** Captures whose disposal transfers to the single execution lifetime owner. */
export interface CapturedCheckExecutionInputs {
  readonly source: FrozenSourcePresentation;
  readonly environment: CapturedEnvironmentInputs;
  readonly plan: CheckExecutionPlan;
  dispose(): Promise<void>;
}

/** Preparation refusal retaining observed trouble removing caller-owned temporary inputs. */
export class CapturedInputPreparationError extends Error {
  constructor(cause: unknown, readonly cleanupWarning: string | undefined) {
    super(cause instanceof Error ? cause.message : "Selected inputs could not be captured.", { cause });
  }
}

/** Capture actual selected presentation and explicit bindings before invoking a consumer plan builder. */
export async function captureCheckExecutionInputs(input: PrepareSelectedCheckExecutionInput,
  io: CheckExecutionIO): Promise<CapturedCheckExecutionInputs> {
  const callerRoot = input.callerRoot;
  const check = structuredClone(input.check);
  if (!check.runner || check.fixes || check.reads_index) {
    throw new Error("Check requires owning-checkout execution; keep it native and retry the check request.");
  }
  const request = { ...input.request, source: { ...input.request.source, head: { ...input.request.source.head } },
    ...(input.request.merged === undefined ? {} : { merged: [...input.request.merged] }) };
  const paths = Object.freeze([...input.paths]);
  const globalRuntimeInputs = (input.globalRuntimeInputs ?? []).map(argv => [...argv]);
  const buildPlan = input.buildPlan;
  const ambient = input.environment ?? process.env;
  const selectedEnvironment = Object.fromEntries(Object.keys(check.environment_inputs)
    .filter(name => Object.hasOwn(ambient, name)).map(name => [name, ambient[name]]));
  const boundary = await acquireSourceBoundary(io, callerRoot, request);
  let source: FrozenSourcePresentation | undefined;
  let environment: CapturedEnvironmentInputs | undefined;
  try {
    source = await freezeSelectedSource(io, callerRoot, request, boundary);
    await addSourceGitMetadata(io, callerRoot, source);
    await resolveSourceCwd(source.root, relative(callerRoot, resolve(callerRoot, check.root)));
    environment = await captureEnvironmentInputs(check.environment_inputs, resolve(callerRoot, check.root),
      { environment: selectedEnvironment, io: io.source.files });
    await boundary.recheck();
    await boundary.remove();
    const plan = buildPlan === undefined
      ? await planCheckExecution({ callerRoot, source, check, paths, globalRuntimeInputs })
      : await buildCapturedPlan(buildPlan, source, environment, paths);
    const captured = { source, environment, plan };
    return { ...captured, dispose: () => disposeCapturedInputs(captured) };
  } catch (cause) {
    const locations = [...(source === undefined ? [] : [source.root, source.manifestPath]),
      ...Object.values(environment?.bindings ?? {}).flatMap(binding => binding.kind === "file" && binding.state === "file" ? [binding.path] : [])];
    const cleanupWarning = await disposeSettledExecutionInputs(async () => {
      const removed = await Promise.allSettled([boundary.remove(), source?.remove(), environment?.dispose()]);
      if (removed.some(result => result.status === "rejected")) throw new Error("Input capture cleanup failed.");
    }, locations);
    throw new CapturedInputPreparationError(cause, cleanupWarning);
  }
}

async function buildCapturedPlan(build: NonNullable<PrepareSelectedCheckExecutionInput["buildPlan"]>,
  source: FrozenSourcePresentation, environment: CapturedEnvironmentInputs, paths: readonly string[]): Promise<CheckExecutionPlan> {
  const manifest = structuredClone(source.manifest);
  Object.freeze(manifest.coordinates.merged);
  Object.freeze(manifest.coordinates);
  manifest.entries.forEach(Object.freeze);
  Object.freeze(manifest.entries);
  Object.freeze(manifest);
  const view = Object.freeze({ root: source.root, manifest, codePaths: new Map(source.codePaths) });
  try { return await build(Object.freeze({ source: view, environment: environment.bindings, paths })); }
  catch (cause) { throw new Error("Captured-input plan construction failed; repair the plan builder and retry the check request.", { cause }); }
}

async function disposeCapturedInputs(inputs: Pick<CapturedCheckExecutionInputs, "source" | "environment">): Promise<void> {
  const removed = await Promise.allSettled([inputs.source.remove(), inputs.environment.dispose()]);
  if (removed.some(result => result.status === "rejected")) throw new Error("Settled captured inputs could not be removed.");
}
