/** Consumer input capture and native controller playback for disposable membership fixtures. */
import { mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { commitAll } from "./temp-repo.js";
import { runVitestControllerFixture } from "./vitest-controller-fixture.js";
import { readNativeShardObservations, type NativeDurationInput } from "./native-shard-evidence.js";
import type { NativeMembershipRun } from "./native-shard-qualification.js";
import { CheckDeclarationSchema } from "../../src/lib/checks/declaration.js";
import { bindCapturedEnvironment } from "../../src/lib/checks/environment-inputs.js";
import { resolveCheckRequest } from "../../src/lib/checks/resolve-request.js";
import { captureCheckExecutionInputs } from "../../src/lib/checks/runner/execution-inputs.js";
import { planCheckExecution } from "../../src/lib/checks/runner/planning.js";
import { createExecaGitExec, createExecaRawGitExec } from "../../src/lib/git/process-executor.js";
import { nodeSourcePresentationIO } from "../../src/lib/checks/runner/source-io.js";

/** Freeze one fixture selection and duration binding before attaching private mutable native writers. */
export async function captureNativeShardFixture(fixture: { root: string; packageRoot: string },
  environment: NodeJS.ProcessEnv, filters: readonly string[] = []) {
  const git = createExecaGitExec();
  const command = [process.execPath, "--import", "tsx", "src/scripts/run-local-test-tier.ts", "unit", ...filters];
  const check = CheckDeclarationSchema.parse({ checks: { native: {
    command, root: "packages/arc-framework", runner: true, mode: "project", cache: false,
    environment_inputs: { ARC_TEST_DURATION_FILE: "file" },
    shards: { count: 2, argument: "--shard={index}/{count}", routed: true },
  } } }).checks.native!;
  await writeFile(join(fixture.root, ".gitignore"), "node_modules\ndist/\n*.secret\n");
  await git("git", ["init", "-b", "main", fixture.root]);
  await git("git", ["config", "user.email", "test@test.com"], { cwd: fixture.root });
  await git("git", ["config", "user.name", "Test User"], { cwd: fixture.root });
  await git("git", ["config", "gc.auto", "0"], { cwd: fixture.root });
  await commitAll(fixture.root);
  const resolved = await resolveCheckRequest(git, fixture.root, { form: { kind: "run", ids: ["native"] }, scope: { kind: "all" } });
  if (resolved.status !== "resolved") throw new Error(resolved.message);
  const captured = await captureCheckExecutionInputs({ callerRoot: fixture.root, request: resolved.request, check, paths: [],
    configuration: { file: "unused-capture-only", argv: [process.execPath] }, environment,
    buildPlan: async context => {
      const input = { callerRoot: fixture.root, source: context.source, paths: context.paths, check };
      const baseline = await planCheckExecution({ ...input, check: { ...check, shards: { ...check.shards!, routed: false } } });
      const matrix = await planCheckExecution(input);
      return { invocations: [...baseline.invocations, ...matrix.invocations], probes: matrix.probes };
    },
  }, { git, gitRaw: createExecaRawGitExec(), source: nodeSourcePresentationIO });
  try {
    // Playback runs in place: take the long form Vitest's module ids may carry where Windows aliases the temp path.
    const packageRoot = join(await realpath(captured.source.root), "packages/arc-framework");
    await symlink(await realpath(join(fixture.root, "node_modules")), join(captured.source.root, "node_modules"), "junction");
    await mkdir(join(packageRoot, "node_modules"));
    const binding = captured.environment.bindings.ARC_TEST_DURATION_FILE;
    if (binding?.kind !== "file") throw new Error("Expected captured duration binding.");
    const duration: NativeDurationInput = binding.state === "file"
      ? { kind: binding.kind, state: binding.state, digest: binding.digest, bytes: binding.bytes }
      : { kind: binding.kind, state: binding.state };
    const basis = { sourceDigest: captured.source.digest, environmentIdentity: captured.environment.identity,
      selection: command.slice(4), duration };
    return { ...captured, packageRoot, basis };
  } catch (cause) { await captured.dispose(); throw cause; }
}

/** Execute the fixed captured commands through the supported controller without a second partition pass. */
export async function runCapturedNativeShards(captured: Awaited<ReturnType<typeof captureNativeShardFixture>>): Promise<
  Array<NativeMembershipRun & { stdout: string; stderr: string }>
> {
  const runs = [];
  for (const invocation of captured.plan.invocations) {
    const result = await runVitestControllerFixture(captured.packageRoot, invocation.argv.slice(4),
      { ARC_TEST_DURATION_FILE: undefined, ...bindCapturedEnvironment(captured.environment.bindings, {}) });
    runs.push({ exitCode: result.code, basis: captured.basis, observations: readNativeShardObservations(result.stdout),
      stdout: result.stdout, stderr: result.stderr });
  }
  return runs;
}
