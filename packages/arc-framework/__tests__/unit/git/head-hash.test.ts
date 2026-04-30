/**
 * Unit tests for the head-hash probe.
 *
 * Covers `git rev-parse --short HEAD` parsing — populated hash returns as
 * `{ hash }`, empty stdout collapses to `{ hash: null }`, exec failures
 * propagate to the probe wrapper.
 */

import { describe, it, expect } from "vitest";

import { runHeadHashStatus } from "../../../src/lib/git/head-hash.js";
import type { GitExec } from "../../../src/lib/git/index.js";

function execWithRevParse(stdout: string): GitExec {
  return async (cmd, args) => {
    if (cmd !== "git" || args[0] !== "rev-parse" || args[1] !== "--short" || args[2] !== "HEAD") {
      throw new Error(`unexpected git invocation: ${cmd} ${args.join(" ")}`);
    }
    return { stdout, stderr: "" };
  };
}

describe("runHeadHashStatus", () => {
  it("returns the trimmed short-hash from rev-parse stdout", async () => {
    const result = await runHeadHashStatus({ exec: execWithRevParse("a1b2c3d\n") });
    expect(result).toEqual({ hash: "a1b2c3d" });
  });

  it("returns null when rev-parse stdout is empty", async () => {
    const result = await runHeadHashStatus({ exec: execWithRevParse("") });
    expect(result).toEqual({ hash: null });
  });

  it("treats whitespace-only stdout as null", async () => {
    const result = await runHeadHashStatus({ exec: execWithRevParse("\n  \n") });
    expect(result).toEqual({ hash: null });
  });

  it("propagates exec failures to the caller", async () => {
    const failing: GitExec = async () => {
      throw new Error("fatal: not a git repository");
    };
    await expect(runHeadHashStatus({ exec: failing })).rejects.toThrow(
      /not a git repository/u,
    );
  });
});
