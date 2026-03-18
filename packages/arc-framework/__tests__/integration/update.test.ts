/**
 * Integration tests for the update command.
 *
 * Tests run `runUpdate` against real temporary directories with controlled
 * initial state (manifest, pristine copies, .arc/ files) and template
 * directories. Merge tests exercise real `git merge-file` through the
 * `createContentMergeFn` temp file lifecycle bridge.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  mkdir,
  access,
  stat,
} from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";

import { runUpdate } from "../../src/commands/update.js";
import type { UpdateResult } from "../../src/commands/update.js";
import { runInit } from "../../src/commands/init.js";
import type { IOContext } from "../../src/commands/init.js";
import { UserFacingError } from "../../src/lib/errors.js";
import { getArcTemplatePath } from "../../src/lib/paths.js";
import type { GitExec } from "../../src/lib/git.js";
import type {
  Recipe,
  Manifest,
  FileEntry,
  Classification,
  Layer,
} from "../../src/lib/types.js";
import type { InitPromptResult } from "../../src/prompts/init-prompts.js";

const execFileAsync = promisify(execFile);

// --- Shared helpers ---

function makeGitExec(cwd: string): GitExec {
  return async (cmd, args) => {
    const { stdout, stderr } = await execFileAsync(cmd, args, { cwd });
    return { stdout: stdout.trimEnd(), stderr };
  };
}

function makeIOContext(cwd: string): IOContext {
  return {
    readFile: (path) => readFile(path, "utf-8"),
    writeFile: (path, content) => writeFile(path, content, "utf-8"),
    mkdir: (path, opts) => mkdir(path, opts).then(() => undefined),
    access: (path) => access(path),
    exec: makeGitExec(cwd),
  };
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

/** Initialize a temp directory with git. */
async function createTempRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "arc-update-test-"));
  await execFileAsync("git", ["init", dir]);
  await execFileAsync("git", ["config", "user.email", "test@test.com"], {
    cwd: dir,
  });
  await execFileAsync("git", ["config", "user.name", "Test User"], {
    cwd: dir,
  });
  return dir;
}

// --- Synthetic test helpers ---

interface FileSpec {
  content: string;
  classification: Classification;
  layer?: Layer;
}

/**
 * Set up a minimal ARC installation in a temp dir.
 * Writes .arc/ files, .pristine/ copies, and .arc-manifest.json.
 */
async function setupInitialState(
  dir: string,
  files: Record<string, FileSpec>,
  installConfig?: Manifest["install_config"],
): Promise<void> {
  const arcDir = join(dir, ".arc");
  const pristineDir = join(arcDir, ".pristine");

  const manifestFiles: Record<string, FileEntry> = {};

  for (const [path, { content, classification, layer }] of Object.entries(
    files,
  )) {
    await ensureDir(dirname(join(arcDir, path)));
    await writeFile(join(arcDir, path), content, "utf-8");

    if (classification !== "Scaffolded") {
      await ensureDir(dirname(join(pristineDir, path)));
      await writeFile(join(pristineDir, path), content, "utf-8");
    }

    manifestFiles[path] = {
      classification,
      layer: layer ?? "core",
      pristine_hash: sha256(content),
    };
  }

  const manifest: Manifest = {
    framework_version: "1.0.0",
    installed_at: "2026-01-01T00:00:00.000Z",
    install_config: installConfig ?? {
      project_name: "Test Project",
      pm_mode: "none",
      tools: [],
    },
    files: manifestFiles,
  };

  await writeFile(
    join(dir, ".arc-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf-8",
  );
}

/** Create a template directory with given file contents. */
async function createTemplateDir(
  files: Record<string, string>,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "arc-templates-"));
  for (const [path, content] of Object.entries(files)) {
    await ensureDir(dirname(join(dir, path)));
    await writeFile(join(dir, path), content, "utf-8");
  }
  return dir;
}

