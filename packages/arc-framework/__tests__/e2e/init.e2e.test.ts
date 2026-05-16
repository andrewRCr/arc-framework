/**
 * Init and join command E2E tests.
 *
 * Exercises `arc init` (fresh install, existing installation detection) and
 * `arc join` (role selection, tool selection, non-interactive mode), verifying
 * file output, manifest integrity, pristine copies, PM mode conditionals,
 * team mode, markdown linting, and error paths.
 */

import { execFile } from "node:child_process";
import { readFile, access, writeFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runArc, createTempRepo, cleanupTempDir } from "./helpers.js";

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Repo root — two levels up from __tests__/e2e/. */
const REPO_ROOT = resolve(__dirname, "../../../..");

/** Local markdownlint-cli2 binary. */
const MARKDOWNLINT_BIN = join(REPO_ROOT, "node_modules/.bin/markdownlint-cli2");

/**
 * Build a markdownlint config for linting installed .arc/ files.
 * Uses the same rules as the repo's config (templates are authored to pass it),
 * scoped to .arc/ and excluding .pristine/ and user/.
 */
function buildLintConfig(): string {
  return JSON.stringify({
    config: {
      default: true,
      MD007: { indent: 4 },
      MD013: { line_length: 120, code_blocks: false, tables: false },
      MD024: { siblings_only: true },
      MD025: false, MD029: false, MD033: false,
      MD036: false, MD040: false, MD041: false,
    },
    globs: [".arc/**/*.md"],
    ignores: [".arc/system/.internal/**", ".arc/user/**"],
  });
}

/** Check whether a path exists. */
async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

