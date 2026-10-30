/** Complete shard parent reuse and publication remain subordinate to prepared executor closure. */
import { afterEach, expect, it } from "vitest";
import { access, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createShardedCheckFixture, readShardedCheckRequests } from "../helpers/sharded-check-fixture.js";
import { preparedAdapterScript } from "../fixtures/checks/prepared-execution.js";
import { startRunnerCli, waitForRunnerObservation } from "../fixtures/checks/runner-cli.js";
import { registerRunnerFixtureSources } from "../fixtures/checks/runner-machine.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runArc } from "./helpers.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

async function passFiles(root: string): Promise<string[]> {
  const directory = join(root, ".git/arc-checks");
  try { return (await readdir(directory)).filter(name => /^[0-9a-f]{64}\.json$/u.test(name)).map(name => join(directory, name)); }
  catch (error) {
    if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return [];
    throw error;
  }
}

it("publishes only after provider exit, releases a whole-parent hit and forces a fresh execution explicitly", async () => {
  const fixture = await createShardedCheckFixture(directories, { mode: "group-known-close-gate",
    check: { cache: true }, program: "process.stdout.write('complete\\n')" });
  const gate = join(fixture.home, "exit");
  await writeFile(fixture.adapter, preparedAdapterScript("group-known-close-gate", gate, fixture.home));
  const cli = startRunnerCli(fixture.root, fixture.environment);
  try {
    await waitForRunnerObservation(join(fixture.home, "input-closed"), cli);
    const prepared = JSON.parse(await readFile(join(fixture.home, "preparing"), "utf8"));
    expect(cli.closed).toBe(false);
    await expect(access(prepared.source.root)).resolves.toBeUndefined();
    expect(await passFiles(fixture.root)).toEqual([]);
    await writeFile(gate, "exit");
    const first = await cli.completed;
    expect(first.exitCode, first.stdout + first.stderr).toBe(0);
    expect(JSON.parse(first.stdout).result.checks[0]).toMatchObject({ outcome: "passed", record: { status: "recorded" } });
    expect(JSON.parse(first.stdout).result.checks[0].invocations).toHaveLength(3);
    expect(await passFiles(fixture.root)).toHaveLength(1);
    await expect(access(prepared.source.root)).rejects.toThrow();
    const hit = await runArc(["check", "run", "example", "--json"], fixture.root, { env: fixture.environment });
    expect(hit.exitCode, hit.stdout + hit.stderr).toBe(0);
    expect(JSON.parse(hit.stdout).result.checks[0]).toMatchObject({ outcome: "reused" });
    const hitRequests = await readShardedCheckRequests(fixture.home);
    expect(hitRequests.filter(request => request.method === "check/runGroup")).toHaveLength(1);
    expect(hitRequests.filter(request => request.method === "check/release")).toHaveLength(2);
    const forced = await runArc(["check", "run", "example", "--force", "--json"], fixture.root, { env: fixture.environment });
    expect(forced.exitCode, forced.stdout + forced.stderr).toBe(0);
    expect(JSON.parse(forced.stdout).result.checks[0].outcome).toBe("passed");
    const requests = await readShardedCheckRequests(fixture.home);
    expect(requests.filter(request => request.method === "check/runGroup")).toHaveLength(2);
    expect(new Set(requests.filter(request => request.method === "check/prepare").map(request => request.params.planId)).size).toBe(3);
    expect(await passFiles(fixture.root)).toHaveLength(1);
  } finally {
    await writeFile(gate, "exit");
    if (!cli.closed) cli.child.kill("SIGKILL");
    await cli.completed;
    await waitForRunnerObservation(join(fixture.home, "closed"));
    await registerRunnerFixtureSources(directories, join(fixture.home, "source"));
  }
}, 30_000);

