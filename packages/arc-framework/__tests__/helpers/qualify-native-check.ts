/** Run native membership qualification through the configured consumer facade and its ordinary pool admission. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readTypedProjectFile } from "../../src/lib/config/typed-file-reader.js";
import { CheckDeclarationSchema } from "../../src/lib/checks/declaration.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { resolveCheckRequest } from "../../src/lib/checks/resolve-request.js";
import { readMachineCheckRunner, type MachineCheckRunnerConfiguration } from "../../src/lib/checks/runner/machine-config.js";
import { prepareSelectedCheckExecution, type CheckExecutionClosure } from "../../src/lib/checks/runner/execution.js";
import { planCheckExecution } from "../../src/lib/checks/runner/planning.js";
import { executeNativeQualificationPlan } from "./native-qualification-dispatch.js";
import type { CheckScope } from "../../src/lib/checks/request.js";
import { bindCapturedEnvironment } from "../../src/lib/checks/environment-inputs.js";
import { readReachDeclaration, selectReachCheck } from "../../src/lib/reach-check.js";
import { readNativeShardObservations, type NativeDurationInput, type NativeMember } from "./native-shard-evidence.js";
import { qualifyNativeShardMembership, type NativeMembershipRun } from "./native-shard-qualification.js";

/** Capture the real declaration, execute its native baseline and matrix, and retain observed membership and closure. */
export async function qualifyNativeCheck(root: string, checkId: "test:unit" | "test:integration" | "test:store", output: string,
  filters: readonly string[] = [], environment: NodeJS.ProcessEnv = process.env,
  options: { scope?: CheckScope; configuration?: MachineCheckRunnerConfiguration; afterCapture?: () => Promise<void>; baselineThenGroup?: boolean } = {}): Promise<void> {
  const loaded = await readTypedProjectFile(root, "check-declaration", CheckDeclarationSchema);
  if (loaded.status !== "valid") throw new Error(`Cannot read native declaration: ${JSON.stringify(loaded)}`);
  const declared = loaded.value.checks[checkId];
  if (declared === undefined || declared.mode === "selection" || !declared.runner || declared.shards === undefined || typeof declared.command === "string") throw new Error("Missing native argv/shard declaration.");
  const check = { ...declared, cache: false as const, command: [...declared.command, ...filters,
    "--config", "__tests__/helpers/native-shard-observation.config.ts"],
    environment_inputs: { ...declared.environment_inputs, ARC_TEST_DURATION_FILE: "file" as const },
    shards: { ...declared.shards, routed: true } };
  const configuration = options.configuration ?? await readMachineCheckRunner(check);
  if (configuration === undefined) throw new Error("Native qualification requires the configured runner.");
  const resolved = await resolveCheckRequest(createExecaGitExec(), root, { form: { kind: "run", ids: [checkId] },
    scope: options.scope ?? { kind: "all" } });
  if (resolved.status !== "resolved") throw new Error(resolved.message);
  await mkdir(dirname(output), { recursive: true });
  const stdout = new Map<string, Buffer[]>();
  const stderr = new Map<string, Buffer[]>();
  const attempt = prepareSelectedCheckExecution({ callerRoot: root, request: resolved.request, check, paths: [],
    configuration, environment, globalRuntimeInputs: loaded.value.global_runtime_inputs,
    onDiagnostic: bytes => { process.stderr.write(bytes); },
    onOutput: frame => {
      const stream = frame.stream === "stdout" ? stdout : stderr;
      const chunks = stream.get(frame.invocationId) ?? [];
      chunks.push(Buffer.from(frame.bytes)); stream.set(frame.invocationId, chunks);
    },
    buildPlan: async context => {
      const input = { callerRoot: root, source: context.source, paths: context.paths, check,
        globalRuntimeInputs: loaded.value.global_runtime_inputs };
      const baseline = await planCheckExecution({ ...input, check: { ...check, shards: { ...check.shards, routed: false } } });
      const matrix = await planCheckExecution(input);
      return { invocations: [...baseline.invocations, ...matrix.invocations],
        coordinates: [...baseline.coordinates!, ...matrix.coordinates!], probes: matrix.probes };
    },
  });
  const preparation = await attempt;
  if (preparation.status !== "ready") {
    await writeFile(output, JSON.stringify({ checkId, planId: attempt.planId, preparation }, null, 2));
    throw new Error(preparation.reason);
  }
  const execution = preparation.execution;
  let closure: CheckExecutionClosure | undefined;
  let selected: NativeMember[] | undefined;
  let failure: string | undefined;
  let reachSelection: Awaited<ReturnType<typeof selectReachCheck>> | undefined;
  let parent;
  const runs: NativeMembershipRun[] = [];
  try {
    if (checkId === "test:store") {
      const declarationPath = "packages/arc-framework/__tests__/reach/store-suites.json";
      const declaration = await readReachDeclaration(join(execution.source.root, declarationPath));
      const content = execution.plan.invocations[0]?.commandContent;
      if (content === undefined) throw new Error("Native store qualification is missing captured content coordinates.");
      reachSelection = await selectReachCheck(declaration, { checkoutRoot: execution.source.root, declarationPath,
        git: createExecaGitExec(), env: { ...bindCapturedEnvironment(execution.environment, {}),
          ARC_CHECK_TREE: content.tree, ...(content.base === undefined ? {} : { ARC_CHECK_BASE: content.base }) } });
    }
    await options.afterCapture?.();
    parent = await executeNativeQualificationPlan(execution, check, options.baselineThenGroup);
    const binding = execution.environment.ARC_TEST_DURATION_FILE;
    if (binding?.kind !== "file") throw new Error("Missing captured native duration binding.");
    const duration: NativeDurationInput = binding.state === "file"
      ? { kind: binding.kind, state: binding.state, digest: binding.digest, bytes: binding.bytes }
      : { kind: binding.kind, state: binding.state };
    const basis = { sourceDigest: execution.source.digest, environmentIdentity: execution.environmentIdentity,
      selection: check.command, duration };
    for (const invocation of execution.plan.invocations) {
      const outcome = execution.observedOutcomes.get(invocation.id);
      const text = Buffer.concat(stdout.get(invocation.id) ?? []).toString("utf8");
      runs.push({ exitCode: outcome?.status === "completed" ? outcome.exitCode : -1,
        basis, observations: readNativeShardObservations(text) });
    }
    if (parent.evidence.kind !== "success") throw new Error(`Native parent did not complete successfully: ${parent.evidence.kind}.`);
    if (reachSelection?.suites.length === 0) {
      if (runs.length !== check.shards.count + 1 || runs.some(run => run.exitCode !== 0 || run.observations.length !== 0)) {
        throw new Error("Native reach no-op did not retain successful exits without execution observations.");
      }
      selected = [];
    } else selected = qualifyNativeShardMembership(runs[0]!, runs.slice(1), check.shards.count);
  } catch (cause) { failure = cause instanceof Error ? cause.message : String(cause); }
  finally {
    closure = await execution.close();
    for (const invocation of execution.plan.invocations) {
      await writeFile(`${output}.${invocation.id}.stdout`, Buffer.concat(stdout.get(invocation.id) ?? []));
      await writeFile(`${output}.${invocation.id}.stderr`, Buffer.concat(stderr.get(invocation.id) ?? []));
    }
  }
  if (closure.status !== "closed" || closure.exit.exitCode !== 0) failure ??= "Native runner closure is incomplete or failed.";
  const report = { checkId, planId: execution.planId, contextId: execution.contextId,
    invocationIds: execution.plan.invocations.map(invocation => invocation.id),
    dispatch: options.baselineThenGroup ? "baseline-then-group" : "default", status: failure === undefined ? "qualified" : "incomplete", failure,
    coordinates: execution.source.coordinates, environment: execution.environment,
    runnerConfigurationOverride: options.configuration !== undefined,
    declaredRouted: declared.shards.routed, runtimeBinding: execution.runtime === undefined ? "unknown" : "known",
    parent, closure, reachSelection, selected, runs };
  await writeFile(output, JSON.stringify(report, null, 2));
  process.stdout.write(`${checkId}: ${report.status}; ${selected?.length ?? 0} native members; evidence ${output}\n`);
  if (failure !== undefined) throw new Error(failure);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [checkId, output, ...filters] = process.argv.slice(2);
  if ((checkId !== "test:unit" && checkId !== "test:integration" && checkId !== "test:store") || output === undefined) throw new Error("Use CHECK OUTPUT [native filters].");
  await qualifyNativeCheck(process.cwd(), checkId, resolve(output), filters);
}
