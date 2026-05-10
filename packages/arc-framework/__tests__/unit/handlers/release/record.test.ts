/**
 * Unit tests for the `arc release opt-in` / `opt-out` / `status`
 * sub-command orchestrators.
 *
 * Covers idempotent local-scope writes of `arc.releaseEnabled` (true on
 * opt-in, false on opt-out — symmetric override surface), with key-naming
 * + underlying-error surfacing on git-config failures, plus human / `--json`
 * rendering of the resolved opt-in + interlock surface.
 */

import { describe, it, expect, vi } from "vitest";

import {
  runReleaseOptIn,
  runReleaseOptOut,
  runReleaseStatus,
} from "../../../../src/handlers/release/record.js";
import type { ResolvedSettingsResult } from "../../../../src/lib/config/resolved-settings.js";
import type { HarnessEntry, MarkerReadResult } from "../../../../src/lib/release/setup-marker.js";
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

function marker(harnesses: HarnessEntry[]): MarkerReadResult {
  return {
    ok: true,
    marker: {
      schemaVersion: 1,
      harnesses,
    },
  };
}

describe("runReleaseOptIn", () => {
  it("writes arc.releaseEnabled = true to local config on first invocation", async () => {
    const exec = vi
      .fn()
      .mockRejectedValueOnce(new Error("exit code 1")) // --get returns undefined (absent)
      .mockResolvedValueOnce({ stdout: "" }); // --local set succeeds

    const result = await runReleaseOptIn({ exec });

    expect(result.exitCode).toBe(0);
    expect(exec).toHaveBeenCalledWith("git", [
      "config",
      "--local",
      "arc.releaseEnabled",
      "true",
    ]);
  });

  it("returns no-op success when key is already set to 'true' (skips --local set)", async () => {
    const exec = vi.fn().mockResolvedValueOnce({ stdout: "true\n" });

    const result = await runReleaseOptIn({ exec });

    expect(result.exitCode).toBe(0);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).not.toHaveBeenCalledWith("git", [
      "config",
      "--local",
      "arc.releaseEnabled",
      "true",
    ]);
  });

  it("overwrites a stale 'false' to 'true' on opt-in", async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "false\n" }) // --get returns "false"
      .mockResolvedValueOnce({ stdout: "" }); // --local set succeeds

    const result = await runReleaseOptIn({ exec });

    expect(result.exitCode).toBe(0);
    expect(exec).toHaveBeenCalledWith("git", [
      "config",
      "--local",
      "arc.releaseEnabled",
      "true",
    ]);
  });

  it("surfaces git-config write failure with key name and underlying error", async () => {
    const exec = vi
      .fn()
      .mockRejectedValueOnce(new Error("exit code 1")) // --get (absent)
      .mockRejectedValueOnce(new Error("permission denied")); // --local set fails

    const stderr: string[] = [];
    const result = await runReleaseOptIn({
      exec,
      writeStderr: (msg) => {
        stderr.push(msg);
      },
    });

    expect(result.exitCode).not.toBe(0);
    expect(stderr.join("")).toContain("arc.releaseEnabled");
    expect(stderr.join("")).toContain("permission denied");
  });
});

