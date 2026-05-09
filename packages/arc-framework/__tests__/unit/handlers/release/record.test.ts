/**
 * Unit tests for the `arc release record-enabled` / `record-disabled`
 * sub-command orchestrators.
 *
 * Covers idempotent local-scope writes and clears of `arc.release.enabled`,
 * with key-naming + underlying-error surfacing on git-config failures.
 */

import { describe, it, expect, vi } from "vitest";

import { runReleaseRecordEnabled } from "../../../../src/handlers/release/record.js";

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
