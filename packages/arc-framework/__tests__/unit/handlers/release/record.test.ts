/**
 * Unit tests for the `arc release record-enabled` / `record-disabled`
 * sub-command orchestrators.
 *
 * Covers idempotent local-scope writes and clears of `arc.release.enabled`,
 * with key-naming + underlying-error surfacing on git-config failures.
 */

import { describe, it, expect, vi } from "vitest";

import {
  runReleaseRecordDisabled,
  runReleaseRecordEnabled,
} from "../../../../src/handlers/release/record.js";

describe("runReleaseRecordEnabled", () => {
  it("writes arc.release.enabled = true to local config on first invocation", async () => {
    const exec = vi
      .fn()
      .mockRejectedValueOnce(new Error("exit code 1")) // --get returns undefined (absent)
      .mockResolvedValueOnce({ stdout: "" }); // --local set succeeds

    const result = await runReleaseRecordEnabled({ exec });

    expect(result.exitCode).toBe(0);
    expect(exec).toHaveBeenCalledWith("git", [
      "config",
      "--local",
      "arc.release.enabled",
      "true",
    ]);
  });

  it("returns no-op success when key is already set to 'true' (skips --local set)", async () => {
    const exec = vi.fn().mockResolvedValueOnce({ stdout: "true\n" });

    const result = await runReleaseRecordEnabled({ exec });

    expect(result.exitCode).toBe(0);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).not.toHaveBeenCalledWith("git", [
      "config",
      "--local",
      "arc.release.enabled",
      "true",
    ]);
  });

  it("surfaces git-config write failure with key name and underlying error", async () => {
    const exec = vi
      .fn()
      .mockRejectedValueOnce(new Error("exit code 1")) // --get (absent)
      .mockRejectedValueOnce(new Error("permission denied")); // --local set fails

    const stderr: string[] = [];
    const result = await runReleaseRecordEnabled({
      exec,
      writeStderr: (msg) => {
        stderr.push(msg);
      },
    });

    expect(result.exitCode).not.toBe(0);
    expect(stderr.join("")).toContain("arc.release.enabled");
    expect(stderr.join("")).toContain("permission denied");
  });
});

describe("runReleaseRecordDisabled", () => {
  it("unsets arc.release.enabled when key is present", async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "true\n" }) // --get returns "true"
      .mockResolvedValueOnce({ stdout: "" }); // --unset succeeds

    const result = await runReleaseRecordDisabled({ exec });

    expect(result.exitCode).toBe(0);
    expect(exec).toHaveBeenCalledWith("git", [
      "config",
      "--unset",
      "arc.release.enabled",
    ]);
  });

  it("returns no-op success when key is absent (idempotent on repeat)", async () => {
    const exec = vi
      .fn()
      .mockRejectedValueOnce(new Error("exit code 1")); // --get returns undefined (absent)

    const result = await runReleaseRecordDisabled({ exec });

    expect(result.exitCode).toBe(0);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).not.toHaveBeenCalledWith("git", [
      "config",
      "--unset",
      "arc.release.enabled",
    ]);
  });

  it("succeeds silently when wrappers were never enabled (no --unset call)", async () => {
    const exec = vi
      .fn()
      .mockRejectedValueOnce(new Error("exit code 1")); // --get returns undefined (never set)

    const stderr: string[] = [];
    const result = await runReleaseRecordDisabled({
      exec,
      writeStderr: (msg) => {
        stderr.push(msg);
      },
    });

    expect(result.exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("surfaces git-config unset failure with key name and underlying error", async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "true\n" }) // --get returns "true"
      .mockRejectedValueOnce(new Error("permission denied")); // --unset fails

    const stderr: string[] = [];
    const result = await runReleaseRecordDisabled({
      exec,
      writeStderr: (msg) => {
        stderr.push(msg);
      },
    });

    expect(result.exitCode).not.toBe(0);
    expect(stderr.join("")).toContain("arc.release.enabled");
    expect(stderr.join("")).toContain("permission denied");
  });
});
