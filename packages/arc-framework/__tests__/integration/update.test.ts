/**
 * Integration tests for the update command.
 *
 * Tests run `runUpdate` against real temporary directories with controlled
 * initial state (manifest, pristine copies, .arc/ files) and template
 * directories. Merge tests exercise real `git merge-file` through the
 * `createContentMergeFn` temp file lifecycle bridge.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";

import {
  createTempRepo,
  cleanupTempDir,
  makeIOContext,
  loadRecipe,
  sha256,
  ensureDir,
  fileExists,
  setupInitialState,
  createTemplateDir,
  readFile,
  writeFile,
  rm,
  join,
  dirname,
  getArcTemplatePath,
  getInternalTemplatePath,
  DEFAULT_PROMPTS,
  readManifestFile,
  readPristineStore,
  writePristineStore,
  manifestPath,
  pristineStorePath,
} from "../helpers/integration.js";
import { runUpdate, buildUpdateSummary } from "../../src/commands/update.js";
import type { UpdateResult } from "../../src/commands/update.js";
import { runInit } from "../../src/commands/init.js";
import { UserFacingError } from "../../src/lib/errors.js";
import { MANIFEST_SCHEMA_VERSION } from "../../src/lib/constants.js";
import type { Recipe, Manifest } from "../../src/lib/types.js";

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
  const prompts = { ...DEFAULT_PROMPTS, project_name: "Update Test Project" };

  beforeEach(async () => {
    tempDir = await createTempRepo("arc-update-test-");
    const recipe = await loadRecipe();

    await runInit({
      cwd: tempDir,
      io: makeIOContext(tempDir),
      templateDir: realTemplateDir,
      internalTemplateDir: getInternalTemplatePath(),
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

    const manifest = await readManifestFile(tempDir);
    expect(Object.keys(manifest.files).length).toBeGreaterThan(0);
  });
});

describe("update integration — downgrade prevention", () => {
  let tempDir: string;
  let templateDir: string;

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

  it("blocks downgrade with UserFacingError", async () => {
    const templateFiles = {
      [FRAMEWORK_FILE]: "# Framework file\n",
      [CONFIGURABLE_FILE]: "# Configurable\n",
      [SCAFFOLDED_FILE]: "# Scaffolded\n",
    };
    templateDir = await createTemplateDir(templateFiles);
    await setupInitialState(tempDir, {
      [FRAMEWORK_FILE]: { content: "# Framework file\n", classification: "Framework" },
      [CONFIGURABLE_FILE]: { content: "# Configurable\n", classification: "Configurable" },
      [SCAFFOLDED_OUTPUT]: { content: "# Scaffolded\n", classification: "Scaffolded" },
    });

    // Overwrite manifest with a future version
    const manifest = await readManifestFile(tempDir);
    manifest.framework_version = "99.0.0";
    await writeFile(
      manifestPath(tempDir),
      JSON.stringify(manifest, null, 2) + "\n",
      "utf-8",
    );

    await expect(
      runUpdate({
        cwd: tempDir,
        io: makeIOContext(tempDir),
        templateDir,
        recipe: baseRecipe,
      }),
    ).rejects.toThrow(UserFacingError);
  });

  it("allows same-version update (no downgrade)", async () => {
    const templateFiles = {
      [FRAMEWORK_FILE]: "# Framework file\n",
      [CONFIGURABLE_FILE]: "# Configurable\n",
      [SCAFFOLDED_FILE]: "# Scaffolded\n",
    };
    templateDir = await createTemplateDir(templateFiles);
    await setupInitialState(tempDir, {
      [FRAMEWORK_FILE]: { content: "# Framework file\n", classification: "Framework" },
      [CONFIGURABLE_FILE]: { content: "# Configurable\n", classification: "Configurable" },
      [SCAFFOLDED_OUTPUT]: { content: "# Scaffolded\n", classification: "Scaffolded" },
    });

    // Should not throw — same version is allowed
    await expect(
      runUpdate({
        cwd: tempDir,
        io: makeIOContext(tempDir),
        templateDir,
        recipe: baseRecipe,
      }),
    ).resolves.toBeDefined();
  });

  it("detects classification change and reports in result", async () => {
    const templateFiles = {
      [FRAMEWORK_FILE]: "# Framework file\n",
      [CONFIGURABLE_FILE]: "# Configurable\n",
      [SCAFFOLDED_FILE]: "# Scaffolded\n",
    };
    templateDir = await createTemplateDir(templateFiles);
    // Set up initial state with CONFIGURABLE_FILE classified as Framework (simulate change)
    await setupInitialState(tempDir, {
      [FRAMEWORK_FILE]: { content: "# Framework file\n", classification: "Framework" },
      [CONFIGURABLE_FILE]: { content: "# Configurable\n", classification: "Framework" },
      [SCAFFOLDED_OUTPUT]: { content: "# Scaffolded\n", classification: "Scaffolded" },
    });

    const result = await runUpdate({
      cwd: tempDir,
      io: makeIOContext(tempDir),
      templateDir,
      recipe: baseRecipe,
    });

    // CONFIGURABLE_FILE was Framework, now Configurable — should be in reclassified
    expect(result.reclassified).toHaveLength(1);
    expect(result.reclassified[0]).toContain("Framework → Configurable");
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

    const store = await readPristineStore(tempDir);
    expect(store[FRAMEWORK_FILE]).toBe(v2Content);

    const manifest = await readManifestFile(tempDir);
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

    const store = await readPristineStore(tempDir);
    expect(store[FRAMEWORK_FILE]).toBe(V1_CONTENT);

    const manifest = await readManifestFile(tempDir);
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
    // FRAMEWORK_FILE content is unchanged (same in template and on disk)
    expect(result.unchanged).toBe(1);

    const content = await readFile(
      join(tempDir, ".arc", NEW_FILE),
      "utf-8",
    );
    expect(content).toBe(NEW_FILE_CONTENT);

    const store = await readPristineStore(tempDir);
    expect(store[NEW_FILE]).toBe(NEW_FILE_CONTENT);

    const manifest = await readManifestFile(tempDir);
    expect(manifest.files[NEW_FILE]).toBeDefined();
    expect(manifest.files[NEW_FILE]?.classification).toBe("Framework");
    expect(manifest.files[NEW_FILE]?.pristine_hash).toBe(
      sha256(NEW_FILE_CONTENT),
    );
  });

  it("Framework file removed → deleted from .arc/ and pristine store, removed from manifest", async () => {
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

    const store = await readPristineStore(tempDir);
    expect(store[EXTRA_FILE]).toBeUndefined();

    const manifest = await readManifestFile(tempDir);
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

    const store = await readPristineStore(tempDir);
    expect(store[CONFIGURABLE_FILE]).toBeUndefined();

    const manifest = await readManifestFile(tempDir);
    expect(manifest.files[CONFIGURABLE_FILE]).toBeUndefined();
  });
});

describe("update integration — pristine repair", () => {
  let tempDir: string;
  let templateDir: string;

  const CONTENT = "# Project\n\nOriginal content\n";
  const V2_CONTENT = "# Project\n\nUpdated content\n";

  beforeEach(async () => {
    tempDir = await createTempRepo("arc-update-test-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
    if (templateDir) {
      await rm(templateDir, { recursive: true, force: true });
    }
  });

  it("missing pristine → one-pass repair: file preserved, pristine rebuilt from framework content", async () => {
    await setupInitialState(tempDir, {
      [FRAMEWORK_FILE]: { content: CONTENT, classification: "Framework" },
    });

    // Remove the framework file's entry from pristine store to simulate corruption
    const store = await readPristineStore(tempDir);
    delete store[FRAMEWORK_FILE];
    await writePristineStore(tempDir, store);

    templateDir = await createTemplateDir({
      [FRAMEWORK_FILE]: V2_CONTENT,
    });

    const recipe = makeRecipe([FRAMEWORK_FILE]);
    const result = await runUpdate({
      cwd: tempDir,
      io: makeIOContext(tempDir),
      templateDir,
      recipe,
    });

    expect(result.pristineRebuilt).toEqual([FRAMEWORK_FILE]);
    // One-pass: base===updated → "unchanged" (adopter's content preserved)
    expect(result.unchanged).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.conflicts).toEqual([]);

    // Current file untouched — adopter customizations preserved
    const current = await readFile(join(tempDir, ".arc", FRAMEWORK_FILE), "utf-8");
    expect(current).toBe(CONTENT);

    // Pristine rebuilt from rendered framework content (not adopter's current)
    const repairedStore = await readPristineStore(tempDir);
    expect(repairedStore[FRAMEWORK_FILE]).toBe(V2_CONTENT);
  });

  it("after one-pass repair, next version update merges correctly", async () => {
    const V3_CONTENT = "# Project\n\nVersion 3 content\n";

    // File on disk matches what was installed (no adopter modifications)
    await setupInitialState(tempDir, {
      [FRAMEWORK_FILE]: { content: V2_CONTENT, classification: "Framework" },
    });

    // Remove from pristine store to simulate corruption
    const store = await readPristineStore(tempDir);
    delete store[FRAMEWORK_FILE];
    await writePristineStore(tempDir, store);

    templateDir = await createTemplateDir({
      [FRAMEWORK_FILE]: V2_CONTENT,
    });

    const recipe = makeRecipe([FRAMEWORK_FILE]);

    // First update: one-pass repair — pristine set to V2_CONTENT, file unchanged
    await runUpdate({
      cwd: tempDir,
      io: makeIOContext(tempDir),
      templateDir,
      recipe,
    });

    // Simulate a new framework version (V3) arriving
    await rm(templateDir, { recursive: true, force: true });
    templateDir = await createTemplateDir({
      [FRAMEWORK_FILE]: V3_CONTENT,
    });

    // Second update: pristine=V2, current=V2 (no adopter changes), updated=V3
    // base===current → takes V3 cleanly
    const result2 = await runUpdate({
      cwd: tempDir,
      io: makeIOContext(tempDir),
      templateDir,
      recipe,
    });

    expect(result2.pristineRebuilt).toEqual([]);
    expect(result2.updated).toBe(1);

    const content = await readFile(join(tempDir, ".arc", FRAMEWORK_FILE), "utf-8");
    expect(content).toBe(V3_CONTENT);
  });
});

describe("update integration — error cases", () => {
  let tempDir: string;
  let templateDir: string;

  beforeEach(async () => {
    tempDir = await createTempRepo("arc-update-test-");
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
    await ensureDir(dirname(manifestPath(tempDir)));
    await writeFile(
      manifestPath(tempDir),
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
    await ensureDir(dirname(manifestPath(tempDir)));
    await writeFile(
      manifestPath(tempDir),
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

// --- Update summary messaging ---

describe("buildUpdateSummary", () => {
  const baseResult: UpdateResult = {
    updated: 0,
    conflicts: [],
    pristineRebuilt: [],
    added: [],
    removed: [],
    keptForReview: [],
    unchanged: 0,
    skipped: 0,
    reclassified: [],
    skillWarnings: [],
    pristineStoreError: null,
  };

  it("shows 'rebuilt' count in summary line", () => {
    const result: UpdateResult = {
      ...baseResult,
      pristineRebuilt: ["README.md"],
      unchanged: 1,
    };
    const output = buildUpdateSummary(result);
    expect(output).toContain("1 rebuilt");
    expect(output).not.toContain("repaired");
  });

  it("shows whole-store cause when pristineStoreError is not-found", () => {
    const result: UpdateResult = {
      ...baseResult,
      pristineRebuilt: ["README.md", "system/arc-config.yml"],
      pristineStoreError: "not-found",
      unchanged: 2,
    };
    const output = buildUpdateSummary(result);
    expect(output).toContain("pristine.json not found");
    expect(output).toContain("rebuilt from current framework version");
    expect(output).toContain("Your customizations are preserved");
    // Should NOT list individual files for whole-store failure
    expect(output).not.toContain(".arc/README.md");
  });

  it("shows whole-store cause when pristineStoreError is invalid-json", () => {
    const result: UpdateResult = {
      ...baseResult,
      pristineRebuilt: ["README.md"],
      pristineStoreError: "invalid-json",
      unchanged: 1,
    };
    const output = buildUpdateSummary(result);
    expect(output).toContain("invalid JSON");
  });

  it("lists individual files for partial pristine misses", () => {
    const result: UpdateResult = {
      ...baseResult,
      pristineRebuilt: ["README.md"],
      pristineStoreError: null,
      unchanged: 1,
    };
    const output = buildUpdateSummary(result);
    expect(output).toContain(".arc/README.md");
    expect(output).toContain("rebuilt from current framework version");
  });

  it("omits rebuild section when no files were rebuilt", () => {
    const result: UpdateResult = {
      ...baseResult,
      updated: 3,
    };
    const output = buildUpdateSummary(result);
    expect(output).not.toContain("rebuilt");
    expect(output).not.toContain("Pristine");
  });

  it("shows skill warnings when present", () => {
    const result: UpdateResult = {
      ...baseResult,
      unchanged: 1,
      skillWarnings: ["Modified skill overwritten: .agents/skills/arc-resume/SKILL.md"],
    };
    const output = buildUpdateSummary(result);
    expect(output).toContain("Skill warnings:");
    expect(output).toContain("Modified skill overwritten");
  });

  it("omits skill warnings section when no warnings", () => {
    const result: UpdateResult = {
      ...baseResult,
      updated: 1,
    };
    const output = buildUpdateSummary(result);
    expect(output).not.toContain("Skill warnings");
  });
});
