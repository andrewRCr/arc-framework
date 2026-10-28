/** Production selected checks execute complete shard matrices through the public adapter contract. */
import { afterEach, expect, it } from "vitest";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createShardedCheckFixture, readShardedCheckRequests } from "../helpers/sharded-check-fixture.js";
import { registerRunnerFixtureSources } from "../fixtures/checks/runner-machine.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runArc } from "./helpers.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it.each(["execute", "group"] as const)("executes every pair through %s even after an ordinary failure", async mode => {
  const machine = await createShardedCheckFixture(directories, { mode, program: `
    const shard=process.argv[2];
    process.stdout.write(JSON.stringify({shard,content:!!process.env.ARC_CHECK_TREE,
      bytes:require('node:fs').readFileSync('src/a.ts','utf8')})+'\\n');
    if(shard==='--shard=1/3')process.exit(7);
  ` });
  const { root } = machine;
  const result = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
  await registerRunnerFixtureSources(directories, join(machine.home, "source"));
  expect(result.exitCode, result.stdout + result.stderr).toBe(1);
  const check = JSON.parse(result.stdout).result.checks[0];
  expect(check.outcome).toBe("failed");
  const rows = check.output.trim().split("\n").map((line: string) => JSON.parse(line));
  expect(rows.sort((first: { shard: string }, second: { shard: string }) => first.shard.localeCompare(second.shard))).toEqual(
    [1, 2, 3].map(index => ({ shard: `--shard=${index}/3`, content: true, bytes: "changed\n" })),
  );
  expect(check).not.toHaveProperty("record");
  const requests = await readShardedCheckRequests(machine.home);
  expect(requests.map(request => request.method)).toEqual(mode === "group"
    ? ["check/prepare", "check/runGroup", "check/release"]
    : ["check/prepare", "check/run", "check/run", "check/run", "check/release"]);
  const ids = requests.flatMap(request => request.method === "check/run" ? [request.params.invocationId!] : request.method === "check/runGroup" ? request.params.invocationIds : []);
  expect(new Set(ids).size).toBe(3);
  const preparation = requests.find(request => request.method === "check/prepare");
  if (preparation?.method !== "check/prepare") throw new Error("Expected a prepare request");
  await expect(access(preparation.params.source.root)).rejects.toThrow();
  await expect(access(join(machine.home, "closed"))).resolves.toBeUndefined();
}, 30_000);

it.each([undefined, false])("keeps opted-out routed declarations unsharded (%s)", async routed => {
  const fixture = await createShardedCheckFixture(directories, { mode: "group",
    program: "process.stdout.write(JSON.stringify(process.argv.slice(2)))",
    check: { shards: { count: 3, argument: "--shard={index}/{count}", ...(routed === undefined ? {} : { routed }) } },
  });
  const result = await runArc(["check", "run", "example", "--json"], fixture.root, { env: fixture.environment });
  expect(result.exitCode, result.stdout + result.stderr).toBe(0);
  const check = JSON.parse(result.stdout).result.checks[0];
  expect(check).toMatchObject({ outcome: "passed", output: "[]" });
  expect(check.invocations).toHaveLength(1);
  expect(check.invocations[0]).toMatchObject({ batch: 1, outcome: { kind: "success", exitCode: 0 } });
  expect(check.invocations[0]).not.toHaveProperty("shard");
  expect((await readShardedCheckRequests(fixture.home)).map(request => request.method))
    .toEqual(["check/prepare", "check/run", "check/release"]);
});

it("keeps complete group evidence when optional reports cannot be saved, without exposing bindings", async () => {
  const secret = "private-captured-input";
  const fixture = await createShardedCheckFixture(directories, { mode: "group",
    program: "process.stdout.write('useful\\n')", check: { environment_inputs: { PRIVATE_TOKEN: "value" } },
  });
  await writeFile(fixture.adapter, "process.stderr.write('adapter diagnostic\\n');\n" + await readFile(fixture.adapter, "utf8"));
  await writeFile(join(fixture.root, ".git/arc-checks"), "unavailable report directory");
  const result = await runArc(["check", "run", "example", "--json"], fixture.root, {
    env: { ...fixture.environment, PRIVATE_TOKEN: secret },
  });
  expect(result.exitCode, result.stdout + result.stderr).toBe(0);
  const check = JSON.parse(result.stdout).result.checks[0];
  expect(check).toMatchObject({ outcome: "passed", runnerOutput: "adapter diagnostic\n" });
  expect(check.logPath).toBeUndefined();
  expect(check.invocations.map((detail: { output: string }) => detail.output)).toEqual(Array(3).fill("useful\n"));
  expect(result.stdout + result.stderr).not.toContain(secret);
});