describe("runReleaseOptOut", () => {
  it("writes arc.releaseEnabled = false to local config when key is absent", async () => {
    const exec = vi
      .fn()
      .mockRejectedValueOnce(new Error("exit code 1")) // --get returns undefined (absent)
      .mockResolvedValueOnce({ stdout: "" }); // --local set succeeds

    const result = await runReleaseOptOut({ exec });

    expect(result.exitCode).toBe(0);
    expect(exec).toHaveBeenCalledWith("git", [
      "config",
      "--local",
      "arc.releaseEnabled",
      "false",
    ]);
  });

  it("overwrites 'true' with 'false' to override yaml-set opt-in locally", async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "true\n" }) // --get returns "true"
      .mockResolvedValueOnce({ stdout: "" }); // --local set succeeds

    const result = await runReleaseOptOut({ exec });

    expect(result.exitCode).toBe(0);
    expect(exec).toHaveBeenCalledWith("git", [
      "config",
      "--local",
      "arc.releaseEnabled",
      "false",
    ]);
  });

  it("returns no-op success when key is already set to 'false' (skips --local set)", async () => {
    const exec = vi.fn().mockResolvedValueOnce({ stdout: "false\n" });

    const result = await runReleaseOptOut({ exec });

    expect(result.exitCode).toBe(0);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).not.toHaveBeenCalledWith("git", [
      "config",
      "--local",
      "arc.releaseEnabled",
      "false",
    ]);
  });

  it("surfaces git-config write failure with key name and underlying error", async () => {
    const exec = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "true\n" }) // --get returns "true"
      .mockRejectedValueOnce(new Error("permission denied")); // --local set fails

    const stderr: string[] = [];
    const result = await runReleaseOptOut({
      exec,
      writeStderr: (msg) => {
        stderr.push(msg);
      },
    });

    expect(result.exitCode).not.toBe(0);
    expect(stderr.join("")).toContain("arc.releaseEnabled");
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

  it("emits a schemaVersion 2 envelope with posture fields in --json mode", async () => {
    const settings = buildSettings({
      releaseEnabled: { value: "true", source: "git-config" },
      commitInterlock: { value: "on-task-approval", source: "yaml" },
      pushInterlock: { value: "on-sync", source: "yaml" },
      syncInterlock: { value: "on-handoff", source: "default" },
    });
    const stdout: string[] = [];
    const result = await runReleaseStatus({
      settings,
      marker: marker([
        { name: "claude-code", mode: "default-prompt", installedAt: "2026-05-10T00:00:00.000Z" },
      ]),
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
      harnesses: Array<{ name: string; mode: string; installedAt: string; annotation?: string }>;
      activeValueLayers: string;
      releaseRouting: {
        taskCommit: string;
        workflowCommit: string;
        workflowPush: string;
        rationale: {
          releaseEnabled: boolean;
          commitInterlock: string;
          pushInterlock: string;
        };
      };
    };
    expect(envelope).toEqual({
      schemaVersion: 2,
      releaseEnabled: { value: true, source: "git-config" },
      commitInterlock: { value: "on-task-approval", source: "yaml" },
      pushInterlock: { value: "on-sync", source: "yaml" },
      syncInterlock: { value: "on-handoff", source: "default" },
      harnesses: [
        {
          name: "claude-code",
          mode: "default-prompt",
          installedAt: "2026-05-10T00:00:00.000Z",
        },
      ],
      activeValueLayers: "validation + audit + harness-prompt bypass",
      releaseRouting: {
        taskCommit: "wrapper",
        workflowCommit: "raw",
        workflowPush: "raw",
        rationale: {
          releaseEnabled: true,
          commitInterlock: "on-task-approval",
          pushInterlock: "on-sync",
        },
      },
    });
  });

  it("projects empty marker and opt-in false as no harnesses and no active value layers", async () => {
    const stdout: string[] = [];
    await runReleaseStatus({
      settings: buildSettings({ releaseEnabled: { value: "false", source: "default" } }),
      marker: marker([]),
      json: true,
      writeStdout: (msg) => {
        stdout.push(msg);
      },
    });

    const envelope = JSON.parse(stdout.join("")) as {
      harnesses: unknown[];
      activeValueLayers: string;
      releaseRouting: { taskCommit: string; workflowCommit: string; workflowPush: string };
    };
    expect(envelope.harnesses).toEqual([]);
    expect(envelope.activeValueLayers).toBe("none");
    expect(envelope.releaseRouting).toEqual(expect.objectContaining({
      taskCommit: "raw",
      workflowCommit: "raw",
      workflowPush: "raw",
    }));
  });

  it("annotates bypass harnesses and mixed-mode value layers", async () => {
    const stdout: string[] = [];
    await runReleaseStatus({
      settings: buildSettings({ releaseEnabled: { value: "true", source: "git-config" } }),
      marker: marker([
        { name: "claude-code", mode: "bypass", installedAt: "2026-05-10T00:00:00.000Z" },
        { name: "codex", mode: "default-prompt", installedAt: "2026-05-10T01:00:00.000Z" },
      ]),
      json: true,
      writeStdout: (msg) => {
        stdout.push(msg);
      },
    });

    const envelope = JSON.parse(stdout.join("")) as {
      harnesses: Array<{ name: string; mode: string; annotation?: string }>;
      activeValueLayers: string;
    };
    expect(envelope.harnesses).toEqual([
      expect.objectContaining({
        name: "claude-code",
        mode: "bypass",
        annotation: "no harness gate to bypass",
      }),
      expect.objectContaining({
        name: "codex",
        mode: "default-prompt",
      }),
    ]);
    expect(envelope.harnesses[1]).not.toHaveProperty("annotation");
    expect(envelope.activeValueLayers).toBe(
      "validation + audit + harness-prompt bypass (codex only)",
    );
  });

  it("renders harnesses, value layers, and routing in human mode", async () => {
    const stdout: string[] = [];
    await runReleaseStatus({
      settings: buildSettings({
        releaseEnabled: { value: "true", source: "git-config" },
        commitInterlock: { value: "on-workflow", source: "yaml" },
        pushInterlock: { value: "on-workflow", source: "yaml" },
      }),
      marker: marker([
        { name: "claude-code", mode: "default-prompt", installedAt: "2026-05-10T00:00:00.000Z" },
        { name: "codex", mode: "bypass", installedAt: "2026-05-10T01:00:00.000Z" },
      ]),
      writeStdout: (msg) => {
        stdout.push(msg);
      },
    });

    const output = stdout.join("");
    expect(output).toContain("harnesses:");
    expect(output).toContain("claude-code (default-prompt) — installed 2026-05-10");
    expect(output).toContain("codex (bypass) — no harness gate to bypass");
    expect(output).toContain(
      "active_value_layers: validation + audit + harness-prompt bypass (claude-code only)",
    );
    expect(output).toContain("release_routing:");
    expect(output).toContain("task_commit: wrapper");
    expect(output).toContain("workflow_commit: wrapper");
    expect(output).toContain("workflow_push: wrapper");
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
