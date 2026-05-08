/**
 * Unit tests for `resolveAllSettings` — the 3-tier wrapper composing
 * `readConfigSettings` with per-key `resolveGitConfigOverride` calls.
 *
 * Covers the eight behaviors listed in the task spec, parameterized over
 * the four release-mode keys: git-config override per key, yaml fallback,
 * defaults, and warn-and-fall-through for invalid values at each tier.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, mkdtemp, readFile as nodeReadFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  resolveAllSettings,
  COMMIT_INTERLOCK_GIT_CONFIG_KEY,
  COMMIT_INTERLOCK_YAML_KEY,
  DEFAULT_COMMIT_INTERLOCK,
  PUSH_INTERLOCK_GIT_CONFIG_KEY,
  PUSH_INTERLOCK_YAML_KEY,
  DEFAULT_PUSH_INTERLOCK,
  SYNC_INTERLOCK_GIT_CONFIG_KEY,
  SYNC_INTERLOCK_YAML_KEY,
  DEFAULT_SYNC_INTERLOCK,
  NOTES_PUSH_GIT_CONFIG_KEY,
  NOTES_PUSH_YAML_KEY,
  DEFAULT_NOTES_PUSH_POLICY,
  RELEASE_ENABLED_GIT_CONFIG_KEY,
  RELEASE_ENABLED_YAML_KEY,
  DEFAULT_RELEASE_ENABLED,
} from "../../../src/lib/config/resolved-settings.js";

interface Fixture {
  root: string;
  configPath: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "arc-resolved-settings-"));
  const configDir = join(root, ".arc", "system");
  await mkdir(configDir, { recursive: true });
  return { root, configPath: join(configDir, "arc-config.yml") };
}

const realReadFile = (path: string): Promise<string> => nodeReadFile(path, "utf8");

/** Build a mock exec that returns the given map of git-config values. */
function buildExec(overrides: Record<string, string | undefined>) {
  return vi.fn().mockImplementation((cmd: string, args: string[]) => {
    if (cmd === "git" && args[0] === "config" && args[1] === "--get") {
      const key = args[2];
      const value = key === undefined ? undefined : overrides[key];
      if (value === undefined) return Promise.reject(new Error("exit 1"));
      return Promise.resolve({ stdout: `${value}\n` });
    }
    return Promise.reject(new Error(`unexpected call: ${cmd} ${(args ?? []).join(" ")}`));
  });
}

type ResolvedKeyName =
  | "commitInterlock"
  | "pushInterlock"
  | "syncInterlock"
  | "notesPush"
  | "releaseEnabled";

interface KeyDescriptor {
  name: ResolvedKeyName;
  gitConfigKey: string;
  yamlKey: string;
  settingsKey:
    | "session.commit_interlock"
    | "session.push_interlock"
    | "session.sync_interlock"
    | "user.notes_push"
    | "release.enabled";
  defaultValue: string;
  /** Valid value distinct from the default (used as the override sample). */
  overrideValue: string;
  /** Valid value distinct from both default and overrideValue (used as the yaml sample). */
  yamlValue: string;
}

const KEY_DESCRIPTORS: KeyDescriptor[] = [
  {
    name: "commitInterlock",
    gitConfigKey: COMMIT_INTERLOCK_GIT_CONFIG_KEY,
    yamlKey: COMMIT_INTERLOCK_YAML_KEY,
    settingsKey: "session.commit_interlock",
    defaultValue: DEFAULT_COMMIT_INTERLOCK,
    overrideValue: "on-task-approval",
    yamlValue: "on-task-approval",
  },
  {
    name: "pushInterlock",
    gitConfigKey: PUSH_INTERLOCK_GIT_CONFIG_KEY,
    yamlKey: PUSH_INTERLOCK_YAML_KEY,
    settingsKey: "session.push_interlock",
    defaultValue: DEFAULT_PUSH_INTERLOCK,
    overrideValue: "on-sync",
    yamlValue: "on-sync",
  },
  {
    name: "syncInterlock",
    gitConfigKey: SYNC_INTERLOCK_GIT_CONFIG_KEY,
    yamlKey: SYNC_INTERLOCK_YAML_KEY,
    settingsKey: "session.sync_interlock",
    defaultValue: DEFAULT_SYNC_INTERLOCK,
    overrideValue: "manual",
    yamlValue: "manual",
  },
  {
    name: "notesPush",
    gitConfigKey: NOTES_PUSH_GIT_CONFIG_KEY,
    yamlKey: NOTES_PUSH_YAML_KEY,
    settingsKey: "user.notes_push",
    defaultValue: DEFAULT_NOTES_PUSH_POLICY,
    overrideValue: "manual",
    yamlValue: "prompt",
  },
  {
    name: "releaseEnabled",
    gitConfigKey: RELEASE_ENABLED_GIT_CONFIG_KEY,
    yamlKey: RELEASE_ENABLED_YAML_KEY,
    settingsKey: "release.enabled",
    defaultValue: DEFAULT_RELEASE_ENABLED,
    // Boolean-shaped key — only "true" distinguishes from the "false" default.
    // Per-tier discrimination relies on the `source` tag, not unique values.
    overrideValue: "true",
    yamlValue: "true",
  },
];

