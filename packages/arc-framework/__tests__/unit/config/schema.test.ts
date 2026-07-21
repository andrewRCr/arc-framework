import { z } from "zod";
import { describe, expect, it } from "vitest";

import {
  ArcConfigSchema,
  ARC_CONFIG_FIELDS,
  ConfigSettingsSchema,
  HarnessDirectorySchema,
  RawArcConfigSchema,
} from "../../../src/lib/config/schema.js";

function field(key: string) {
  const descriptor = ARC_CONFIG_FIELDS.find((candidate) => candidate.key === key);
  if (descriptor === undefined) throw new Error(`missing config field: ${key}`);
  return descriptor;
}

describe("ARC config field catalog", () => {
  it("accepts every enum and boolean token while rejecting neighboring values", () => {
    const domains: Record<string, readonly string[]> = {
      "branch.protection": ["partial", "full"],
      "commit.format": ["conventional", "custom", "any"],
      "commit.context_footer": ["required", "recommended", "custom", "disabled"],
      "merge.strategy": ["merge", "rebase", "squash"],
      "hooks.pre_commit": ["enabled", "disabled"],
      "hooks.commit_msg": ["enabled", "disabled"],
      "hooks.pre_push": ["enabled", "disabled"],
      "hooks.task_numbering": ["error", "warning", "off"],
      "review.pre_merge": ["enabled", "disabled"],
      "platform.type": ["github", "gitlab", "bitbucket", "azure-devops"],
      "pm.mode": ["none", "arc-in-git", "external"],
      "team.mode": ["false", "true"],
      "session.remote_sync": ["enabled", "disabled"],
      "session.init_pull.worktree": ["manual", "prompt"],
      "session.init_pull.notes": ["manual", "prompt", "always"],
      "session.init_pull.base": ["manual", "prompt", "always"],
      "session.init_load.notes": ["manual", "prompt", "always"],
      "user.notes_push": ["manual", "prompt", "on-sync"],
      "sync.auto_pull": ["false", "true"],
      "archive.cadence": ["with-integration", "manual"],
    };

    for (const [key, values] of Object.entries(domains)) {
      for (const value of values) expect(field(key).schema.safeParse(value).success, `${key}: ${value}`).toBe(true);
      expect(field(key).schema.safeParse("neighboring-value").success, key).toBe(false);
    }
  });

  it("accepts exact positive safe-integer domains, including compatible leading zeros", () => {
    const minima: Record<string, number> = {
      "hooks.subject_max_length": 10,
      "hooks.body_max_lines": 1,
      "hooks.body_max_line_length": 1,
      "inbox.remind_after_days": 1,
      "integration.stale_after_days": 1,
    };

    for (const [key, minimum] of Object.entries(minima)) {
      const schema = field(key).schema;
      for (const value of [String(minimum), `000${String(minimum)}`, String(Number.MAX_SAFE_INTEGER)]) {
        expect(schema.safeParse(value).success, `${key}: ${value}`).toBe(true);
      }
      for (const value of ["", "+1", "-1", "1.0", "0x10", String(minimum - 1), "9007199254740992"]) {
        expect(schema.safeParse(value).success, `${key}: ${value}`).toBe(false);
      }
    }
  });

  it("preserves open string and harness-directory domains without compiling pattern contents", () => {
    const openValues: Record<string, readonly string[]> = {
      "branch.base": ["main", "feature/topic", "not a validated git ref"],
      "worktree.location_template": ["../{repo}.{name}", "{branch}", "literal path"],
      "worktree.post_create": ["", "npm run setup && echo ready"],
      "worktree.harness_dirs": ["", ".claude, .codex", "adapter-validates-this-later"],
      "commit.custom_pattern": ["", "[", "(?<name>.+)"],
      "commit.context_pattern": ["", "[", "^Context:"],
      "hooks.skip_extensions": ["", "[", "md|txt"],
      "hooks.test_patterns": ["", "[", "__tests__/"],
      "hooks.strict_meta_ref_patterns": ["", "[", "PRD R[0-9]+"],
      "hooks.meta_ref_patterns": ["", "[", "[Tt]ask"],
      "hooks.contributor_protected_paths": ["", "[", "active/|backlog/"],
    };

    for (const [key, values] of Object.entries(openValues)) {
      for (const value of values) expect(field(key).schema.safeParse(value).success, `${key}: ${value}`).toBe(true);
    }
    expect(field("worktree.location_template").schema.safeParse("").success).toBe(false);

    for (const value of [".claude", "custom-harness", "name with spaces"]) {
      expect(HarnessDirectorySchema.safeParse(value).success, value).toBe(true);
    }
    for (const value of ["", ".", "..", ".git", ".ARC", "nested/name", "nested\\name"]) {
      expect(HarnessDirectorySchema.safeParse(value).success, value).toBe(false);
    }
  });

  it("classifies quoted-empty values per key and rejects them for invalid leaves", () => {
    const unset = new Set([
      "worktree.post_create",
      "worktree.harness_dirs",
      "commit.custom_pattern",
      "commit.context_pattern",
      "hooks.skip_extensions",
      "hooks.test_patterns",
      "hooks.strict_meta_ref_patterns",
      "hooks.meta_ref_patterns",
      "hooks.contributor_protected_paths",
    ]);
    const invalid = new Set([
      "worktree.location_template",
      "hooks.subject_max_length",
      "hooks.body_max_lines",
      "hooks.body_max_line_length",
      "inbox.remind_after_days",
      "integration.stale_after_days",
    ]);

    for (const descriptor of ARC_CONFIG_FIELDS) {
      const expected = invalid.has(descriptor.key) ? "invalid" : unset.has(descriptor.key) ? "unset" : "default";
      expect(descriptor.quotedEmpty, descriptor.key).toBe(expected);
      expect(descriptor.schema.safeParse("").success, descriptor.key).toBe(expected !== "invalid");
    }
  });

  it("declares every active key and documented omission default exactly once", () => {
    const expected = [
      ["branch.base", "main"],
      ["branch.protection", "partial"],
      ["worktree.location_template", "../{repo}.{name}"],
      ["worktree.post_create", ""],
      ["worktree.harness_dirs", ".claude,.codex,.gemini,.opencode"],
      ["commit.format", "conventional"],
      ["commit.context_footer", "required"],
      ["commit.custom_pattern", ""],
      ["commit.context_pattern", ""],
      ["merge.strategy", "merge"],
      ["hooks.pre_commit", "enabled"],
      ["hooks.commit_msg", "enabled"],
      ["hooks.pre_push", "enabled"],
      ["hooks.task_numbering", "error"],
      ["hooks.skip_extensions", "md|yml|yaml|json|toml|txt|csv|lock|conf|cfg|ini|env|license|makefile"],
      ["hooks.test_patterns", "__tests__/|\\.test\\.|\\.spec\\.|/test/|/tests/"],
      ["hooks.strict_meta_ref_patterns", "PRD " + "R[0-9]+|\\b[RB][0-9]+\\b|" + "§" + " "],
      [
        "hooks.meta_ref_patterns",
        "[Tt]ask [0-9]+\\.[0-9]+|[Pp]hase [0-9]+|\\.arc/|"
          + "(tasks|plan|prd|status|notes|atomic)-[a-z][a-z0-9-]+\\.md",
      ],
      ["hooks.subject_max_length", "72"],
      ["hooks.body_max_lines", "100"],
      ["hooks.body_max_line_length", "100"],
      ["hooks.contributor_protected_paths", "active/|backlog/"],
      ["review.pre_merge", "enabled"],
      ["platform.type", "github"],
      ["pm.mode", "none"],
      ["team.mode", "false"],
      ["session.remote_sync", "enabled"],
      ["session.init_pull.worktree", "prompt"],
      ["session.init_pull.notes", "prompt"],
      ["session.init_pull.base", "prompt"],
      ["session.init_load.notes", "prompt"],
      ["user.notes_push", "on-sync"],
      ["sync.auto_pull", "false"],
      ["archive.cadence", "with-integration"],
      ["inbox.remind_after_days", "1"],
      ["integration.stale_after_days", "2"],
    ];

    expect(ARC_CONFIG_FIELDS.map(({ key, defaultValue }) => [key, defaultValue])).toEqual(expected);
    expect(new Set(ARC_CONFIG_FIELDS.map(({ key }) => key))).toHaveLength(ARC_CONFIG_FIELDS.length);
  });

  it("keeps every catalog leaf structurally projectable", () => {
    for (const descriptor of ARC_CONFIG_FIELDS) {
      expect(() => z.toJSONSchema(descriptor.schema), descriptor.key).not.toThrow();
    }
    expect(() => z.toJSONSchema(HarnessDirectorySchema)).not.toThrow();
  });
});

