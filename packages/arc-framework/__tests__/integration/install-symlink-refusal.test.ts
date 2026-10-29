/**
 * Integration tests for installing through a symbolic link.
 *
 * `arc init` and `arc update` run against real temporary repositories whose `.arc/`, or a directory under it, links to
 * a directory outside the repository. Each refuses before its first write, leaves the link's target as it was, and runs
 * once the link is replaced with a regular directory.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readdir, rename, symlink, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";

import {
  createTempRepo,
  cleanupTempDir,
  commitAll,
  makeIOContext,
  loadRecipe,
  setupInitialState,
  createTemplateDir,
  fileExists,
  readFile,
  rm,
  mkdir,
  join,
  dirname,
  getArcTemplatePath,
  getInternalTemplatePath,
  DEFAULT_PROMPTS,
  manifestPath,
} from "../helpers/integration.js";
import { runInit } from "../../src/commands/init.js";
import { runUpdate } from "../../src/commands/update.js";
import { UserFacingError } from "../../src/lib/errors.js";

describe("init integration — a linked .arc/", () => {
  let tempDir: string;
  let outside: string;

  beforeEach(async () => {
    tempDir = await createTempRepo("arc-init-symlinked-");
    outside = await mkdtemp(join(tmpdir(), "arc-init-link-target-"));
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
    await rm(outside, { recursive: true, force: true });
  });

  const init = async () => runInit({
    cwd: tempDir,
    io: makeIOContext(tempDir),
    templateDir: getArcTemplatePath(),
    internalTemplateDir: getInternalTemplatePath(),
    recipe: await loadRecipe(),
    prompts: { ...DEFAULT_PROMPTS, project_name: "Linked Install Project" },
    identityResult: "test-user",
  });

  it("refuses before writing through the link, and installs once .arc/ is a directory", async () => {
    await symlink(outside, join(tempDir, ".arc"), "junction");

    const refusal = await init().catch((err: unknown) => err);

    expect(refusal).toBeInstanceOf(UserFacingError);
    expect(refusal).toMatchObject({ code: "manifest.install-path-symlinked" });
    expect((refusal as UserFacingError).why).toContain("symbolic links: .arc.");
    expect(await readdir(outside)).toEqual([]);

    await unlink(join(tempDir, ".arc"));
    expect(await init()).not.toBeNull();

    expect(await fileExists(manifestPath(tempDir))).toBe(true);
    expect(await readdir(outside)).toEqual([]);
  });

  it("refuses a linked personal directory before seeding through it, and seeds once it is a directory", async () => {
    const userDir = join(tempDir, ".arc", "user", "test-user");
    await mkdir(dirname(userDir), { recursive: true });
    await symlink(outside, userDir, "junction");

    const refusal = await init().catch((err: unknown) => err);

    expect(refusal).toBeInstanceOf(UserFacingError);
    expect(refusal).toMatchObject({ code: "manifest.install-path-symlinked" });
    expect((refusal as UserFacingError).why).toContain("symbolic links: .arc/user/test-user.");
    expect(await readdir(outside)).toEqual([]);

    await unlink(userDir);
    expect(await init()).not.toBeNull();

    expect(await fileExists(join(userDir, "WORKING-MEMORY.md"))).toBe(true);
    expect(await readdir(outside)).toEqual([]);
  });
});

describe("update integration — a linked directory under .arc/", () => {
  let tempDir: string;
  let templateDir: string;
  let outside: string;

  const FRAMEWORK_FILE = "README.md";
  const CONFIGURABLE_FILE = "system/rules/DEV-RULES.PROJECT.md";
  const CONTENT = "# Project\n\nOriginal content\n";
  const V2_CONTENT = "# Project\n\nUpdated content\n";

  beforeEach(async () => {
    tempDir = await createTempRepo("arc-update-symlinked-");
    await setupInitialState(tempDir, {
      [FRAMEWORK_FILE]: { content: CONTENT, classification: "Framework" },
      [CONFIGURABLE_FILE]: { content: CONTENT, classification: "Configurable" },
    });
    await commitAll(tempDir);
    templateDir = await createTemplateDir({ [FRAMEWORK_FILE]: V2_CONTENT, [CONFIGURABLE_FILE]: V2_CONTENT });
    outside = await mkdtemp(join(tmpdir(), "arc-update-link-target-"));
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
    await rm(templateDir, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  const update = () => runUpdate({
    cwd: tempDir,
    io: makeIOContext(tempDir),
    templateDir,
    recipe: { include_files: [FRAMEWORK_FILE, CONFIGURABLE_FILE], prompts: [], conditions: {} },
  });

  it("refuses a committed link before writing through it, and applies once the directory is back", async () => {
    const rulesDir = join(tempDir, ".arc", "system", "rules");
    const moved = join(outside, "rules");
    await rename(rulesDir, moved);
    await symlink(moved, rulesDir, "junction");
    await commitAll(tempDir);
    const manifestBefore = await readFile(manifestPath(tempDir), "utf-8");

    const refusal = await update().catch((err: unknown) => err);

    expect(refusal).toBeInstanceOf(UserFacingError);
    expect(refusal).toMatchObject({ code: "manifest.install-path-symlinked" });
    expect((refusal as UserFacingError).why).toContain("symbolic links: .arc/system/rules.");
    expect(await readFile(join(moved, "DEV-RULES.PROJECT.md"), "utf-8")).toBe(CONTENT);
    expect(await readFile(join(tempDir, ".arc", FRAMEWORK_FILE), "utf-8")).toBe(CONTENT);
    expect(await readFile(manifestPath(tempDir), "utf-8")).toBe(manifestBefore);

    await unlink(rulesDir);
    await rename(moved, rulesDir);
    await commitAll(tempDir);
    await update();

    expect(await readFile(join(tempDir, ".arc", FRAMEWORK_FILE), "utf-8")).toBe(V2_CONTENT);
    expect(await readFile(join(tempDir, ".arc", CONFIGURABLE_FILE), "utf-8")).toBe(V2_CONTENT);
  });
});
