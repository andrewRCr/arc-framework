/**
 * Unit tests for git-config-backed config override resolution.
 */

import { describe, expect, it, vi } from "vitest";
import { resolveGitConfigOverride } from "../../../src/lib/config/resolve-override.js";

const VALID_VALUES = ["always", "prompt", "manual"] as const;
type TestPolicy = (typeof VALID_VALUES)[number];

function isValidTestPolicy(value: string): value is TestPolicy {
  return (VALID_VALUES as readonly string[]).includes(value);
}

function gitExecWithOverride(value: string | undefined) {
  return vi.fn().mockImplementation((cmd: string, args: string[]) => {
    if (cmd === "git" && args[0] === "config" && args[1] === "--get" && args[2] === "arc.testPolicy") {
      if (value === undefined) return Promise.reject(new Error("exit 1"));
      return Promise.resolve({ stdout: `${value}\n` });
    }
    return Promise.reject(new Error(`unexpected call: ${cmd} ${args.join(" ")}`));
  });
}

function readFileWithYaml(yamlContent: string | undefined) {
  return vi.fn().mockImplementation((path: string) => {
    if (path.endsWith("arc-config.yml")) {
      if (yamlContent === undefined) return Promise.reject(new Error("ENOENT"));
      return Promise.resolve(yamlContent);
    }
    return Promise.reject(new Error(`unexpected readFile: ${path}`));
  });
}

function resolveTestPolicy(opts: {
  gitConfigValue?: string;
  yamlContent?: string;
  warn?: (message: string) => void;
}) {
  return resolveGitConfigOverride<TestPolicy>({
    exec: gitExecWithOverride(opts.gitConfigValue),
    readFile: readFileWithYaml(opts.yamlContent),
    cwd: "/fake/repo",
    gitConfigKey: "arc.testPolicy",
    yamlKey: "test.policy",
    defaultValue: "always",
    isValidValue: isValidTestPolicy,
    validValues: VALID_VALUES,
    warn: opts.warn,
  });
}

describe("resolveGitConfigOverride", () => {
  it("returns a valid git-config override with source metadata", async () => {
    await expect(
      resolveTestPolicy({
        gitConfigValue: "manual",
        yamlContent: "test.policy: prompt\n",
      }),
    ).resolves.toEqual({ value: "manual", source: "git-config" });
  });

  it("falls through to yaml when git-config is unset", async () => {
    await expect(
      resolveTestPolicy({
        yamlContent: "test.policy: prompt\n",
      }),
    ).resolves.toEqual({ value: "prompt", source: "yaml" });
  });

  it("falls through to default when git-config and yaml are unset", async () => {
    await expect(resolveTestPolicy({})).resolves.toEqual({
      value: "always",
      source: "default",
    });
  });

  it("warns and falls through from invalid git-config values", async () => {
    const warn = vi.fn();

    await expect(
      resolveTestPolicy({
        gitConfigValue: "invalid",
        yamlContent: "test.policy: manual\n",
        warn,
      }),
    ).resolves.toEqual({ value: "manual", source: "yaml" });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain("invalid");
    expect(warn.mock.calls[0]?.[0]).toContain("arc.testPolicy");
  });

  it("warns and falls through from invalid yaml values", async () => {
    const warn = vi.fn();

    await expect(
      resolveTestPolicy({
        yamlContent: "test.policy: invalid\n",
        warn,
      }),
    ).resolves.toEqual({ value: "always", source: "default" });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain("invalid");
    expect(warn.mock.calls[0]?.[0]).toContain("test.policy");
  });

  it("treats empty configured values as unset", async () => {
    await expect(
      resolveTestPolicy({
        gitConfigValue: "",
        yamlContent: "test.policy: ''\n",
      }),
    ).resolves.toEqual({ value: "always", source: "default" });
  });
});