describe("init", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("fresh init with defaults creates .arc/ directory, valid manifest, and pristine store", async () => {
    const result = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);

    expect(result.exitCode).toBe(0);

    // .arc/ directory exists
    expect(await pathExists(join(tmpDir, ".arc"))).toBe(true);

    // Manifest exists and is valid JSON
    const internalDir = join(tmpDir, ".arc", "system", ".internal");
    const manifestRaw = await readFile(join(internalDir, "manifest.json"), "utf-8");
    const manifest = JSON.parse(manifestRaw) as {
      framework_version: string;
      installed_at: string;
      install_config: {
        project_name: string;
        pm_mode: string;
        tools: string[];
        team_mode: boolean;
      };
      files: Record<string, unknown>;
    };

    expect(manifest.framework_version).toBeTruthy();
    expect(manifest.installed_at).toBeTruthy();
    expect(manifest.install_config.project_name).toBe("test-project");
    expect(manifest.install_config.pm_mode).toBe("none");
    expect(manifest.install_config.tools).toEqual([]);
    expect(manifest.install_config.team_mode).toBe(false);
    expect(manifest.install_config).not.toHaveProperty("repo_root");
    expect(Object.keys(manifest.files).length).toBeGreaterThan(0);

    // pristine.json exists and has entries
    const pristineRaw = await readFile(join(internalDir, "pristine.json"), "utf-8");
    const pristineStore = JSON.parse(pristineRaw) as Record<string, string>;
    expect(Object.keys(pristineStore).length).toBeGreaterThan(0);

    // Key files exist
    expect(await pathExists(join(tmpDir, ".arc", "system", "arc-config.yml"))).toBe(true);
    expect(await pathExists(join(tmpDir, ".arc", "reference", "constitution", "DEV-RULES.ARC.md"))).toBe(true);
    expect(await pathExists(join(tmpDir, ".arc", "reference", "templates", "template-status.md"))).toBe(true);
  });

  it("init with --pm-mode arc-in-git installs arc-in-git files", async () => {
    const result = await runArc(
      ["init", "--yes", "--name", "test-project", "--pm-mode", "arc-in-git"],
      tmpDir,
    );

    expect(result.exitCode).toBe(0);

    // arc-in-git specific files
    expect(await pathExists(join(tmpDir, ".arc", "backlog", "ROADMAP.md"))).toBe(true);
    expect(await pathExists(join(tmpDir, ".arc", "backlog", "feature", "BACKLOG-FEATURE.md"))).toBe(true);
    expect(await pathExists(join(tmpDir, ".arc", "backlog", "technical", "BACKLOG-TECHNICAL.md"))).toBe(true);
    expect(await pathExists(join(tmpDir, ".arc", "reference", "PROJECT-STATUS.md"))).toBe(true);

    // ATOMIC-INBOX created in user directory
    expect(await pathExists(join(tmpDir, ".arc", "user", "test-user", "ATOMIC-INBOX.md"))).toBe(true);

    // Config reflects pm.mode
    const configContent = await readFile(join(tmpDir, ".arc", "system", "arc-config.yml"), "utf-8");
    expect(configContent).toContain("pm.mode: arc-in-git");
  });

  it("init --yes installs per-file methods and extensions directories", async () => {
    const result = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(result.exitCode).toBe(0);

    const methodNames = [
      "commit-footer", "commit-format", "diff-review",
      "issue-triage", "quality-gate-commands", "review-triage",
      "session-state", "test-first",
    ];
    const extensionNames = [
      "post-context-load", "post-task-completion", "post-task-quality",
      "post-unit-quality", "post-work-unit-activate",
      "post-work-unit-archive", "pre-activation", "pre-commit-review",
      "pre-merge-review", "pre-pr-review", "pre-push-review",
    ];

    for (const name of methodNames) {
      expect(
        await pathExists(join(tmpDir, ".arc/system/methods", `${name}.md`)),
        `system/methods/${name}.md`,
      ).toBe(true);
    }
    for (const name of extensionNames) {
      expect(
        await pathExists(join(tmpDir, ".arc/system/extensions", `${name}.md`)),
        `system/extensions/${name}.md`,
      ).toBe(true);
    }

    expect(
      await pathExists(join(tmpDir, ".arc/system/methods/README.md")),
    ).toBe(true);
    expect(
      await pathExists(join(tmpDir, ".arc/system/extensions/README.md")),
    ).toBe(true);

    // Legacy aggregates must not ship from a fresh install.
    expect(
      await pathExists(join(tmpDir, ".arc/system/methods/arc-methods.md")),
    ).toBe(false);
    expect(
      await pathExists(join(tmpDir, ".arc/system/extensions/arc-extensions.md")),
    ).toBe(false);

    // All 18 registered in manifest with expected classifications.
    const manifestRaw = await readFile(
      join(tmpDir, ".arc/system/.internal/manifest.json"),
      "utf-8",
    );
    const manifest = JSON.parse(manifestRaw) as {
      files: Record<string, { classification: string }>;
    };
    for (const name of methodNames) {
      const key = `system/methods/${name}.md`;
      expect(manifest.files[key], `manifest[${key}]`).toBeDefined();
      expect(manifest.files[key]!.classification).toBe("Configurable");
    }
    for (const name of extensionNames) {
      const key = `system/extensions/${name}.md`;
      expect(manifest.files[key], `manifest[${key}]`).toBeDefined();
      expect(manifest.files[key]!.classification).toBe("Configurable");
    }
    expect(manifest.files["system/methods/README.md"]!.classification).toBe(
      "Framework",
    );
    expect(manifest.files["system/extensions/README.md"]!.classification).toBe(
      "Framework",
    );
  });

  it("init with --team sets team mode in arc-config.yml", async () => {
    const result = await runArc(
      ["init", "--yes", "--name", "test-project", "--team"],
      tmpDir,
    );

    expect(result.exitCode).toBe(0);

    const configContent = await readFile(join(tmpDir, ".arc", "system", "arc-config.yml"), "utf-8");
    expect(configContent).toContain("team.mode: true");
  });

  it("installed markdown passes linting", async () => {
    const initResult = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(initResult.exitCode).toBe(0);

    // Write a markdownlint config in the temp dir with the same rules as the repo
    // (templates are authored to pass this config), scoped to .arc/ only.
    await writeFile(join(tmpDir, ".markdownlint-cli2.jsonc"), buildLintConfig());

    try {
      await execFileAsync(MARKDOWNLINT_BIN, [], { cwd: tmpDir, timeout: 30_000 });
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; code?: number | string };
      const output = (e.stdout ?? "") + (e.stderr ?? "");
      expect.fail(`Markdown linting failed (exit ${e.code ?? "?"}) on installed .arc/ files:\n${output}`);
    }
  });

  it("second init in same directory errors with guidance", async () => {
    // First init — fresh mode
    const first = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(first.exitCode).toBe(0);

    // Second init — should detect existing installation and error
    const second = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(second.exitCode).toBe(1);

    // Error message suggests alternatives
    const output = second.stdout + second.stderr;
    expect(output).toContain("already installed");
    expect(output).toContain("arc join");
    expect(output).toContain("arc update");
  });

  it("arc update before init exits non-zero with user-facing message", async () => {
    const result = await runArc(["update"], tmpDir);

    expect(result.exitCode).not.toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain("Not inside an ARC project");
  });

  it("arc health before init exits non-zero with user-facing message", async () => {
    const result = await runArc(["health"], tmpDir);

    expect(result.exitCode).not.toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain("Not inside an ARC project");
  });
});

