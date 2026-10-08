/** A managed controller pins CLI children while ordinary children still qualify source. */
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { TEST_CONTROLLER_TOKEN_ENV } from "../../src/lib/build-ownership.js";
import { makeVitestRuntimeFixture } from "../helpers/vitest-runtime-fixture.js";
import { runVitestControllerFixture } from "../helpers/vitest-controller-fixture.js";

it("pins inherited CLI children and refuses tokenless source drift", async () => {
  const fixture = await makeVitestRuntimeFixture();
  try {
    await writeFile(join(fixture.packageRoot, "src/cli.ts"), `
import { createDevBuildGuardDeps, runDevBuildGuard } from "./lib/dev-check.js";
import { fileURLToPath } from "node:url";
runDevBuildGuard({ commandPath: "arc marker" }, createDevBuildGuardDeps(fileURLToPath(import.meta.url)));
process.stdout.write("new-native-runtime\\n");
`);
    await writeFile(join(fixture.packageRoot, "tests/integration-runtime.test.mjs"), `
import { it, expect } from "vitest";
import { appendFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
const packageRoot = join(import.meta.dirname, "..");
function invoke(env) {
  try {
    return { code: 0, stdout: execFileSync(process.execPath, [join(packageRoot, "dist/cli.js")],
      { cwd: packageRoot, env, timeout: 10_000, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), stderr: "" };
  } catch (error) { return { code: error.status, stdout: error.stdout, stderr: error.stderr }; }
}
it("uses the controller lease after source changes", () => {
  appendFileSync(join(packageRoot, "src/cli.ts"), "\\nexport const sourceChanged = true;\\n");
  const inherited = invoke(process.env);
  const ordinaryEnv = { ...process.env };
  Reflect.deleteProperty(ordinaryEnv, ${JSON.stringify(TEST_CONTROLLER_TOKEN_ENV)});
  const ordinary = invoke(ordinaryEnv);
  writeFileSync(join(packageRoot, "child-outcomes.json"), JSON.stringify({ inherited, ordinary }));
  expect(inherited).toEqual({ code: 0, stdout: "new-native-runtime\\n", stderr: "" });
  expect(ordinary.code).toBe(1);
  expect(ordinary.stderr).toContain("arc dev build is stale");
  expect(ordinary.stderr).toContain(${JSON.stringify("run `npm run build:fast`, then retry.")});
});
`);
    const result = await runVitestControllerFixture(fixture.packageRoot, ["integration"],
      { CI: "true", ARC_E2E_SKIP_BUILD: undefined });
    expect(result.code, result.stdout + result.stderr).toBe(0);
    const outcomes: unknown = JSON.parse(await readFile(join(fixture.packageRoot, "child-outcomes.json"), "utf8"));
    expect(outcomes).toMatchObject({ inherited: { code: 0, stdout: "new-native-runtime\n", stderr: "" },
      ordinary: { code: 1, stderr: expect.stringContaining("arc dev build is stale") } });
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 60_000);
