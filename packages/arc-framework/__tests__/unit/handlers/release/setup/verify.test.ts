/**
 * Unit tests for `arc release setup verify`.
 *
 * Covers the read-only setup posture report: release opt-in state, marker
 * entries, default-prompt direct-observation instructions, and bypass-mode
 * behavior.
 */

import { describe, expect, it } from "vitest";

import { runReleaseSetupVerify } from "../../../../../src/handlers/release/setup/verify.js";
import type { ConfigSettings } from "../../../../../src/commands/config/types.js";
import type { ResolvedSettingsResult } from "../../../../../src/lib/config/resolved-settings.js";
import type {
  HarnessEntry,
  MarkerReadResult,
  MarkerStorageError,
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

describe("runReleaseSetupVerify", () => {
  it("reports not engaged as a non-error when release opt-in is absent", () => {
    const stdout: string[] = [];

    const result = runReleaseSetupVerify({
      settings: buildSettings({ value: "false", source: "default" }),
      marker: marker([]),
      writeStdout: (msg) => stdout.push(msg),
    });

    expect(result.exitCode).toBe(0);
    const output = stdout.join("");
    expect(output).toContain("release_setup: not engaged");
    expect(output).toContain("release_opted_in: false (default)");
    expect(output).toContain("behavioral_test_subprocess: not run");
  });

  it("prints direct prompt-observation instructions for default-prompt harnesses", () => {
    const stdout: string[] = [];

    const result = runReleaseSetupVerify({
      settings: buildSettings({ value: "true", source: "git-config" }),
      marker: marker([
        { name: "claude-code", mode: "default-prompt", installedAt: "2026-05-10T00:00:00.000Z" },
      ]),
      writeStdout: (msg) => stdout.push(msg),
    });

    expect(result.exitCode).toBe(0);
    const output = stdout.join("");
    expect(output).toContain("release_setup: engaged");
    expect(output).toContain("harness: claude-code");
    expect(output).toContain("mode: default-prompt");
    expect(output).toContain("direct_prompt_observation: required");
    expect(output).toContain("test_command: arc release commit --version");
    expect(output).toContain("behavioral_test_subprocess: not run");
  });

  it("skips prompt observation for bypass-mode harnesses", () => {
    const stdout: string[] = [];

    const result = runReleaseSetupVerify({
      settings: buildSettings({ value: "true", source: "git-config" }),
      marker: marker([
        { name: "codex", mode: "bypass", installedAt: "2026-05-10T00:00:00.000Z" },
      ]),
      writeStdout: (msg) => stdout.push(msg),
    });

    expect(result.exitCode).toBe(0);
    const output = stdout.join("");
    expect(output).toContain("harness: codex");
    expect(output).toContain("mode: bypass");
    expect(output).toContain("direct_prompt_observation: skipped");
    expect(output).toContain("reason: bypass mode has no harness prompt to observe");
    expect(output).toContain("behavioral_test_subprocess: not run");
  });

  it("filters to the selected marker entry when --harness is provided", () => {
    const stdout: string[] = [];

    const result = runReleaseSetupVerify({
      settings: buildSettings({ value: "true", source: "git-config" }),
      marker: marker([
        { name: "claude-code", mode: "default-prompt", installedAt: "2026-05-10T00:00:00.000Z" },
        { name: "codex", mode: "bypass", installedAt: "2026-05-10T00:00:00.000Z" },
      ]),
      harness: "codex",
      writeStdout: (msg) => stdout.push(msg),
    });

    expect(result.exitCode).toBe(0);
    const output = stdout.join("");
    expect(output).toContain("harness: codex");
    expect(output).not.toContain("harness: claude-code");
  });

  it("reports every marker entry when no harness filter is provided", () => {
    const stdout: string[] = [];

    const result = runReleaseSetupVerify({
      settings: buildSettings({ value: "true", source: "git-config" }),
      marker: marker([
        { name: "claude-code", mode: "default-prompt", installedAt: "2026-05-10T00:00:00.000Z" },
        { name: "codex", mode: "bypass", installedAt: "2026-05-10T00:00:00.000Z" },
      ]),
      writeStdout: (msg) => stdout.push(msg),
    });

    expect(result.exitCode).toBe(0);
    const output = stdout.join("");
    expect(output).toContain("harness: claude-code");
    expect(output).toContain("harness: codex");
  });

  it("surfaces marker read errors on stderr", () => {
    const stderr: string[] = [];

    const result = runReleaseSetupVerify({
      settings: buildSettings({ value: "true", source: "git-config" }),
      marker: markerError({
        kind: "malformed-json",
        message: "release setup marker contains malformed JSON",
        path: "/repo/.arc/user/andrew/.internal/release-setup.json",
      }),
      writeStderr: (msg) => stderr.push(msg),
    });

    expect(result.exitCode).toBe(1);
    expect(stderr.join("")).toContain("release setup marker contains malformed JSON");
  });
});
