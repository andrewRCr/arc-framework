/** Mixed discovery prepares heavy setup before native shards choose executed files. */
import { execa } from "execa";
import { access, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeFocusedVitestFixture } from "../helpers/focused-vitest-fixture.js";

it("retains heavy setup and artifact ownership when a native mixed shard executes only unit cases", async () => {
  const fixture = await makeFocusedVitestFixture();
  try {
    await writeFile(join(fixture.packageRoot, "__tests__/unit/shard-unit.test.mjs"), `
import { it, expect, inject } from "vitest";
import { existsSync, readFileSync } from "node:fs";
it("executes owned unit shard", () => {
  expect(existsSync(${JSON.stringify(join(fixture.packageRoot, ".arc-build.lock"))})).toBe(true);
  const evidence = JSON.parse(readFileSync(${JSON.stringify(join(fixture.packageRoot, "dist/dev-build-stamp.json"))}, "utf8"));
  expect(inject("arcRuntimeBuild").generation).toBe(evidence.generation);
  console.log("OWNED-UNIT-SHARD-RAN");
});
`);
    let sawUnitShard = false;
    let generation: string | undefined;
    for (const shard of ["1/2", "2/2"]) {
      await writeFile(fixture.events, "");
      const result = await execa("npm", ["run", "-s", "test:full", "-w", "packages/arc-framework", "--",
        "__tests__/unit/shard-unit.test.mjs", "__tests__/integration/runtime.test.mjs", "--shard", shard],
        { cwd: fixture.root, env: { CI: "1", ARC_E2E_SKIP_BUILD: "" }, reject: false, timeout: 30_000 });
      expect(result, result.stderr).toMatchObject({ exitCode: 0 });
      if (result.stdout.includes("OWNED-UNIT-SHARD-RAN")) {
        sawUnitShard = true;
        expect(result.stdout).not.toContain("|integration|");
      }
      const events = (await readFile(fixture.events, "utf8")).split("\n").filter((line) => line.startsWith("{"))
        .map((line) => JSON.parse(line) as { stage: string; owned: boolean; generation: string });
      expect(events.map(({ stage }) => stage)).toEqual(["integration:setup", "integration:teardown"]);
      for (const event of events) {
        expect(event.owned).toBe(true);
        if (generation === undefined) generation = event.generation;
        expect(event.generation).toBe(generation);
      }
      await expect(access(join(fixture.packageRoot, ".arc-build.lock"))).rejects.toMatchObject({ code: "ENOENT" });
    }
    expect(sawUnitShard).toBe(true);
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 60_000);
