/** Unit tests for side-effect-free ARC configuration validation. */

import { describe, expect, it, vi } from "vitest";

import { validateConfigFile } from "../../../../src/commands/config/validate.js";

describe("validateConfigFile", () => {
  it("reports an unreadable selected file as an error", async () => {
    const readFile = async (): Promise<string> => {
      throw new Error("ENOENT");
    };

    await expect(
      validateConfigFile({
        readPath: "/resolved/config.yml",
        displayPath: "selected.yml",
        readFile,
      }),
    ).resolves.toEqual({
      lines: [
        "ERROR Config file not found: selected.yml",
        "",
        "Summary: 0 passed, 0 warnings, 1 error",
      ],
      passes: 0,
      warnings: 0,
      errors: 1,
      exitCode: 2,
    });
  });

  it("preserves the empty-file pass ordering and counts", async () => {
    const result = await validateConfigFile({
      readPath: "/resolved/config.yml",
      displayPath: "selected.yml",
      readFile: vi.fn().mockResolvedValue(""),
    });

    expect(result.lines).toEqual([
      "PASS  Config file exists: selected.yml",
      "PASS  branch.base: [absent, default: main]",
      "PASS  branch.protection: [absent, default: partial]",
      "PASS  commit.format: [absent, default: conventional]",
      "PASS  commit.context_footer: [absent, default: required]",
      "PASS  hooks.pre_commit: [absent, default: enabled]",
      "PASS  hooks.commit_msg: [absent, default: enabled]",
      "PASS  hooks.pre_push: [absent, default: enabled]",
      "PASS  hooks.task_numbering: [absent, default: error]",
      "PASS  hooks.subject_max_length: 72",
      "PASS  hooks.body_max_lines: 100",
      "PASS  hooks.body_max_line_length: 100",
      "PASS  merge.strategy: [absent, default: merge]",
      "PASS  merge.lock: [absent, default: none]",
      "PASS  platform.type: [absent, default: github]",
      "PASS  review.frontline_max_passes: 2",
      "PASS  review.standard_max_passes: 2",
      "PASS  changeset.advisory_threshold_lines: 0",
      "PASS  changeset.advisory_threshold_files: 0",
      "PASS  pm.mode: [absent, default: none]",
      "PASS  team.mode: [absent, default: false]",
      "PASS  session.remote_sync: [absent, default: enabled]",
      "PASS  session.init_pull.worktree: [absent, default: prompt]",
      "PASS  session.init_pull.notes: [absent, default: prompt]",
      "PASS  session.init_pull.base: [absent, default: prompt]",
      "PASS  session.init_load.notes: [absent, default: prompt]",
      "PASS  user.notes_push: [absent, default: on-sync]",
      "PASS  sync.auto_pull: [absent, default: false]",
      "PASS  archive.cadence: [absent, default: with-integration]",
      "",
      "Summary: 29 passed, 0 warnings, 0 errors (29 checks)",
    ]);
    expect(result).toMatchObject({ passes: 29, warnings: 0, errors: 0, exitCode: 0 });
  });

  it("reports catalog-domain failures without exposing unrelated values", async () => {
    const content = [
      "branch.protection: nope",
      "worktree.location_template: ''",
      "hooks.subject_max_length: 9",
    ].join("\n");

    const result = await validateConfigFile({
      readPath: "/resolved/config.yml",
      displayPath: "selected.yml",
      readFile: vi.fn().mockResolvedValue(content),
    });

    expect(result.lines).toContain(
      "ERROR branch.protection: 'nope' is not valid (expected: partial full)",
    );
    expect(result.lines).toContain(
      "ERROR hooks.subject_max_length: '9' must be an unsigned base-10 safe integer >= 10",
    );
    expect(result.lines).toContain(
      "ERROR worktree.location_template: '' is not valid (expected: non-empty value)",
    );
    expect(result).toMatchObject({ passes: 27, warnings: 0, errors: 3, exitCode: 2 });
  });

  it("warns for every validatable unknown occurrence in source order", async () => {
    const content = [
      "unknown.one:",
      "_tokenizer_only: value",
      "Uppercase.key: value",
      "x: value",
      "unknown.two: first",
      "unknown.one: later",
      "hooks.subject_warn_length: 50",
      "unknown.two: later",
    ].join("\n");

    const result = await validateConfigFile({
      readPath: "/resolved/config.yml",
      displayPath: "selected.yml",
      readFile: vi.fn().mockResolvedValue(content),
    });

    expect(result.lines.filter((line) => line.startsWith("WARN"))).toEqual([
      "WARN  Unknown key: 'unknown.one' (possible typo?)",
      "WARN  Unknown key: 'unknown.two' (possible typo?)",
      "WARN  Unknown key: 'unknown.one' (possible typo?)",
      "WARN  Unknown key: 'hooks.subject_warn_length' (possible typo?)",
      "WARN  Unknown key: 'unknown.two' (possible typo?)",
    ]);
    expect(result).toMatchObject({ passes: 29, warnings: 5, errors: 0, exitCode: 1 });
  });

  it("treats the former review-owned thresholds as unknown rather than aliases", async () => {
    const result = await validateConfigFile({
      readPath: "/resolved/config.yml",
      displayPath: "selected.yml",
      readFile: vi.fn().mockResolvedValue([
        "review.chunking_threshold_lines: 5000",
        "review.chunking_threshold_files: 150",
      ].join("\n")),
    });

    expect(result.lines).toContain("WARN  Unknown key: 'review.chunking_threshold_lines' (possible typo?)");
    expect(result.lines).toContain("WARN  Unknown key: 'review.chunking_threshold_files' (possible typo?)");
    expect(result.lines).toContain("PASS  changeset.advisory_threshold_lines: 0");
    expect(result.lines).toContain("PASS  changeset.advisory_threshold_files: 0");
  });

  it("distinguishes default, unset, and invalid quoted-empty fields", async () => {
    const content = [
      "branch.protection: ''",
      "commit.format: ''",
      "commit.custom_pattern: ''",
      "hooks.body_max_lines: ''",
      "inbox.remind_after_days: ''",
    ].join("\n");

    const result = await validateConfigFile({
      readPath: "/resolved/config.yml",
      displayPath: "selected.yml",
      readFile: vi.fn().mockResolvedValue(content),
    });

    expect(result.lines).toContain("PASS  branch.protection: [absent, default: partial]");
    expect(result.lines).toContain("PASS  commit.format: [absent, default: conventional]");
    expect(result.lines).not.toContain(expect.stringContaining("commit.custom_pattern is set"));
    expect(result.lines).toContain(
      "ERROR hooks.body_max_lines: '' must be an unsigned base-10 safe integer >= 1",
    );
    expect(result.lines).toContain(
      "ERROR inbox.remind_after_days must be a positive integer (got '')",
    );
    expect(result).toMatchObject({ passes: 28, warnings: 0, errors: 2, exitCode: 2 });
  });

  it("applies custom-pattern dependencies without compiling or echoing pattern bodies", async () => {
    const missing = await validateConfigFile({
      readPath: "/resolved/config.yml",
      displayPath: "selected.yml",
      readFile: vi.fn().mockResolvedValue("commit.format: custom\ncommit.custom_pattern: ''\n"),
    });
    expect(missing.lines).toContain(
      "ERROR commit.format is 'custom' but commit.custom_pattern is empty",
    );

    const configured = await validateConfigFile({
      readPath: "/resolved/config.yml",
      displayPath: "selected.yml",
      readFile: vi.fn().mockResolvedValue("commit.format: custom\ncommit.custom_pattern: '[.'\n"),
    });
    expect(configured.lines).toContain("PASS  commit.custom_pattern is set for custom format");
    expect(configured.lines.join("\n")).not.toContain("[.");
    expect(configured.exitCode).toBe(0);

    const ignored = await validateConfigFile({
      readPath: "/resolved/config.yml",
      displayPath: "selected.yml",
      readFile: vi.fn().mockResolvedValue("commit.custom_pattern: secret-pattern\n"),
    });
    expect(ignored.lines).toContain(
      "WARN  commit.custom_pattern is set but commit.format is 'conventional' (pattern is ignored)",
    );
    expect(ignored.lines.join("\n")).not.toContain("secret-pattern");
    expect(ignored.exitCode).toBe(1);
  });

  it("applies custom-footer dependencies with the same missing and ignored policy", async () => {
    const missing = await validateConfigFile({
      readPath: "/resolved/config.yml",
      displayPath: "selected.yml",
      readFile: vi.fn().mockResolvedValue("commit.context_footer: custom\ncommit.context_pattern:\n"),
    });
    expect(missing.lines).toContain(
      "ERROR commit.context_footer is 'custom' but commit.context_pattern is empty",
    );

    const configured = await validateConfigFile({
      readPath: "/resolved/config.yml",
      displayPath: "selected.yml",
      readFile: vi.fn().mockResolvedValue(
        "commit.context_footer: custom\ncommit.context_pattern: '(?P<python>.+)'\n",
      ),
    });
    expect(configured.lines).toContain("PASS  commit.context_pattern is set for custom footer");
    expect(configured.lines.join("\n")).not.toContain("(?P<python>.+)");
    expect(configured.exitCode).toBe(0);

    const ignored = await validateConfigFile({
      readPath: "/resolved/config.yml",
      displayPath: "selected.yml",
      readFile: vi.fn().mockResolvedValue("commit.context_pattern: private-pattern\n"),
    });
    expect(ignored.lines).toContain(
      "WARN  commit.context_pattern is set but commit.context_footer is 'required' (pattern is ignored)",
    );
    expect(ignored.lines.join("\n")).not.toContain("private-pattern");
    expect(ignored.exitCode).toBe(1);
  });

  it("orders domain errors, policy warnings, unknown warnings, and the summary", async () => {
    const result = await validateConfigFile({
      readPath: "/resolved/config.yml",
      displayPath: "selected.yml",
      readFile: vi.fn().mockResolvedValue([
        "branch.protection: nope",
        "commit.custom_pattern: private-pattern",
        "unknown.key:",
        "unknown.key: duplicate",
      ].join("\n")),
    });

    const diagnostics = result.lines.filter((line) => /^(?:ERROR|WARN)/u.test(line));
    expect(diagnostics).toEqual([
      "ERROR branch.protection: 'nope' is not valid (expected: partial full)",
      "WARN  commit.custom_pattern is set but commit.format is 'conventional' (pattern is ignored)",
      "WARN  Unknown key: 'unknown.key' (possible typo?)",
      "WARN  Unknown key: 'unknown.key' (possible typo?)",
    ]);
    expect(result.lines.at(-1)).toBe("Summary: 28 passed, 3 warnings, 1 errors (32 checks)");
    expect(result).toMatchObject({ passes: 28, warnings: 3, errors: 1, exitCode: 2 });
  });

  it("enforces positive-safe-integer minima and accepts normalized boundaries", async () => {
    const content = [
      "hooks.subject_max_length: 00010",
      "hooks.body_max_lines: 9007199254740991",
      "inbox.remind_after_days: 0",
      "integration.stale_after_days: 9007199254740992",
    ].join("\n");

    const result = await validateConfigFile({
      readPath: "/resolved/config.yml",
      displayPath: "selected.yml",
      readFile: vi.fn().mockResolvedValue(content),
    });

    expect(result.lines).toContain("PASS  hooks.subject_max_length: 00010");
    expect(result.lines).toContain("PASS  hooks.body_max_lines: 9007199254740991");
    expect(result.lines).toContain(
      "ERROR inbox.remind_after_days must be a positive integer (got '0')",
    );
    expect(result.lines).toContain(
      "ERROR integration.stale_after_days must be a positive integer (got '9007199254740992')",
    );
    expect(result.exitCode).toBe(2);
  });

  it("enforces review-source compatibility at the typed validation boundary", async () => {
    const accepted = await validateConfigFile({
      readPath: "/resolved/config.yml",
      displayPath: "selected.yml",
      readFile: vi.fn().mockResolvedValue([
        "review.frontline_sources: [coderabbit-cli, project-reviewer]",
        "review.standard_sources: [coderabbit-pr, codex-pr, delegated-agent]",
      ].join("\n")),
    });
    expect(accepted.lines).toContain(
      "PASS  review.frontline_sources entry is a safe registry ID",
    );
    expect(accepted.lines).toContain("PASS  review.standard_sources entry is a standard source");
    expect(accepted.exitCode).toBe(0);

    const rejected = await validateConfigFile({
      readPath: "/resolved/config.yml",
      displayPath: "selected.yml",
      readFile: vi.fn().mockResolvedValue([
        "review.frontline_sources: [coderabbit-pr]",
        "review.standard_sources: [project-reviewer]",
      ].join("\n")),
    });
    expect(rejected.lines).toContain(
      "ERROR review.frontline_sources source 'coderabbit-pr' is not frontline-compatible",
    );
    expect(rejected.lines).toContain(
      "ERROR review.standard_sources source 'project-reviewer' is not standard-compatible",
    );
    expect(rejected.exitCode).toBe(2);
  });

  it("requires list syntax for standard sources and matched brackets for both source lists", async () => {
    const scalar = await validateConfigFile({
      readPath: "/resolved/config.yml",
      displayPath: "selected.yml",
      readFile: vi.fn().mockResolvedValue("review.standard_sources: coderabbit-pr\n"),
    });
    expect(scalar.lines).toContain("ERROR review.standard_sources must use list syntax");

    const unmatched = await validateConfigFile({
      readPath: "/resolved/config.yml",
      displayPath: "selected.yml",
      readFile: vi.fn().mockResolvedValue([
        "review.frontline_sources: [project-reviewer",
        "review.standard_sources: codex-pr]",
      ].join("\n")),
    });
    expect(unmatched.lines).toContain(
      "ERROR review.frontline_sources must use matched list brackets",
    );
    expect(unmatched.lines).toContain(
      "ERROR review.standard_sources must use matched list brackets",
    );
    expect(unmatched.exitCode).toBe(2);
  });

  it("applies positive safe-integer domains to review pass ceilings", async () => {
    const accepted = await validateConfigFile({
      readPath: "/resolved/config.yml",
      displayPath: "selected.yml",
      readFile: vi.fn().mockResolvedValue([
        "review.frontline_max_passes: 1",
        "review.standard_max_passes: 9007199254740991",
      ].join("\n")),
    });
    expect(accepted.lines).toContain("PASS  review.frontline_max_passes: 1");
    expect(accepted.lines).toContain(
      "PASS  review.standard_max_passes: 9007199254740991",
    );
    expect(accepted.exitCode).toBe(0);

    const rejected = await validateConfigFile({
      readPath: "/resolved/config.yml",
      displayPath: "selected.yml",
      readFile: vi.fn().mockResolvedValue([
        "review.frontline_max_passes: 0",
        "review.standard_max_passes: 9007199254740992",
      ].join("\n")),
    });
    expect(rejected.lines).toContain(
      "ERROR review.frontline_max_passes: '0' must be an unsigned base-10 safe integer >= 1",
    );
    expect(rejected.lines).toContain(
      "ERROR review.standard_max_passes: '9007199254740992' must be an unsigned base-10 safe integer >= 1",
    );
    expect(rejected.exitCode).toBe(2);
  });
});
