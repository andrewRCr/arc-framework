/** Independently observed shard outcomes survive lost or malformed group closure. */
import { afterEach, expect, it } from "vitest";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createShardedCheckFixture } from "../helpers/sharded-check-fixture.js";
import { registerRunnerFixtureSources } from "../fixtures/checks/runner-machine.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runArc } from "./helpers.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it.each([
  { mode: "group-loss", code: 7 }, { mode: "group-malformed", code: 7 },
  { mode: "group-loss", code: 0 }, { mode: "group-malformed", code: 0 },
] as const)("retains status $code and every incomplete pair after $mode", async ({ mode, code }) => {
  const fixture = await createShardedCheckFixture(directories, { mode,
    program: `process.stdout.write('native terminal output');process.exit(${code})`,
  });
  const result = await runArc(["check", "run", "example", "--json"], fixture.root, { env: fixture.environment });
  await expect(access(join(fixture.home, "closed"))).resolves.toBeUndefined();
  await registerRunnerFixtureSources(directories, join(fixture.home, "source"));
  expect(result.exitCode, result.stdout + result.stderr).toBe(code === 0 ? 2 : 1);
  const check = JSON.parse(result.stdout).result.checks[0];
  expect(check).toMatchObject({ outcome: code === 0 ? "couldn't run" : "failed", output: "native terminal output" });
  expect(check.reason).toMatch(/batch 1.*shard 2\/3/iu);
  expect(check.reason).toMatch(/batch 1.*shard 3\/3/iu);
  expect(check.invocations).toHaveLength(3);
  expect(check.invocations[0].output).toBe("native terminal output");
  expect(await readFile(check.logPath, "utf8")).toContain("Batch 1, shard 1/3\nnative terminal output");
  expect(check.invocations[0]).toMatchObject({ batch: 1, shard: { index: 1, count: 3 },
    outcome: { kind: code === 0 ? "success" : "failure", exitCode: code } });
  expect(check.invocations.slice(1)).toMatchObject([
    { shard: { index: 2, count: 3 }, outcome: { kind: "unavailable" } },
    { shard: { index: 3, count: 3 }, outcome: { kind: "unavailable" } },
  ]);
  expect(check.remedy).toMatch(/plan|settle/iu);
  expect(check).not.toHaveProperty("record");
  const human = await runArc(["check", "run", "example"], fixture.root, { env: fixture.environment });
  await registerRunnerFixtureSources(directories, join(fixture.home, "source"));
  expect(human.exitCode, human.stdout + human.stderr).toBe(code === 0 ? 2 : 1);
  expect(human.stdout).toContain(`Batch 1, shard 1/3: ${code === 0 ? "passed" : "failed"} (exit ${code})`);
  expect(human.stdout).toContain("Batch 1, shard 2/3: couldn't run");
  expect(human.stdout).toContain("Batch 1, shard 3/3: couldn't run");
}, 30_000);
