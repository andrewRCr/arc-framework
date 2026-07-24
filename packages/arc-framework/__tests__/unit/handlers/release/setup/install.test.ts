/**
 * Unit tests for `arc release setup install`.
 *
 * Covers the state-read shell and existing-install idempotency branch.
 */

import { describe, expect, it, vi } from "vitest";

import {
  acquireInteractiveInstallInputs,
  runReleaseSetupInstall,
  type ReleaseSetupInstallInput,
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
  releaseOptedIn: { value: "true" | "false"; source: "git-config" | "yaml" | "default" },
): ResolvedSettingsResult {
  return {
    settings: {} as ConfigSettings,
    resolved: {
      commitInterlock: { value: "manual", source: "default" },
      pushInterlock: { value: "manual", source: "default" },
      syncInterlock: { value: "on-handoff", source: "default" },
      notesPush: { value: "on-sync", source: "default" },
      releaseOptedIn,
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

function installInput(overrides: Partial<ReleaseSetupInstallInput> = {}): ReleaseSetupInstallInput {
  return {
    trustAccepted: false,
    workflowVerified: false,
    json: false,
    ...overrides,
  };
}

describe("runReleaseSetupInstall", () => {
  it("requires --harness on the single-harness install path", async () => {
    const stderr: string[] = [];
    const result = await runReleaseSetupInstall({
      settings: buildSettings({ value: "false", source: "default" }),
      marker: marker([]),
      input: installInput({ mode: "default-prompt" }),
      writeStdout: () => undefined,
      writeStderr: (msg) => stderr.push(msg),
    });

    expect(result.exitCode).toBe(1);
    expect(stderr.join("")).toContain("missing required option --harness");
  });

  it("requires --mode on the single-harness install path", async () => {
    const stderr: string[] = [];

    const result = await runReleaseSetupInstall({
      settings: buildSettings({ value: "false", source: "default" }),
      marker: marker([]),
      input: installInput({ harness: "claude-code" }),
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
      input: installInput({ idempotencyAction: "exit" }),
      writeStdout: (msg) => stdout.push(msg),
    });

    expect(result.exitCode).toBe(0);
    const output = stdout.join("");
    expect(output).toContain("release_setup_install: existing");
    expect(output).toContain("release_opted_in: true (git-config)");
    expect(output).toContain("harness: claude-code");
    expect(output).toContain("mode: default-prompt");
    expect(output).toContain("installed_at: 2026-05-10T00:00:00.000Z");
  });

  it("acknowledges the exit idempotency choice as a no-op", async () => {
    const stdout: string[] = [];

    const result = await runReleaseSetupInstall({
      settings: buildSettings({ value: "true", source: "git-config" }),
      marker: marker([existingHarness()]),
      input: installInput({ idempotencyAction: "exit" }),
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
      input: installInput({ idempotencyAction: "re-verify" }),
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
      input: installInput({ idempotencyAction: "update-markers" }),
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
      input: installInput({ idempotencyAction: "add-harness" }),
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

  it("refuses unresolved trust for default-prompt mode", async () => {
    const result = await runReleaseSetupInstall({
      settings: buildSettings({ value: "false", source: "default" }),
      marker: marker([]),
      input: installInput({ harness: "claude-code", mode: "default-prompt" }),
      writeStdout: () => undefined,
    });

    expect(result.exitCode).toBe(0);
  });

  it("refuses unresolved trust for bypass mode", async () => {
    const result = await runReleaseSetupInstall({
      settings: buildSettings({ value: "false", source: "default" }),
      marker: marker([]),
      input: installInput({ harness: "claude-code", mode: "bypass" }),
      writeStdout: () => undefined,
    });

    expect(result.exitCode).toBe(0);
  });

  it("aborts without state changes when trust acknowledgment is declined", async () => {
    const stdout: string[] = [];
    const upsertHarness = vi.fn();
    const recordOptIn = vi.fn();

    const result = await runReleaseSetupInstall({
      settings: buildSettings({ value: "false", source: "default" }),
      marker: marker([]),
      input: installInput({ harness: "claude-code", mode: "default-prompt" }),
      upsertHarness,
      recordOptIn,
      writeStdout: (msg) => stdout.push(msg),
    });

    expect(result.exitCode).toBe(0);
    expect(upsertHarness).not.toHaveBeenCalled();
    expect(recordOptIn).not.toHaveBeenCalled();
    expect(stdout.join("")).toContain("result: aborted");
  });

  it("aborts without state changes when workflow verification is absent independently of trust", async () => {
    const upsertHarness = vi.fn();
    const recordOptIn = vi.fn();

    const result = await runReleaseSetupInstall({
      settings: buildSettings({ value: "false", source: "default" }),
      marker: marker([]),
      input: installInput({
        harness: "claude-code",
        mode: "default-prompt",
        trustAccepted: true,
        workflowVerified: false,
      }),
      upsertHarness,
      recordOptIn,
      writeStdout: () => undefined,
    });

    expect(result.exitCode).toBe(0);
    expect(upsertHarness).not.toHaveBeenCalled();
    expect(recordOptIn).not.toHaveBeenCalled();
  });

  it("records marker and opt-in after accepted default-prompt workflow verification", async () => {
    const stdout: string[] = [];
    const upsertHarness = vi.fn<(entry: HarnessEntry) => Promise<MarkerWriteResult>>()
      .mockResolvedValue(marker([{ name: "claude-code", mode: "default-prompt", installedAt: "2026-05-10T12:00:00.000Z" }]) as MarkerWriteResult);
    const recordOptIn = vi.fn<() => Promise<{ exitCode: number }>>().mockResolvedValue({ exitCode: 0 });

    const result = await runReleaseSetupInstall({
      settings: buildSettings({ value: "false", source: "default" }),
      marker: marker([]),
      input: installInput({
        harness: "claude-code", mode: "default-prompt", trustAccepted: true, workflowVerified: true,
      }),
      now: () => "2026-05-10T12:00:00.000Z",
      upsertHarness,
      recordOptIn,
      writeStdout: (msg) => stdout.push(msg),
    });

    expect(result.exitCode).toBe(0);
    expect(upsertHarness).toHaveBeenCalledWith({
      name: "claude-code",
      mode: "default-prompt",
      installedAt: "2026-05-10T12:00:00.000Z",
    });
    expect(recordOptIn).toHaveBeenCalledTimes(1);
    expect(stdout.join("")).toContain("result: install recorded");
  });

  it("records marker and opt-in after accepted bypass workflow verification", async () => {
    const upsertHarness = vi.fn<(entry: HarnessEntry) => Promise<MarkerWriteResult>>()
      .mockResolvedValue(marker([{ name: "codex", mode: "bypass", installedAt: "2026-05-10T12:00:00.000Z" }]) as MarkerWriteResult);
    const recordOptIn = vi.fn<() => Promise<{ exitCode: number }>>().mockResolvedValue({ exitCode: 0 });

    const result = await runReleaseSetupInstall({
      settings: buildSettings({ value: "false", source: "default" }),
      marker: marker([]),
      input: installInput({ harness: "codex", mode: "bypass", trustAccepted: true, workflowVerified: true }),
      now: () => "2026-05-10T12:00:00.000Z",
      upsertHarness,
      recordOptIn,
      writeStdout: () => undefined,
    });

    expect(result.exitCode).toBe(0);
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
      input: installInput({
        idempotencyAction: "add-harness", harness: "codex", mode: "default-prompt",
        trustAccepted: true, workflowVerified: true,
      }),
      now: () => "2026-05-10T12:00:00.000Z",
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
      input: installInput({
        harness: "claude-code", mode: "default-prompt", trustAccepted: true, workflowVerified: true, json: true,
      }),
      now: () => "2026-05-10T12:00:00.000Z",
      upsertHarness: async (entry) => marker([entry]) as MarkerWriteResult,
      recordOptIn: async () => ({ exitCode: 0 }),
      writeStdout: (msg) => stdout.push(msg),
      writeStderr: (msg) => stderr.push(msg),
    });

    expect(result.exitCode).toBe(0);
    const envelope = JSON.parse(stdout.join("")) as {
      schemaVersion: number;
      command: string;
      releaseOptedIn: { before: boolean; after: boolean };
      harnesses: Array<{ name: string; mode: string; result: string }>;
      exitCode: number;
    };
    expect(envelope).toEqual(expect.objectContaining({
      schemaVersion: 1,
      command: "install",
      releaseOptedIn: expect.objectContaining({ before: false, after: true }),
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
      input: installInput(),
      writeStderr: (msg) => stderr.push(msg),
    });

    expect(result.exitCode).toBe(1);
    expect(stderr.join("")).toContain("release setup marker does not match schema v1");
  });
});

describe("interactive release setup acquisition", () => {
  const resolved = <T>(value: T) => Promise.resolve({
    kind: "resolved" as const,
    value,
    source: "prompt" as const,
  });

  it("stops immediately when harness acquisition is cancelled", async () => {
    const mode = vi.fn(() => resolved<HarnessMode>("bypass"));
    const trust = vi.fn(() => resolved(true));
    const workflow = vi.fn(() => resolved(true));

    const result = await acquireInteractiveInstallInputs({
      trustAccepted: false,
      workflowVerified: false,
    }, {
      harness: async () => ({ kind: "cancelled" }),
      mode,
      trust,
      workflow,
    });

    expect(result).toEqual({ kind: "cancelled" });
    expect(mode).not.toHaveBeenCalled();
    expect(trust).not.toHaveBeenCalled();
    expect(workflow).not.toHaveBeenCalled();
  });

  it("does not request workflow evidence after trust is declined", async () => {
    const workflow = vi.fn(() => resolved(true));

    const result = await acquireInteractiveInstallInputs({
      harness: "codex",
      mode: "bypass",
      trustAccepted: false,
      workflowVerified: false,
    }, {
      harness: () => resolved("unused"),
      mode: () => resolved<HarnessMode>("bypass"),
      trust: () => resolved(false),
      workflow,
    });

    expect(result).toEqual({ kind: "cancelled" });
    expect(workflow).not.toHaveBeenCalled();
  });
});