describe("resolveAllSettings — git-config override per key", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  for (const key of KEY_DESCRIPTORS) {
    it(`${key.name}: git-config set → resolved value, source "git-config"`, async () => {
      await writeFile(fixture.configPath, "pm.mode: arc-in-git\n");
      const exec = buildExec({ [key.gitConfigKey]: key.overrideValue });

      const result = await resolveAllSettings({
        cwd: fixture.root,
        exec,
        readFile: realReadFile,
      });

      expect(result.resolved[key.name].value).toBe(key.overrideValue);
      expect(result.resolved[key.name].source).toBe("git-config");
      expect(result.settings[key.settingsKey]).toBe(key.overrideValue);
    });
  }
});

describe("resolveAllSettings — fall-through, defaults, warnings", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  for (const key of KEY_DESCRIPTORS) {
    it(`${key.name}: git-config absent + yaml present → yaml, source "yaml"`, async () => {
      await writeFile(fixture.configPath, `${key.yamlKey}: ${key.yamlValue}\n`);
      const exec = buildExec({}); // no overrides

      const result = await resolveAllSettings({
        cwd: fixture.root,
        exec,
        readFile: realReadFile,
      });

      expect(result.resolved[key.name].value).toBe(key.yamlValue);
      expect(result.resolved[key.name].source).toBe("yaml");
      expect(result.settings[key.settingsKey]).toBe(key.yamlValue);
    });

    it(`${key.name}: git-config absent + yaml absent → default, source "default"`, async () => {
      await writeFile(fixture.configPath, "pm.mode: arc-in-git\n");
      const exec = buildExec({});

      const result = await resolveAllSettings({
        cwd: fixture.root,
        exec,
        readFile: realReadFile,
      });

      expect(result.resolved[key.name].value).toBe(key.defaultValue);
      expect(result.resolved[key.name].source).toBe("default");
      expect(result.settings[key.settingsKey]).toBe(key.defaultValue);
    });

    it(`${key.name}: invalid git-config → warns, falls through to yaml, source "yaml"`, async () => {
      await writeFile(fixture.configPath, `${key.yamlKey}: ${key.yamlValue}\n`);
      const exec = buildExec({ [key.gitConfigKey]: "garbage-value" });
      const warn = vi.fn();

      const result = await resolveAllSettings({
        cwd: fixture.root,
        exec,
        readFile: realReadFile,
        warn,
      });

      expect(result.resolved[key.name].value).toBe(key.yamlValue);
      expect(result.resolved[key.name].source).toBe("yaml");
      const matchingWarning = result.warnings.find(
        (m) => m.includes("garbage-value") && m.includes(key.gitConfigKey),
      );
      expect(matchingWarning).toBeDefined();
      expect(warn).toHaveBeenCalledWith(matchingWarning);
    });

    it(`${key.name}: invalid yaml → warns, falls through to default, source "default"`, async () => {
      await writeFile(fixture.configPath, `${key.yamlKey}: bogus-yaml\n`);
      const exec = buildExec({});
      const warn = vi.fn();

      const result = await resolveAllSettings({
        cwd: fixture.root,
        exec,
        readFile: realReadFile,
        warn,
      });

      expect(result.resolved[key.name].value).toBe(key.defaultValue);
      expect(result.resolved[key.name].source).toBe("default");
      const matchingWarning = result.warnings.find(
        (m) => m.includes("bogus-yaml") && m.includes(key.yamlKey),
      );
      expect(matchingWarning).toBeDefined();
      expect(warn).toHaveBeenCalledWith(matchingWarning);
    });
  }
});

