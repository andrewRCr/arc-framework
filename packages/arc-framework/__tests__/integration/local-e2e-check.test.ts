/** The path-selected E2E check executes every configured E2E specification. */
import { execa } from "execa";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeFocusedVitestFixture } from "../helpers/focused-vitest-fixture.js";
import { gitExec } from "../../src/lib/io-context.js";

it("runs the complete E2E suite when supplied only one changed test path", async () => {
  const fixture = await makeFocusedVitestFixture();
  try {
    await gitExec("git", ["init", "-b", "main"], { cwd: fixture.root });
    await writeFile(join(fixture.packageRoot, "__tests__/e2e/runtime.test.mjs"),
      (await readFile(join(fixture.packageRoot, "tests/e2e-runtime.test.mjs"), "utf8"))
        .replace("../dist/cli.js", "../../dist/cli.js"));
    await mkdir(join(fixture.root, "scripts"));
    await copyFile(new URL("../../../../scripts/run-local-e2e.mjs", import.meta.url),
      join(fixture.root, "scripts/run-local-e2e.mjs"));
    await writeFile(join(fixture.packageRoot, "__tests__/e2e/second.test.mjs"),
      'import { it } from "vitest"; it("second E2E case", () => { console.log("SECOND-E2E-RAN"); });\n');
    const result = await execa(process.execPath, ["--import", "tsx", "scripts/run-local-e2e.mjs",
      "packages/arc-framework/__tests__/e2e/runtime.test.mjs"], {
      cwd: fixture.root, reject: false, timeout: 30_000,
      env: { FORCE_COLOR: undefined, VITEST_MAX_WORKERS: undefined },
    });
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain("SECOND-E2E-RAN");
    expect(result.stdout).toContain("2 passed");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
}, 30_000);
