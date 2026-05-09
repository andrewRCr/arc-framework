/**
 * Unit tests for the `arc release record-enabled` / `record-disabled` /
 * `status` sub-command orchestrators.
 *
 * Covers idempotent local-scope writes and clears of `arc.release.enabled`,
 * with key-naming + underlying-error surfacing on git-config failures, plus
 * human / `--json` rendering of the resolved opt-in + interlock surface.
 */

import { describe, it, expect, vi } from "vitest";

import {
  runReleaseRecordDisabled,
  runReleaseRecordEnabled,
  runReleaseStatus,
} from "../../../../src/handlers/release/record.js";
import type { ResolvedSettingsResult } from "../../../../src/lib/config/resolved-settings.js";
import type { ConfigSettings } from "../../../../src/commands/config/types.js";

function buildSettings(overrides: {
  releaseEnabled?: { value: "true" | "false"; source: "git-config" | "yaml" | "default" };
  commitInterlock?: { value: "manual" | "on-task-approval" | "on-workflow"; source: "git-config" | "yaml" | "default" };
  pushInterlock?: { value: "manual" | "on-sync" | "on-workflow"; source: "git-config" | "yaml" | "default" };
  syncInterlock?: { value: "manual" | "on-handoff" | "on-workflow"; source: "git-config" | "yaml" | "default" };
} = {}): ResolvedSettingsResult {
  return {
    settings: {} as ConfigSettings,
    resolved: {
      commitInterlock: overrides.commitInterlock ?? { value: "manual", source: "default" },
      pushInterlock: overrides.pushInterlock ?? { value: "manual", source: "default" },
      syncInterlock: overrides.syncInterlock ?? { value: "on-handoff", source: "default" },
      notesPush: { value: "on-sync", source: "default" },
      releaseEnabled: overrides.releaseEnabled ?? { value: "false", source: "default" },
    },
    defaultsApplied: [],
    warnings: [],
  };
}

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

describe("runReleaseStatus", () => {
  it("renders four resolved values with provenance labels in human mode", async () => {
    const settings = buildSettings({
      releaseEnabled: { value: "true", source: "git-config" },
      commitInterlock: { value: "on-task-approval", source: "yaml" },
      pushInterlock: { value: "on-sync", source: "yaml" },
      syncInterlock: { value: "on-handoff", source: "default" },
    });
    const stdout: string[] = [];
    const result = await runReleaseStatus({
      settings,
      writeStdout: (msg) => {
        stdout.push(msg);
      },
    });

    expect(result.exitCode).toBe(0);
    const output = stdout.join("");
    expect(output).toContain("release_enabled: true (git-config)");
    expect(output).toContain("commit_interlock: on-task-approval (yaml)");
    expect(output).toContain("push_interlock: on-sync (yaml)");
    expect(output).toContain("sync_interlock: on-handoff (default)");
  });

  it("emits a schemaVersion 1 envelope with four typed value/source pairs in --json mode", async () => {
    const settings = buildSettings({
      releaseEnabled: { value: "true", source: "git-config" },
      commitInterlock: { value: "on-task-approval", source: "yaml" },
      pushInterlock: { value: "on-sync", source: "yaml" },
      syncInterlock: { value: "on-handoff", source: "default" },
    });
    const stdout: string[] = [];
    const result = await runReleaseStatus({
      settings,
      json: true,
      writeStdout: (msg) => {
        stdout.push(msg);
      },
    });

    expect(result.exitCode).toBe(0);
    const envelope = JSON.parse(stdout.join("")) as {
      schemaVersion: number;
      releaseEnabled: { value: boolean; source: string };
      commitInterlock: { value: string; source: string };
      pushInterlock: { value: string; source: string };
      syncInterlock: { value: string; source: string };
    };
    expect(envelope).toEqual({
      schemaVersion: 1,
      releaseEnabled: { value: true, source: "git-config" },
      commitInterlock: { value: "on-task-approval", source: "yaml" },
      pushInterlock: { value: "on-sync", source: "yaml" },
      syncInterlock: { value: "on-handoff", source: "default" },
    });
  });

  it("threads provenance distinguishing git-config / yaml / default", async () => {
    const settings = buildSettings({
      releaseEnabled: { value: "true", source: "git-config" },
      commitInterlock: { value: "on-task-approval", source: "yaml" },
      pushInterlock: { value: "manual", source: "default" },
      syncInterlock: { value: "on-handoff", source: "default" },
    });
    const stdout: string[] = [];
    await runReleaseStatus({
      settings,
      writeStdout: (msg) => {
        stdout.push(msg);
      },
    });

    const output = stdout.join("");
    expect(output).toMatch(/release_enabled:.*\(git-config\)/);
    expect(output).toMatch(/commit_interlock:.*\(yaml\)/);
    expect(output).toMatch(/push_interlock:.*\(default\)/);
    expect(output).toMatch(/sync_interlock:.*\(default\)/);
  });

  it("surfaces release_enabled as a JSON boolean, not the resolver's string form", async () => {
    const settings = buildSettings({
      releaseEnabled: { value: "false", source: "default" },
    });
    const stdout: string[] = [];
    await runReleaseStatus({
      settings,
      json: true,
      writeStdout: (msg) => {
        stdout.push(msg);
      },
    });

    const envelope = JSON.parse(stdout.join("")) as {
      releaseEnabled: { value: unknown };
    };
    expect(envelope.releaseEnabled.value).toBe(false);
    expect(typeof envelope.releaseEnabled.value).toBe("boolean");
  });
});
