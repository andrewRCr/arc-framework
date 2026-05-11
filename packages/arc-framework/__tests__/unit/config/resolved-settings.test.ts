/**
 * Unit tests for `resolveAllSettings` — the resolver wrapper composing
 * `readConfigSettings` with per-key `resolveGitConfigOverride` calls.
 *
 * Covers two key categories:
 *
 * - Per-developer-only keys (`commitInterlock`, `pushInterlock`,
 *   `syncInterlock`, `releaseOptedIn`): `git config arc.* → default`. The
 *   yaml tier is not consulted — arbitrary yaml entries must not influence
 *   resolution.
 * - Dual-scope keys (`notesPush`): `git config arc.* → yaml → default`.
 *   The yaml tier carries the project-side default; git-config overrides
 *   personally.
 *
 * Plus composite behavior — settings pass-through, warning surfacing, and
 * yaml-read failure tolerance.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, mkdtemp, readFile as nodeReadFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  resolveAllSettings,
  COMMIT_INTERLOCK_GIT_CONFIG_KEY,
  DEFAULT_COMMIT_INTERLOCK,
  PUSH_INTERLOCK_GIT_CONFIG_KEY,
  DEFAULT_PUSH_INTERLOCK,
  SYNC_INTERLOCK_GIT_CONFIG_KEY,
  DEFAULT_SYNC_INTERLOCK,
  NOTES_PUSH_GIT_CONFIG_KEY,
  NOTES_PUSH_YAML_KEY,
  DEFAULT_NOTES_PUSH_POLICY,
  RELEASE_OPTED_IN_GIT_CONFIG_KEY,
  DEFAULT_RELEASE_OPTED_IN,
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

type PerDevKeyName = "commitInterlock" | "pushInterlock" | "syncInterlock" | "releaseOptedIn";

interface PerDevDescriptor {
  name: PerDevKeyName;
  gitConfigKey: string;
  defaultValue: string;
  /** Valid value distinct from the default (used as the override sample). */
  overrideValue: string;
  /**
   * A yaml key whose presence must not influence resolution of this key.
   * Pairs the dotted-yaml name with a value that would change resolution
   * if the resolver mistakenly read yaml — the test asserts it does not.
   */
  ignoredYamlKey: string;
  /** Value written under `ignoredYamlKey`, distinct from the default. */
  ignoredYamlValue: string;
}

const PER_DEV_KEYS: PerDevDescriptor[] = [
  {
    name: "commitInterlock",
    gitConfigKey: COMMIT_INTERLOCK_GIT_CONFIG_KEY,
    defaultValue: DEFAULT_COMMIT_INTERLOCK,
    overrideValue: "on-task-approval",
    ignoredYamlKey: "session.commit_interlock",
    ignoredYamlValue: "on-workflow",
  },
  {
    name: "pushInterlock",
    gitConfigKey: PUSH_INTERLOCK_GIT_CONFIG_KEY,
    defaultValue: DEFAULT_PUSH_INTERLOCK,
    overrideValue: "on-sync",
    ignoredYamlKey: "session.push_interlock",
    ignoredYamlValue: "on-workflow",
  },
  {
    name: "syncInterlock",
    gitConfigKey: SYNC_INTERLOCK_GIT_CONFIG_KEY,
    defaultValue: DEFAULT_SYNC_INTERLOCK,
    overrideValue: "manual",
    ignoredYamlKey: "session.sync_interlock",
    ignoredYamlValue: "on-workflow",
  },
  {
    name: "releaseOptedIn",
    gitConfigKey: RELEASE_OPTED_IN_GIT_CONFIG_KEY,
    defaultValue: DEFAULT_RELEASE_OPTED_IN,
    // Boolean-shaped key — only "true" distinguishes from the "false" default.
    overrideValue: "true",
    ignoredYamlKey: "release.enabled",
    ignoredYamlValue: "true",
  },
];

interface DualScopeDescriptor {
  name: "notesPush";
  gitConfigKey: string;
  yamlKey: string;
  settingsKey: "user.notes_push";
  defaultValue: string;
  overrideValue: string;
  yamlValue: string;
}

const DUAL_SCOPE_KEYS: DualScopeDescriptor[] = [
  {
    name: "notesPush",
    gitConfigKey: NOTES_PUSH_GIT_CONFIG_KEY,
    yamlKey: NOTES_PUSH_YAML_KEY,
    settingsKey: "user.notes_push",
    defaultValue: DEFAULT_NOTES_PUSH_POLICY,
    overrideValue: "manual",
    yamlValue: "prompt",
  },
];

describe("resolveAllSettings — git-config override per key", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  for (const key of PER_DEV_KEYS) {
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
    });
  }

  for (const key of DUAL_SCOPE_KEYS) {
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

describe("resolveAllSettings — per-developer-only keys: yaml is not consulted", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  for (const key of PER_DEV_KEYS) {
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
    });

    it(`${key.name}: git-config absent + matching yaml entry present → default (yaml not read)`, async () => {
      await writeFile(
        fixture.configPath,
        `${key.ignoredYamlKey}: ${key.ignoredYamlValue}\n`,
      );
      const exec = buildExec({});

      const result = await resolveAllSettings({
        cwd: fixture.root,
        exec,
        readFile: realReadFile,
      });

      expect(result.resolved[key.name].value).toBe(key.defaultValue);
      expect(result.resolved[key.name].source).toBe("default");
    });

    it(`${key.name}: invalid git-config → warns, falls through to default`, async () => {
      await writeFile(fixture.configPath, "pm.mode: arc-in-git\n");
      const exec = buildExec({ [key.gitConfigKey]: "garbage-value" });
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
        (m) => m.includes("garbage-value") && m.includes(key.gitConfigKey),
      );
      expect(matchingWarning).toBeDefined();
      expect(warn).toHaveBeenCalledWith(matchingWarning);
    });
  }
});

describe("resolveAllSettings — dual-scope keys: yaml fallback applies", () => {
  let fixture: Fixture;
  beforeEach(async () => { fixture = await createFixture(); });
  afterEach(async () => { await rm(fixture.root, { recursive: true, force: true }); });

  for (const key of DUAL_SCOPE_KEYS) {
    it(`${key.name}: git-config absent + yaml present → yaml, source "yaml"`, async () => {
      await writeFile(fixture.configPath, `${key.yamlKey}: ${key.yamlValue}\n`);
      const exec = buildExec({});

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

    it(`${key.name}: invalid git-config → warns, falls through to yaml`, async () => {
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

    it(`${key.name}: invalid yaml → warns, falls through to default`, async () => {
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

  it("does not throw when warn is omitted and invalid values are present", async () => {
    await writeFile(fixture.configPath, "pm.mode: arc-in-git\n");
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
    name: PerDevKeyName;
    gitConfigKey: string;
  }> = [
    { name: "commitInterlock", gitConfigKey: COMMIT_INTERLOCK_GIT_CONFIG_KEY },
    { name: "pushInterlock", gitConfigKey: PUSH_INTERLOCK_GIT_CONFIG_KEY },
    { name: "syncInterlock", gitConfigKey: SYNC_INTERLOCK_GIT_CONFIG_KEY },
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
    });
  }
});
