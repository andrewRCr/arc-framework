/** Real native teardown and worker cleanup failures are visible after passing cases. */
import { access, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeVitestRuntimeFixture } from "../helpers/vitest-runtime-fixture.js";
import { runVitestControllerFixture } from "../helpers/vitest-controller-fixture.js";

it.each(["teardown", "worker", "collection and teardown"])("retains native %s failure through closing", async (fault) => {
  const fixture = await makeVitestRuntimeFixture();
  try {
    if (fault.includes("teardown")) {
      const setup = join(fixture.packageRoot, "tests/integration-setup.mjs");
      await writeFile(setup, (await readFile(setup, "utf8")).replace(
        'return () => observe("teardown");',
        'return () => { observe("teardown"); throw new Error("native teardown failure retained"); };'));
    }
    if (fault === "worker") {
      await writeFile(join(fixture.packageRoot, "tests/environment.mjs"), `export default {
        name: "cleanup-failure", viteEnvironment: "ssr", setup() { return {
          teardown() { throw new Error("native worker cleanup failure retained"); }
        }; }
      };`);
      const config = join(fixture.packageRoot, "vitest.config.mjs");
      await writeFile(config, (await readFile(config, "utf8")).replace('name: "integration",',
        'name: "integration", environment: "./tests/environment.mjs",'));
    }
    if (fault.includes("collection")) await writeFile(join(fixture.packageRoot, "tests/integration-runtime.test.mjs"),
      'throw new Error("original collection failure retained");');
    const result = await runVitestControllerFixture(fixture.packageRoot,
      ["integration", "--dangerouslyIgnoreUnhandledErrors"], { CI: "1", ARC_E2E_SKIP_BUILD: undefined });
    expect(result.code).toBe(1);
    expect(result.stdout + result.stderr).toContain(fault === "worker"
      ? "native worker cleanup failure retained" : "native teardown failure retained");
    if (fault.includes("collection")) expect(result.stdout + result.stderr).toContain("original collection failure retained");
    expect(result.stdout + result.stderr).not.toContain("No test cases completed");
    const events = await readFile(fixture.events, "utf8");
    expect(events).toContain('"stage":"integration:teardown"');
    expect(events).toContain('"owned":true');
    await expect(access(join(fixture.packageRoot, ".arc-build.lock"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 30_000);
