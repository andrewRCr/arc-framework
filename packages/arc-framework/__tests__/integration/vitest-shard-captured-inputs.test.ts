/** Native siblings observe one consumer capture even after the caller changes its checkout and handed inputs. */
import { mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeNativeShardFixture } from "../helpers/native-shard-fixture.js";
import { readNativeShardObservations } from "../helpers/native-shard-evidence.js";
import { qualifyNativeShardMembership, type NativeMembershipRun } from "../helpers/native-shard-qualification.js";
import { runVitestControllerFixture } from "../helpers/vitest-controller-fixture.js";
import { commitAll, removeGitBackedDir } from "../helpers/temp-repo.js";
import { CheckDeclarationSchema } from "../../src/lib/checks/declaration.js";
import { bindCapturedEnvironment } from "../../src/lib/checks/environment-inputs.js";
import { resolveCheckRequest } from "../../src/lib/checks/resolve-request.js";
import { captureCheckExecutionInputs } from "../../src/lib/checks/runner/execution-inputs.js";
import { planCheckExecution } from "../../src/lib/checks/runner/planning.js";
import { createExecaGitExec, createExecaRawGitExec } from "../../src/lib/git/process-executor.js";
import { nodeSourcePresentationIO } from "../../src/lib/checks/runner/source-io.js";

it("keeps native membership and assignments fixed after source, branch and duration edits following capture", async () => {
  const fixture = await makeNativeShardFixture();
  const git = createExecaGitExec();
  const command = [process.execPath, "--import", "tsx", "src/scripts/run-local-test-tier.ts", "unit"];
  const check = CheckDeclarationSchema.parse({ checks: { native: {
    command, root: "packages/arc-framework", runner: true, mode: "project", cache: false,
    environment_inputs: { ARC_TEST_DURATION_FILE: "file" },
    shards: { count: 2, argument: "--shard={index}/{count}", routed: true },
  } } }).checks.native!;
  try {
    await writeFile(join(fixture.root, ".gitignore"), "node_modules\ndist/\n*.secret\n");
    await git("git", ["init", "-b", "main", fixture.root]);
    await git("git", ["config", "user.email", "test@test.com"], { cwd: fixture.root });
    await git("git", ["config", "user.name", "Test User"], { cwd: fixture.root });
    await git("git", ["config", "gc.auto", "0"], { cwd: fixture.root });
    await commitAll(fixture.root);
    const durations = join(fixture.packageRoot, "durations.secret");
    await writeFile(durations, JSON.stringify({ results: [
      ["unit:tests/c.test.mjs", { duration: 100 }], ["unit-mocks:tests/a.test.mjs", { duration: 50 }],
    ] }));
    const resolved = await resolveCheckRequest(git, fixture.root, { form: { kind: "run", ids: ["native"] }, scope: { kind: "all" } });
    if (resolved.status !== "resolved") throw new Error(resolved.message);
    const captured = await captureCheckExecutionInputs({ callerRoot: fixture.root, request: resolved.request, check, paths: [],
      configuration: { file: "unused-capture-only", argv: [process.execPath] }, environment: { ARC_TEST_DURATION_FILE: durations },
      buildPlan: async context => {
        const input = { callerRoot: fixture.root, source: context.source, paths: context.paths, check };
        const baseline = await planCheckExecution({ ...input, check: { ...check, shards: { ...check.shards!, routed: false } } });
        const matrix = await planCheckExecution(input);
        return { invocations: [...baseline.invocations, ...matrix.invocations], probes: matrix.probes };
      },
    }, { git, gitRaw: createExecaRawGitExec(), source: nodeSourcePresentationIO });
    try {
      const packageRoot = join(captured.source.root, "packages/arc-framework");
      await symlink(await realpath(join(fixture.root, "node_modules")), join(captured.source.root, "node_modules"), "junction");
      await mkdir(join(packageRoot, "node_modules"));
      const binding = captured.environment.bindings.ARC_TEST_DURATION_FILE;
      if (binding?.kind !== "file" || binding.state !== "file") throw new Error("Expected captured duration file.");
      const basis = { sourceDigest: captured.source.digest, environmentIdentity: captured.environment.identity,
        selection: command.slice(4), duration: { kind: binding.kind, state: binding.state, digest: binding.digest, bytes: binding.bytes } };
      await git("git", ["switch", "-c", "changed-after-capture"], { cwd: fixture.root });
      await rm(join(fixture.packageRoot, "tests/a.test.mjs"));
      await writeFile(join(fixture.packageRoot, "tests/widened.test.mjs"), 'import { it } from "vitest"; it("live source must not execute", () => { throw new Error("changed source"); });');
      await writeFile(durations, '{"results":[["unit:tests/a.test.mjs",{"duration":99999}]]}');
      const runs: NativeMembershipRun[] = [];
      for (const invocation of captured.plan.invocations) {
        const result = await runVitestControllerFixture(packageRoot, invocation.argv.slice(4),
          bindCapturedEnvironment(captured.environment.bindings, {}));
        runs.push({ exitCode: result.code, basis, observations: readNativeShardObservations(result.stdout) });
        expect(result.code, result.stdout + result.stderr).toBe(0);
      }
      const [baseline, ...shards] = runs;
      expect(qualifyNativeShardMembership(baseline!, shards, 2)).toHaveLength(6);
      expect(shards.map(run => run.observations[0]!.assigned)).toEqual([
        ["c", "a", "b"].map(name => ({ project: "unit", file: `tests/${name}.test.mjs` })),
        ["a", "b", "c"].map(name => ({ project: "unit-mocks", file: `tests/${name}.test.mjs` })),
      ]);
    } finally {
      await captured.dispose();
    }
  } finally { await removeGitBackedDir(fixture.root); }
}, 90_000);
