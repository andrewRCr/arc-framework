/** The portability npm route executes installation, cancellation, and publication coverage. */
import { execa } from "execa";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeVitestControllerFixture } from "../helpers/vitest-controller-fixture.js";

it("selects the build and prebuilt recovery suites alongside existing portability cases", async () => {
  const fixture = await makeVitestControllerFixture();
  const required = ["fs.test.ts", "build-context.test.ts", "build-cancellation.test.ts", "build-generation-lifetime.test.ts",
    "build-coordinator.test.ts", "build-publication.test.ts",
    "build-inventory.test.ts", "build-ownership.test.ts", "ci-build-transfer.test.ts", "ci-build-recovery.test.ts"];
  try {
    const config = join(fixture.packageRoot, "vitest.config.mjs");
    await writeFile(config, (await readFile(config, "utf8")).replace('["tests/unit*.test.mjs"]', '["tests/*.test.ts"]'));
    for (const file of required) {
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
