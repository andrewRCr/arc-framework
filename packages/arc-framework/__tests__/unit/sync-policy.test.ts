/**
 * Unit tests for notes push policy resolution.
 *
 * Covers precedence (git-config → yaml → default), invalid-value fall-through,
 * and missing-yaml degradation.
 */

import { describe, it, expect, vi } from "vitest";
import {
  resolveNotesPushPolicy,
  DEFAULT_NOTES_PUSH_POLICY,
  NOTES_PUSH_GIT_CONFIG_KEY,
  NOTES_PUSH_YAML_KEY,
} from "../../src/lib/sync-policy.js";

// --- Helpers ---

/** Build a mock git exec that returns the given value for `git config --get arc.notesPush`. */
function gitExecWithOverride(value: string | undefined) {
  return vi.fn().mockImplementation((cmd: string, args: string[]) => {
    if (cmd === "git" && args[0] === "config" && args[1] === "--get" && args[2] === NOTES_PUSH_GIT_CONFIG_KEY) {
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

describe("resolveNotesPushPolicy", () => {
  const cwd = "/fake/repo";

  describe("git-config override (highest precedence)", () => {
    for (const policy of ["on-sync", "prompt", "manual"] as const) {
      it(`returns "${policy}" when git-config override is set to "${policy}"`, async () => {
        const exec = gitExecWithOverride(policy);
        const readFile = readFileWithYaml(`${NOTES_PUSH_YAML_KEY}: on-sync\n`);
        const result = await resolveNotesPushPolicy({ exec, readFile, cwd });
        expect(result).toEqual({ value: policy, source: "git-config" });
      });
    }

    it("override wins even when yaml has a different valid value", async () => {
      const exec = gitExecWithOverride("manual");
      const readFile = readFileWithYaml(`${NOTES_PUSH_YAML_KEY}: prompt\n`);
      const result = await resolveNotesPushPolicy({ exec, readFile, cwd });
      expect(result.value).toBe("manual");
      expect(result.source).toBe("git-config");
    });

    it("falls through to yaml when override is invalid, and warns", async () => {
      const exec = gitExecWithOverride("bogus");
      const readFile = readFileWithYaml(`${NOTES_PUSH_YAML_KEY}: prompt\n`);
      const warn = vi.fn();
      const result = await resolveNotesPushPolicy({ exec, readFile, cwd, warn });
      expect(result).toEqual({ value: "prompt", source: "yaml" });
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0]?.[0]).toContain("bogus");
      expect(warn.mock.calls[0]?.[0]).toContain(NOTES_PUSH_GIT_CONFIG_KEY);
    });

    it("falls through to yaml when override is an empty string (treated as unset)", async () => {
      const exec = gitExecWithOverride("");
      const readFile = readFileWithYaml(`${NOTES_PUSH_YAML_KEY}: manual\n`);
      const result = await resolveNotesPushPolicy({ exec, readFile, cwd });
      expect(result).toEqual({ value: "manual", source: "yaml" });
    });
  });

  describe("yaml (fallback from override)", () => {
    for (const policy of ["on-sync", "prompt", "manual"] as const) {
      it(`returns "${policy}" from yaml when override is unset`, async () => {
        const exec = gitExecWithOverride(undefined);
        const readFile = readFileWithYaml(`${NOTES_PUSH_YAML_KEY}: ${policy}\n`);
        const result = await resolveNotesPushPolicy({ exec, readFile, cwd });
        expect(result).toEqual({ value: policy, source: "yaml" });
      });
    }

    it("falls through to default when yaml value is invalid, and warns", async () => {
      const exec = gitExecWithOverride(undefined);
      const readFile = readFileWithYaml(`${NOTES_PUSH_YAML_KEY}: alwys\n`);
      const warn = vi.fn();
      const result = await resolveNotesPushPolicy({ exec, readFile, cwd, warn });
      expect(result).toEqual({ value: DEFAULT_NOTES_PUSH_POLICY, source: "default" });
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0]?.[0]).toContain("alwys");
      expect(warn.mock.calls[0]?.[0]).toContain(NOTES_PUSH_YAML_KEY);
    });

    it("falls through to default when arc-config.yml is missing (silent)", async () => {
      const exec = gitExecWithOverride(undefined);
      const readFile = readFileWithYaml(undefined);
      const warn = vi.fn();
      const result = await resolveNotesPushPolicy({ exec, readFile, cwd, warn });
      expect(result).toEqual({ value: DEFAULT_NOTES_PUSH_POLICY, source: "default" });
      expect(warn).not.toHaveBeenCalled();
    });

    it("falls through to default when yaml exists but has no notes_push key", async () => {
      const exec = gitExecWithOverride(undefined);
      const readFile = readFileWithYaml("branch.base: main\n");
      const result = await resolveNotesPushPolicy({ exec, readFile, cwd });
      expect(result).toEqual({ value: DEFAULT_NOTES_PUSH_POLICY, source: "default" });
    });
  });

  describe("default", () => {
    it(`returns "${DEFAULT_NOTES_PUSH_POLICY}" when both sources are unset`, async () => {
      const exec = gitExecWithOverride(undefined);
      const readFile = readFileWithYaml(undefined);
      const result = await resolveNotesPushPolicy({ exec, readFile, cwd });
      expect(result).toEqual({ value: DEFAULT_NOTES_PUSH_POLICY, source: "default" });
    });
  });

  describe("warn defaulting", () => {
    it("does not throw when warn is omitted and invalid values are present", async () => {
      const exec = gitExecWithOverride("garbage");
      const readFile = readFileWithYaml(`${NOTES_PUSH_YAML_KEY}: alsowrong\n`);
      await expect(
        resolveNotesPushPolicy({ exec, readFile, cwd }),
      ).resolves.toEqual({ value: DEFAULT_NOTES_PUSH_POLICY, source: "default" });
    });
  });
});
