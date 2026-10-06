/** Native measurement fixtures share configured projects and actual retained-run consumers. */
import { execa } from "execa";
import { cp } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { MeasurementProjectSet } from "../../src/lib/test-cost/mode.js";
import { makeFocusedVitestFixture } from "./focused-vitest-fixture.js";

/**
 * Compose configured native test projects with the real measurement budget input.
 * @returns Caller-owned checkout, event log, and retained output destination
 */
export async function makeNativeTestCostFixture(): Promise<Awaited<ReturnType<typeof makeFocusedVitestFixture>> & {
  readonly output: string;
}> {
  const fixture = await makeFocusedVitestFixture();
  await cp(resolve(import.meta.dirname, "../../test-cost-budgets.json"), join(fixture.packageRoot, "test-cost-budgets.json"));
  return { ...fixture, output: join(fixture.packageRoot, "retained.json") };
}

/**
 * Execute the actual measurement script with explicit mode axes in package cwd.
 * @param fixture - Prepared configured measurement checkout
 * @param projectSet - Native measurement project selection
 * @returns Native process outcome, preserving execution and cleanup diagnostics
 */
export async function runNativeTestCostFixture(
  fixture: Awaited<ReturnType<typeof makeNativeTestCostFixture>>, projectSet: MeasurementProjectSet,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const result = await execa(process.execPath, ["--import", "tsx", "src/scripts/measure-test-cost.ts",
    "--condition", "tier-isolated", "--project-set", projectSet, "--workers", "1", "--output", fixture.output],
    { cwd: fixture.packageRoot, env: { CI: "1", ARC_E2E_SKIP_BUILD: "" }, reject: false, timeout: 30_000 });
  return { exitCode: result.exitCode ?? 1, stdout: result.stdout, stderr: result.stderr };
}
