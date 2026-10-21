/** The repository's native configuration keeps operation measurements outside parallel test execution. */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { copyLiveDependencies } from "../helpers/copy-live-dependencies.js";
import { makeVitestControllerFixture, runVitestControllerFixture } from "../helpers/vitest-controller-fixture.js";
import { localVitestTierArguments } from "../../src/lib/local-vitest-runner.js";

it("runs timing exactly once outside other selected files while ordinary files still overlap", async () => {
  const fixture = await makeVitestControllerFixture();
  try {
    await rm(join(fixture.packageRoot, "vitest.config.mjs"));
    await copyLiveDependencies(resolve(import.meta.dirname, "../.."), fixture.packageRoot, ["vitest.config.ts"]);
    const directory = join(fixture.packageRoot, "__tests__/integration");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "global-setup.ts"), "export function setup() {}\n");
    for (const name of ["parallel-a", "parallel-b", "store-ref-timing"]) {
      const timing = name === "store-ref-timing";
      await writeFile(join(directory, `${name}.test.ts`), `
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
import { it } from "vitest";
it(${JSON.stringify(name)}, async () => {
  const events = ${JSON.stringify(fixture.events)};
  appendFileSync(events, ${JSON.stringify(`${name}:start\n`)});
  writeFileSync(events + ${JSON.stringify(`.${name}`)}, "ready");
  ${timing ? "await setTimeout(1_000);" : `
  const deadline = Date.now() + 5_000;
  while (!existsSync(events + ".parallel-a") || !existsSync(events + ".parallel-b")) {
    if (Date.now() >= deadline) throw new Error("Ordinary files no longer execute concurrently");
    await setTimeout(10);
  }
  await setTimeout(100);`}
  appendFileSync(events, ${JSON.stringify(`${name}:end\n`)});
});
`);
    }
    await writeFile(fixture.events, "");
    const result = await runVitestControllerFixture(fixture.packageRoot,
      ["run", ...localVitestTierArguments("integration"), "--maxWorkers", "3"],
      { CI: "1", FORCE_COLOR: "", ARC_TEST_DURATION_FILE: "" }, "native");
    expect(result.code, result.stdout + result.stderr).toBe(0);
    const events = (await readFile(fixture.events, "utf8")).trim().split("\n");
    expect(events.filter(event => event === "store-ref-timing:start")).toHaveLength(1);
    expect(events.filter(event => event === "store-ref-timing:end")).toHaveLength(1);
    const start = events.indexOf("store-ref-timing:start");
    const end = events.indexOf("store-ref-timing:end");
    for (const name of ["parallel-a", "parallel-b"]) {
      const otherStart = events.indexOf(`${name}:start`);
      const otherEnd = events.indexOf(`${name}:end`);
      expect(otherStart).toBeGreaterThanOrEqual(0);
      expect(otherEnd).toBeGreaterThan(otherStart);
      expect(otherEnd < start || otherStart > end, events.join("\n")).toBe(true);
    }
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 30_000);
