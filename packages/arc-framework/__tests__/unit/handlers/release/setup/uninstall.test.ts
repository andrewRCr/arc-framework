/**
 * Unit tests for `arc release setup uninstall`.
 *
 * Covers workflow-mediated cleanup orchestration, marker removal, opt-out
 * recording, idempotent no-op behavior, and JSON output.
 */

import { describe, expect, it, vi } from "vitest";

import {
  runReleaseSetupUninstall,
  type CleanupVerification,
} from "../../../../../src/handlers/release/setup/uninstall.js";
import type { ConfigSettings } from "../../../../../src/commands/config/types.js";
import type { ResolvedSettingsResult } from "../../../../../src/lib/config/resolved-settings.js";
import type {
  HarnessEntry,
  MarkerReadResult,
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

function existingHarness(overrides: Partial<HarnessEntry> = {}): HarnessEntry {
  return {
    name: "claude-code",
    mode: "default-prompt",
    installedAt: "2026-05-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("runReleaseSetupUninstall", () => {
  it("requires --harness before reading marker state", async () => {
    const readMarker = vi.fn<() => Promise<MarkerReadResult>>().mockResolvedValue(marker([]));
    const stderr: string[] = [];

    const result = await runReleaseSetupUninstall({
      settings: buildSettings({ value: "false", source: "default" }),
      readMarker,
      writeStdout: () => undefined,
      writeStderr: (msg) => stderr.push(msg),
    });

    expect(result.exitCode).toBe(1);
    expect(readMarker).not.toHaveBeenCalled();
    expect(stderr.join("")).toContain("missing required option --harness");
  });

  it("succeeds as a no-op when the requested harness is already uninstalled", async () => {
    const cleanup = vi.fn<CleanupVerification>();
    const removeHarness = vi.fn();
    const recordOptOut = vi.fn();
    const stdout: string[] = [];

    const result = await runReleaseSetupUninstall({
      settings: buildSettings({ value: "false", source: "default" }),
      harness: "claude-code",
      readMarker: async () => marker([]),
      cleanup,
      removeHarness,
      recordOptOut,
      writeStdout: (msg) => stdout.push(msg),
    });

    expect(result.exitCode).toBe(0);
    expect(cleanup).not.toHaveBeenCalled();
    expect(removeHarness).not.toHaveBeenCalled();
    expect(recordOptOut).not.toHaveBeenCalled();
    expect(stdout.join("")).toContain("result: no-op acknowledged");
  });

  it("passes canonical raw patterns to cleanup before removing the last marker entry and opting out", async () => {
    const cleanup = vi.fn<CleanupVerification>().mockResolvedValue({ ok: true });
    const removeHarness = vi.fn<(name: string) => Promise<MarkerWriteResult>>()
      .mockResolvedValue(marker([]) as MarkerWriteResult);
    const recordOptOut = vi.fn<() => Promise<{ exitCode: number }>>().mockResolvedValue({ exitCode: 0 });
    const stdout: string[] = [];

    const result = await runReleaseSetupUninstall({
      settings: buildSettings({ value: "true", source: "git-config" }),
      harness: "claude-code",
      readMarker: async () => marker([existingHarness()]),
      cleanup,
      removeHarness,
      recordOptOut,
      writeStdout: (msg) => stdout.push(msg),
    });

    expect(result.exitCode).toBe(0);
    expect(cleanup).toHaveBeenCalledWith(expect.objectContaining({
      harness: "claude-code",
      patterns: ["arc release commit:*", "arc release push:*"],
    }));
    expect(removeHarness).toHaveBeenCalledWith("claude-code");
    expect(recordOptOut).toHaveBeenCalledTimes(1);
    expect(stdout.join("")).toContain("result: uninstall recorded");
  });

  it("preserves the opt-in flag when uninstall leaves sibling harness entries", async () => {
    const sibling = existingHarness({
      name: "codex",
      mode: "bypass",
      installedAt: "2026-05-10T01:00:00.000Z",
    });
    const recordOptOut = vi.fn<() => Promise<{ exitCode: number }>>().mockResolvedValue({ exitCode: 0 });
    const stdout: string[] = [];

    const result = await runReleaseSetupUninstall({
      settings: buildSettings({ value: "true", source: "git-config" }),
      harness: "claude-code",
      readMarker: async () => marker([existingHarness(), sibling]),
      cleanup: async () => ({ ok: true }),
      removeHarness: async () => marker([sibling]) as MarkerWriteResult,
      recordOptOut,
      writeStdout: (msg) => stdout.push(msg),
    });

    expect(result.exitCode).toBe(0);
    expect(recordOptOut).not.toHaveBeenCalled();
    expect(stdout.join("")).toContain("opt_out: preserved (sibling harnesses remain)");
  });

  it("surfaces conservative cleanup refusals verbatim without changing state", async () => {
    const removeHarness = vi.fn();
    const recordOptOut = vi.fn();
    const stdout: string[] = [];

    const result = await runReleaseSetupUninstall({
      settings: buildSettings({ value: "true", source: "git-config" }),
      harness: "claude-code",
      readMarker: async () => marker([existingHarness()]),
      cleanup: async () => ({
        ok: false,
        reason: "user-curated allowlist entry drifted from canonical pattern set",
      }),
      removeHarness,
      recordOptOut,
      writeStdout: (msg) => stdout.push(msg),
    });

    expect(result.exitCode).toBe(1);
    expect(removeHarness).not.toHaveBeenCalled();
    expect(recordOptOut).not.toHaveBeenCalled();
    expect(stdout.join("")).toContain("user-curated allowlist entry drifted from canonical pattern set");
  });

  it("emits a schemaVersion 1 JSON envelope with uninstall result and post-op opt-in state", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const result = await runReleaseSetupUninstall({
      settings: buildSettings({ value: "true", source: "git-config" }),
      harness: "claude-code",
      json: true,
      readMarker: async () => marker([existingHarness()]),
      cleanup: async () => ({ ok: true }),
      removeHarness: async () => marker([]) as MarkerWriteResult,
      recordOptOut: async () => ({ exitCode: 0 }),
      writeStdout: (msg) => stdout.push(msg),
      writeStderr: (msg) => stderr.push(msg),
    });

    expect(result.exitCode).toBe(0);
    const envelope = JSON.parse(stdout.join("")) as {
      schemaVersion: number;
      command: string;
      releaseOptedIn: { before: boolean; after: boolean };
      harnesses: Array<{ name: string; mode?: string; result: string }>;
      exitCode: number;
    };
    expect(envelope).toEqual(expect.objectContaining({
      schemaVersion: 1,
      command: "uninstall",
      releaseOptedIn: expect.objectContaining({ before: true, after: false }),
      exitCode: 0,
    }));
    expect(envelope.harnesses).toEqual([
      expect.objectContaining({
        name: "claude-code",
        mode: "default-prompt",
        result: "removed",
      }),
    ]);
    expect(stdout.join("").trim()).toMatch(/^\{/);
    expect(stderr.join("")).toContain("release_setup_uninstall: recorded");
  });
});
