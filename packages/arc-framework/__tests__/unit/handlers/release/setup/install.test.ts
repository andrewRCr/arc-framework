/**
 * Unit tests for `arc release setup install`.
 *
 * Covers the state-read shell and existing-install idempotency branch.
 */

import { describe, expect, it, vi } from "vitest";

import {
  runReleaseSetupInstall,
  type SetupInstallIdempotencyChoice,
  type TrustAcknowledgment,
  type WorkflowVerification,
} from "../../../../../src/handlers/release/setup/install.js";
import type { ConfigSettings } from "../../../../../src/commands/config/types.js";
import type { ResolvedSettingsResult } from "../../../../../src/lib/config/resolved-settings.js";
import type {
  HarnessMode,
  HarnessEntry,
  MarkerReadResult,
  MarkerStorageError,
  MarkerWriteResult,
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
  it("requires --harness on the single-harness install path", async () => {
    const stderr: string[] = [];
    const chooseIdempotency = vi.fn<() => Promise<SetupInstallIdempotencyChoice>>();

    const result = await runReleaseSetupInstall({
      settings: buildSettings({ value: "false", source: "default" }),
      marker: marker([]),
      chooseIdempotency,
      mode: "default-prompt",
      writeStdout: () => undefined,
      writeStderr: (msg) => stderr.push(msg),
    });

    expect(result.exitCode).toBe(1);
    expect(chooseIdempotency).not.toHaveBeenCalled();
    expect(stderr.join("")).toContain("missing required option --harness");
  });

  it("requires --mode on the single-harness install path", async () => {
    const stderr: string[] = [];

    const result = await runReleaseSetupInstall({
      settings: buildSettings({ value: "false", source: "default" }),
      marker: marker([]),
      harness: "claude-code",
      writeStdout: () => undefined,
      writeStderr: (msg) => stderr.push(msg),
    });

    expect(result.exitCode).toBe(1);
    expect(stderr.join("")).toContain("missing required option --mode");
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
    const stderr: string[] = [];

    const result = await runReleaseSetupInstall({
      settings: buildSettings({ value: "true", source: "git-config" }),
      marker: marker([existingHarness()]),
      chooseIdempotency: async () => "add-harness",
      writeStdout: (msg) => stdout.push(msg),
      writeStderr: (msg) => stderr.push(msg),
    });

    expect(result.exitCode).toBe(1);
    const output = stdout.join("");
    expect(output).toContain("idempotency_action: add-harness");
    expect(output).toContain("next_action: single-harness install flow");
    expect(output).toContain("scope: harnesses not already recorded");
    expect(stderr.join("")).toContain("missing required option --harness");
  });

  it("surfaces trust-shift acknowledgment text for default-prompt mode", async () => {
    const acknowledgeTrust = vi.fn<TrustAcknowledgment>().mockResolvedValue(false);

    const result = await runReleaseSetupInstall({
      settings: buildSettings({ value: "false", source: "default" }),
      marker: marker([]),
      harness: "claude-code",
      mode: "default-prompt",
      acknowledgeTrust,
      writeStdout: () => undefined,
    });

    expect(result.exitCode).toBe(0);
    expect(acknowledgeTrust).toHaveBeenCalledWith(expect.objectContaining({
      harness: "claude-code",
      mode: "default-prompt",
      message: expect.stringContaining("trust shift"),
    }));
  });

  it("surfaces audit-only acknowledgment text for bypass mode", async () => {
    const acknowledgeTrust = vi.fn<TrustAcknowledgment>().mockResolvedValue(false);

    const result = await runReleaseSetupInstall({
      settings: buildSettings({ value: "false", source: "default" }),
      marker: marker([]),
      harness: "claude-code",
      mode: "bypass",
      acknowledgeTrust,
      writeStdout: () => undefined,
    });

    expect(result.exitCode).toBe(0);
    expect(acknowledgeTrust).toHaveBeenCalledWith(expect.objectContaining({
      mode: "bypass",
      message: expect.stringContaining("audit-only"),
    }));
  });

  it("aborts without state changes when trust acknowledgment is declined", async () => {
    const stdout: string[] = [];
    const upsertHarness = vi.fn();
    const recordOptIn = vi.fn();

    const result = await runReleaseSetupInstall({
      settings: buildSettings({ value: "false", source: "default" }),
      marker: marker([]),
      harness: "claude-code",
      mode: "default-prompt",
      acknowledgeTrust: async () => false,
      upsertHarness,
      recordOptIn,
      writeStdout: (msg) => stdout.push(msg),
    });

    expect(result.exitCode).toBe(0);
    expect(upsertHarness).not.toHaveBeenCalled();
    expect(recordOptIn).not.toHaveBeenCalled();
    expect(stdout.join("")).toContain("result: aborted");
  });

  it("records marker and opt-in after accepted default-prompt workflow verification", async () => {
    const stdout: string[] = [];
    const workflowVerification = vi.fn<WorkflowVerification>().mockResolvedValue(true);
    const upsertHarness = vi.fn<(entry: HarnessEntry) => Promise<MarkerWriteResult>>()
      .mockResolvedValue(marker([{ name: "claude-code", mode: "default-prompt", installedAt: "2026-05-10T12:00:00.000Z" }]) as MarkerWriteResult);
    const recordOptIn = vi.fn<() => Promise<{ exitCode: number }>>().mockResolvedValue({ exitCode: 0 });

    const result = await runReleaseSetupInstall({
      settings: buildSettings({ value: "false", source: "default" }),
      marker: marker([]),
      harness: "claude-code",
      mode: "default-prompt",
      now: () => "2026-05-10T12:00:00.000Z",
      acknowledgeTrust: async () => true,
      workflowVerification,
      upsertHarness,
      recordOptIn,
      writeStdout: (msg) => stdout.push(msg),
    });

    expect(result.exitCode).toBe(0);
    expect(workflowVerification).toHaveBeenCalledWith(expect.objectContaining({
      harness: "claude-code",
      mode: "default-prompt",
      requiresPromptObservation: true,
    }));
    expect(upsertHarness).toHaveBeenCalledWith({
      name: "claude-code",
      mode: "default-prompt",
      installedAt: "2026-05-10T12:00:00.000Z",
    });
    expect(recordOptIn).toHaveBeenCalledTimes(1);
    expect(stdout.join("")).toContain("result: install recorded");
  });

  it("records marker and opt-in after accepted bypass workflow verification", async () => {
    const workflowVerification = vi.fn<WorkflowVerification>().mockResolvedValue(true);
    const upsertHarness = vi.fn<(entry: HarnessEntry) => Promise<MarkerWriteResult>>()
      .mockResolvedValue(marker([{ name: "codex", mode: "bypass", installedAt: "2026-05-10T12:00:00.000Z" }]) as MarkerWriteResult);
    const recordOptIn = vi.fn<() => Promise<{ exitCode: number }>>().mockResolvedValue({ exitCode: 0 });

    const result = await runReleaseSetupInstall({
      settings: buildSettings({ value: "false", source: "default" }),
      marker: marker([]),
      harness: "codex",
      mode: "bypass",
      now: () => "2026-05-10T12:00:00.000Z",
      acknowledgeTrust: async () => true,
      workflowVerification,
      upsertHarness,
      recordOptIn,
      writeStdout: () => undefined,
    });

    expect(result.exitCode).toBe(0);
    expect(workflowVerification).toHaveBeenCalledWith(expect.objectContaining({
      mode: "bypass",
      requiresPromptObservation: false,
    }));
    expect(upsertHarness).toHaveBeenCalledWith(expect.objectContaining({
      name: "codex",
      mode: "bypass" satisfies HarnessMode,
    }));
  });

  it("appends sibling harness entries without rewriting an already-enabled opt-in flag", async () => {
    const stdout: string[] = [];
    const upsertHarness = vi.fn<(entry: HarnessEntry) => Promise<MarkerWriteResult>>()
      .mockResolvedValue(marker([
        existingHarness(),
        { name: "codex", mode: "default-prompt", installedAt: "2026-05-10T12:00:00.000Z" },
      ]) as MarkerWriteResult);
    const recordOptIn = vi.fn<() => Promise<{ exitCode: number }>>().mockResolvedValue({ exitCode: 0 });

    const result = await runReleaseSetupInstall({
      settings: buildSettings({ value: "true", source: "git-config" }),
      marker: marker([existingHarness()]),
      chooseIdempotency: async () => "add-harness",
      harness: "codex",
      mode: "default-prompt",
      now: () => "2026-05-10T12:00:00.000Z",
      acknowledgeTrust: async () => true,
      workflowVerification: async () => true,
      upsertHarness,
      recordOptIn,
      writeStdout: (msg) => stdout.push(msg),
    });

    expect(result.exitCode).toBe(0);
    expect(upsertHarness).toHaveBeenCalledWith({
      name: "codex",
      mode: "default-prompt",
      installedAt: "2026-05-10T12:00:00.000Z",
    });
    expect(recordOptIn).not.toHaveBeenCalled();
    expect(stdout.join("")).toContain("opt_in: already recorded");
  });

  it("emits a schemaVersion 1 JSON envelope with install result and post-op opt-in state", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const result = await runReleaseSetupInstall({
      settings: buildSettings({ value: "false", source: "default" }),
      marker: marker([]),
      harness: "claude-code",
      mode: "default-prompt",
      json: true,
      now: () => "2026-05-10T12:00:00.000Z",
      acknowledgeTrust: async () => true,
      workflowVerification: async () => true,
      upsertHarness: async (entry) => marker([entry]) as MarkerWriteResult,
      recordOptIn: async () => ({ exitCode: 0 }),
      writeStdout: (msg) => stdout.push(msg),
      writeStderr: (msg) => stderr.push(msg),
    });

    expect(result.exitCode).toBe(0);
    const envelope = JSON.parse(stdout.join("")) as {
      schemaVersion: number;
      command: string;
      releaseEnabled: { before: boolean; after: boolean };
      harnesses: Array<{ name: string; mode: string; result: string }>;
      exitCode: number;
    };
    expect(envelope).toEqual(expect.objectContaining({
      schemaVersion: 1,
      command: "install",
      releaseEnabled: expect.objectContaining({ before: false, after: true }),
      exitCode: 0,
    }));
    expect(envelope.harnesses).toEqual([
      expect.objectContaining({
        name: "claude-code",
        mode: "default-prompt",
        result: "recorded",
      }),
    ]);
    expect(stdout.join("").trim()).toMatch(/^\{/);
    expect(stderr.join("")).toContain("release_setup_install: fresh");
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
