/** Real consumer-facade requests and native membership for the opt-in baseline/group route. */
import { afterEach, expect, it } from "vitest";
import { appendFile, mkdir, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { executeNativeQualificationPlan } from "../helpers/native-qualification-dispatch.js";
import { makeNativeShardFixture } from "../helpers/native-shard-fixture.js";
import { readNativeShardObservations } from "../helpers/native-shard-evidence.js";
import { qualifyNativeShardMembership, type NativeMembershipRun } from "../helpers/native-shard-qualification.js";
import { preparedAdapterScript, selectedExecutionFixture } from "../fixtures/checks/prepared-execution.js";
import { commitAll, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { CheckDeclarationSchema } from "../../src/lib/checks/declaration.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { resolveCheckRequest } from "../../src/lib/checks/resolve-request.js";
import { prepareSelectedCheckExecution } from "../../src/lib/checks/runner/execution.js";
import { planCheckExecution } from "../../src/lib/checks/runner/planning.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });
const shards = { count: 4, argument: "--shard={index}/{count}", routed: true } as const;
const playback = async (path: string) => (await readFile(path, "utf8")).trim().split("\n")
  .map(line => JSON.parse(line) as { method: string; params: { invocationId?: string; invocationIds?: string[]; source?: { root: string } } });

it("runs one real native baseline then exactly four native shards in the same prepared capture", async () => {
  const fixture = await makeNativeShardFixture();
  directories.push(fixture.root);
  const observed = join(fixture.root, "observations.secret");
  const roots = join(fixture.root, "native-roots.secret");
  await mkdir(observed);
  for (const file of ["a", "b", "c"]) {
    await appendFile(join(fixture.packageRoot, "tests", `${file}.test.mjs`),
      `\nimport { appendFileSync } from "node:fs";it("records native capture root",()=>appendFileSync(${JSON.stringify(roots)},process.cwd()+"\\n"));\n`);
  }
  await writeFile(join(fixture.root, ".gitignore"), "node_modules\ndist/\n*.secret\n");
  const git = createExecaGitExec();
  await git("git", ["init", "-b", "main", fixture.root]);
  await git("git", ["config", "user.email", "test@test.com"], { cwd: fixture.root });
  await git("git", ["config", "user.name", "Test User"], { cwd: fixture.root });
  await git("git", ["config", "gc.auto", "0"], { cwd: fixture.root });
  await commitAll(fixture.root);
  const check = CheckDeclarationSchema.parse({ checks: { native: {
    command: [process.execPath, "--import", "tsx", "src/scripts/run-local-test-tier.ts", "unit"],
    root: "packages/arc-framework", runner: true, mode: "project", cache: false,
    environment_inputs: { ARC_TEST_DURATION_FILE: "file", VITEST_MAX_WORKERS: "value" }, shards,
  } } }).checks.native!;
  const resolved = await resolveCheckRequest(git, fixture.root, { form: { kind: "run", ids: ["native"] }, scope: { kind: "all" } });
  if (resolved.status !== "resolved") throw new Error(resolved.message);
  const stdout = new Map<string, Buffer[]>();
  const prepared = await prepareSelectedCheckExecution({ callerRoot: fixture.root, request: resolved.request, check, paths: [],
    configuration: { file: "actual-process-fixture", argv: [process.execPath, "-e", preparedAdapterScript("group", undefined, observed)] },
    environment: { ARC_TEST_DURATION_FILE: undefined, VITEST_MAX_WORKERS: "1" },
    onOutput: frame => { if (frame.stream === "stdout") stdout.set(frame.invocationId,
      [...stdout.get(frame.invocationId) ?? [], Buffer.from(frame.bytes)]); },
    buildPlan: async context => {
      await symlink(await realpath(join(fixture.root, "node_modules")), join(context.source.root, "node_modules"), "junction");
      await mkdir(join(context.source.root, "packages/arc-framework/node_modules"));
      const input = { callerRoot: fixture.root, source: context.source, paths: context.paths, check };
      const baseline = await planCheckExecution({ ...input, check: { ...check, shards: { ...shards, routed: false } } });
      const matrix = await planCheckExecution(input);
      return { invocations: [...baseline.invocations, ...matrix.invocations],
        coordinates: [...baseline.coordinates!, ...matrix.coordinates!], probes: matrix.probes };
    },
  });
  if (prepared.status !== "ready") throw new Error(prepared.reason);
  const { execution } = prepared;
  try {
    const parent = await executeNativeQualificationPlan(execution, check, true);
    expect(parent.evidence.kind, JSON.stringify(parent)).toBe("success");
    const runs: NativeMembershipRun[] = execution.plan.invocations.map(invocation => {
      const outcome = execution.observedOutcomes.get(invocation.id);
      return { exitCode: outcome?.status === "completed" ? outcome.exitCode : -1,
      basis: { sourceDigest: execution.source.digest, environmentIdentity: execution.environmentIdentity,
        selection: check.command as string[], duration: { kind: "file", state: "unset" } },
      observations: readNativeShardObservations(Buffer.concat(stdout.get(invocation.id) ?? []).toString("utf8")) };
    });
    expect(qualifyNativeShardMembership(runs[0]!, runs.slice(1), 4)).toHaveLength(6);
    const rootsSeen = (await readFile(roots, "utf8")).trim().split("\n");
    expect(rootsSeen).toHaveLength(12);
    expect(new Set(rootsSeen)).toEqual(new Set([join(execution.source.root, "packages/arc-framework")]));
    const requests = await playback(join(observed, "requests"));
    const ids = execution.plan.invocations.map(invocation => invocation.id);
    expect(requests.filter(request => request.method === "check/prepare")).toHaveLength(1);
    expect(requests.filter(request => ["check/run", "check/runGroup"].includes(request.method))).toEqual([
      expect.objectContaining({ method: "check/run", params: { contextId: execution.contextId, invocationId: ids[0] } }),
      expect.objectContaining({ method: "check/runGroup", params: { contextId: execution.contextId, invocationIds: ids.slice(1) } }),
    ]);
    expect(execution.planId).toMatch(/^[a-f\d-]{36}$/u);
    await expect(execution.close()).resolves.toMatchObject({ status: "closed", exit: { exitCode: 0 } });
  } finally { await execution.close(); }
}, 90_000);

async function smallExecution(mode: "group" | "group-loss" | "execute", baselineExit = 0) {
  const fixture = await selectedExecutionFixture(directories, mode);
  const observed = join(fixture.stateRoot, "observations");
  await mkdir(observed);
  const launched = join(fixture.root, "launches.secret");
  const check = { ...fixture.input.check, shards };
  const prepared = await prepareSelectedCheckExecution({ ...fixture.input, check,
    configuration: { ...fixture.input.configuration, argv: [process.execPath, "-e", preparedAdapterScript(mode, undefined, observed)] },
    buildPlan: () => ({ invocations: ["baseline", "one", "two", "three", "four"].map((id, index) => ({
      id, cwd: ".", shell: false, argv: [process.execPath, "-e",
        `require('node:fs').appendFileSync(${JSON.stringify(launched)},${JSON.stringify(id + "\n")});process.exit(${index === 0 ? baselineExit : 0})`] })),
    probes: { global: [], check: [] } }),
  }, fixture.io);
  if (prepared.status !== "ready") throw new Error(prepared.reason);
  return { ...fixture, observed, launched, check, execution: prepared.execution };
}

it("keeps default dispatch unchanged and continues shards after a settled native baseline failure", async () => {
  for (const optIn of [false, true]) {
    const fixture = await smallExecution("group", 7);
    try {
      const parent = await executeNativeQualificationPlan(fixture.execution, fixture.check, optIn);
      expect(parent.evidence).toMatchObject({ kind: "failure", exitCode: 7, incomplete: [] });
      expect(fixture.execution.observedOutcomes.size).toBe(5);
      const requests = (await playback(join(fixture.observed, "requests"))).filter(request => ["check/run", "check/runGroup"].includes(request.method));
      expect(requests.map(request => request.method)).toEqual(optIn ? ["check/run", "check/runGroup"] : ["check/runGroup"]);
    } finally { await fixture.execution.close(); }
  }
});

it("does not dispatch the shard group after incomplete baseline work, retaining native failure and incomplete reasons", async () => {
  const fixture = await smallExecution("group-loss", 7);
  try {
    const parent = await executeNativeQualificationPlan(fixture.execution, fixture.check, true);
    expect(parent.evidence.kind).toBe("failure");
    expect(parent.evidence.exitCode).toBe(7);
    expect(parent.evidence.incomplete.length).toBeGreaterThan(0);
    expect(await readFile(fixture.launched, "utf8")).toBe("baseline\n");
    const requests = (await playback(join(fixture.observed, "requests"))).filter(request => ["check/run", "check/runGroup"].includes(request.method));
    expect(requests.map(request => request.method)).toEqual(["check/run"]);
    expect((await fixture.execution.close()).status).toBe("uncertain");
  } finally { await fixture.execution.close(); }
});

it("requires advertised grouping for the opt-in route without launching planned commands", async () => {
  const fixture = await smallExecution("execute");
  try {
    const parent = await executeNativeQualificationPlan(fixture.execution, fixture.check, true);
    expect(parent.evidence.kind).toBe("unavailable");
    expect(parent.evidence.incomplete.join(" ")).toContain("advertised");
    const requests = await playback(join(fixture.observed, "requests"));
    expect(requests.filter(request => ["check/run", "check/runGroup"].includes(request.method))).toEqual([]);
    expect(fixture.execution.observedOutcomes.size).toBe(0);
  } finally { await fixture.execution.close(); }
});