describe("ARC config record schemas", () => {
  it("accepts omission-as-default and every valid catalog domain", () => {
    expect(ArcConfigSchema.parse({})).toEqual({});
    const defaults = Object.fromEntries(
      ARC_CONFIG_FIELDS.map(({ key, defaultValue }) => [key, defaultValue]),
    );
    expect(ArcConfigSchema.parse(defaults)).toEqual(defaults);
    expect(RawArcConfigSchema.parse(defaults)).toEqual(defaults);

    const completed = Object.fromEntries(
      ARC_CONFIG_FIELDS
        .filter(({ key }) => !key.startsWith("hooks."))
        .map(({ key, defaultValue }) => [key, defaultValue]),
    );
    expect(ConfigSettingsSchema.parse(completed)).toEqual(completed);
  });

  it("accepts quoted empty only for default and unset fields", () => {
    for (const descriptor of ARC_CONFIG_FIELDS) {
      const result = ArcConfigSchema.safeParse({ [descriptor.key]: "" });
      expect(result.success, descriptor.key).toBe(descriptor.quotedEmpty !== "invalid");
    }
  });

  it("preserves matching unknown string keys and rejects names outside the authoring grammar", () => {
    const accepted = {
      future: "value",
      "future.key": "value",
      "future..key.": "value",
    };
    expect(ArcConfigSchema.parse(accepted)).toEqual(accepted);

    for (const key of ["Upper.key", "1future", "_future", "a", "future-key"]) {
      expect(ArcConfigSchema.safeParse({ [key]: "value" }).success, key).toBe(false);
    }
  });

  it("rejects invalid records while keeping the completed projection limited to string shape", () => {
    expect(ArcConfigSchema.safeParse({ "branch.protection": "sometimes" }).success).toBe(false);
    expect(ArcConfigSchema.safeParse({ future: 1 }).success).toBe(false);
    expect(RawArcConfigSchema.safeParse({ future: 1 }).success).toBe(false);

    const completed = Object.fromEntries(
      ARC_CONFIG_FIELDS
        .filter(({ key }) => !key.startsWith("hooks."))
        .map(({ key, defaultValue }) => [key, defaultValue]),
    );
    expect(ConfigSettingsSchema.safeParse({ ...completed, "branch.protection": "tolerated-raw" }).success).toBe(true);
    const incomplete = { ...completed };
    delete incomplete["branch.base"];
    expect(ConfigSettingsSchema.safeParse(incomplete).success).toBe(false);
    expect(ConfigSettingsSchema.safeParse({ ...completed, future: "value" }).success).toBe(false);
  });

  it("projects the authorable schema without transforms or refinements", () => {
    expect(() => z.toJSONSchema(ArcConfigSchema)).not.toThrow();
  });
});