describe("resolveAllSettings — composite behavior", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  it("passes through non-release-mode settings unchanged", async () => {
    await writeFile(
      fixture.configPath,
      [
        "pm.mode: arc-in-git",
        "branch.protection: full",
        "branch.base: develop",
      ].join("\n"),
    );
    const result = await resolveAllSettings({
      cwd: fixture.root,
      exec: buildExec({}),
      readFile: realReadFile,
    });

    expect(result.settings["pm.mode"]).toBe("arc-in-git");
    expect(result.settings["branch.protection"]).toBe("full");
    expect(result.settings["branch.base"]).toBe("develop");
  });

  it("git-config override does not appear in defaultsApplied (yaml-absence semantic preserved)", async () => {
    await writeFile(fixture.configPath, "pm.mode: arc-in-git\n");
    const result = await resolveAllSettings({
      cwd: fixture.root,
      exec: buildExec({ [COMMIT_INTERLOCK_GIT_CONFIG_KEY]: "on-task-approval" }),
      readFile: realReadFile,
    });

    expect(result.defaultsApplied).toContain("session.commit_interlock");
    expect(result.resolved.commitInterlock.source).toBe("git-config");
  });

  it("releaseEnabled: yaml-absence defaultsApplied semantic holds when git-config supplies the value", async () => {
    await writeFile(fixture.configPath, "pm.mode: arc-in-git\n");
    const result = await resolveAllSettings({
      cwd: fixture.root,
      exec: buildExec({ [RELEASE_ENABLED_GIT_CONFIG_KEY]: "true" }),
      readFile: realReadFile,
    });

    expect(result.defaultsApplied).toContain("release.enabled");
    expect(result.resolved.releaseEnabled.source).toBe("git-config");
    expect(result.resolved.releaseEnabled.value).toBe("true");
  });

  it("does not throw when warn is omitted and invalid values are present at every tier", async () => {
    await writeFile(fixture.configPath, `${COMMIT_INTERLOCK_YAML_KEY}: garbage\n`);
    await expect(
      resolveAllSettings({
        cwd: fixture.root,
        exec: buildExec({ [COMMIT_INTERLOCK_GIT_CONFIG_KEY]: "also-garbage" }),
        readFile: realReadFile,
      }),
    ).resolves.toMatchObject({
      resolved: {
        commitInterlock: { value: DEFAULT_COMMIT_INTERLOCK, source: "default" },
      },
    });
  });

  it("preserves yaml-read warnings from readConfigSettings (missing arc-config.yml)", async () => {
    // No file written — yaml read fails.
    const warn = vi.fn();
    const result = await resolveAllSettings({
      cwd: fixture.root,
      exec: buildExec({}),
      readFile: realReadFile,
      warn,
    });

    expect(result.warnings.some((m) => m.includes("arc-config.yml"))).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("arc-config.yml"));
  });
});

describe("resolveAllSettings — on-workflow value extension", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  const ON_WORKFLOW_KEYS: Array<{
    name: ResolvedKeyName;
    gitConfigKey: string;
    settingsKey:
      | "session.commit_interlock"
      | "session.push_interlock"
      | "session.sync_interlock";
  }> = [
    {
      name: "commitInterlock",
      gitConfigKey: COMMIT_INTERLOCK_GIT_CONFIG_KEY,
      settingsKey: "session.commit_interlock",
    },
    {
      name: "pushInterlock",
      gitConfigKey: PUSH_INTERLOCK_GIT_CONFIG_KEY,
      settingsKey: "session.push_interlock",
    },
    {
      name: "syncInterlock",
      gitConfigKey: SYNC_INTERLOCK_GIT_CONFIG_KEY,
      settingsKey: "session.sync_interlock",
    },
  ];

  for (const key of ON_WORKFLOW_KEYS) {
    it(`${key.name}: on-workflow as git-config override resolves`, async () => {
      await writeFile(fixture.configPath, "pm.mode: arc-in-git\n");
      const exec = buildExec({ [key.gitConfigKey]: "on-workflow" });

      const result = await resolveAllSettings({
        cwd: fixture.root,
        exec,
        readFile: realReadFile,
      });

      expect(result.resolved[key.name].value).toBe("on-workflow");
      expect(result.resolved[key.name].source).toBe("git-config");
      expect(result.settings[key.settingsKey]).toBe("on-workflow");
    });
  }
});
