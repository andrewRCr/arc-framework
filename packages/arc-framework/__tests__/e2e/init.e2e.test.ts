/**
 * Init command E2E tests.
 *
 * Exercises `arc init` in fresh and join modes, verifying file output,
 * manifest integrity, pristine copies, PM mode conditionals, tool selection,
 * team mode, markdown linting, and error paths for commands that require
 * an existing installation.
 */

import { execFile } from "node:child_process";
import { readFile, readdir, access, writeFile } from "node:fs/promises";
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
    ignores: [".arc/.pristine/**", ".arc/user/**"],
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

/** Recursively list all files under a directory, returning relative paths. */
async function listFilesRecursive(dir: string, base = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFilesRecursive(full, base));
    } else {
      files.push(full.slice(base.length + 1));
    }
  }
  return files.sort();
}

describe("init", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("fresh init with defaults creates .arc/ directory, valid manifest, and pristine copies", async () => {
    const result = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);

    expect(result.exitCode).toBe(0);

    // .arc/ directory exists
    expect(await pathExists(join(tmpDir, ".arc"))).toBe(true);

    // Manifest exists and is valid JSON
    const manifestRaw = await readFile(join(tmpDir, ".arc-manifest.json"), "utf-8");
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
    expect(Object.keys(manifest.files).length).toBeGreaterThan(0);

    // .pristine/ contains copies
    expect(await pathExists(join(tmpDir, ".arc", ".pristine"))).toBe(true);
    const pristineFiles = await listFilesRecursive(join(tmpDir, ".arc", ".pristine"));
    expect(pristineFiles.length).toBeGreaterThan(0);

    // Key files exist
    expect(await pathExists(join(tmpDir, ".arc", "system", "arc-config.yml"))).toBe(true);
    expect(await pathExists(join(tmpDir, ".arc", "reference", "constitution", "DEV-RULES.ARC.md"))).toBe(true);
    expect(await pathExists(join(tmpDir, ".arc", "active", "WORK-STATUS.md"))).toBe(true);
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

  it("init with --tools claude,codex installs agent-specific files", async () => {
    const result = await runArc(
      ["init", "--yes", "--name", "test-project", "--tools", "claude,codex"],
      tmpDir,
    );

    expect(result.exitCode).toBe(0);

    expect(await pathExists(join(tmpDir, ".arc", "system", "agent", "CLAUDE.ARC.md"))).toBe(true);
    expect(await pathExists(join(tmpDir, ".arc", "system", "agent", "CODEX.ARC.md"))).toBe(true);
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

  it("join mode: second init in same directory activates join mode", async () => {
    // First init — fresh mode
    const first = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(first.exitCode).toBe(0);

    // Second init — should detect existing .arc/ and run join mode
    const second = await runArc(["init", "--yes", "--name", "test-project", "--tools", "claude"], tmpDir);
    expect(second.exitCode).toBe(0);

    // Join mode output mentions join/existing
    const output = second.stdout + second.stderr;
    expect(output.toLowerCase()).toMatch(/join|existing/);
  });

  it("arc update before init exits non-zero with user-facing message", async () => {
    const result = await runArc(["update"], tmpDir);

    expect(result.exitCode).not.toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain("arc init");
  });

  it("arc status before init exits non-zero with user-facing message", async () => {
    const result = await runArc(["status"], tmpDir);

    expect(result.exitCode).not.toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain("arc init");
  });
});
