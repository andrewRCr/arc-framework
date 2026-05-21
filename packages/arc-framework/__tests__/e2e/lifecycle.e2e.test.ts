/**
 * Lifecycle E2E test.
 *
 * Golden path: init → verify installed → modify files → health shows changes →
 * diff shows correct output → update → customizations preserved → health
 * still shows modified (customized file differs from pristine).
 *
 * This is the "beta is functional enough" success criterion exercised
 * end-to-end in a single test.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { runArc, createTempRepo, cleanupTempDir } from "./helpers.js";

async function runHealthCheck(cwd: string): Promise<string> {
  const result = await runArc(["health"], cwd);
  expect(result.exitCode).toBe(0);
  return result.stdout + result.stderr;
}

describe("lifecycle", () => {
  let tmpDir: string;

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("golden path: init → health → modify → diff → update → customization preserved", async () => {
    tmpDir = await createTempRepo();

    // --- Init ---
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);

    // Verify key files installed
    const configContent = await readFile(
      join(tmpDir, ".arc", "system", "arc-config.yml"),
      "utf-8",
    );
    expect(configContent).toContain("branch.base: main");

    const statusTemplate = await readFile(
      join(tmpDir, ".arc", "reference", "templates", "template-meta.md"),
      "utf-8",
    );
    expect(statusTemplate).toContain("# Metadata: {wu-name}");

    // --- Health after clean init ---
    const cleanOutput = await runHealthCheck(tmpDir);
    expect(cleanOutput).toContain("unmodified");
    expect(cleanOutput).not.toMatch(/\d+ modified/);

    // --- Modify a file ---
    const rulesPath = join(
      tmpDir,
      ".arc",
      "system",
      "rules",
      "DEV-RULES.PROJECT.md",
    );
    const original = await readFile(rulesPath, "utf-8");
    const customized = original + "\n## My Custom Quality Gate\n\nRun integration tests nightly.\n";
    await writeFile(rulesPath, customized, "utf-8");

    // --- Health shows modification ---
    const modOutput = await runHealthCheck(tmpDir);
    expect(modOutput).toMatch(/\d+ modified/);

    // --- Diff shows the change ---
    const diff = await runArc(["diff"], tmpDir);
    expect(diff.exitCode).toBe(0);
    const diffOutput = diff.stdout + diff.stderr;
    expect(diffOutput).toContain("DEV-RULES.PROJECT.md");
    expect(diffOutput).toContain("My Custom Quality Gate");

    // --- Update preserves customization ---
    const update = await runArc(["update"], tmpDir);
    expect(update.exitCode).toBe(0);

    const afterUpdate = await readFile(rulesPath, "utf-8");
    expect(afterUpdate).toContain("## My Custom Quality Gate");
    expect(afterUpdate).toContain("Run integration tests nightly.");

    // --- Health after update: customization still shows as modified ---
    // The file differs from its pristine copy because the user customized it.
    // Update preserved the customization (three-way merge), but doesn't reset
    // the pristine to match the customized version.
    const postOutput = await runHealthCheck(tmpDir);
    expect(postOutput).toMatch(/\d+ modified/);
  });
});