// --- arc join ---

describe("arc join", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo("arc-join-e2e-");
    // Fresh init first
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("arc join --contributor --yes sets role=contributor", async () => {
    const result = await runArc(["join", "--contributor", "--yes"], tmpDir);
    expect(result.exitCode).toBe(0);

    const { stdout } = await execFileAsync("git", ["config", "arc.role"], { cwd: tmpDir });
    expect(stdout.trim()).toBe("contributor");
  });

  it("arc join --yes --tools claude,cursor sets role=maintainer with tools", async () => {
    const result = await runArc(["join", "--yes", "--tools", "claude,cursor"], tmpDir);
    expect(result.exitCode).toBe(0);

    const { stdout } = await execFileAsync("git", ["config", "arc.role"], { cwd: tmpDir });
    expect(stdout.trim()).toBe("maintainer");

    // Skills installed for both tools
    const claudeSkillExists = await access(
      join(tmpDir, ".claude/skills/arc-resume/SKILL.md"),
    ).then(() => true).catch(() => false);
    expect(claudeSkillExists).toBe(true);
  });

  it("arc join --contributor --yes --tools claude combines role and tools", async () => {
    const result = await runArc(["join", "--contributor", "--yes", "--tools", "claude"], tmpDir);
    expect(result.exitCode).toBe(0);

    const { stdout: role } = await execFileAsync("git", ["config", "arc.role"], { cwd: tmpDir });
    expect(role.trim()).toBe("contributor");

    const claudeSkillExists = await access(
      join(tmpDir, ".claude/skills/arc-resume/SKILL.md"),
    ).then(() => true).catch(() => false);
    expect(claudeSkillExists).toBe(true);
  });

  it("arc join without existing installation fails with guidance", async () => {
    const emptyDir = await createTempRepo("arc-join-empty-");
    try {
      const result = await runArc(["join", "--yes"], emptyDir);
      expect(result.exitCode).toBe(1);

      const output = result.stdout + result.stderr;
      expect(output).toContain("Not inside an ARC project");
    } finally {
      await cleanupTempDir(emptyDir);
    }
  });
});

describe("arc init --yes identity error", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo("arc-init-no-identity-");
    // Unset user.name so identity resolution has nothing to fall back on
    await execFileAsync("git", ["config", "--unset", "user.name"], { cwd: tmpDir }).catch(() => {});
    await execFileAsync("git", ["config", "--unset", "arc.identity"], { cwd: tmpDir }).catch(() => {});
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("errors with clear message when --yes cannot resolve identity", async () => {
    // GIT_AUTHOR_NAME/GIT_COMMITTER_NAME could still provide user.name via
    // global config — override the entire git env to ensure no identity
    const result = await runArc(["init", "--yes"], tmpDir, {
      env: { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" },
    });
    expect(result.exitCode).toBe(1);

    const output = result.stdout + result.stderr;
    expect(output).toContain("IDENTITY_MISSING");
    expect(output).toContain("non-interactive");
  });
});
