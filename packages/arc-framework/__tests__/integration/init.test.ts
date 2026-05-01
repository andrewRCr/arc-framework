/**
 * Integration tests for the init command.
 *
 * Runs `runInit` against a real temporary git repo with the real recipe and
 * template files. Verifies the full pipeline: file rendering, pristine copies,
 * manifest integrity, git integration, and post-init messaging.
 *
 * Includes existing-installation detection and join integration tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { stat } from "node:fs/promises";

import {
  createTempRepo,
  cleanupTempDir,
  makeIOContext,
  loadRecipe,
  DEFAULT_PROMPTS,
  listFiles,
  sha256,
  readFile,
  join,
  execFileAsync,
  getArcTemplatePath,
  getInternalTemplatePath,
  readManifestFile,
  readPristineStore,
  manifestPath,
} from "../helpers/integration.js";
import { runInit, buildPostInitMessage } from "../../src/commands/init.js";
import type { InitResult } from "../../src/commands/init.js";
import type { Recipe } from "../../src/lib/types.js";
import { UserFacingError } from "../../src/lib/errors.js";
import { getFrameworkVersion } from "../../src/lib/version.js";

// --- Test Setup ---

let tempDir: string;
let arcDir: string;
let result: InitResult;
let recipe: Recipe;

const templateDir = getArcTemplatePath();
const internalTemplateDir = getInternalTemplatePath();
const prompts = { ...DEFAULT_PROMPTS, project_name: "Integration Test Project" };

describe("init integration (fresh mode, pm.mode=none, tools=[claude])", () => {
  beforeEach(async () => {
    tempDir = await createTempRepo("arc-init-test-");
    arcDir = join(tempDir, ".arc");

    recipe = await loadRecipe();
    const io = makeIOContext(tempDir);

    const initResult = await runInit({
      cwd: tempDir,
      io,
      templateDir,
      internalTemplateDir,
      recipe,
      prompts,
      identityResult: "test-user",
    });

    expect(initResult).not.toBeNull();
    result = initResult!;
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  // --- Directory Structure ---

  it("does not create .arc/active/ at init — per-WU status files are created lazily at activation", async () => {
    try {
      await stat(join(arcDir, "active"));
      expect.fail(".arc/active/ should not exist after a clean init — created lazily at first work unit activation");
    } catch (err: unknown) {
      expect((err as NodeJS.ErrnoException).code).toBe("ENOENT");
    }
  });

  it("creates .arc/ directory with expected subdirectories", async () => {
    const arcStat = await stat(arcDir);
    expect(arcStat.isDirectory()).toBe(true);

    const expectedDirs = [
      "reference",
      "reference/constitution",
      "reference/strategies",
      "reference/strategies/arc",
      "reference/templates",
      "system",
      "system/briefs",
      "system/githooks",
      "system/scripts",
      "system/skills",
      "system/workflows",
      "system/workflows/arc",
    ];

    for (const dir of expectedDirs) {
      const dirStat = await stat(join(arcDir, dir));
      expect(dirStat.isDirectory(), `expected directory: .arc/${dir}`).toBe(
        true,
      );
    }
  });

  // --- File Contents ---

  it("renders init-time tokens in output files", async () => {
    const briefing = await readFile(
      join(arcDir, "system/briefs/AGENT-BRIEF.PROJECT.md"),
      "utf-8",
    );
    expect(briefing).toContain("Integration Test Project");
  });

  it("leaves no init-time token residuals in rendered files", async () => {
    const files = await listFiles(arcDir, { skipInternal: false });
    // Only check rendered files — non-template files may legitimately reference
    // token syntax in documentation examples (e.g., agent/README.md explains
    // `{{PROJECT_NAME}}`). Rendered files are those whose source had a .template
    // suffix, plus arc-config.yml (programmatic render path).
    const mdFiles = files.filter(
      (f) => f.endsWith(".md") && !f.startsWith("system/.internal/"),
    );
    // Identify which output files came from .template sources
    const templateOutputs = new Set(
      recipe.include_files!
        .filter((f: string) => /\.template\.[^/]+$/.test(f))
        .map((f: string) => f.replace(/\.template(\.[^/]+)$/, "$1")),
    );

    for (const file of mdFiles) {
      if (!templateOutputs.has(file)) continue;
      const content = await readFile(join(arcDir, file), "utf-8");
      expect(
        content,
        `{{PROJECT_NAME}} residual in .arc/${file}`,
      ).not.toContain("{{PROJECT_NAME}}");
      expect(content, `{{REPO_ROOT}} residual in .arc/${file}`).not.toContain(
        "{{REPO_ROOT}}",
      );
    }
  });

  it("leaves no unresolved conditional markers in rendered files", async () => {
    const files = await listFiles(arcDir, { skipInternal: false });
    const mdFiles = files.filter(
      (f) => f.endsWith(".md") && !f.startsWith("system/.internal/"),
    );

    const arcIfLine = /^\s*<!--\s*arc:if\b/m;
    const arcEndifLine = /^\s*<!--\s*arc:endif\s*-->\s*$/m;

    for (const file of mdFiles) {
      const content = await readFile(join(arcDir, file), "utf-8");
      expect(
        content,
        `arc:if residual in .arc/${file}`,
      ).not.toMatch(arcIfLine);
      expect(
        content,
        `arc:endif residual in .arc/${file}`,
      ).not.toMatch(arcEndifLine);
    }
  });

  // --- Git Integration ---

  it("configures .gitignore with internal storage and user entries", async () => {
    const gitignore = await readFile(join(tempDir, ".gitignore"), "utf-8");
    expect(gitignore).toContain(".arc/system/.internal/pristine.json");
    expect(gitignore).toContain(".arc/user/*/");
  });

  it("sets git config for hooks path", async () => {
    const { stdout } = await execFileAsync(
      "git",
      ["config", "core.hooksPath"],
      { cwd: tempDir },
    );
    expect(stdout.trim()).toBe(".arc/system/githooks");
  });

  it("stores identity in git config", async () => {
    const { stdout } = await execFileAsync(
      "git",
      ["config", "arc.identity"],
      { cwd: tempDir },
    );
    expect(stdout.trim()).toBe("test-user");
  });

  // --- User Directory ---

  it("creates user/{identity}/ directory with SESSION-NOTES.md", async () => {
    const sessionNotes = await stat(
      join(arcDir, "user/test-user/SESSION-NOTES.md"),
    );
    expect(sessionNotes.isFile()).toBe(true);
  });

  it("SESSION-NOTES.md matches CLI-internal template content", async () => {
    const installed = await readFile(
      join(arcDir, "user/test-user/SESSION-NOTES.md"),
      "utf-8",
    );
    const template = await readFile(
      join(internalTemplateDir, "user/SESSION-NOTES.md"),
      "utf-8",
    );
    expect(installed).toBe(template);
  });

  it("does not install ATOMIC-INBOX.md when pm.mode=none", async () => {
    try {
      await stat(join(arcDir, "user/test-user/ATOMIC-INBOX.md"));
      expect.fail("ATOMIC-INBOX should not exist for pm.mode=none");
    } catch (err: unknown) {
      expect((err as NodeJS.ErrnoException).code).toBe("ENOENT");
    }
  });

  // --- Manifest ---

  it("writes manifest with correct structure", async () => {
    const manifest = await readManifestFile(tempDir);

    expect(manifest.framework_version).toBe(getFrameworkVersion());
    expect(manifest.install_config).toEqual({
      project_name: "Integration Test Project",
      pm_mode: "none",
      tools: ["claude"],
      team_mode: false,
      repo_root: tempDir,
    });
    expect(Object.keys(manifest.files).length).toBeGreaterThan(0);
  });

  it("manifest file inventory matches files on disk", async () => {
    const manifest = await readManifestFile(tempDir);

    const manifestPaths = Object.keys(manifest.files).sort();
    const diskFiles = await listFiles(arcDir);

    expect(diskFiles).toEqual(manifestPaths);
  });

  it("pristine hashes match rendered file content", async () => {
    const manifest = await readManifestFile(tempDir);

    for (const [filePath, entry] of Object.entries(manifest.files)) {
      const content = await readFile(join(arcDir, filePath), "utf-8");
      const actualHash = sha256(content);
      expect(
        actualHash,
        `hash mismatch for .arc/${filePath}`,
      ).toBe(entry.pristine_hash);
    }
  });

  // --- Specific File Presence ---

  it("installs agent briefing files (ARC + PROJECT split)", async () => {
    const arcBriefing = await stat(
      join(arcDir, "system/briefs/AGENT-BRIEF.ARC.md"),
    );
    expect(arcBriefing.isFile()).toBe(true);

    const projectBriefing = await stat(
      join(arcDir, "system/briefs/AGENT-BRIEF.PROJECT.md"),
    );
    expect(projectBriefing.isFile()).toBe(true);
  });

  // --- Per-File Methods and Extensions ---

  it("installs all 8 per-file methods plus README in system/methods/", async () => {
    const methodFiles = [
      "commit-context-format.md",
      "commit-format.md",
      "diff-review.md",
      "issue-triage.md",
      "quality-gate-commands.md",
      "review-triage.md",
      "session-state.md",
      "test-first.md",
      "README.md",
    ];
    for (const name of methodFiles) {
      const s = await stat(join(arcDir, "system/methods", name));
      expect(s.isFile(), `expected system/methods/${name}`).toBe(true);
    }
  });

  it("installs all 8 per-file extensions plus README in system/extensions/", async () => {
    const extensionFiles = [
      "post-context-load.md",
      "post-task-completion.md",
      "post-task-quality.md",
      "post-unit-quality.md",
      "post-work-unit-activate.md",
      "post-work-unit-archive.md",
      "pre-merge-review.md",
      "pre-stage-review.md",
      "README.md",
    ];
    for (const name of extensionFiles) {
      const s = await stat(join(arcDir, "system/extensions", name));
      expect(s.isFile(), `expected system/extensions/${name}`).toBe(true);
    }
  });

  it(
    "registers all 18 per-file methods/extensions in manifest — 16 Configurable, 2 READMEs Framework",
    async () => {
      const manifest = await readManifestFile(tempDir);

      const methodNames = [
        "commit-context-format", "commit-format", "diff-review",
        "issue-triage", "quality-gate-commands", "review-triage",
        "session-state", "test-first",
      ];
      const extensionNames = [
        "post-context-load", "post-task-completion", "post-task-quality",
        "post-unit-quality", "post-work-unit-activate",
        "post-work-unit-archive", "pre-merge-review", "pre-stage-review",
      ];

      for (const name of methodNames) {
        const key = `system/methods/${name}.md`;
        const entry = manifest.files[key];
        expect(entry, `manifest missing ${key}`).toBeDefined();
        expect(entry!.classification, `${key} classification`).toBe("Configurable");
      }

      for (const name of extensionNames) {
        const key = `system/extensions/${name}.md`;
        const entry = manifest.files[key];
        expect(entry, `manifest missing ${key}`).toBeDefined();
        expect(entry!.classification, `${key} classification`).toBe("Configurable");
      }

      // READMEs fall through to Framework — not adopter-customizable
      const methodsReadme = manifest.files["system/methods/README.md"];
      expect(methodsReadme).toBeDefined();
      expect(methodsReadme!.classification).toBe("Framework");

      const extensionsReadme = manifest.files["system/extensions/README.md"];
      expect(extensionsReadme).toBeDefined();
      expect(extensionsReadme!.classification).toBe("Framework");
    },
  );

  it("installs script files", async () => {
    const validateConfig = await stat(
      join(arcDir, "system/scripts/validate-config.sh"),
    );
    expect(validateConfig.isFile()).toBe(true);

    const verifyIntegrity = await stat(
      join(arcDir, "system/scripts/verify-integrity.sh"),
    );
    expect(verifyIntegrity.isFile()).toBe(true);
  });

  it("sets executable permissions on hooks and scripts", async () => {
    const executableFiles = [
      "system/githooks/pre-commit",
      "system/githooks/commit-msg",
      "system/scripts/validate-config.sh",
      "system/scripts/verify-integrity.sh",
      "system/scripts/arc-lib.sh",
    ];
    for (const relPath of executableFiles) {
      const s = await stat(join(arcDir, relPath));
      // Check owner-execute bit (0o100)
      expect(s.mode & 0o100, `${relPath} should be executable`).toBeTruthy();
    }
  });

  // --- Pristine Store ---

  it("pristine store includes Framework and Configurable files", async () => {
    const store = await readPristineStore(tempDir);

    expect(store["README.md"]).toBeDefined();
    expect(store["system/arc-config.yml"]).toBeDefined();
  });

  it("pristine store excludes Scaffolded files", async () => {
    const store = await readPristineStore(tempDir);

    expect(store["reference/META-PRD.md"]).toBeUndefined();
  });

  it("pristine store content matches .arc/ files exactly", async () => {
    const store = await readPristineStore(tempDir);
    const checkPaths = [
      "README.md",
      "system/arc-config.yml",
      "system/briefs/AGENT-BRIEF.ARC.md",
    ];

    for (const filePath of checkPaths) {
      const arcContent = await readFile(join(arcDir, filePath), "utf-8");
      expect(
        arcContent,
        `pristine mismatch for ${filePath}`,
      ).toBe(store[filePath]);
    }
  });

  // --- arc-config.yml ---

  it("writes arc-config.yml with selected pm.mode", async () => {
    const config = await readFile(
      join(arcDir, "system/arc-config.yml"),
      "utf-8",
    );
    expect(config).toContain("pm.mode: none");
  });

  it("writes arc-config.yml with solo team mode defaults", async () => {
    const config = await readFile(
      join(arcDir, "system/arc-config.yml"),
      "utf-8",
    );
    expect(config).toContain("team.mode: false");
    expect(config).toContain("session.remote_sync: enabled");
    expect(config).toContain("user.sync_push: always");
  });

  it("renders session.init_pull.* keys with defaults and inline comments", async () => {
    const config = await readFile(
      join(arcDir, "system/arc-config.yml"),
      "utf-8",
    );
    expect(config).toContain("session.init_pull.worktree: prompt");
    expect(config).toContain("session.init_pull.notes: prompt");
    // Comment block precedes the keys (each key has at least one introductory comment line).
    expect(config).toMatch(/# Worktree pull policy[\s\S]*?session\.init_pull\.worktree: prompt/);
    expect(config).toMatch(/# Notes pull policy[\s\S]*?session\.init_pull\.notes: prompt/);
  });

  it("renders archive.cadence with default and inline comments", async () => {
    const config = await readFile(
      join(arcDir, "system/arc-config.yml"),
      "utf-8",
    );
    expect(config).toContain("archive.cadence: with-integration");
    expect(config).toMatch(/# Work-unit archival cadence[\s\S]*?archive\.cadence: with-integration/);
  });

  // --- Conditional File Exclusion ---

  it("excludes arc-in-git files when pm.mode=none", async () => {
    try {
      await stat(join(arcDir, "backlog/ROADMAP.md"));
      expect.fail("ROADMAP should not exist for pm.mode=none");
    } catch (err: unknown) {
      expect((err as NodeJS.ErrnoException).code).toBe("ENOENT");
    }
  });

  it("does not produce any completed-atomic files", async () => {
    const allFiles = await listFiles(arcDir, { skipInternal: false });
    const completedAtomic = allFiles.filter((f) => f.includes("completed-atomic"));
    expect(completedAtomic).toEqual([]);
  });

  // --- Post-Init Message ---

  it("post-init message contains file count and next steps", () => {
    const message = buildPostInitMessage(result);
    expect(message).toContain(`(${result.filesWritten.length} files)`);
    expect(message).toContain("/arc-setup");
    expect(message).toContain("AGENT-BRIEF.ARC.md");
    expect(message).toContain("01_verify-and-configure.md");
  });
});

// --- arc-in-git mode ---

describe("init integration (fresh mode, pm.mode=arc-in-git)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempRepo("arc-init-arcingit-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("includes arc-in-git conditional files", async () => {
    const recipe = await loadRecipe();
    const io = makeIOContext(tempDir);

    await runInit({
      cwd: tempDir,
      io,
      templateDir,
      internalTemplateDir,
      recipe,
      prompts: { ...prompts, pm_mode: "arc-in-git" },
      identityResult: "test-user",
    });

    const roadmap = await stat(join(tempDir, ".arc/backlog/ROADMAP.md"));
    expect(roadmap.isFile()).toBe(true);

    const config = await readFile(
      join(tempDir, ".arc/system/arc-config.yml"),
      "utf-8",
    );
    expect(config).toContain("pm.mode: arc-in-git");
  });

  it("installs both SESSION-NOTES.md and ATOMIC-INBOX.md in user directory", async () => {
    const recipe = await loadRecipe();
    const io = makeIOContext(tempDir);

    await runInit({
      cwd: tempDir,
      io,
      templateDir,
      internalTemplateDir,
      recipe,
      prompts: { ...prompts, pm_mode: "arc-in-git" },
      identityResult: "test-user",
    });

    const sessionNotes = await stat(
      join(tempDir, ".arc/user/test-user/SESSION-NOTES.md"),
    );
    expect(sessionNotes.isFile()).toBe(true);

    const atomicInbox = await stat(
      join(tempDir, ".arc/user/test-user/ATOMIC-INBOX.md"),
    );
    expect(atomicInbox.isFile()).toBe(true);

    // Verify content matches templates
    const installedInbox = await readFile(
      join(tempDir, ".arc/user/test-user/ATOMIC-INBOX.md"),
      "utf-8",
    );
    const templateInbox = await readFile(
      join(internalTemplateDir, "user/ATOMIC-INBOX.md"),
      "utf-8",
    );
    expect(installedInbox).toBe(templateInbox);
  });

  it("does not produce any completed-atomic files in arc-in-git mode", async () => {
    const recipe = await loadRecipe();
    const io = makeIOContext(tempDir);

    await runInit({
      cwd: tempDir,
      io,
      templateDir,
      internalTemplateDir,
      recipe,
      prompts: { ...prompts, pm_mode: "arc-in-git" },
      identityResult: "test-user",
    });

    const allFiles = await listFiles(join(tempDir, ".arc"), { skipInternal: false });
    const completedAtomic = allFiles.filter((f) => f.includes("completed-atomic"));
    expect(completedAtomic).toEqual([]);
  });
});

