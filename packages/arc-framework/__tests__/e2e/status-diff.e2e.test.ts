/**
 * Status and diff command E2E tests.
 *
 * Exercises `arc status` and `arc diff` after clean init and after
 * file modifications, verifying correct state reporting and diff output.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runArc, createTempRepo, cleanupTempDir } from "./helpers.js";

describe("status", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("after clean init all files show as unmodified", async () => {
    const result = await runArc(["status"], tmpDir);

    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain("unmodified");
    // No modified or missing files
    expect(output).not.toMatch(/\d+ modified/);
    expect(output).not.toMatch(/\d+ missing/);
  });

  it("after modification reports modified files", async () => {
    // Modify a tracked file
    const readmePath = join(tmpDir, ".arc", "README.md");
    const original = await readFile(readmePath, "utf-8");
    await writeFile(readmePath, original + "\nCustom addition.\n", "utf-8");

    const result = await runArc(["status"], tmpDir);

    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/\d+ modified/);
  });
});

describe("diff", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("with no changes reports clean output", async () => {
    const result = await runArc(["diff"], tmpDir);

    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain("No changes detected");
  });

  it("after modification shows unified diff output", async () => {
    // Modify a tracked file
    const readmePath = join(tmpDir, ".arc", "README.md");
    const original = await readFile(readmePath, "utf-8");
    await writeFile(readmePath, original + "\nCustom addition.\n", "utf-8");

    const result = await runArc(["diff"], tmpDir);

    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    // Should show the file path and diff content
    expect(output).toContain("README.md");
    expect(output).toContain("Custom addition");
  });
});
