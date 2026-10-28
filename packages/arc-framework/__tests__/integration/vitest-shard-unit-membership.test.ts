/** Native unit projects retain exact membership across filters, captured duration states and selection changes. */
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeNativeShardFixture } from "../helpers/native-shard-fixture.js";
import { captureNativeShardFixture, runCapturedNativeShards } from "../helpers/native-shard-capture.js";
import { qualifyNativeShardMembership } from "../helpers/native-shard-qualification.js";
import { removeGitBackedDir } from "../helpers/temp-repo.js";

it.each(["unset", "empty", "available", "empty-file"] as const)(
  "qualifies native unit projects with captured %s durations and changed/filtered membership", async state => {
    const fixture = await makeNativeShardFixture();
    try {
      await rm(join(fixture.packageRoot, "tests/b.test.mjs"));
      await writeFile(join(fixture.packageRoot, "tests/d.test.mjs"),
        'import { it } from "vitest"; it("new native member", () => {});');
      const path = join(fixture.packageRoot, "durations.secret");
      const content = state === "empty-file" ? "" : JSON.stringify({ results: [
        ["unit:tests/c.test.mjs", { duration: 100 }], ["unit-mocks:tests/a.test.mjs", { duration: 50 }],
      ] });
      await writeFile(path, content);
      const environment = { ARC_TEST_DURATION_FILE: state === "unset" ? undefined : state === "empty" ? "" : path };
      const filtered = state === "empty" || state === "empty-file";
      const captured = await captureNativeShardFixture(fixture, environment, filtered ? ["tests/a"] : []);
      try {
        const [baseline, ...shards] = await runCapturedNativeShards(captured);
        for (const run of [baseline!, ...shards]) expect(run.exitCode, run.stdout + run.stderr).toBe(0);
        const selected = qualifyNativeShardMembership(baseline!, shards, 2);
        const expected = ["unit", "unit-mocks"].flatMap(project => (filtered ? ["a"] : ["a", "c", "d"])
          .map(name => `${project}:tests/${name}.test.mjs`)).sort();
        expect(selected.map(member => `${member.project}:${member.file}`).sort()).toEqual(expected);
        expect(shards.map(run => run.observations[0]!.assigned).flat()).not.toContainEqual({ project: "unit", file: "tests/b.test.mjs" });
        if (state === "available") {
          expect(shards.map(run => run.observations[0]!.ordered[0])).toEqual([
            { project: "unit", file: "tests/c.test.mjs" }, { project: "unit-mocks", file: "tests/a.test.mjs" },
          ]);
        }
      } finally { await captured.dispose(); }
    } finally { await removeGitBackedDir(fixture.root); }
  }, 90_000,
);
