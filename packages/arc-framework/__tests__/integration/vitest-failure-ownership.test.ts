/** Native failure paths close their controller before releasing either ownership scope. */
import { execFile } from "node:child_process";
import { access, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { makeVitestRuntimeFixture } from "../helpers/vitest-runtime-fixture.js";
import { runVitestControllerFixture } from "../helpers/vitest-controller-fixture.js";

const execute = promisify(execFile);

it.each(["setup", "collection"])("closes a native %s failure before releasing CPU and artifacts", async (fault) => {
  const fixture = await makeVitestRuntimeFixture();
  try {
    await execute("git", ["init", fixture.root]);
    const configuration = join(fixture.packageRoot, "vitest.config.mjs");
    const closing = `appendFileSync(events, JSON.stringify({ stage: "controller:close",
      artifact: existsSync(${JSON.stringify(join(fixture.packageRoot, ".arc-build.lock"))}),
      cpu: existsSync(${JSON.stringify(join(fixture.root, ".git/arc/test-suite/.local-heavy-tests.lock"))}) }) + "\\n");`;
    await writeFile(configuration, (await readFile(configuration, "utf8"))
      .replace('import { appendFileSync }', 'import { appendFileSync, existsSync }')
      .replace('appendFileSync(events, "closed\\n");', closing));
    const module = join(fixture.packageRoot, "tests/integration-runtime.test.mjs");
    if (fault === "setup") {
      const setup = join(fixture.packageRoot, "tests/integration-setup.mjs");
      await writeFile(setup, (await readFile(setup, "utf8")).replace(
        '  observe("setup");', '  throw new Error("native setup refused");'));
    } else if (fault === "collection") {
      await writeFile(module, 'throw new Error("native collection refused");');
    } else {
      await writeFile(module, 'import { it } from "vitest"; it("failure", () => { throw new Error("native execution refused"); });');
    }
    const result = await runVitestControllerFixture(fixture.packageRoot, ["integration"],
      { CI: "", ARC_TEST_ALLOW_CONCURRENCY: "", ARC_E2E_SKIP_BUILD: undefined });
    expect(result.code).toBe(1);
    expect(result.stdout + result.stderr).toContain(`native ${fault} refused`);
    const closingEvents = (await readFile(fixture.events, "utf8")).split("\n")
      .filter((event) => event.startsWith('{"stage":"controller:close"'))
      .map((event) => JSON.parse(event) as { artifact: boolean; cpu: boolean });
    expect(closingEvents.length).toBeGreaterThan(0);
    for (const event of closingEvents) expect(event).toMatchObject({ artifact: true, cpu: true });
    for (const lease of [join(fixture.packageRoot, ".arc-build.lock"),
      join(fixture.root, ".git/arc/test-suite/.local-heavy-tests.lock")]) {
      await expect(access(lease)).rejects.toMatchObject({ code: "ENOENT" });
    }
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 30_000);
