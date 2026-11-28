/** Run the store fixture's real setup and teardown after each early setup failure. */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { NESTED_CALL_LIMIT } from "../helpers/call-limit.js";
import { runVitestControllerFixture } from "../helpers/vitest-controller-fixture.js";
import { cleanupTempDir, createTempRepo } from "./helpers.js";

it.each(["repo creation", "arc init"])("cleans up after %s fails", async (stage) => {
  const scratch = await createTempRepo("arc-cleanup-probe-");
  try {
    const packageRoot = resolve(import.meta.dirname, "../..");
    const config = join(scratch, "vitest.config.mjs");
    const setup = join(import.meta.dirname, "lifecycle-exit-setup-failure.fixture.ts");
    await writeFile(config, `export default ${JSON.stringify({ root: packageRoot, test: { setupFiles: [setup] } })}`);
    const trace = join(scratch, "git.trace");
    await writeFile(trace, "");
    const beforeRepo = stage === "repo creation";
    const result = await runVitestControllerFixture(packageRoot, [
      "run", "--config", config, "--configLoader", "native", "--reporter", "default",
      "__tests__/e2e/lifecycle-exit.e2e.test.ts", "-t", "lifecycle exit on the store",
    ], {
      TMPDIR: scratch, TEMP: scratch, TMP: scratch,
      ARC_TEST_FAIL_REPO: beforeRepo ? "1" : "0",
      // Contain any Git call that would otherwise resolve the runner's checkout.
      ...(beforeRepo ? { GIT_DIR: join(scratch, ".git"), GIT_TRACE: trace } : {}),
    }, "native");

    const output = result.stdout + result.stderr;
    expect(result.code, output).toBe(1);
    expect(output).toContain(beforeRepo ? "fixture repo unavailable" : ".arc-init.lock exists");
    if (beforeRepo) {
      expect(await readFile(trace, "utf8"), "pruned without acquiring a repository").not.toContain("git worktree prune");
    } else {
      const leftovers = (await readdir(scratch)).filter(name => name.startsWith("arc-exit-store-"));
      expect(leftovers, "fixture repositories left after arc init failed").toEqual([]);
    }
  } finally {
    await cleanupTempDir(scratch);
  }
}, 2 * NESTED_CALL_LIMIT);
