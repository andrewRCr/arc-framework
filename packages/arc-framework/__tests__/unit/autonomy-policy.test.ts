/**
 * Unit tests for autonomy policy resolution.
 *
 * Covers precedence (git-config → yaml → default), invalid-value fall-through,
 * and missing-yaml degradation. Mirrors the shape of `sync-policy.test.ts`.
 */

import { describe, it, expect, vi } from "vitest";
import {
  resolveAutonomyPolicy,
  DEFAULT_AUTONOMY_POLICY,
  AUTONOMY_GIT_CONFIG_KEY,
  AUTONOMY_YAML_KEY,
} from "../../src/lib/autonomy-policy.js";

// --- Helpers ---

/** Build a mock git exec that returns the given value for `git config --get arc.autonomy`. */
function gitExecWithOverride(value: string | undefined) {
  return vi.fn().mockImplementation((cmd: string, args: string[]) => {
    if (cmd === "git" && args[0] === "config" && args[1] === "--get" && args[2] === AUTONOMY_GIT_CONFIG_KEY) {
      if (value === undefined) return Promise.reject(new Error("exit 1"));
      return Promise.resolve({ stdout: `${value}\n` });
    }
    return Promise.reject(new Error(`unexpected call: ${cmd} ${args.join(" ")}`));
  });
}

/** Build a readFile that returns yaml content for `arc-config.yml`, or throws ENOENT. */
function readFileWithYaml(yamlContent: string | undefined) {
  return vi.fn().mockImplementation((path: string) => {
    if (path.endsWith("arc-config.yml")) {
      if (yamlContent === undefined) return Promise.reject(new Error("ENOENT"));
      return Promise.resolve(yamlContent);
    }
    return Promise.reject(new Error(`unexpected readFile: ${path}`));
  });
}

// --- Tests ---

describe("resolveAutonomyPolicy", () => {
  const cwd = "/fake/repo";

  describe("default (both sources absent)", () => {
    it(`returns "${DEFAULT_AUTONOMY_POLICY}" when both sources are unset`, async () => {
      const exec = gitExecWithOverride(undefined);
      const readFile = readFileWithYaml(undefined);
      const result = await resolveAutonomyPolicy({ exec, readFile, cwd });
      expect(result).toEqual({ policy: DEFAULT_AUTONOMY_POLICY, source: "default" });
    });
  });

  describe("yaml (git-config absent)", () => {
    for (const policy of ["manual-commit", "auto-commit", "auto-push"] as const) {
      it(`returns "${policy}" from yaml when git-config override is unset`, async () => {
        const exec = gitExecWithOverride(undefined);
        const readFile = readFileWithYaml(`${AUTONOMY_YAML_KEY}: ${policy}\n`);
        const result = await resolveAutonomyPolicy({ exec, readFile, cwd });
        expect(result).toEqual({ policy, source: "yaml" });
      });
    }
  });

  describe("git-config override (highest precedence)", () => {
    it("override wins over a different valid yaml value", async () => {
      const exec = gitExecWithOverride("auto-push");
      const readFile = readFileWithYaml(`${AUTONOMY_YAML_KEY}: manual-commit\n`);
      const result = await resolveAutonomyPolicy({ exec, readFile, cwd });
      expect(result).toEqual({ policy: "auto-push", source: "git-config" });
    });

    for (const policy of ["manual-commit", "auto-commit", "auto-push"] as const) {
      it(`returns "${policy}" when git-config override is set to "${policy}"`, async () => {
        const exec = gitExecWithOverride(policy);
        const readFile = readFileWithYaml(`${AUTONOMY_YAML_KEY}: manual-commit\n`);
        const result = await resolveAutonomyPolicy({ exec, readFile, cwd });
        expect(result).toEqual({ policy, source: "git-config" });
      });
    }
  });

  describe("invalid git-config override", () => {
    it("falls through to yaml when override is invalid, and warns", async () => {
      const exec = gitExecWithOverride("bogus");
      const readFile = readFileWithYaml(`${AUTONOMY_YAML_KEY}: auto-commit\n`);
      const warn = vi.fn();
      const result = await resolveAutonomyPolicy({ exec, readFile, cwd, warn });
      expect(result).toEqual({ policy: "auto-commit", source: "yaml" });
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0]?.[0]).toContain("bogus");
      expect(warn.mock.calls[0]?.[0]).toContain(AUTONOMY_GIT_CONFIG_KEY);
    });

    it("falls through to yaml when override is an empty string (treated as unset)", async () => {
      const exec = gitExecWithOverride("");
      const readFile = readFileWithYaml(`${AUTONOMY_YAML_KEY}: auto-push\n`);
      const result = await resolveAutonomyPolicy({ exec, readFile, cwd });
      expect(result).toEqual({ policy: "auto-push", source: "yaml" });
    });
  });

  describe("invalid yaml value", () => {
    it("falls through to default when yaml value is invalid, and warns", async () => {
      const exec = gitExecWithOverride(undefined);
      const readFile = readFileWithYaml(`${AUTONOMY_YAML_KEY}: autocommit\n`);
      const warn = vi.fn();
      const result = await resolveAutonomyPolicy({ exec, readFile, cwd, warn });
      expect(result).toEqual({ policy: DEFAULT_AUTONOMY_POLICY, source: "default" });
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0]?.[0]).toContain("autocommit");
      expect(warn.mock.calls[0]?.[0]).toContain(AUTONOMY_YAML_KEY);
    });

    it("falls through to default when arc-config.yml is missing (silent)", async () => {
      const exec = gitExecWithOverride(undefined);
      const readFile = readFileWithYaml(undefined);
      const warn = vi.fn();
      const result = await resolveAutonomyPolicy({ exec, readFile, cwd, warn });
      expect(result).toEqual({ policy: DEFAULT_AUTONOMY_POLICY, source: "default" });
      expect(warn).not.toHaveBeenCalled();
    });

    it("falls through to default when yaml exists but has no autonomy key", async () => {
      const exec = gitExecWithOverride(undefined);
      const readFile = readFileWithYaml("branch.base: main\n");
      const result = await resolveAutonomyPolicy({ exec, readFile, cwd });
      expect(result).toEqual({ policy: DEFAULT_AUTONOMY_POLICY, source: "default" });
    });
  });

  describe("both invalid", () => {
    it("warns at each tier and falls back to default", async () => {
      const exec = gitExecWithOverride("garbage");
      const readFile = readFileWithYaml(`${AUTONOMY_YAML_KEY}: alsowrong\n`);
      const warn = vi.fn();
      const result = await resolveAutonomyPolicy({ exec, readFile, cwd, warn });
      expect(result).toEqual({ policy: DEFAULT_AUTONOMY_POLICY, source: "default" });
      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn.mock.calls[0]?.[0]).toContain("garbage");
      expect(warn.mock.calls[0]?.[0]).toContain(AUTONOMY_GIT_CONFIG_KEY);
      expect(warn.mock.calls[1]?.[0]).toContain("alsowrong");
      expect(warn.mock.calls[1]?.[0]).toContain(AUTONOMY_YAML_KEY);
    });
  });

  describe("warn defaulting", () => {
    it("does not throw when warn is omitted and invalid values are present", async () => {
      const exec = gitExecWithOverride("garbage");
      const readFile = readFileWithYaml(`${AUTONOMY_YAML_KEY}: alsowrong\n`);
      await expect(
        resolveAutonomyPolicy({ exec, readFile, cwd }),
      ).resolves.toEqual({ policy: DEFAULT_AUTONOMY_POLICY, source: "default" });
    });
  });
});