/** Read the manifest from a project directory. */
async function readManifestFromDir(dir: string): Promise<Manifest> {
  const raw = await readFile(join(dir, ".arc-manifest.json"), "utf-8");
  return JSON.parse(raw) as Manifest;
}

/** Check whether a file exists. */
async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

// --- Minimal recipe for synthetic tests ---

/** Template paths that align with init.ts classification sets. */
const FRAMEWORK_FILE = "README.md";
const CONFIGURABLE_FILE = "reference/constitution/DEV-RULES.PROJECT.md";
const SCAFFOLDED_FILE = "active/WORK-STATUS.template.md";
const SCAFFOLDED_OUTPUT = "active/WORK-STATUS.md";

function makeRecipe(
  includeFiles: string[],
  conditions?: Recipe["conditions"],
): Recipe {
  return {
    include_files: includeFiles,
    prompts: [],
    conditions: conditions ?? {},
  };
}

// ============================================================
// Tests
// ============================================================

describe("update integration — baseline (real recipe)", () => {
  let tempDir: string;
  const realTemplateDir = getArcTemplatePath();
  const prompts: InitPromptResult = {
    project_name: "Update Test Project",
    tools: ["claude"],
    pm_mode: "none",
  };

  async function loadRealRecipe(): Promise<Recipe> {
    const content = await readFile(
      join(realTemplateDir, "..", "init-recipe.json"),
      "utf-8",
    );
    return JSON.parse(content) as Recipe;
  }

  beforeEach(async () => {
    tempDir = await createTempRepo();
    const recipe = await loadRealRecipe();

    await runInit({
      cwd: tempDir,
      io: makeIOContext(tempDir),
      templateDir: realTemplateDir,
      recipe,
      prompts,
      identityResult: "test-user",
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("immediate update with no changes → all files unchanged or skipped", async () => {
    const recipe = await loadRealRecipe();

    const result = await runUpdate({
      cwd: tempDir,
      io: makeIOContext(tempDir),
      templateDir: realTemplateDir,
      recipe,
    });

    expect(result.conflicts).toEqual([]);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.updated).toBe(0);
    expect(result.unchanged + result.skipped).toBeGreaterThan(0);

    // Manifest should still be valid with all files tracked
    const manifest = await readManifestFromDir(tempDir);
    expect(Object.keys(manifest.files).length).toBeGreaterThan(0);
  });
});

describe("update integration — merge scenarios", () => {
  let tempDir: string;
  let templateDir: string;

  const V1_CONTENT = [
    "# Project",
    "",
    "Line A: original content",
    "",
    "Line B: original content",
    "",
    "Line C: shared footer",
    "",
  ].join("\n");

  const baseRecipeFiles = [FRAMEWORK_FILE, CONFIGURABLE_FILE, SCAFFOLDED_FILE];
  const baseRecipe = makeRecipe(baseRecipeFiles);

  beforeEach(async () => {
    tempDir = await createTempRepo();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    if (templateDir) {
      await rm(templateDir, { recursive: true, force: true });
    }
  });

  it("no adopter changes → files take new version, pristine and manifest updated", async () => {
    // Setup: install v1
    await setupInitialState(tempDir, {
      [FRAMEWORK_FILE]: { content: V1_CONTENT, classification: "Framework" },
      [CONFIGURABLE_FILE]: {
        content: V1_CONTENT,
        classification: "Configurable",
      },
      [SCAFFOLDED_OUTPUT]: {
        content: "Adopter's work status",
        classification: "Scaffolded",
      },
    });

    // New framework version: v2 content
    const v2Content = V1_CONTENT.replace(
      "Line A: original content",
      "Line A: updated in v2",
    );
    templateDir = await createTemplateDir({
      [FRAMEWORK_FILE]: v2Content,
      [CONFIGURABLE_FILE]: v2Content,
      [SCAFFOLDED_FILE]: "New scaffolded template",
    });

    const result = await runUpdate({
      cwd: tempDir,
      io: makeIOContext(tempDir),
      templateDir,
      recipe: baseRecipe,
    });

    // Framework and Configurable updated, Scaffolded skipped
    expect(result.updated).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.conflicts).toEqual([]);

    // .arc/ files have v2 content
    const fwContent = await readFile(
      join(tempDir, ".arc", FRAMEWORK_FILE),
      "utf-8",
    );
    expect(fwContent).toContain("Line A: updated in v2");

    // Pristine updated to v2
    const pristineContent = await readFile(
      join(tempDir, ".arc", ".pristine", FRAMEWORK_FILE),
      "utf-8",
    );
    expect(pristineContent).toBe(v2Content);

    // Manifest hashes match v2
    const manifest = await readManifestFromDir(tempDir);
    expect(manifest.files[FRAMEWORK_FILE]?.pristine_hash).toBe(
      sha256(v2Content),
    );

    // Scaffolded file preserved
    const scaffolded = await readFile(
      join(tempDir, ".arc", SCAFFOLDED_OUTPUT),
      "utf-8",
    );
    expect(scaffolded).toBe("Adopter's work status");
  });

  it("non-overlapping adopter changes → auto-merge preserves both", async () => {
    // Setup: install v1
    await setupInitialState(tempDir, {
      [FRAMEWORK_FILE]: { content: V1_CONTENT, classification: "Framework" },
    });

    // Adopter modifies Line B (bottom section)
    const adopterContent = V1_CONTENT.replace(
      "Line B: original content",
      "Line B: adopter customization",
    );
    await writeFile(
      join(tempDir, ".arc", FRAMEWORK_FILE),
      adopterContent,
      "utf-8",
    );

    // Framework v2 modifies Line A (top section)
    const v2Content = V1_CONTENT.replace(
      "Line A: original content",
      "Line A: updated in v2",
    );
    templateDir = await createTemplateDir({
      [FRAMEWORK_FILE]: v2Content,
    });

    const recipe = makeRecipe([FRAMEWORK_FILE]);
    const result = await runUpdate({
      cwd: tempDir,
      io: makeIOContext(tempDir),
      templateDir,
      recipe,
    });

    expect(result.updated).toBe(1);
    expect(result.conflicts).toEqual([]);

    // Merged file contains both changes
    const merged = await readFile(
      join(tempDir, ".arc", FRAMEWORK_FILE),
      "utf-8",
    );
    expect(merged).toContain("Line A: updated in v2");
    expect(merged).toContain("Line B: adopter customization");
  });

  it("conflicting changes → conflict markers in file, pristine unchanged", async () => {
    // Setup: install v1
    await setupInitialState(tempDir, {
      [FRAMEWORK_FILE]: { content: V1_CONTENT, classification: "Framework" },
    });

    // Adopter modifies Line A
    const adopterContent = V1_CONTENT.replace(
      "Line A: original content",
      "Line A: adopter version",
    );
    await writeFile(
      join(tempDir, ".arc", FRAMEWORK_FILE),
      adopterContent,
      "utf-8",
    );

    // Framework v2 also modifies Line A
    const v2Content = V1_CONTENT.replace(
      "Line A: original content",
      "Line A: framework v2 version",
    );
    templateDir = await createTemplateDir({
      [FRAMEWORK_FILE]: v2Content,
    });

    const recipe = makeRecipe([FRAMEWORK_FILE]);
    const result = await runUpdate({
      cwd: tempDir,
      io: makeIOContext(tempDir),
      templateDir,
      recipe,
    });

    expect(result.conflicts).toEqual([FRAMEWORK_FILE]);

    // File has conflict markers
    const content = await readFile(
      join(tempDir, ".arc", FRAMEWORK_FILE),
      "utf-8",
    );
    expect(content).toContain("<<<<<<<");
    expect(content).toContain("=======");
    expect(content).toContain(">>>>>>>");

    // Pristine NOT updated (still v1)
    const pristine = await readFile(
      join(tempDir, ".arc", ".pristine", FRAMEWORK_FILE),
      "utf-8",
    );
    expect(pristine).toBe(V1_CONTENT);

    // Manifest preserves old pristine hash
    const manifest = await readManifestFromDir(tempDir);
    expect(manifest.files[FRAMEWORK_FILE]?.pristine_hash).toBe(
      sha256(V1_CONTENT),
    );
  });

  it("Scaffolded files skipped entirely — content preserved regardless of template changes", async () => {
    const adopterContent = "# My custom work status\n\nAdopter content.\n";

    await setupInitialState(tempDir, {
      [SCAFFOLDED_OUTPUT]: {
        content: adopterContent,
        classification: "Scaffolded",
      },
    });

    // Template has completely different content
    templateDir = await createTemplateDir({
      [SCAFFOLDED_FILE]: "# New template\n\nCompletely different.\n",
    });

    const recipe = makeRecipe([SCAFFOLDED_FILE]);
    const result = await runUpdate({
      cwd: tempDir,
      io: makeIOContext(tempDir),
      templateDir,
      recipe,
    });

    expect(result.skipped).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.conflicts).toEqual([]);

    // Adopter content preserved
    const content = await readFile(
      join(tempDir, ".arc", SCAFFOLDED_OUTPUT),
      "utf-8",
    );
    expect(content).toBe(adopterContent);
  });
});

describe("update integration — file add/remove", () => {
  let tempDir: string;
  let templateDir: string;

  const INITIAL_CONTENT = "# Initial content\n";
  const NEW_FILE = "reference/strategies/arc/strategy-new-feature.md";
  const NEW_FILE_CONTENT = "# New Strategy\n\nNew framework content.\n";

  beforeEach(async () => {
    tempDir = await createTempRepo();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    if (templateDir) {
      await rm(templateDir, { recursive: true, force: true });
    }
  });

  it("new Framework file added → installed, pristine created, tracked in manifest", async () => {
    // Setup: initial state with one file
    await setupInitialState(tempDir, {
      [FRAMEWORK_FILE]: {
        content: INITIAL_CONTENT,
        classification: "Framework",
      },
    });

    // New version adds a file
    templateDir = await createTemplateDir({
      [FRAMEWORK_FILE]: INITIAL_CONTENT,
      [NEW_FILE]: NEW_FILE_CONTENT,
    });

    const recipe = makeRecipe([FRAMEWORK_FILE, NEW_FILE]);
    const result = await runUpdate({
      cwd: tempDir,
      io: makeIOContext(tempDir),
      templateDir,
      recipe,
    });

    expect(result.added).toEqual([NEW_FILE]);
    expect(result.updated).toBe(1); // added file counts as updated

    // File exists in .arc/ and .pristine/
    const content = await readFile(
      join(tempDir, ".arc", NEW_FILE),
      "utf-8",
    );
    expect(content).toBe(NEW_FILE_CONTENT);

    const pristine = await readFile(
      join(tempDir, ".arc", ".pristine", NEW_FILE),
      "utf-8",
    );
    expect(pristine).toBe(NEW_FILE_CONTENT);

    // Tracked in manifest
    const manifest = await readManifestFromDir(tempDir);
    expect(manifest.files[NEW_FILE]).toBeDefined();
    expect(manifest.files[NEW_FILE]?.classification).toBe("Framework");
    expect(manifest.files[NEW_FILE]?.pristine_hash).toBe(
      sha256(NEW_FILE_CONTENT),
    );
  });

  it("Framework file removed → deleted from .arc/ and .pristine/, removed from manifest", async () => {
    const EXTRA_FILE = "reference/adr/README.md";

    await setupInitialState(tempDir, {
      [FRAMEWORK_FILE]: {
        content: INITIAL_CONTENT,
        classification: "Framework",
      },
      [EXTRA_FILE]: {
        content: "# ADR Readme\n",
        classification: "Framework",
      },
    });

    // New version only includes README.md — EXTRA_FILE removed
    templateDir = await createTemplateDir({
      [FRAMEWORK_FILE]: INITIAL_CONTENT,
    });

    const recipe = makeRecipe([FRAMEWORK_FILE]);
    const result = await runUpdate({
      cwd: tempDir,
      io: makeIOContext(tempDir),
      templateDir,
      recipe,
    });

    expect(result.removed).toEqual([EXTRA_FILE]);

    // Deleted from disk
    expect(await fileExists(join(tempDir, ".arc", EXTRA_FILE))).toBe(false);
    expect(
      await fileExists(join(tempDir, ".arc", ".pristine", EXTRA_FILE)),
    ).toBe(false);

    // Removed from manifest
    const manifest = await readManifestFromDir(tempDir);
    expect(manifest.files[EXTRA_FILE]).toBeUndefined();
    expect(manifest.files[FRAMEWORK_FILE]).toBeDefined();
  });

  it("Configurable file removed → file kept on disk, pristine deleted, reported in keptForReview", async () => {
    const adopterCustomized = "# My DEV-RULES\n\nCustom rules here.\n";

    await setupInitialState(tempDir, {
      [FRAMEWORK_FILE]: {
        content: INITIAL_CONTENT,
        classification: "Framework",
      },
      [CONFIGURABLE_FILE]: {
        content: adopterCustomized,
        classification: "Configurable",
      },
    });

    // New version only includes README.md — Configurable file removed
    templateDir = await createTemplateDir({
      [FRAMEWORK_FILE]: INITIAL_CONTENT,
    });

    const recipe = makeRecipe([FRAMEWORK_FILE]);
    const result = await runUpdate({
      cwd: tempDir,
      io: makeIOContext(tempDir),
      templateDir,
      recipe,
    });

    expect(result.keptForReview).toEqual([CONFIGURABLE_FILE]);

    // File still on disk with adopter content
    const content = await readFile(
      join(tempDir, ".arc", CONFIGURABLE_FILE),
      "utf-8",
    );
    expect(content).toBe(adopterCustomized);

    // Pristine deleted
    expect(
      await fileExists(
        join(tempDir, ".arc", ".pristine", CONFIGURABLE_FILE),
      ),
    ).toBe(false);

    // Removed from manifest
    const manifest = await readManifestFromDir(tempDir);
    expect(manifest.files[CONFIGURABLE_FILE]).toBeUndefined();
  });
});

describe("update integration — error cases", () => {
  let tempDir: string;
  let templateDir: string;

  beforeEach(async () => {
    tempDir = await createTempRepo();
    templateDir = await createTemplateDir({
      [FRAMEWORK_FILE]: "# Content\n",
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    await rm(templateDir, { recursive: true, force: true });
  });

  it("manifest missing → UserFacingError with MANIFEST_MISSING", async () => {
    const recipe = makeRecipe([FRAMEWORK_FILE]);

    await expect(
      runUpdate({
        cwd: tempDir,
        io: makeIOContext(tempDir),
        templateDir,
        recipe,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "MANIFEST_MISSING",
        name: "UserFacingError",
      }),
    );
  });

  it("manifest invalid JSON → UserFacingError with MANIFEST_INVALID", async () => {
    await writeFile(
      join(tempDir, ".arc-manifest.json"),
      "{ not valid json",
      "utf-8",
    );

    const recipe = makeRecipe([FRAMEWORK_FILE]);

    await expect(
      runUpdate({
        cwd: tempDir,
        io: makeIOContext(tempDir),
        templateDir,
        recipe,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "MANIFEST_INVALID",
        name: "UserFacingError",
      }),
    );
  });

  it("manifest invalid schema → UserFacingError with MANIFEST_INVALID", async () => {
    await writeFile(
      join(tempDir, ".arc-manifest.json"),
      JSON.stringify({ framework_version: 123 }),
      "utf-8",
    );

    const recipe = makeRecipe([FRAMEWORK_FILE]);

    await expect(
      runUpdate({
        cwd: tempDir,
        io: makeIOContext(tempDir),
        templateDir,
        recipe,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: "MANIFEST_INVALID",
        name: "UserFacingError",
      }),
    );
  });
});
