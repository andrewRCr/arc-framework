/** Native siblings observe one consumer capture even after the caller changes its checkout and handed inputs. */
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeNativeShardFixture } from "../helpers/native-shard-fixture.js";
import { captureNativeShardFixture, runCapturedNativeShards } from "../helpers/native-shard-capture.js";
import { qualifyNativeShardMembership } from "../helpers/native-shard-qualification.js";
import { removeGitBackedDir } from "../helpers/temp-repo.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";

it("keeps native membership and assignments fixed after source, branch and duration edits following capture", async () => {
  const fixture = await makeNativeShardFixture();
  try {
    const durations = join(fixture.packageRoot, "durations.secret");
    await writeFile(durations, JSON.stringify({ results: [
      ["unit:tests/c.test.mjs", { duration: 100 }], ["unit-mocks:tests/a.test.mjs", { duration: 50 }],
    ] }));
    const captured = await captureNativeShardFixture(fixture, { ARC_TEST_DURATION_FILE: durations });
    try {
      await createExecaGitExec()("git", ["switch", "-c", "changed-after-capture"], { cwd: fixture.root });
      await rm(join(fixture.packageRoot, "tests/a.test.mjs"));
      await writeFile(join(fixture.packageRoot, "tests/widened.test.mjs"),
        'import { it } from "vitest"; it("live source must not execute", () => { throw new Error("changed source"); });');
      await writeFile(durations, '{"results":[["unit:tests/a.test.mjs",{"duration":99999}]]}');
      const [baseline, ...shards] = await runCapturedNativeShards(captured);
      for (const run of [baseline!, ...shards]) expect(run.exitCode, run.stdout + run.stderr).toBe(0);
      expect(qualifyNativeShardMembership(baseline!, shards, 2)).toHaveLength(6);
      expect(shards.map(run => run.observations[0]!.assigned)).toEqual([
        ["c", "a", "b"].map(name => ({ project: "unit", file: `tests/${name}.test.mjs` })),
        ["a", "b", "c"].map(name => ({ project: "unit-mocks", file: `tests/${name}.test.mjs` })),
      ]);
    } finally { await captured.dispose(); }
  } finally { await removeGitBackedDir(fixture.root); }
}, 90_000);
