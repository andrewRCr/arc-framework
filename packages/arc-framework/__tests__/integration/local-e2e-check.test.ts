/** The path-selected E2E check runs only the named specifications, or the whole suite when support changed or went. */
import { execa } from "execa";
import { copyFile, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeFocusedVitestFixture } from "../helpers/focused-vitest-fixture.js";
import { gitExec } from "../../src/lib/io-context.js";

/** A committed checkout with three configured E2E specifications, two announcing their run, and a support file. */
async function e2eCheckout(): Promise<Awaited<ReturnType<typeof makeFocusedVitestFixture>> & { base: string }> {
  const fixture = await makeFocusedVitestFixture();
  await gitExec("git", ["init", "-b", "main"], { cwd: fixture.root });
  await writeFile(join(fixture.packageRoot, "__tests__/e2e/runtime.test.mjs"),
    (await readFile(join(fixture.packageRoot, "tests/e2e-runtime.test.mjs"), "utf8"))
      .replace("../dist/cli.js", "../../dist/cli.js"));
  await mkdir(join(fixture.root, "scripts"));
  await copyFile(new URL("../../../../scripts/run-local-e2e.mjs", import.meta.url),
    join(fixture.root, "scripts/run-local-e2e.mjs"));
  for (const name of ["second", "third"]) {
    await writeFile(join(fixture.packageRoot, `__tests__/e2e/${name}.test.mjs`),
      `import { it } from "vitest"; it("${name} E2E case", () => { console.log("${name.toUpperCase()}-E2E-RAN"); });\n`);
  }
  await writeFile(join(fixture.packageRoot, "__tests__/e2e/helper.mjs"), "export const helper = true;\n");
  await gitExec("git", ["add", "packages/arc-framework/__tests__/e2e"], { cwd: fixture.root });
  await gitExec("git", ["-c", "user.name=fixture", "-c", "user.email=fixture@example.com", "commit", "-q", "-m", "e2e"],
    { cwd: fixture.root });
  return { ...fixture, base: (await gitExec("git", ["rev-parse", "HEAD"], { cwd: fixture.root })).stdout.trim() };
}

async function runCheck(root: string, base: string, paths: string[]) {
  return await execa(process.execPath, ["--import", "tsx", "scripts/run-local-e2e.mjs",
    ...paths.map((path) => `packages/arc-framework/__tests__/e2e/${path}`)], {
    cwd: root, reject: false, timeout: 30_000,
    env: { FORCE_COLOR: undefined, VITEST_MAX_WORKERS: undefined, ARC_E2E_SKIP_BUILD: undefined, ARC_CHECK_BASE: base },
  });
}

it("runs only the named E2E specification when every supplied path is one", async () => {
  const fixture = await e2eCheckout();
  try {
    const result = await runCheck(fixture.root, fixture.base, ["second.test.mjs"]);
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain("SECOND-E2E-RAN");
    expect(result.stdout).not.toContain("THIRD-E2E-RAN");
    expect(result.stdout).toContain("1 passed");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
}, 30_000);

it("runs the complete E2E suite when a supplied path is a support file", async () => {
  const fixture = await e2eCheckout();
  try {
    const result = await runCheck(fixture.root, fixture.base, ["second.test.mjs", "helper.mjs"]);
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain("SECOND-E2E-RAN");
    expect(result.stdout).toContain("THIRD-E2E-RAN");
    expect(result.stdout).toContain("3 passed");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
}, 30_000);

it("runs the complete E2E suite when a support file was deleted, though the check supplies only a test", async () => {
  const fixture = await e2eCheckout();
  try {
    await unlink(join(fixture.packageRoot, "__tests__/e2e/helper.mjs"));
    const result = await runCheck(fixture.root, fixture.base, ["second.test.mjs"]);
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain("SECOND-E2E-RAN");
    expect(result.stdout).toContain("THIRD-E2E-RAN");
    expect(result.stdout).toContain("3 passed");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
}, 30_000);
