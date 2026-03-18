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
  createTempRepo,
  cleanupTempDir,
  makeIOContext,
  loadRecipe,
  sha256,
  ensureDir,
  fileExists,
  readFile,
  writeFile,
  mkdir,
  rm,
  join,
  dirname,
  getArcTemplatePath,
} from "../helpers/integration.js";
import { runUpdate } from "../../src/commands/update.js";
import { runInit } from "../../src/commands/init.js";
import type {
  Recipe,
  Manifest,
  FileEntry,
  Classification,
  Layer,
} from "../../src/lib/types.js";
import type { InitPromptResult } from "../../src/prompts/init-prompts.js";

// --- Synthetic test helpers (update-specific) ---

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
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
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

// --- Minimal recipe for synthetic tests ---

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

  beforeEach(async () => {
    tempDir = await createTempRepo("arc-update-test-");
    const recipe = await loadRecipe();

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
    await cleanupTempDir(tempDir);
  });

  it("immediate update with no changes → all files unchanged or skipped", async () => {
    const recipe = await loadRecipe();

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
    tempDir = await createTempRepo("arc-update-test-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
    if (templateDir) {
      await rm(templateDir, { recursive: true, force: true });
    }
  });

  it("no adopter changes → files take new version, pristine and manifest updated", async () => {
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

    expect(result.updated).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.conflicts).toEqual([]);

    const fwContent = await readFile(
      join(tempDir, ".arc", FRAMEWORK_FILE),
      "utf-8",
    );
    expect(fwContent).toContain("Line A: updated in v2");

    const pristineContent = await readFile(
      join(tempDir, ".arc", ".pristine", FRAMEWORK_FILE),
      "utf-8",
    );
    expect(pristineContent).toBe(v2Content);

    const manifest = await readManifestFromDir(tempDir);
    expect(manifest.files[FRAMEWORK_FILE]?.pristine_hash).toBe(
      sha256(v2Content),
    );

    const scaffolded = await readFile(
      join(tempDir, ".arc", SCAFFOLDED_OUTPUT),
      "utf-8",
    );
    expect(scaffolded).toBe("Adopter's work status");
  });

  it("non-overlapping adopter changes → auto-merge preserves both", async () => {
    await setupInitialState(tempDir, {
      [FRAMEWORK_FILE]: { content: V1_CONTENT, classification: "Framework" },
    });

    const adopterContent = V1_CONTENT.replace(
      "Line B: original content",
      "Line B: adopter customization",
    );
    await writeFile(
      join(tempDir, ".arc", FRAMEWORK_FILE),
      adopterContent,
      "utf-8",
    );

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

    const merged = await readFile(
      join(tempDir, ".arc", FRAMEWORK_FILE),
      "utf-8",
    );
    expect(merged).toContain("Line A: updated in v2");
    expect(merged).toContain("Line B: adopter customization");
  });

  it("conflicting changes → conflict markers in file, pristine unchanged", async () => {
    await setupInitialState(tempDir, {
      [FRAMEWORK_FILE]: { content: V1_CONTENT, classification: "Framework" },
    });

    const adopterContent = V1_CONTENT.replace(
      "Line A: original content",
      "Line A: adopter version",
    );
    await writeFile(
      join(tempDir, ".arc", FRAMEWORK_FILE),
      adopterContent,
      "utf-8",
    );

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

    const content = await readFile(
      join(tempDir, ".arc", FRAMEWORK_FILE),
      "utf-8",
    );
    expect(content).toContain("<<<<<<<");
    expect(content).toContain("=======");
    expect(content).toContain(">>>>>>>");

    const pristine = await readFile(
      join(tempDir, ".arc", ".pristine", FRAMEWORK_FILE),
      "utf-8",
    );
    expect(pristine).toBe(V1_CONTENT);

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
    tempDir = await createTempRepo("arc-update-test-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
    if (templateDir) {
      await rm(templateDir, { recursive: true, force: true });
    }
  });

  it("new Framework file added → installed, pristine created, tracked in manifest", async () => {
    await setupInitialState(tempDir, {
      [FRAMEWORK_FILE]: {
        content: INITIAL_CONTENT,
        classification: "Framework",
      },
    });

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
    expect(result.updated).toBe(1);

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

    expect(await fileExists(join(tempDir, ".arc", EXTRA_FILE))).toBe(false);
    expect(
      await fileExists(join(tempDir, ".arc", ".pristine", EXTRA_FILE)),
    ).toBe(false);

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

    const content = await readFile(
      join(tempDir, ".arc", CONFIGURABLE_FILE),
      "utf-8",
    );
    expect(content).toBe(adopterCustomized);

    expect(
      await fileExists(
        join(tempDir, ".arc", ".pristine", CONFIGURABLE_FILE),
      ),
    ).toBe(false);

    const manifest = await readManifestFromDir(tempDir);
    expect(manifest.files[CONFIGURABLE_FILE]).toBeUndefined();
  });
});

describe("update integration — error cases", () => {
  let tempDir: string;
  let templateDir: string;

  beforeEach(async () => {
    tempDir = await createTempRepo("arc-update-test-");
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    templateDir = await mkdtemp(join(tmpdir(), "arc-templates-"));
    await ensureDir(dirname(join(templateDir, FRAMEWORK_FILE)));
    await writeFile(join(templateDir, FRAMEWORK_FILE), "# Content\n", "utf-8");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
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
