/**
 * Integration tests for the init command.
 *
 * Runs `runInit` against a real temporary git repo with the real recipe and
 * template files. Verifies the full pipeline: file rendering, pristine copies,
 * manifest integrity, git integration, and post-init messaging.
 *
 * Join-mode tests deferred to 7.1.d (orchestrator narrowing not yet implemented).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtemp, rm, readFile, readdir, stat, writeFile, mkdir, access,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";

import { runInit, buildPostInitMessage } from "../../src/commands/init.js";
import type { IOContext, InitResult } from "../../src/commands/init.js";
import type { Recipe } from "../../src/lib/types.js";
import type { GitExec } from "../../src/lib/git.js";
import type { Manifest } from "../../src/lib/types.js";
import type { InitPromptResult } from "../../src/prompts/init-prompts.js";
import { getArcTemplatePath } from "../../src/lib/paths.js";

const execFileAsync = promisify(execFile);

// --- Helpers ---

/** Create a real GitExec bound to a specific cwd. */
function makeGitExec(cwd: string): GitExec {
  return async (cmd, args) => {
    const { stdout, stderr } = await execFileAsync(cmd, args, { cwd });
    return { stdout: stdout.trimEnd(), stderr };
  };
}

/** Create a real IOContext for a given cwd. */
function makeIOContext(cwd: string): IOContext {
  return {
    readFile: (path) => readFile(path, "utf-8"),
    writeFile: (path, content) => writeFile(path, content, "utf-8"),
    mkdir: (path, opts) => mkdir(path, opts).then(() => undefined),
    access: (path) => access(path),
    exec: makeGitExec(cwd),
  };
}

/** Recursively collect all file paths under a directory (relative to root). */
async function walkDir(dir: string, root?: string): Promise<string[]> {
  root = root ?? dir;
  const entries = await readdir(dir, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await walkDir(full, root)));
    } else {
      paths.push(full.slice(root.length + 1));
    }
  }
  return paths.sort();
}

