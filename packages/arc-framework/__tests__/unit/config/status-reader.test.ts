/**
 * Unit tests for the arc-config settings reader.
 *
 * Covers defaults application, missing-file handling, hooks.* exclusion,
 * and round-tripping of user-supplied values — the behaviors the probe and
 * future composite consumer depend on.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  AGENT_CONSUMABLE_KEYS,
  readConfigSettings,
} from "../../../src/lib/config/status-reader.js";

interface Fixture {
  root: string;
  configPath: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "arc-config-reader-"));
  const configDir = join(root, ".arc", "system");
  await mkdir(configDir, { recursive: true });
  return { root, configPath: join(configDir, "arc-config.yml") };
}

describe("readConfigSettings — AGENT_CONSUMABLE_KEYS", () => {
  it("enumerates the 15 agent-consumable keys", () => {
    expect(AGENT_CONSUMABLE_KEYS).toHaveLength(15);
  });

  it("excludes all hooks.* keys", () => {
    for (const key of AGENT_CONSUMABLE_KEYS) {
      expect(key.startsWith("hooks.")).toBe(false);
    }
  });

  it("includes the session.init_pull.* channel keys", () => {
    expect(AGENT_CONSUMABLE_KEYS).toContain("session.init_pull.worktree");
    expect(AGENT_CONSUMABLE_KEYS).toContain("session.init_pull.notes");
  });
});

describe("readConfigSettings — default fallback", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("returns documented defaults when arc-config.yml is missing", async () => {
    const result = await readConfigSettings(fixture.root);
    expect(result.settings["pm.mode"]).toBe("none");
    expect(result.settings["branch.base"]).toBe("main");
    expect(result.settings["branch.protection"]).toBe("partial");
    expect(result.settings["commit.format"]).toBe("conventional");
    expect(result.settings["commit.context_footer"]).toBe("required");
    expect(result.settings["merge.strategy"]).toBe("merge");
    expect(result.settings["review.pre_merge"]).toBe("enabled");
    expect(result.settings["platform.type"]).toBe("github");
    expect(result.settings["team.mode"]).toBe("false");
    expect(result.settings["session.remote_sync"]).toBe("enabled");
    expect(result.settings["user.sync_push"]).toBe("always");
  });

  it("reports every key as defaulted when the file is missing", async () => {
    const result = await readConfigSettings(fixture.root);
    expect(result.defaultsApplied).toHaveLength(AGENT_CONSUMABLE_KEYS.length);
    for (const key of AGENT_CONSUMABLE_KEYS) {
      expect(result.defaultsApplied).toContain(key);
    }
  });

  it("surfaces the missing-file error in the errors array", async () => {
    const result = await readConfigSettings(fixture.root);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("arc-config.yml");
  });
});

describe("readConfigSettings — user-supplied values", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("returns on-disk values when all keys are present", async () => {
    const content = [
      "branch.base: develop",
      "branch.protection: full",
      "commit.format: custom",
      "commit.context_footer: disabled",
      "commit.custom_pattern: ^FOO-.+",
      "commit.context_pattern: ^Relates to",
      "merge.strategy: rebase",
      "review.pre_merge: disabled",
      "platform.type: gitlab",
      "pm.mode: arc-in-git",
      "team.mode: true",
      "session.remote_sync: disabled",
      "session.init_pull.worktree: manual",
      "session.init_pull.notes: always",
      "user.sync_push: manual",
    ].join("\n");
    await writeFile(fixture.configPath, content);

    const result = await readConfigSettings(fixture.root);
    expect(result.settings["branch.base"]).toBe("develop");
    expect(result.settings["commit.format"]).toBe("custom");
    expect(result.settings["pm.mode"]).toBe("arc-in-git");
    expect(result.settings["user.sync_push"]).toBe("manual");
    expect(result.settings["session.init_pull.worktree"]).toBe("manual");
    expect(result.settings["session.init_pull.notes"]).toBe("always");
    expect(result.defaultsApplied).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("mixes on-disk values with defaults for absent keys", async () => {
    await writeFile(
      fixture.configPath,
      ["pm.mode: arc-in-git", "branch.protection: full"].join("\n"),
    );
    const result = await readConfigSettings(fixture.root);
    expect(result.settings["pm.mode"]).toBe("arc-in-git");
    expect(result.settings["branch.protection"]).toBe("full");
    expect(result.settings["branch.base"]).toBe("main");
    expect(result.defaultsApplied).not.toContain("pm.mode");
    expect(result.defaultsApplied).not.toContain("branch.protection");
    expect(result.defaultsApplied).toContain("branch.base");
    expect(result.defaultsApplied).toContain("commit.format");
  });

  it("ignores hooks.* keys in the on-disk file", async () => {
    const content = [
      "pm.mode: arc-in-git",
      "hooks.pre_commit: disabled",
      "hooks.commit_msg: disabled",
      "hooks.task_numbering: off",
    ].join("\n");
    await writeFile(fixture.configPath, content);

    const result = await readConfigSettings(fixture.root);
    const keys = Object.keys(result.settings) as string[];
    for (const key of keys) {
      expect(key.startsWith("hooks.")).toBe(false);
    }
    expect(result.settings["pm.mode"]).toBe("arc-in-git");
  });
});

describe("readConfigSettings — session.init_pull channels", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("applies 'prompt' default for both keys when both are absent (file present)", async () => {
    await writeFile(fixture.configPath, "pm.mode: arc-in-git\n");
    const result = await readConfigSettings(fixture.root);
    expect(result.settings["session.init_pull.worktree"]).toBe("prompt");
    expect(result.settings["session.init_pull.notes"]).toBe("prompt");
    expect(result.defaultsApplied).toContain("session.init_pull.worktree");
    expect(result.defaultsApplied).toContain("session.init_pull.notes");
    expect(result.errors).toHaveLength(0);
  });

  it("accepts manual | prompt | always for notes", async () => {
    for (const value of ["manual", "prompt", "always"]) {
      await writeFile(fixture.configPath, `session.init_pull.notes: ${value}\n`);
      const result = await readConfigSettings(fixture.root);
      expect(result.settings["session.init_pull.notes"]).toBe(value);
      expect(result.errors).toHaveLength(0);
    }
  });

  it("accepts manual | prompt for worktree", async () => {
    for (const value of ["manual", "prompt"]) {
      await writeFile(fixture.configPath, `session.init_pull.worktree: ${value}\n`);
      const result = await readConfigSettings(fixture.root);
      expect(result.settings["session.init_pull.worktree"]).toBe(value);
      expect(result.errors).toHaveLength(0);
    }
  });

  it("rejects 'always' for worktree with an error naming the valid set", async () => {
    await writeFile(fixture.configPath, "session.init_pull.worktree: always\n");
    const result = await readConfigSettings(fixture.root);
    expect(result.settings["session.init_pull.worktree"]).toBe("prompt");
    expect(result.errors).toHaveLength(1);
    const message = result.errors[0] ?? "";
    expect(message).toContain("session.init_pull.worktree");
    expect(message).toContain("'always'");
    expect(message).toContain("manual");
    expect(message).toContain("prompt");
  });

  it("rejects unknown values for worktree with an error naming the valid set", async () => {
    await writeFile(fixture.configPath, "session.init_pull.worktree: bogus\n");
    const result = await readConfigSettings(fixture.root);
    expect(result.settings["session.init_pull.worktree"]).toBe("prompt");
    expect(result.errors).toHaveLength(1);
    const message = result.errors[0] ?? "";
    expect(message).toContain("session.init_pull.worktree");
    expect(message).toContain("'bogus'");
    expect(message).toContain("manual");
    expect(message).toContain("prompt");
    expect(message).not.toContain("always");
  });

  it("rejects unknown values for notes with an error naming the valid set", async () => {
    await writeFile(fixture.configPath, "session.init_pull.notes: bogus\n");
    const result = await readConfigSettings(fixture.root);
    expect(result.settings["session.init_pull.notes"]).toBe("prompt");
    expect(result.errors).toHaveLength(1);
    const message = result.errors[0] ?? "";
    expect(message).toContain("session.init_pull.notes");
    expect(message).toContain("'bogus'");
    expect(message).toContain("manual");
    expect(message).toContain("prompt");
    expect(message).toContain("always");
  });

  it("fills only the missing key with 'prompt' on partial config", async () => {
    await writeFile(fixture.configPath, "session.init_pull.worktree: manual\n");
    const result = await readConfigSettings(fixture.root);
    expect(result.settings["session.init_pull.worktree"]).toBe("manual");
    expect(result.settings["session.init_pull.notes"]).toBe("prompt");
    expect(result.defaultsApplied).not.toContain("session.init_pull.worktree");
    expect(result.defaultsApplied).toContain("session.init_pull.notes");
    expect(result.errors).toHaveLength(0);
  });

  it("parses pre-existing arc-config.yml without the new keys cleanly", async () => {
    const legacyContent = [
      "branch.base: main",
      "branch.protection: full",
      "commit.format: conventional",
      "commit.context_footer: required",
      "merge.strategy: merge",
      "review.pre_merge: enabled",
      "platform.type: github",
      "pm.mode: arc-in-git",
      "team.mode: false",
      "session.remote_sync: enabled",
      "user.sync_push: always",
    ].join("\n");
    await writeFile(fixture.configPath, legacyContent);
    const result = await readConfigSettings(fixture.root);
    expect(result.errors).toHaveLength(0);
    expect(result.settings["session.init_pull.worktree"]).toBe("prompt");
    expect(result.settings["session.init_pull.notes"]).toBe("prompt");
    expect(result.defaultsApplied).toContain("session.init_pull.worktree");
    expect(result.defaultsApplied).toContain("session.init_pull.notes");
    expect(result.defaultsApplied).not.toContain("pm.mode");
  });
});
