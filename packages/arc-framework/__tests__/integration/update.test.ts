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
} from "../helpers/integration.js";
import { runUpdate, buildUpdateSummary } from "../../src/commands/update.js";
import type { UpdateResult } from "../../src/commands/update.js";
import { runInit } from "../../src/commands/init.js";
import { UserFacingError } from "../../src/lib/errors.js";
import type { Recipe } from "../../src/lib/types.js";

// --- Minimal recipe for synthetic tests ---

const FRAMEWORK_FILE = "README.md";
const CONFIGURABLE_FILE = "reference/constitution/DEV-RULES.PROJECT.md";
const SCAFFOLDED_FILE = "reference/META-PRD.template.md";
const SCAFFOLDED_OUTPUT = "reference/META-PRD.md";

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

  it("re-update on post-restructure .arc/ is idempotent for per-file methods/extensions", async () => {
    const recipe = await loadRecipe();

    // First update — no-op baseline.
    await runUpdate({
      cwd: tempDir,
      io: makeIOContext(tempDir),
      templateDir: realTemplateDir,
      recipe,
    });

    const manifestBefore = await readFile(manifestPath(tempDir), "utf-8");

    // Second update — should produce no diff.
    const result = await runUpdate({
      cwd: tempDir,
      io: makeIOContext(tempDir),
      templateDir: realTemplateDir,
      recipe,
    });

    expect(result.updated).toBe(0);
    expect(result.conflicts).toEqual([]);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.reclassified).toEqual([]);

    // Per-file methods/extensions specifically: none of the 18 entries moved
    // through added/removed/updated/conflicts.
    const perFilePaths = [
      ...[
        "commit-context-format", "commit-format", "diff-review",
        "issue-triage", "quality-gate-commands", "review-triage",
        "session-state", "test-first",
      ].map((n) => `system/methods/${n}.md`),
      ...[
        "post-context-load", "post-task-completion", "post-task-quality",
        "post-unit-quality", "post-work-unit-activate",
        "post-work-unit-archive", "pre-merge-review", "pre-stage-review",
      ].map((n) => `system/extensions/${n}.md`),
      "system/methods/README.md",
      "system/extensions/README.md",
    ];
    for (const path of perFilePaths) {
      expect(result.added, `${path} should not be added`).not.toContain(path);
      expect(result.removed, `${path} should not be removed`).not.toContain(path);
      expect(result.conflicts, `${path} should not conflict`).not.toContain(path);
    }

    // Manifest byte-identical after the second update.
    const manifestAfter = await readFile(manifestPath(tempDir), "utf-8");
    expect(manifestAfter).toBe(manifestBefore);
  });

  it("legacy arc-methods.md / arc-extensions.md on disk are no-op on update — not deleted, not tracked", async () => {
    const recipe = await loadRecipe();

    // Simulate an adopter who once had the legacy aggregate files but upgraded
    // to the post-restructure layout. The aggregate files are no longer in the
    // recipe or manifest, but may linger on disk. PRD § Won't Do excludes
    // migration code — `arc update` must leave them untouched.
    const legacyMethodsPath = join(tempDir, ".arc/system/methods/arc-methods.md");
    const legacyExtensionsPath = join(
      tempDir, ".arc/system/extensions/arc-extensions.md",
    );
    const legacyMethodsContent = "# Legacy aggregate methods file\n";
    const legacyExtensionsContent = "# Legacy aggregate extensions file\n";

    await writeFile(legacyMethodsPath, legacyMethodsContent, "utf-8");
    await writeFile(legacyExtensionsPath, legacyExtensionsContent, "utf-8");

    const result = await runUpdate({
      cwd: tempDir,
      io: makeIOContext(tempDir),
      templateDir: realTemplateDir,
      recipe,
    });

    // Update reports nothing about the legacy files.
    expect(result.added).not.toContain("system/methods/arc-methods.md");
    expect(result.added).not.toContain("system/extensions/arc-extensions.md");
    expect(result.removed).not.toContain("system/methods/arc-methods.md");
    expect(result.removed).not.toContain("system/extensions/arc-extensions.md");
    expect(result.keptForReview).not.toContain("system/methods/arc-methods.md");
    expect(result.keptForReview).not.toContain(
      "system/extensions/arc-extensions.md",
    );

    // Files still on disk, content unchanged.
    expect(await readFile(legacyMethodsPath, "utf-8")).toBe(legacyMethodsContent);
    expect(await readFile(legacyExtensionsPath, "utf-8")).toBe(
      legacyExtensionsContent,
    );

    // Not registered in manifest.
    const manifest = await readManifestFile(tempDir);
    expect(manifest.files["system/methods/arc-methods.md"]).toBeUndefined();
    expect(manifest.files["system/extensions/arc-extensions.md"]).toBeUndefined();
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
      [CONFIGURABLE_FILE]: { content: V1_CONTENT, classification: "Configurable" },
    });

    const adopterContent = V1_CONTENT.replace(
      "Line B: original content",
      "Line B: adopter customization",
    );
    await writeFile(
      join(tempDir, ".arc", CONFIGURABLE_FILE),
      adopterContent,
      "utf-8",
    );

    const v2Content = V1_CONTENT.replace(
      "Line A: original content",
      "Line A: updated in v2",
    );
    templateDir = await createTemplateDir({
      [CONFIGURABLE_FILE]: v2Content,
    });

    const recipe = makeRecipe([CONFIGURABLE_FILE]);
    const result = await runUpdate({
      cwd: tempDir,
      io: makeIOContext(tempDir),
      templateDir,
      recipe,
    });

    expect(result.updated).toBe(1);
    expect(result.conflicts).toEqual([]);

    const merged = await readFile(
      join(tempDir, ".arc", CONFIGURABLE_FILE),
      "utf-8",
    );
    expect(merged).toContain("Line A: updated in v2");
    expect(merged).toContain("Line B: adopter customization");
  });

  it("conflicting changes → conflict markers in file, pristine unchanged", async () => {
    await setupInitialState(tempDir, {
      [CONFIGURABLE_FILE]: { content: V1_CONTENT, classification: "Configurable" },
    });

    const adopterContent = V1_CONTENT.replace(
      "Line A: original content",
      "Line A: adopter version",
    );
    await writeFile(
      join(tempDir, ".arc", CONFIGURABLE_FILE),
      adopterContent,
      "utf-8",
    );

    const v2Content = V1_CONTENT.replace(
      "Line A: original content",
      "Line A: framework v2 version",
    );
    templateDir = await createTemplateDir({
      [CONFIGURABLE_FILE]: v2Content,
    });

    const recipe = makeRecipe([CONFIGURABLE_FILE]);
    const result = await runUpdate({
      cwd: tempDir,
      io: makeIOContext(tempDir),
      templateDir,
      recipe,
    });

    expect(result.conflicts).toEqual([CONFIGURABLE_FILE]);

    const content = await readFile(
      join(tempDir, ".arc", CONFIGURABLE_FILE),
      "utf-8",
    );
    expect(content).toContain("<<<<<<<");
    expect(content).toContain("=======");
    expect(content).toContain(">>>>>>>");

    const store = await readPristineStore(tempDir);
    expect(store[CONFIGURABLE_FILE]).toBe(V1_CONTENT);

    const manifest = await readManifestFile(tempDir);
    expect(manifest.files[CONFIGURABLE_FILE]?.pristine_hash).toBe(
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

describe("update integration — arc-config migration", () => {
  let tempDir: string;
  let templateDir: string;

  const configPath = "system/arc-config.yml";
  const installConfig = (teamMode = false) => ({
    project_name: "Test Project",
    pm_mode: "none",
    team_mode: teamMode,
    tools: [],
  });

  async function runArcConfigUpdate(
    currentConfig: string,
    templateConfig = "user.notes_push: on-sync\n",
    teamMode = false,
  ): Promise<UpdateResult> {
    await setupInitialState(
      tempDir,
      {
        [configPath]: { content: currentConfig, classification: "Configurable" },
      },
      installConfig(teamMode),
    );
    templateDir = await createTemplateDir({ [configPath]: templateConfig });

    return runUpdate({
      cwd: tempDir,
      io: makeIOContext(tempDir),
      templateDir,
      recipe: makeRecipe([configPath]),
    });
  }

  beforeEach(async () => {
    tempDir = await createTempRepo("arc-update-test-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
    if (templateDir) {
      await rm(templateDir, { recursive: true, force: true });
    }
  });

  it("migrates legacy user.sync_push: always to user.notes_push: on-sync", async () => {
    const legacyConfig = "user.sync_push: always\n";
    const updatedConfig = "user.notes_push: on-sync\n";

    const result = await runArcConfigUpdate(legacyConfig, updatedConfig);

    expect(result.conflicts).toEqual([]);
    expect(result.migrated).toEqual([configPath]);
    expect(await readFile(join(tempDir, ".arc", configPath), "utf-8")).toBe(
      updatedConfig,
    );
  });

  it.each(["prompt", "manual"] as const)(
    "carries legacy user.sync_push: %s forward under the new key",
    async (value) => {
      const result = await runArcConfigUpdate(`user.sync_push: ${value}\n`);

      expect(result.conflicts).toEqual([configPath]);
      const content = await readFile(join(tempDir, ".arc", configPath), "utf-8");
      expect(content).toContain(`user.notes_push: ${value}`);
      expect(content).not.toContain("user.sync_push");
    },
  );

  it("migrates session.push_interlock: on-handoff to on-sync", async () => {
    const result = await runArcConfigUpdate(
      "session.push_interlock: on-handoff\n",
      "session.push_interlock: on-sync\n",
    );

    expect(result.conflicts).toEqual([]);
    expect(result.migrated).toEqual([configPath]);
    expect(await readFile(join(tempDir, ".arc", configPath), "utf-8")).toBe(
      "session.push_interlock: on-sync\n",
    );
  });

  it("removes the legacy user.sync_push key after migration", async () => {
    await runArcConfigUpdate("user.sync_push: always\n");

    const content = await readFile(join(tempDir, ".arc", configPath), "utf-8");
    expect(content).not.toContain("user.sync_push");
  });

  it("is idempotent for already-migrated config", async () => {
    const migratedConfig = [
      "session.push_interlock: on-sync",
      "user.notes_push: on-sync",
      "",
    ].join("\n");

    const result = await runArcConfigUpdate(migratedConfig, migratedConfig);

    expect(result.migrated).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(await readFile(join(tempDir, ".arc", configPath), "utf-8")).toBe(
      migratedConfig,
    );
  });

  it("preserves user.notes_push and warns when both notes-push keys are present", async () => {
    const currentConfig = [
      "user.sync_push: manual",
      "user.notes_push: prompt",
      "",
    ].join("\n");

    const result = await runArcConfigUpdate(
      currentConfig,
      "user.notes_push: prompt\n",
      true,
    );

    expect(result.conflicts).toEqual([]);
    expect(result.migrationWarnings).toHaveLength(1);
    expect(result.migrationWarnings[0]).toContain("both user.sync_push and user.notes_push");
    expect(await readFile(join(tempDir, ".arc", configPath), "utf-8")).toBe(
      "user.notes_push: prompt\n",
    );
  });

  it("preserves invalid legacy user.sync_push values under the new key", async () => {
    const result = await runArcConfigUpdate("user.sync_push: garbage\n");

    expect(result.conflicts).toEqual([configPath]);
    const content = await readFile(join(tempDir, ".arc", configPath), "utf-8");
    expect(content).toContain("user.notes_push: garbage");
    expect(content).not.toContain("user.sync_push");
  });

  it("surfaces a value conflict after migrating a customized legacy notes-push value", async () => {
    const result = await runArcConfigUpdate("user.sync_push: prompt\n");

    expect(result.conflicts).toEqual([configPath]);
    const content = await readFile(join(tempDir, ".arc", configPath), "utf-8");
    expect(content).toContain("<<<<<<<");
    expect(content).toContain("user.notes_push: prompt");
    expect(content).toContain("=======");
    expect(content).toContain("user.notes_push: on-sync");
    expect(content).toContain(">>>>>>>");
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
      [CONFIGURABLE_FILE]: { content: CONTENT, classification: "Configurable" },
    });

    // Remove the configurable file's entry from pristine store to simulate corruption
    const fullStore = await readPristineStore(tempDir);
    const store = Object.fromEntries(
      Object.entries(fullStore).filter(([key]) => key !== CONFIGURABLE_FILE),
    );
    await writePristineStore(tempDir, store);

    templateDir = await createTemplateDir({
      [CONFIGURABLE_FILE]: V2_CONTENT,
    });

    const recipe = makeRecipe([CONFIGURABLE_FILE]);
    const result = await runUpdate({
      cwd: tempDir,
      io: makeIOContext(tempDir),
      templateDir,
      recipe,
    });

    expect(result.pristineRebuilt).toEqual([CONFIGURABLE_FILE]);
    // One-pass: base===updated → "unchanged" (adopter's content preserved)
    expect(result.unchanged).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.conflicts).toEqual([]);

    // Current file untouched — adopter customizations preserved
    const current = await readFile(join(tempDir, ".arc", CONFIGURABLE_FILE), "utf-8");
    expect(current).toBe(CONTENT);

    // Pristine rebuilt from rendered framework content (not adopter's current)
    const repairedStore = await readPristineStore(tempDir);
    expect(repairedStore[CONFIGURABLE_FILE]).toBe(V2_CONTENT);
  });

  it("after one-pass repair, next version update merges correctly", async () => {
    const V3_CONTENT = "# Project\n\nVersion 3 content\n";

    // File on disk matches what was installed (no adopter modifications)
    await setupInitialState(tempDir, {
      [CONFIGURABLE_FILE]: { content: V2_CONTENT, classification: "Configurable" },
    });

    // Remove from pristine store to simulate corruption
    const fullStore2 = await readPristineStore(tempDir);
    const store = Object.fromEntries(
      Object.entries(fullStore2).filter(([key]) => key !== CONFIGURABLE_FILE),
    );
    await writePristineStore(tempDir, store);

    templateDir = await createTemplateDir({
      [CONFIGURABLE_FILE]: V2_CONTENT,
    });

    const recipe = makeRecipe([CONFIGURABLE_FILE]);

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
      [CONFIGURABLE_FILE]: V3_CONTENT,
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

    const content = await readFile(join(tempDir, ".arc", CONFIGURABLE_FILE), "utf-8");
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
    migrated: [],
    conflicts: [],
    pristineRebuilt: [],
    added: [],
    removed: [],
    keptForReview: [],
    unchanged: 0,
    skipped: 0,
    reclassified: [],
    previousVersion: "0.1.0",
    currentVersion: "0.1.0",
    skillWarnings: [],
    migrationWarnings: [],
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

  it("shows migrated count and migration warnings when present", () => {
    const result: UpdateResult = {
      ...baseResult,
      migrated: ["system/arc-config.yml"],
      migrationWarnings: ["arc-config.yml contains both user.sync_push and user.notes_push."],
    };
    const output = buildUpdateSummary(result);
    expect(output).toContain("1 migrated");
    expect(output).toContain("Migration warnings:");
    expect(output).toContain("both user.sync_push and user.notes_push");
  });

  it("shows version change when versions differ", () => {
    const result: UpdateResult = {
      ...baseResult,
      previousVersion: "0.1.0",
      currentVersion: "0.2.0",
      updated: 1,
    };
    const output = buildUpdateSummary(result);
    expect(output).toContain("v0.1.0 → v0.2.0");
  });

  it("shows no version change when versions match", () => {
    const result: UpdateResult = {
      ...baseResult,
      previousVersion: "0.1.0",
      currentVersion: "0.1.0",
      unchanged: 1,
    };
    const output = buildUpdateSummary(result);
    expect(output).toContain("v0.1.0 (no version change)");
  });
});