/** SHA-256 hex digest of a string. */
function sha256(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

// --- Test Setup ---

let tempDir: string;
let arcDir: string;
let result: InitResult;

const templateDir = getArcTemplatePath();
const prompts: InitPromptResult = {
  project_name: "Integration Test Project",
  tools: ["claude"],
  pm_mode: "none",
};

/** Load the real init recipe. */
async function loadRecipe(): Promise<Recipe> {
  const content = await readFile(
    join(templateDir, "..", "init-recipe.json"),
    "utf-8",
  );
  return JSON.parse(content) as Recipe;
}

describe("init integration (fresh mode, pm.mode=none, tools=[claude])", () => {
  beforeEach(async () => {
    // Create temp dir with a real git repo
    tempDir = await mkdtemp(join(tmpdir(), "arc-init-test-"));
    arcDir = join(tempDir, ".arc");

    await execFileAsync("git", ["init", tempDir]);
    await execFileAsync("git", ["config", "user.email", "test@test.com"], {
      cwd: tempDir,
    });
    await execFileAsync("git", ["config", "user.name", "Test User"], {
      cwd: tempDir,
    });

    const recipe = await loadRecipe();
    const io = await makeIOContext(tempDir);

    const initResult = await runInit({
      cwd: tempDir,
      io,
      templateDir,
      recipe,
      prompts,
      identityResult: "test-user",
    });

    expect(initResult).not.toBeNull();
    result = initResult!;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // --- Directory Structure ---

  it("creates .arc/ directory with expected subdirectories", async () => {
    const arcStat = await stat(arcDir);
    expect(arcStat.isDirectory()).toBe(true);

    const expectedDirs = [
      "active",
      "reference",
      "reference/constitution",
      "reference/strategies",
      "reference/strategies/arc",
      "reference/templates",
      "system",
      "system/agent",
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
    // AGENT-BRIEFING.PROJECT.md is rendered from .template.md with {{PROJECT_NAME}}
    const briefing = await readFile(
      join(arcDir, "system/agent/AGENT-BRIEFING.PROJECT.md"),
      "utf-8",
    );
    expect(briefing).toContain("Integration Test Project");
  });

  it("leaves no init-time token residuals in rendered files", async () => {
    const files = await walkDir(arcDir);
    const mdFiles = files.filter(
      (f) => f.endsWith(".md") && !f.startsWith(".pristine/"),
    );

    for (const file of mdFiles) {
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
    const files = await walkDir(arcDir);
    const mdFiles = files.filter(
      (f) => f.endsWith(".md") && !f.startsWith(".pristine/"),
    );

    // Match actual conditional comment lines (what the render engine produces/consumes),
    // not documentation references inside backtick code spans.
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

  it("configures .gitignore with pristine and user entries", async () => {
    const gitignore = await readFile(join(tempDir, ".gitignore"), "utf-8");
    expect(gitignore).toContain(".arc/.pristine/");
    expect(gitignore).toContain(".arc/user/*/");
  });

  it("configures .gitattributes with WORK-STATUS merge strategy", async () => {
    const gitattrs = await readFile(join(tempDir, ".gitattributes"), "utf-8");
    expect(gitattrs).toContain(".arc/active/WORK-STATUS.md merge=ours");
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

  // --- Manifest ---

  it("writes .arc-manifest.json with correct structure", async () => {
    const raw = await readFile(join(tempDir, ".arc-manifest.json"), "utf-8");
    const manifest = JSON.parse(raw) as Manifest;

    expect(manifest.framework_version).toBe("0.0.0");
    expect(manifest.install_config).toEqual({
      project_name: "Integration Test Project",
      pm_mode: "none",
      tools: ["claude"],
    });
    expect(Object.keys(manifest.files).length).toBeGreaterThan(0);
  });

  it("manifest file inventory matches files on disk", async () => {
    const raw = await readFile(join(tempDir, ".arc-manifest.json"), "utf-8");
    const manifest = JSON.parse(raw) as Manifest;

    const manifestPaths = Object.keys(manifest.files).sort();
    const diskFiles = await walkDir(arcDir);
    // Filter out .pristine/ directory — not in manifest
    const arcFiles = diskFiles
      .filter((f) => !f.startsWith(".pristine/"))
      .sort();

    expect(arcFiles).toEqual(manifestPaths);
  });

  it("pristine hashes match rendered file content", async () => {
    const raw = await readFile(join(tempDir, ".arc-manifest.json"), "utf-8");
    const manifest = JSON.parse(raw) as Manifest;

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
      join(arcDir, "system/agent/AGENT-BRIEFING.ARC.md"),
    );
    expect(arcBriefing.isFile()).toBe(true);

    const projectBriefing = await stat(
      join(arcDir, "system/agent/AGENT-BRIEFING.PROJECT.md"),
    );
    expect(projectBriefing.isFile()).toBe(true);
  });

  it("installs CLAUDE.ARC.md (tool-conditional file)", async () => {
    const claudeFile = await stat(
      join(arcDir, "system/agent/CLAUDE.ARC.md"),
    );
    expect(claudeFile.isFile()).toBe(true);
  });

  it("WORK-STATUS.md initial Next Action points to setup workflow", async () => {
    const content = await readFile(
      join(arcDir, "active/WORK-STATUS.md"),
      "utf-8",
    );
    expect(content).toContain("01_verify-and-configure");
  });

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

  // --- Pristine Copies ---

  it("creates .pristine/ copies for Framework and Configurable files", async () => {
    // Framework file
    const pristineReadme = await stat(
      join(arcDir, ".pristine/README.md"),
    );
    expect(pristineReadme.isFile()).toBe(true);

    // Configurable file
    const pristineConfig = await stat(
      join(arcDir, ".pristine/system/arc-config.yml"),
    );
    expect(pristineConfig.isFile()).toBe(true);
  });

  it("does not create .pristine/ copies for Scaffolded files", async () => {
    try {
      await stat(join(arcDir, ".pristine/active/WORK-STATUS.md"));
      expect.fail("Scaffolded file should not have a pristine copy");
    } catch (err: unknown) {
      expect((err as NodeJS.ErrnoException).code).toBe("ENOENT");
    }
  });

  it("pristine copies match .arc/ copies exactly", async () => {
    // Spot-check a few files
    const checkPaths = [
      "README.md",
      "system/arc-config.yml",
      "system/agent/AGENT-BRIEFING.ARC.md",
    ];

    for (const filePath of checkPaths) {
      const arcContent = await readFile(join(arcDir, filePath), "utf-8");
      const pristineContent = await readFile(
        join(arcDir, ".pristine", filePath),
        "utf-8",
      );
      expect(
        arcContent,
        `pristine mismatch for ${filePath}`,
      ).toBe(pristineContent);
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

  // --- Conditional File Exclusion ---

  it("excludes arc-in-git files when pm.mode=none", async () => {
    try {
      await stat(join(arcDir, "backlog/ROADMAP.md"));
      expect.fail("ROADMAP should not exist for pm.mode=none");
    } catch (err: unknown) {
      expect((err as NodeJS.ErrnoException).code).toBe("ENOENT");
    }
  });

  it("excludes unselected tool agent files", async () => {
    // CODEX.ARC.md should not exist since tools=["claude"]
    try {
      await stat(join(arcDir, "system/agent/CODEX.ARC.md"));
      expect.fail("CODEX.ARC.md should not exist when codex not selected");
    } catch (err: unknown) {
      expect((err as NodeJS.ErrnoException).code).toBe("ENOENT");
    }
  });

  // --- Post-Init Message ---

  it("post-init message contains file count and next steps", () => {
    const message = buildPostInitMessage(result);
    expect(message).toContain(`(${result.filesWritten.length} files)`);
    expect(message).toContain("/arc-setup");
    expect(message).toContain("AGENT-BRIEFING.ARC.md");
    expect(message).toContain("01_verify-and-configure.md");
  });
});

// --- arc-in-git mode ---

describe("init integration (fresh mode, pm.mode=arc-in-git)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "arc-init-arcingit-"));
    await execFileAsync("git", ["init", tempDir]);
    await execFileAsync("git", ["config", "user.email", "test@test.com"], {
      cwd: tempDir,
    });
    await execFileAsync("git", ["config", "user.name", "Test User"], {
      cwd: tempDir,
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("includes arc-in-git conditional files", async () => {
    const recipe = await loadRecipe();
    const io = await makeIOContext(tempDir);

    await runInit({
      cwd: tempDir,
      io,
      templateDir,
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
});
