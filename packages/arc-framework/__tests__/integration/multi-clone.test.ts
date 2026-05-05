/**
 * Integration tests exercising the multi-clone test harness.
 *
 * The harness produces a bare origin plus two working clones for cross-machine
 * regression coverage. These tests pin its shape — that clone A and clone B
 * truly share an origin and that pushed commits are visible after fetch.
 */

import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { setupMultiClone } from "../helpers/multi-clone.js";

const execFileAsync = promisify(execFile);

describe("setupMultiClone", () => {
  it("produces two clones sharing an origin where clone A's pushes are visible to clone B", async () => {
    const harness = await setupMultiClone();
    try {
      await execFileAsync(
        "git",
        ["-c", "core.hooksPath=/dev/null", "commit", "--allow-empty", "-m", "from clone A"],
        { cwd: harness.cloneA },
      );
      const { stdout: aHead } = await execFileAsync(
        "git", ["rev-parse", "HEAD"], { cwd: harness.cloneA },
      );
      await execFileAsync("git", ["push", "origin", "HEAD:main"], { cwd: harness.cloneA });

      await execFileAsync("git", ["fetch", "origin"], { cwd: harness.cloneB });
      const { stdout: bRemoteHead } = await execFileAsync(
        "git", ["rev-parse", "origin/main"], { cwd: harness.cloneB },
      );

      expect(bRemoteHead.trim()).toBe(aHead.trim());
    } finally {
      await harness.cleanup();
    }
  });
});
