/**
 * Integration tests for the inbound-pull execution shell against real temp
 * repos. Covers the shared, side-effecting primitive directly — not only
 * through its consumers — so a failure localizes here and the destructive-op
 * safety (ff-only, no mutation on block/refuse) is asserted at the primitive.
 */

import { describe, it, expect, afterEach } from "vitest";

import { executeInboundPull } from "../../src/lib/git/inbound-pull.js";
import { makeGitExec, execFileAsync, writeFile, join } from "../helpers/integration.js";
import { setupMultiClone, type MultiClone } from "../helpers/multi-clone.js";

const FETCH_TIMEOUT_MS = 10_000;

async function revParse(cwd: string, ref = "HEAD"): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", ref], { cwd });
  return stdout.trim();
}

async function commitLocal(cwd: string, message: string): Promise<void> {
  await execFileAsync(
    "git",
    ["-c", "core.hooksPath=/dev/null", "commit", "--allow-empty", "-m", message],
    { cwd },
  );
}

async function commitAndPush(cwd: string, message: string): Promise<void> {
  await commitLocal(cwd, message);
  await execFileAsync("git", ["push", "origin", "main"], { cwd });
}

describe("executeInboundPull (integration)", () => {
  let mc: MultiClone | null = null;

  afterEach(async () => {
    if (mc) {
      await mc.cleanup();
      mc = null;
    }
  });

  it("fast-forwards the local branch to the remote tip on remote-ahead + clean", async () => {
    mc = await setupMultiClone();
    await commitAndPush(mc.cloneB, "remote advance");
    const remoteTip = await revParse(mc.cloneB);

    const result = await executeInboundPull({
      exec: makeGitExec(mc.cloneA),
      branch: "main",
      policy: "always",
      isTty: false,
      fetchTimeoutMs: FETCH_TIMEOUT_MS,
    });

    expect(result.decision).toBe("ff-pull");
    expect(result.fastForwarded).toBe(true);
    expect(await revParse(mc.cloneA)).toBe(remoteTip);
  });

  it("enforces ff-only — never produces a merge commit", async () => {
    mc = await setupMultiClone();
    await commitAndPush(mc.cloneB, "remote advance");

    await executeInboundPull({
      exec: makeGitExec(mc.cloneA),
      branch: "main",
      policy: "always",
      isTty: false,
      fetchTimeoutMs: FETCH_TIMEOUT_MS,
    });

    const { stdout } = await execFileAsync(
      "git",
      ["rev-list", "--count", "--merges", "HEAD"],
      { cwd: mc.cloneA },
    );
    expect(stdout.trim()).toBe("0");
  });

  it("blocks on diverged without mutating the local branch", async () => {
    mc = await setupMultiClone();
    await commitLocal(mc.cloneA, "local only");
    await commitAndPush(mc.cloneB, "remote only");
    const before = await revParse(mc.cloneA);

    const result = await executeInboundPull({
      exec: makeGitExec(mc.cloneA),
      branch: "main",
      policy: "always",
      isTty: false,
      fetchTimeoutMs: FETCH_TIMEOUT_MS,
    });

    expect(result.decision).toBe("block");
    expect(result.fastForwarded).toBe(false);
    expect(await revParse(mc.cloneA)).toBe(before);
  });

  it("refuses on a dirty working tree without mutating the local branch", async () => {
    mc = await setupMultiClone();
    await commitAndPush(mc.cloneB, "remote advance");
    await writeFile(join(mc.cloneA, "scratch.txt"), "uncommitted");
    const before = await revParse(mc.cloneA);

    const result = await executeInboundPull({
      exec: makeGitExec(mc.cloneA),
      branch: "main",
      policy: "always",
      isTty: false,
      fetchTimeoutMs: FETCH_TIMEOUT_MS,
    });

    expect(result.decision).toBe("refuse");
    expect(result.fastForwarded).toBe(false);
    expect(await revParse(mc.cloneA)).toBe(before);
  });
});
