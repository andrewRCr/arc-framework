/**
 * `arc plan check` E2E.
 *
 * Exercises the built CLI end-to-end: `arc plan check` classifies the
 * planning-entry route before drafting, emitting the route as JSON for skill
 * consumption. This covers the real config + write-context + active-WU
 * resolution that unit tests stub.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { runArc, createTempRepo, cleanupTempDir } from "./helpers.js";

const execFileAsync = promisify(execFile);

describe("arc plan check", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
    // Born HEAD: write-context resolves the current branch from a real commit.
    await execFileAsync("git", ["add", "-A"], { cwd: tmpDir });
    await execFileAsync("git", ["commit", "-m", "init", "--no-verify"], { cwd: tmpDir });
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("proceeds as JSON on the base branch under partial protection", async () => {
    const result = await runArc(["plan", "check", "--json"], tmpDir);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      route: "proceed",
      protection: "partial",
    });
  });

  it("redirects on a work-unit branch — a draft would tangle its PR", async () => {
    await execFileAsync("git", ["checkout", "-b", "feat/some-wu"], { cwd: tmpDir });

    const result = await runArc(["plan", "check", "--json"], tmpDir);

    // JSON mode carries the verdict in the payload and exits 0; the route is the contract.
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      route: "redirect",
      reason: "work-unit-branch",
      activeWorkUnit: false,
      draftPresent: false,
    });
  });

  it("exits non-zero on the human path so the redirect reads as a guard", async () => {
    await execFileAsync("git", ["checkout", "-b", "feat/some-wu"], { cwd: tmpDir });

    const result = await runArc(["plan", "check"], tmpDir);

    expect(result.exitCode).toBe(1);
  });
});
