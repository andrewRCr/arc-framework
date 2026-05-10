/**
 * Unit tests for `arc release setup install`.
 *
 * Covers the state-read shell and existing-install idempotency branch.
 */

import { describe, expect, it, vi } from "vitest";

import {
  runReleaseSetupInstall,
  type SetupInstallIdempotencyChoice,
} from "../../../../../src/handlers/release/setup/install.js";
import type { ConfigSettings } from "../../../../../src/commands/config/types.js";
import type { ResolvedSettingsResult } from "../../../../../src/lib/config/resolved-settings.js";
import type {
  HarnessEntry,
  MarkerReadResult,
  MarkerStorageError,
} from "../../../../../src/lib/release/setup-marker.js";

function buildSettings(
  releaseEnabled: { value: "true" | "false"; source: "git-config" | "yaml" | "default" },
): ResolvedSettingsResult {
  return {
    settings: {} as ConfigSettings,
    resolved: {
      commitInterlock: { value: "manual", source: "default" },
      pushInterlock: { value: "manual", source: "default" },
      syncInterlock: { value: "on-handoff", source: "default" },
      notesPush: { value: "on-sync", source: "default" },
      releaseEnabled,
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

function markerError(error: MarkerStorageError): MarkerReadResult {
  return { ok: false, error };
}

function existingHarness(): HarnessEntry {
  return {
    name: "claude-code",
    mode: "default-prompt",
    installedAt: "2026-05-10T00:00:00.000Z",
  };
}

describe("runReleaseSetupInstall", () => {
  it("routes fresh state to the single-harness install flow", async () => {
    const stdout: string[] = [];
    const chooseIdempotency = vi.fn<() => Promise<SetupInstallIdempotencyChoice>>();

    const result = await runReleaseSetupInstall({
      settings: buildSettings({ value: "false", source: "default" }),
      marker: marker([]),
      chooseIdempotency,
      writeStdout: (msg) => stdout.push(msg),
    });

    expect(result.exitCode).toBe(0);
    expect(chooseIdempotency).not.toHaveBeenCalled();
    const output = stdout.join("");
    expect(output).toContain("release_setup_install: fresh");
    expect(output).toContain("release_enabled: false (default)");
    expect(output).toContain("harnesses: none recorded");
    expect(output).toContain("next_action: single-harness install flow");
  });

  it("surfaces current state before the existing-install idempotency choice", async () => {
    const stdout: string[] = [];

    const result = await runReleaseSetupInstall({
      settings: buildSettings({ value: "true", source: "git-config" }),
      marker: marker([existingHarness()]),
      chooseIdempotency: async () => "exit",
      writeStdout: (msg) => stdout.push(msg),
    });

    expect(result.exitCode).toBe(0);
    const output = stdout.join("");
    expect(output).toContain("release_setup_install: existing");
    expect(output).toContain("release_enabled: true (git-config)");
    expect(output).toContain("harness: claude-code");
    expect(output).toContain("mode: default-prompt");
    expect(output).toContain("installed_at: 2026-05-10T00:00:00.000Z");
  });

  it("acknowledges the exit idempotency choice as a no-op", async () => {
    const stdout: string[] = [];

    const result = await runReleaseSetupInstall({
      settings: buildSettings({ value: "true", source: "git-config" }),
      marker: marker([existingHarness()]),
      chooseIdempotency: async () => "exit",
      writeStdout: (msg) => stdout.push(msg),
    });

    expect(result.exitCode).toBe(0);
    const output = stdout.join("");
    expect(output).toContain("idempotency_action: exit");
    expect(output).toContain("result: no-op acknowledged");
  });

  it("routes re-verify to the workflow-mediated verify path", async () => {
    const stdout: string[] = [];

    const result = await runReleaseSetupInstall({
      settings: buildSettings({ value: "true", source: "git-config" }),
      marker: marker([existingHarness()]),
      chooseIdempotency: async () => "re-verify",
      writeStdout: (msg) => stdout.push(msg),
    });

    expect(result.exitCode).toBe(0);
    const output = stdout.join("");
    expect(output).toContain("idempotency_action: re-verify");
    expect(output).toContain("next_action: workflow-mediated verify for recorded harnesses");
    expect(output).toContain("direct_prompt_observation: outer-harness step");
  });

  it("routes update markers to workflow-mediated mode re-detection", async () => {
    const stdout: string[] = [];

    const result = await runReleaseSetupInstall({
      settings: buildSettings({ value: "true", source: "git-config" }),
      marker: marker([existingHarness()]),
      chooseIdempotency: async () => "update-markers",
      writeStdout: (msg) => stdout.push(msg),
    });

    expect(result.exitCode).toBe(0);
    const output = stdout.join("");
    expect(output).toContain("idempotency_action: update-markers");
    expect(output).toContain("next_action: workflow-mediated mode re-detection");
  });

  it("routes add harness to the single-harness install flow", async () => {
    const stdout: string[] = [];

    const result = await runReleaseSetupInstall({
      settings: buildSettings({ value: "true", source: "git-config" }),
      marker: marker([existingHarness()]),
      chooseIdempotency: async () => "add-harness",
      writeStdout: (msg) => stdout.push(msg),
    });

    expect(result.exitCode).toBe(0);
    const output = stdout.join("");
    expect(output).toContain("idempotency_action: add-harness");
    expect(output).toContain("next_action: single-harness install flow");
    expect(output).toContain("scope: harnesses not already recorded");
  });

  it("surfaces marker read errors on stderr", async () => {
    const stderr: string[] = [];

    const result = await runReleaseSetupInstall({
      settings: buildSettings({ value: "true", source: "git-config" }),
      marker: markerError({
        kind: "invalid-schema",
        message: "release setup marker does not match schema v1",
        path: "/repo/.arc/user/andrew/.internal/release-setup.json",
      }),
      writeStderr: (msg) => stderr.push(msg),
    });

    expect(result.exitCode).toBe(1);
    expect(stderr.join("")).toContain("release setup marker does not match schema v1");
  });
});
