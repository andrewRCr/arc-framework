/** Refusal and interruption retain complete-plan lifetime authority through real CLI conversations. */
import { afterEach, expect, it } from "vitest";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createShardedCheckFixture, readShardedCheckRequests } from "../helpers/sharded-check-fixture.js";
import { preparedAdapterScript } from "../fixtures/checks/prepared-execution.js";
import { startRunnerCli, waitForRunnerObservation } from "../fixtures/checks/runner-cli.js";
import { registerRunnerFixtureSources } from "../fixtures/checks/runner-machine.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runArc } from "./helpers.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it.each(["unavailable", "unavailable-unsettled", "unavailable-bad-exit"] as const)(
  "handles %s without inventing a context, and permits a fresh repaired attempt", async mode => {
    const fixture = await createShardedCheckFixture(directories, { mode, program: "process.stdout.write('repaired')" });
    const result = await runArc(["check", "run", "example", "--json"], fixture.root, { env: fixture.environment });
    expect(result.exitCode, result.stdout + result.stderr).toBe(2);
    expect(JSON.parse(result.stdout).result.checks[0].outcome).toBe("couldn't run");
    const source = JSON.parse(await readFile(join(fixture.home, "source"), "utf8"));
    const requests = await readShardedCheckRequests(fixture.home);
    expect(requests.filter(request => ["check/run", "check/runGroup", "check/release"].includes(request.method))).toEqual([]);
    const prepare = requests.find(request => request.method === "check/prepare");
    if (prepare?.method !== "check/prepare") throw new Error("Expected prepare request");
    expect(prepare.params.invocations).toHaveLength(3);
    if (mode === "unavailable") await expect(access(source.root)).rejects.toThrow();
    else {
      await expect(access(source.root)).resolves.toBeUndefined();
      expect(JSON.parse(result.stdout).result.checks[0].remedy).toContain(prepare.params.planId);
    }
    await registerRunnerFixtureSources(directories, join(fixture.home, "source"));
    await writeFile(fixture.adapter, preparedAdapterScript("group", undefined, fixture.home));
    const repaired = await runArc(["check", "run", "example", "--json"], fixture.root, { env: fixture.environment });
    expect(repaired.exitCode, repaired.stdout + repaired.stderr).toBe(0);
    expect(JSON.parse(repaired.stdout).result.checks[0]).toMatchObject({ outcome: "passed", output: "repaired".repeat(3) });
    const attempts = (await readShardedCheckRequests(fixture.home)).filter(request => request.method === "check/prepare");
    expect(new Set(attempts.map(request => request.params.planId)).size).toBe(2);
  }, 30_000,
);

it.runIf(process.platform !== "win32")("accepts preparation refusal before a late cancellation acknowledgment", async () => {
  const fixture = await createShardedCheckFixture(directories, { mode: "cancel-refusal", program: "process.exit(0)" });
  const cli = startRunnerCli(fixture.root, fixture.environment);
  try {
    await waitForRunnerObservation(join(fixture.home, "waiting"), cli);
    const preparing = JSON.parse(await readFile(join(fixture.home, "preparing"), "utf8"));
    cli.child.kill("SIGTERM");
    const result = await cli.completed;
    expect(result.exitCode, result.stdout + result.stderr).toBe(2);
    expect(JSON.parse(result.stdout).result.checks[0].outcome).toBe("couldn't run");
    const requests = await readShardedCheckRequests(fixture.home);
    expect(requests.map(request => request.method)).toEqual(["check/prepare", "check/cancel"]);
    await expect(access(preparing.source.root)).rejects.toThrow();
    await expect(access(join(fixture.home, "closed"))).resolves.toBeUndefined();
  } finally {
    if (!cli.closed) cli.child.kill("SIGKILL");
    await cli.completed;
    await registerRunnerFixtureSources(directories, join(fixture.home, "source"));
  }
}, 30_000);

it.runIf(process.platform !== "win32")("holds the group capture after cancellation acknowledgment until every resistant sibling closes", async () => {
  const fixture = await createShardedCheckFixture(directories, { mode: "group-cancel", program: "" });
  const gate = join(fixture.home, "settle");
  await writeFile(join(fixture.root, "capture.cjs"), `const fs=require('node:fs');
    const shard=process.argv[2].split('=')[1].replaceAll('/','-');
    process.on('SIGTERM',()=>fs.writeFileSync(${JSON.stringify(fixture.home)}+'/cancelled-'+shard,'acknowledged'));
    fs.writeFileSync(${JSON.stringify(fixture.home)}+'/started-'+shard,'started');
    setInterval(()=>{if(fs.existsSync(${JSON.stringify(gate)})){process.stdout.write('drained '+shard+'\\n');process.exit(0);}},10);`);
  const cli = startRunnerCli(fixture.root, fixture.environment);
  try {
    for (let index = 1; index <= 3; index++) await waitForRunnerObservation(join(fixture.home, `started-${index}-3`), cli);
    const preparing = JSON.parse(await readFile(join(fixture.home, "preparing"), "utf8"));
    cli.child.kill("SIGTERM");
    await waitForRunnerObservation(join(fixture.home, "cancel"), cli);
    for (let index = 1; index <= 3; index++) await waitForRunnerObservation(join(fixture.home, `cancelled-${index}-3`), cli);
    expect(cli.closed).toBe(false);
    await expect(access(preparing.source.root)).resolves.toBeUndefined();
    await writeFile(gate, "settle");
    const result = await cli.completed;
    expect(result.exitCode, result.stdout + result.stderr).toBe(2);
    const check = JSON.parse(result.stdout).result.checks[0];
    expect(check.outcome).toBe("couldn't run");
    expect(check.invocations).toHaveLength(3);
    for (let index = 1; index <= 3; index++) expect(check.invocations[index - 1].output).toBe(`drained ${index}-3\n`);
    await expect(access(preparing.source.root)).rejects.toThrow();
    const requests = await readShardedCheckRequests(fixture.home);
    expect(requests.filter(request => request.method === "check/runGroup")).toHaveLength(1);
    expect(requests.filter(request => request.method === "check/release")).toHaveLength(1);
  } finally {
    await writeFile(gate, "settle");
    if (!cli.closed) cli.child.kill("SIGKILL");
    await cli.completed;
    await waitForRunnerObservation(join(fixture.home, "closed"));
    await registerRunnerFixtureSources(directories, join(fixture.home, "source"));
  }
}, 30_000);
