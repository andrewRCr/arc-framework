/**
 * E2E smoke for `arc teardown` — confirms the command is registered and the
 * handler wiring reaches the verb's refusal paths through the built CLI. The
 * merge-strategy-independent reaping mechanics are covered at the integration tier
 * (against the verb directly with real git); this asserts only the user-facing
 * command surface.
 */

import { describe, it, expect, afterEach } from "vitest";
import { runArc, createTempRepo, cleanupTempDir } from "./helpers.js";

describe("arc teardown (CLI surface)", () => {
  let tmpDir: string | undefined;

  afterEach(async () => {
    // Guard the assignment: a setup throw before `tmpDir` is set must not have its
    // original error masked by a cleanup on `undefined`.
    if (tmpDir !== undefined) await cleanupTempDir(tmpDir);
    tmpDir = undefined;
  });

  it("refuses without a work-unit name", async () => {
    tmpDir = await createTempRepo();
    await runArc(["init", "--yes", "--name", "test-project"], tmpDir);

    const result = await runArc(["teardown"], tmpDir);

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/requires the work-unit name/i);
  });

  it("refuses a work unit that has not shipped (no completed/ presence)", async () => {
    tmpDir = await createTempRepo();
    await runArc(["init", "--yes", "--name", "test-project"], tmpDir);

    const result = await runArc(["teardown", "ghost"], tmpDir);

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/not shipped|completed/i);
  });

  it("refuses branch-scoped teardown for non-chore branches", async () => {
    tmpDir = await createTempRepo();
    await runArc(["init", "--yes", "--name", "test-project"], tmpDir);

    const result = await runArc(["teardown", "--branch", "feat/demo"], tmpDir);

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/chore\/<slug>|cheap branches/i);
  });

  it("accepts an already-absent recordless chore branch as an idempotent no-op", async () => {
    tmpDir = await createTempRepo();
    await runArc(["init", "--yes", "--name", "test-project"], tmpDir);

    const result = await runArc(["teardown", "--branch", "chore/missing"], tmpDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout + result.stderr).toMatch(/already reaped/i);
  });
});
