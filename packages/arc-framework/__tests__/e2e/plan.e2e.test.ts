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

import { useInRepoStoreForEach } from "../helpers/in-repo-store-override.js";
import { runArc, createTempRepo, cleanupTempDir } from "./store-default.js";

const execFileAsync = promisify(execFile);

/** An initialized project with a born HEAD, so write-context resolves the current branch from a real commit. */
async function initializedProject(): Promise<string> {
  const tmpDir = await createTempRepo();
  const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
  expect(init.exitCode).toBe(0);
  await execFileAsync("git", ["add", "-A"], { cwd: tmpDir });
  await execFileAsync("git", ["commit", "-m", "init", "--no-verify"], { cwd: tmpDir });
  return tmpDir;
}

describe("arc plan check", () => {
  let tmpDir: string;

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  describe("on the store", () => {
    beforeEach(async () => { tmpDir = await initializedProject(); });

    it("proceeds as JSON on the base branch under partial protection", async () => {
      const result = await runArc(["plan", "check", "--json"], tmpDir);

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout.trim())).toMatchObject({
        route: "proceed",
        protection: "partial",
      });
    });
  });

  describe("over the in-repo store", () => {
    // The store's writes do not depend on the checkout, so it proceeds on any branch; the redirect is the in-repo
    // implementation's.
    useInRepoStoreForEach();
    beforeEach(async () => { tmpDir = await initializedProject(); });

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
});