it.each([
  { mode: "group-known", code: 7, exit: 1, outcome: "failed" },
  { mode: "group-known-loss", code: 0, exit: 2, outcome: "couldn't run" },
  { mode: "group-known-bad-output", code: 0, exit: 2, outcome: "couldn't run" },
  { mode: "group-known-bad-exit", code: 0, exit: 2, outcome: "couldn't run" },
  { mode: "group", code: 0, exit: 0, outcome: "passed" },
] as const)("publishes no pass for $mode with native status $code", async ({ mode, code, exit, outcome }) => {
  const fixture = await createShardedCheckFixture(directories, { mode, check: { cache: true },
    program: `process.exit(${code})` });
  const result = await runArc(["check", "run", "example", "--json"], fixture.root, { env: fixture.environment });
  expect(result.exitCode, result.stdout + result.stderr).toBe(exit);
  expect(JSON.parse(result.stdout).result.checks[0].outcome).toBe(outcome);
  expect(JSON.parse(result.stdout).result.checks[0].invocations).toHaveLength(3);
  expect(await passFiles(fixture.root)).toEqual([]);
  await registerRunnerFixtureSources(directories, join(fixture.home, "source"));
}, 30_000);

it("treats a corrupt parent record as a miss and keeps a successful run when replacement publication fails", async () => {
  const fixture = await createShardedCheckFixture(directories, { mode: "group-known",
    check: { cache: true }, program: "process.stdout.write('proof')" });
  const run = () => runArc(["check", "run", "example", "--json"], fixture.root, { env: fixture.environment });
  const first = await run();
  expect(first.exitCode, first.stdout + first.stderr).toBe(0);
  const [record] = await passFiles(fixture.root);
  if (!record) throw new Error("Expected one complete parent record");
  await writeFile(record, "invalid disposable record");
  const miss = await run();
  expect(miss.exitCode, miss.stdout + miss.stderr).toBe(0);
  expect(JSON.parse(miss.stdout).result.checks[0]).toMatchObject({ outcome: "passed", record: { status: "unavailable" } });
  expect((await readShardedCheckRequests(fixture.home)).filter(request => request.method === "check/runGroup")).toHaveLength(2);
  await rm(record);
  const repaired = await run();
  expect(JSON.parse(repaired.stdout).result.checks[0]).toMatchObject({ outcome: "passed", record: { status: "recorded" } });
  const hit = await run();
  expect(JSON.parse(hit.stdout).result.checks[0].outcome).toBe("reused");
  expect(await passFiles(fixture.root)).toHaveLength(1);
}, 30_000);

it("keeps native group success when pass and report storage are unavailable, then recovers normally", async () => {
  const fixture = await createShardedCheckFixture(directories, { mode: "group-known",
    check: { cache: true }, program: "process.stdout.write('proof')" });
  const blocked = join(fixture.root, ".git/arc-checks");
  await writeFile(blocked, "unavailable storage");
  const run = () => runArc(["check", "run", "example", "--json"], fixture.root, { env: fixture.environment });
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await run();
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).result.checks[0]).toMatchObject({ outcome: "passed", record: { status: "unavailable" } });
    expect(JSON.parse(result.stdout).result.checks[0].logPath).toBeUndefined();
  }
  await rm(blocked);
  const repaired = await run();
  expect(JSON.parse(repaired.stdout).result.checks[0]).toMatchObject({ outcome: "passed", record: { status: "recorded" } });
  const hit = await run();
  expect(JSON.parse(hit.stdout).result.checks[0].outcome).toBe("reused");
}, 30_000);

it("keeps settled disposal warnings advisory on both execution and whole-parent reuse", async () => {
  const fixture = await createShardedCheckFixture(directories, { mode: "cleanup-warning",
    check: { cache: true }, program: "process.stdout.write('proof')" });
  for (const outcome of ["passed", "reused"]) {
    const result = await runArc(["check", "run", "example", "--json"], fixture.root, { env: fixture.environment });
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).result.checks[0]).toMatchObject({ outcome,
      notice: expect.stringContaining("Remove settled provider resource manually") });
    expect(await readFile(join(fixture.home, "settled-resource"), "utf8")).toBe("settled provider resource");
    const source = JSON.parse(await readFile(join(fixture.home, "source"), "utf8"));
    await expect(access(source.root)).rejects.toThrow();
  }
  expect(await passFiles(fixture.root)).toHaveLength(1);
}, 30_000);