// --- team mode ---

describe("init integration (fresh mode, team_mode=true)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempRepo("arc-init-team-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("writes team mode config values and includes team guidance in post-init message", async () => {
    const recipe = await loadRecipe();
    const io = makeIOContext(tempDir);

    const result = await runInit({
      cwd: tempDir,
      io,
      templateDir,
      internalTemplateDir,
      recipe,
      prompts: { ...prompts, team_mode: true },
      identityResult: "test-user",
    });

    expect(result).not.toBeNull();

    const config = await readFile(
      join(tempDir, ".arc/system/arc-config.yml"),
      "utf-8",
    );
    expect(config).toContain("team.mode: true");
    expect(config).toContain("session.remote_sync: enabled");
    expect(config).toContain("user.sync_push: prompt");

    const message = buildPostInitMessage(result!);
    expect(message).toContain("Team mode enabled");
  });
});

// --- existing installation detection ---

describe("init integration (existing installation)", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Fresh init first to create .arc/ structure
    tempDir = await createTempRepo("arc-init-existing-");
    const recipe = await loadRecipe();
    const io = makeIOContext(tempDir);

    await runInit({
      cwd: tempDir,
      io,
      templateDir,
      internalTemplateDir,
      recipe,
      prompts: { ...prompts, pm_mode: "arc-in-git" },
      identityResult: "first-dev",
    });
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("errors with ALREADY_INSTALLED when arc init is run on existing project", async () => {
    const recipe = await loadRecipe();
    const io = makeIOContext(tempDir);

    try {
      await runInit({
        cwd: tempDir,
        io,
        templateDir,
        internalTemplateDir,
        recipe,
        prompts: { ...prompts, pm_mode: "arc-in-git" },
        identityResult: "second-dev",
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(UserFacingError);
      const ufErr = err as UserFacingError;
      expect(ufErr.code).toBe("ALREADY_INSTALLED");
      expect(ufErr.whatToDo).toContain("arc join");
      expect(ufErr.whatToDo).toContain("arc update");
    }
  });
});

// --- join integration ---

describe("join integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Fresh init first to create .arc/ structure
    tempDir = await createTempRepo("arc-join-test-");
    const recipe = await loadRecipe();
    const io = makeIOContext(tempDir);

    await runInit({
      cwd: tempDir,
      io,
      templateDir,
      internalTemplateDir,
      recipe,
      prompts: { ...prompts, pm_mode: "arc-in-git" },
      identityResult: "first-dev",
    });
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("creates user directory without touching existing .arc/ files", async () => {
    const io = makeIOContext(tempDir);

    // Record pre-join state
    const manifestBefore = await readFile(manifestPath(tempDir), "utf-8");

    const { runJoin } = await import("../../src/commands/join.js");
    const result = await runJoin({
      cwd: tempDir,
      io,
      templateDir,
      internalTemplateDir,
      prompts: { role: "maintainer", tools: ["cursor"] },
      identityResult: "second-dev",
      pmMode: "arc-in-git",
    });

    expect(result.role).toBe("maintainer");
    expect(result.tools).toEqual(["cursor"]);

    // Manifest unchanged (join doesn't write manifest)
    const manifestAfter = await readFile(manifestPath(tempDir), "utf-8");
    expect(manifestAfter).toBe(manifestBefore);

    // Second developer's user directory created
    const sessionNotes = await stat(
      join(tempDir, ".arc/user/second-dev/SESSION-NOTES.md"),
    );
    expect(sessionNotes.isFile()).toBe(true);

    const atomicInbox = await stat(
      join(tempDir, ".arc/user/second-dev/ATOMIC-INBOX.md"),
    );
    expect(atomicInbox.isFile()).toBe(true);

    // First developer's user directory still intact
    const firstDevNotes = await stat(
      join(tempDir, ".arc/user/first-dev/SESSION-NOTES.md"),
    );
    expect(firstDevNotes.isFile()).toBe(true);

    // Identity stored for second developer
    const { stdout } = await execFileAsync(
      "git", ["config", "arc.identity"], { cwd: tempDir },
    );
    expect(stdout.trim()).toBe("second-dev");

    // Role stored
    const { stdout: role } = await execFileAsync(
      "git", ["config", "arc.role"], { cwd: tempDir },
    );
    expect(role.trim()).toBe("maintainer");

    // Hooks path configured
    const { stdout: hooksPath } = await execFileAsync(
      "git", ["config", "core.hooksPath"], { cwd: tempDir },
    );
    expect(hooksPath.trim()).toBe(".arc/system/githooks");
  });
});
