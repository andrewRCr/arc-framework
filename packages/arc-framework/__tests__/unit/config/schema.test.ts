import { z } from "zod";
import { describe, expect, it } from "vitest";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../helpers/schema-assertion.js";

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
  it("does not retain the former review-owned threshold keys", () => {
    const keys = ARC_CONFIG_FIELDS.map(({ key }) => key);
    expect(keys).not.toContain("review.chunking_threshold_lines");
    expect(keys).not.toContain("review.chunking_threshold_files");
  });

  it("accepts every enum and boolean token while rejecting neighboring values", () => {
    const domains: Record<string, readonly string[]> = {
      "branch.protection": ["partial", "full"],
      "commit.format": ["conventional", "custom", "any"],
      "commit.context_footer": ["required", "recommended", "custom", "disabled"],
      "merge.strategy": ["merge", "rebase", "squash"],
      "merge.lock": ["draft", "none"],
      "hooks.pre_commit": ["enabled", "disabled"],
      "hooks.commit_msg": ["enabled", "disabled"],
      "hooks.pre_push": ["enabled", "disabled"],
      "hooks.task_numbering": ["error", "warning", "off"],
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
      for (const value of values) assertSchemaAccepts(field(key).schema, value);
      assertSchemaRefuses(field(key).schema, "neighboring-value");
    }
  });

  it("accepts exact positive safe-integer domains, including compatible leading zeros", () => {
    const minima: Record<string, number> = {
      "hooks.subject_max_length": 10,
      "hooks.body_max_lines": 1,
      "hooks.body_max_line_length": 1,
      "review.frontline_max_passes": 1,
      "review.standard_max_passes": 1,
      "review.hosted_await_attention_after_minutes": 1,
      "inbox.remind_after_days": 1,
      "integration.stale_after_days": 1,
    };

    for (const [key, minimum] of Object.entries(minima)) {
      const schema = field(key).schema;
      for (const value of [
        String(minimum),
        `000${String(minimum)}`,
        "9000000000000000",
        "9007199254740989",
        String(Number.MAX_SAFE_INTEGER),
      ]) {
        assertSchemaAccepts(schema, value);
      }
      for (const value of ["", "+1", "-1", "1.0", "0x10", String(minimum - 1), "9007199254740992"]) {
        assertSchemaRefuses(schema, value);
      }
    }
  });

  it("bounds hosted await call timing to the runtime timer contract", () => {
    const timeout = field("review.hosted_await_timeout_seconds").schema;
    const poll = field("review.hosted_await_initial_poll_interval_seconds").schema;
    assertSchemaAccepts(timeout, "1");
    assertSchemaAccepts(timeout, "1800");
    assertSchemaRefuses(timeout, "1801");
    assertSchemaAccepts(poll, "1");
    assertSchemaAccepts(poll, "60");
    assertSchemaRefuses(poll, "61");
  });

  it("accepts exact unsigned safe-integer domains, including all-zero strings", () => {
    for (const key of ["changeset.advisory_threshold_lines", "changeset.advisory_threshold_files"]) {
      const schema = field(key).schema;
      for (const value of [
        "0",
        "00",
        "0000",
        "1",
        "0001",
        "9000000000000000",
        "9007199254740989",
        String(Number.MAX_SAFE_INTEGER),
      ]) {
        assertSchemaAccepts(schema, value);
      }
      for (const value of ["", "+0", "-0", "1.0", "0x10", "9007199254740992"]) {
        assertSchemaRefuses(schema, value);
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
      for (const value of values) assertSchemaAccepts(field(key).schema, value);
    }
    assertSchemaRefuses(field("worktree.location_template").schema, "");

    for (const value of [".claude", "custom-harness", "name with spaces"]) {
      assertSchemaAccepts(HarnessDirectorySchema, value);
    }
    for (const value of ["", ".", "..", ".git", ".ARC", "nested/name", "nested\\name"]) {
      assertSchemaRefuses(HarnessDirectorySchema, value);
    }
  });

  it("owns the exact frontline and standard review-source authoring domains", () => {
    const frontline = field("review.frontline_sources").schema;
    for (const value of [
      "",
      "[]",
      "project-reviewer",
      "[coderabbit-cli, project-reviewer]",
      "[,project-reviewer,,]",
    ]) {
      assertSchemaAccepts(frontline, value);
    }
    for (const value of [
      "[project-reviewer",
      "project reviewer",
      "[coderabbit-pr]",
      "[codex-pr]",
      "[delegated-agent]",
    ]) {
      assertSchemaRefuses(frontline, value);
    }

    const standard = field("review.standard_sources").schema;
    for (const value of [
      "[]",
      "[coderabbit-pr]",
      "[coderabbit-pr, codex-pr, delegated-agent]",
      "[,codex-pr,,]",
    ]) {
      assertSchemaAccepts(standard, value);
    }
    for (const value of [
      "",
      "coderabbit-pr",
      "[project-reviewer]",
      "[codex-pr",
      "codex-pr]",
    ]) {
      assertSchemaRefuses(standard, value);
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
      "review.frontline_max_passes",
      "review.standard_max_passes",
      "review.hosted_await_timeout_seconds",
      "review.hosted_await_initial_poll_interval_seconds",
      "review.hosted_await_attention_after_minutes",
      "review.standard_sources",
      "changeset.advisory_threshold_lines",
      "changeset.advisory_threshold_files",
    ]);

    for (const descriptor of ARC_CONFIG_FIELDS) {
      const expected = invalid.has(descriptor.key) ? "invalid" : unset.has(descriptor.key) ? "unset" : "default";
      expect(descriptor.quotedEmpty, descriptor.key).toBe(expected);
      if (expected === "invalid") {
        assertSchemaRefuses(descriptor.schema, "");
      } else {
        assertSchemaAccepts(descriptor.schema, "");
      }
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
      ["merge.lock", "none"],
      ["hooks.pre_commit", "enabled"],
      ["hooks.commit_msg", "enabled"],
      ["hooks.pre_push", "enabled"],
      ["hooks.task_numbering", "error"],
      ["hooks.skip_extensions", "md|yml|yaml|json|toml|txt|csv|lock|conf|cfg|ini|env|license|makefile"],
      ["hooks.test_patterns", "__tests__/|\\.test\\.|\\.spec\\.|/test/|/tests/"],
      [
        "hooks.strict_meta_ref_patterns",
        "PRD " + "R[0-9]+|\\b[RB][0-9]+\\b|" + String.fromCodePoint(0xa7) + " ",
      ],
      [
        "hooks.meta_ref_patterns",
        "[Tt]ask [0-9]+\\.[0-9]+|[Pp]hase [0-9]+|\\.arc/|"
          + "(tasks|plan|prd|status|notes|atomic)-[a-z][a-z0-9-]+\\.md",
      ],
      ["hooks.subject_max_length", "72"],
      ["hooks.body_max_lines", "100"],
      ["hooks.body_max_line_length", "100"],
      ["hooks.contributor_protected_paths", "active/|backlog/"],
      ["platform.type", "github"],
      ["review.frontline_sources", "[]"],
      ["review.standard_sources", "[]"],
      ["review.frontline_max_passes", "2"],
      ["review.standard_max_passes", "2"],
      ["review.hosted_await_timeout_seconds", "120"],
      ["review.hosted_await_initial_poll_interval_seconds", "15"],
      ["review.hosted_await_attention_after_minutes", "15"],
      ["changeset.advisory_threshold_lines", "0"],
      ["changeset.advisory_threshold_files", "0"],
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
      if (descriptor.quotedEmpty === "invalid") {
        assertSchemaRefuses(ArcConfigSchema, { [descriptor.key]: "" });
      } else {
        assertSchemaAccepts(ArcConfigSchema, { [descriptor.key]: "" });
      }
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
      assertSchemaRefuses(ArcConfigSchema, { [key]: "value" });
    }
  });

  it("rejects invalid records while keeping the completed projection limited to string shape", () => {
    assertSchemaRefuses(ArcConfigSchema, { "branch.protection": "sometimes" });
    assertSchemaRefuses(ArcConfigSchema, { future: 1 });
    assertSchemaRefuses(RawArcConfigSchema, { future: 1 });

    const completed = Object.fromEntries(
      ARC_CONFIG_FIELDS
        .filter(({ key }) => !key.startsWith("hooks."))
        .map(({ key, defaultValue }) => [key, defaultValue]),
    );
    assertSchemaAccepts(ConfigSettingsSchema, { ...completed, "branch.protection": "tolerated-raw" });
    const incomplete = { ...completed };
    delete incomplete["branch.base"];
    assertSchemaRefuses(ConfigSettingsSchema, incomplete);
    assertSchemaRefuses(ConfigSettingsSchema, { ...completed, future: "value" });
  });

  it("projects the authorable schema without transforms or refinements", () => {
    expect(() => z.toJSONSchema(ArcConfigSchema)).not.toThrow();
  });
});
