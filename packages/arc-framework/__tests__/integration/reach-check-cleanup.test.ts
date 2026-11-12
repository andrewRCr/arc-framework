/** Native discovery cleanup survives invalid shard duration input and admits a repaired retry. */
import { execa } from "execa";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { makeVitestControllerFixture } from "../helpers/vitest-controller-fixture.js";

const sourcePackage = resolve(import.meta.dirname, "../..");

it("closes a discovered controller once when its sequencer throws, then runs after duration repair", async () => {
  const fixture = await makeVitestControllerFixture();
  try {
    const module = (path: string) => JSON.stringify(pathToFileURL(join(sourcePackage, path)).href);
    const configuration = join(fixture.packageRoot, "vitest.config.mjs");
    await writeFile(configuration, `import { HeavyFirstSequencer } from ${module("__tests__/helpers/heavy-first-sequencer.ts")};\n`
      + (await readFile(configuration, "utf8")).replace("test: { watch: false,", "test: { sequence: { sequencer: HeavyFirstSequencer }, watch: false,"));
    await writeFile(join(fixture.packageRoot, "tests/integration-selected.test.mjs"),
      'import { it, expect } from "vitest"; it("selected", () => expect(true).toBe(true));');
    const duration = join(fixture.packageRoot, "durations.json");
    await writeFile(duration, "invalid JSON");
    const script = join(fixture.packageRoot, "reach.mts");
    await writeFile(script, `
import { runReachSuites } from ${module("src/lib/reach-check.ts")};
const input = { checkoutRoot: ${JSON.stringify(fixture.root)}, packageRoot: process.cwd(),
  declaration: { name: "fixture suites" }, arguments: ["--shard=1/1"], env: process.env };
try { await runReachSuites(input, ["packages/arc-framework/tests/integration-selected.test.mjs"]); }
catch (error) { console.error(error); process.exitCode = 1; }
finally { process.exit(process.exitCode || 0); }
`);
    // The fixture builds its own runtime; CI's prebuilt-only switch governs the checkout's artifacts.
    const run = () => execa(process.execPath, ["--import", "tsx", script], { cwd: fixture.packageRoot,
      env: { ...process.env, FORCE_COLOR: undefined, CI: "1", ARC_E2E_SKIP_BUILD: "",
        ARC_TEST_DURATION_FILE: duration },
      reject: false, timeout: 30_000 });
    const failed = await run();
    expect(failed.exitCode).toBe(1);
    expect(failed.stderr).toMatch(/JSON|Unexpected token/u);
    const failedEvents = (await readFile(fixture.events, "utf8")).split("\n");
    expect(failedEvents.filter(event => event === "initialized")).toHaveLength(1);
    // Native closing tears down the root Vite server and both configured project servers.
    expect(failedEvents.filter(event => event === "closed")).toHaveLength(3);
    expect(failedEvents).not.toContain("integration-setup");
    await writeFile(fixture.events, "");
    await writeFile(duration, JSON.stringify({ results: [] }));
    const repaired = await run();
    expect(repaired.exitCode, repaired.stdout + repaired.stderr).toBe(0);
    expect(repaired.stdout).toContain("1 passed");
    const repairedEvents = (await readFile(fixture.events, "utf8")).split("\n");
    expect(repairedEvents).toContain("integration-setup");
    expect(repairedEvents.filter(event => event === "closed")).toHaveLength(3);
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 60_000);
