/** The portability npm route executes installation, cancellation, and publication coverage. */
import { execa } from "execa";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { makeVitestControllerFixture } from "../helpers/vitest-controller-fixture.js";

it("selects the build and prebuilt recovery suites alongside existing portability cases", async () => {
  const fixture = await makeVitestControllerFixture();
  const required = ["unit/paths.test.ts", "check-runner-home.e2e.test.ts", "fs.test.ts", "build-context.test.ts", "build-cancellation.test.ts", "build-generation-lifetime.test.ts",
    "build-coordinator.test.ts", "build-publication.test.ts",
    "build-inventory.test.ts", "build-ownership.test.ts", "ci-build-transfer.test.ts", "ci-build-recovery.test.ts",
    "lib/checks/runner/planning-spelling.test.ts", "lib/checks/runner/source-platform-paths.test.ts",
    "lib/checks/runner/source-cwd.test.ts", "lib/checks/runner/session-outcomes.test.ts",
    "lib/checks/runner/contract-operations.test.ts", "lib/checks/result.test.ts",
    "check-runner-session.test.ts", "check-runner-conformance-wire.test.ts", "check-runner-conformance-groups.test.ts",
    "check-runner-execution-run.test.ts", "check-runner-platform-status.test.ts", "check-runner-platform-spelling.test.ts",
    "check-runner-platform.e2e.test.ts", "check-symlink-cwd.test.ts",
    "lib/checks/batching.test.ts", "lib/checks/forecast.test.ts",
    "lib/checks/key.test.ts", "handlers/check/run-output.test.ts", "handlers/check/run-output-json.test.ts",
    "check-runner-shards.e2e.test.ts", "check-runner-shard-loss.e2e.test.ts", "check-runner-shard-inputs.test.ts",
    "ci-check-runner.test.ts", "heavy-first-sequencer.test.ts", "duration-artifacts.test.ts",
    "duration-layout-workflow.test.ts", "vitest-discovery.test.ts", "vitest-completion.test.ts",
    "vitest-mixed-shard.test.ts", "vitest-native-writers.test.ts", "vitest-native-closing.test.ts",
    "vitest-runtime-ownership.test.ts"];
  try {
    const config = join(fixture.packageRoot, "vitest.config.mjs");
    await writeFile(config, (await readFile(config, "utf8")).replace('["tests/unit*.test.mjs"]', '["tests/**/*.test.ts"]'));
    // Similarly named suites outside the portability surface must stay unselected.
    for (const file of [...required, "unit/build-publication-paths.test.ts", "lib/store/lifecycle-paths.test.ts"]) {
      await mkdir(dirname(join(fixture.packageRoot, "tests", file)), { recursive: true });
      await writeFile(join(fixture.packageRoot, "tests", file), `
import { it } from "vitest";
import { appendFileSync } from "node:fs";
it("executes the selected portability suite", () => appendFileSync(${JSON.stringify(fixture.events)}, ${JSON.stringify("suite:" + file + "\n")}));
`);
    }
    const result = await execa("npm", ["run", "-s", "test:portability"], {
      cwd: fixture.root, env: { CI: "1", ARC_E2E_SKIP_BUILD: "1" }, reject: false, timeout: 30_000,
    });
    expect(result.exitCode, result.stderr).toBe(0);
    const selected = (await readFile(fixture.events, "utf8")).split("\n")
      .filter((line) => line.startsWith("suite:")).map((line) => line.slice("suite:".length)).sort();
    expect(selected).toEqual([...required].sort());
    await expect(readFile(join(fixture.packageRoot, ".config-loads"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 60_000);
