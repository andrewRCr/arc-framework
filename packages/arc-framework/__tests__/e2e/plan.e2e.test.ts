/**
 * `arc plan check` E2E.
 *
 * Exercises the built CLI end-to-end: `arc plan check` classifies the
 * planning-entry route before drafting, emitting the route as JSON for skill
 * consumption. This covers the real config + write-context + active-WU
 * resolution that unit tests stub.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

import { describe, it, expect, assert, beforeAll, beforeEach, afterEach, vi } from "vitest";

import { useInRepoStoreForEach } from "../helpers/in-repo-store-override.js";
import { runArc, createTempRepo, cleanupTempDir } from "./helpers.js";

const execFileAsync = promisify(execFile);

/** Set up a project with a born HEAD, so write-context resolves the current branch from a real commit. */
async function initializedProject(tmpDir: string): Promise<void> {
  const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
  expect(init.exitCode).toBe(0);
  await execFileAsync("git", ["add", "-A"], { cwd: tmpDir });
  await execFileAsync("git", ["commit", "-m", "init", "--no-verify"], { cwd: tmpDir });
}

describe("arc plan check", () => {
  let tmpDir = "";

  beforeEach(async () => {
    tmpDir = await createTempRepo();
  });

  afterEach(async () => {
    const repo = tmpDir;
    tmpDir = "";
    if (repo !== "") await cleanupTempDir(repo);
  });

  describe("on the store", () => {
    beforeEach(async () => { await initializedProject(tmpDir); });

    it("proceeds as JSON on the base branch under partial protection", async () => {
      const result = await runArc(["plan", "check", "--json"], tmpDir);

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout.trim())).toMatchObject({
        route: "proceed",
        protection: "partial",
      });
    });

    describe("when arc init fails", () => {
      beforeAll(async () => {
        const init = vi.spyOn(await import("./helpers.js"), "runArc")
          .mockResolvedValueOnce({ stdout: "", stderr: "injected init failure", exitCode: 1 });

        // Check the filesystem after the enclosing suite's normal teardown has run.
        return async () => {
          const [call] = init.mock.calls;
          init.mockRestore();
          assert(call && call[0][0] === "init", "fixture setup must reach arc init");
          const [, repo] = call;
          try {
            expect(existsSync(repo), "teardown must remove the repository after init fails").toBe(false);
          } finally {
            await cleanupTempDir(repo);
          }
        };
      });

      it.fails("propagates the init failure before the test body runs", () => {});
    });
  });

  describe("over the in-repo store", () => {
    // The store's writes do not depend on the checkout, so it proceeds on any branch; the redirect is the in-repo
    // implementation's.
    useInRepoStoreForEach();
    beforeEach(async () => { await initializedProject(tmpDir); });

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
