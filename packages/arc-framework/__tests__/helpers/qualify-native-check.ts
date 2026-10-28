/** Run native membership qualification through the configured consumer facade and its ordinary pool admission. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readTypedProjectFile } from "../../src/lib/config/typed-file-reader.js";
import { CheckDeclarationSchema } from "../../src/lib/checks/declaration.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { resolveCheckRequest } from "../../src/lib/checks/resolve-request.js";
import { readMachineCheckRunner } from "../../src/lib/checks/runner/machine-config.js";
import { prepareSelectedCheckExecution, type CheckExecutionClosure } from "../../src/lib/checks/runner/execution.js";
import { planCheckExecution } from "../../src/lib/checks/runner/planning.js";
import { executePreparedCheckPlan } from "../../src/lib/checks/runner/dispatch.js";
import { readNativeShardObservations, type NativeDurationInput, type NativeMember } from "./native-shard-evidence.js";
import { qualifyNativeShardMembership, type NativeMembershipRun } from "./native-shard-qualification.js";

/** Capture the real declaration, execute its native baseline and matrix, and retain observed membership and closure. */
export async function qualifyNativeCheck(root: string, checkId: "test:unit" | "test:integration", output: string,
  filters: readonly string[] = [], environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  const loaded = await readTypedProjectFile(root, "check-declaration", CheckDeclarationSchema);
  if (loaded.status !== "valid") throw new Error(`Cannot read native declaration: ${JSON.stringify(loaded)}`);
  const declared = loaded.value.checks[checkId];
  if (declared === undefined || declared.mode === "selection" || !declared.runner || declared.shards === undefined || typeof declared.command === "string") throw new Error("Missing native argv/shard declaration.");
  const check = { ...declared, cache: false as const, command: [...declared.command, ...filters,
    "--config", "__tests__/helpers/native-shard-observation.config.ts"],
    environment_inputs: { ...declared.environment_inputs, ARC_TEST_DURATION_FILE: "file" as const },
    shards: { ...declared.shards, routed: true } };
  const configuration = await readMachineCheckRunner(check);
  if (configuration === undefined) throw new Error("Native qualification requires the configured runner.");
  const resolved = await resolveCheckRequest(createExecaGitExec(), root, { form: { kind: "run", ids: [checkId] }, scope: { kind: "all" } });
  if (resolved.status !== "resolved") throw new Error(resolved.message);
  await mkdir(dirname(output), { recursive: true });
  const stdout = new Map<string, Buffer[]>();
  const preparation = await prepareSelectedCheckExecution({ callerRoot: root, request: resolved.request, check, paths: [],
    configuration, environment, globalRuntimeInputs: loaded.value.global_runtime_inputs,
    onDiagnostic: bytes => { process.stderr.write(bytes); },
    onOutput: frame => { if (frame.stream === "stdout") {
      const chunks = stdout.get(frame.invocationId) ?? [];
      chunks.push(Buffer.from(frame.bytes)); stdout.set(frame.invocationId, chunks);
    } },
    buildPlan: async context => {
      const input = { callerRoot: root, source: context.source, paths: context.paths, check,
        globalRuntimeInputs: loaded.value.global_runtime_inputs };
      const baseline = await planCheckExecution({ ...input, check: { ...check, shards: { ...check.shards, routed: false } } });
      const matrix = await planCheckExecution(input);
      return { invocations: [...baseline.invocations, ...matrix.invocations],
        coordinates: [...baseline.coordinates!, ...matrix.coordinates!], probes: matrix.probes };
    },
  });
  if (preparation.status !== "ready") {
    await writeFile(output, JSON.stringify({ checkId, preparation }, null, 2));
    throw new Error(preparation.reason);
  }
  const execution = preparation.execution;
  let closure: CheckExecutionClosure | undefined;
  let selected: NativeMember[] | undefined;
  let failure: string | undefined;
  let parent;
  const runs: NativeMembershipRun[] = [];
  try {
    parent = await executePreparedCheckPlan(execution, check);
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
      await writeFile(`${output}.${invocation.id}.stdout`, text);
      runs.push({ exitCode: outcome?.status === "completed" ? outcome.exitCode : -1,
        basis, observations: readNativeShardObservations(text) });
    }
    if (parent.evidence.kind !== "success") throw new Error(`Native parent did not complete successfully: ${parent.evidence.kind}.`);
    selected = qualifyNativeShardMembership(runs[0]!, runs.slice(1), check.shards.count);
  } catch (cause) { failure = cause instanceof Error ? cause.message : String(cause); }
  finally { closure = await execution.close(); }
  if (closure.status !== "closed" || closure.exit.exitCode !== 0) failure ??= "Native runner closure is incomplete or failed.";
  const report = { checkId, status: failure === undefined ? "qualified" : "incomplete", failure,
    declaredRouted: declared.shards.routed, runtimeBinding: execution.runtime === undefined ? "unknown" : "known",
    parent, closure, selected, runs };
  await writeFile(output, JSON.stringify(report, null, 2));
  process.stdout.write(`${checkId}: ${report.status}; ${selected?.length ?? 0} native members; evidence ${output}\n`);
  if (failure !== undefined) throw new Error(failure);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [checkId, output, ...filters] = process.argv.slice(2);
  if ((checkId !== "test:unit" && checkId !== "test:integration") || output === undefined) throw new Error("Use CHECK OUTPUT [native filters].");
  await qualifyNativeCheck(process.cwd(), checkId, resolve(output), filters);
}
