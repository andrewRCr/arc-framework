/**
 * Integration tests for skill generation.
 *
 * Tests the full skill generation pipeline through init and update against
 * real temporary git repos with real template files. Verifies file output,
 * codex supplement generation, gitignore entries, and update regeneration.
 */

import { describe, it, expect, afterEach } from "vitest";

import { mkdir } from "node:fs/promises";
import {
  createTempRepo,
  cleanupTempDir,
  makeIOContext,
  loadRecipe,
  readFile,
  writeFile,
  join,
  getArcTemplatePath,
  getInternalTemplatePath,
  DEFAULT_PROMPTS,
} from "../helpers/integration.js";
import { runInit } from "../../src/commands/init.js";
import { runUpdate } from "../../src/commands/update.js";
import { CANONICAL_SKILLS } from "../../src/lib/skills/index.js";

// --- Helpers ---

const templateDir = getArcTemplatePath();

async function initWithTools(
  tools: string[],
  pmMode = "none",
): Promise<string> {
  const dir = await createTempRepo("arc-skills-test-");
  const recipe = await loadRecipe();
  const io = makeIOContext(dir);
  const prompts = { ...DEFAULT_PROMPTS, tools, pm_mode: pmMode };

  await runInit({
    cwd: dir,
    io,
    templateDir,
    internalTemplateDir: getInternalTemplatePath(),
    recipe,
    prompts,
    identityResult: "test-user",
  });

  return dir;
}

/** Check that all 5 canonical SKILL.md files exist under a skill directory. */
async function assertSkillsExist(
  dir: string,
  skillDir: string,
): Promise<void> {
  for (const name of CANONICAL_SKILLS) {
    const path = join(dir, skillDir, name, "SKILL.md");
    const content = await readFile(path, "utf-8");
    expect(content.length, `${skillDir}/${name}/SKILL.md should not be empty`).toBeGreaterThan(0);
  }
}

// --- Tests ---

let tempDir: string;

afterEach(async () => {
  if (tempDir) {
    await cleanupTempDir(tempDir);
  }
});

describe("skill generation (integration)", () => {
  it("init with claude populates .claude/skills/ with all canonical skills", async () => {
    tempDir = await initWithTools(["claude"]);
    await assertSkillsExist(tempDir, ".claude/skills");
  });

  it("init with codex (no pre-existing dir) falls back to .agents/skills/", async () => {
    tempDir = await initWithTools(["codex"]);
    await assertSkillsExist(tempDir, ".agents/skills");

    // Verify codex-yaml supplements exist
    for (const name of CANONICAL_SKILLS) {
      const yamlPath = join(tempDir, ".agents/skills", name, "agents", "openai.yaml");
      const content = await readFile(yamlPath, "utf-8");
      expect(content).toContain("interface:");
      expect(content).toContain("display_name:");
      expect(content).toContain("short_description:");
    }
  });

  it("init with codex detects pre-existing .codex/skills/ and writes there", async () => {
    tempDir = await createTempRepo("arc-skills-test-");
    // Create pre-existing .codex/skills/ before init
    await mkdir(join(tempDir, ".codex", "skills"), { recursive: true });

    const recipe = await loadRecipe();
    const io = makeIOContext(tempDir);
    await runInit({
      cwd: tempDir,
      io,
      templateDir,
      internalTemplateDir: getInternalTemplatePath(),
      recipe,
      prompts: { ...DEFAULT_PROMPTS, tools: ["codex"] },
      identityResult: "test-user",
    });

    // Skills written to native .codex/skills/, not .agents/skills/
    await assertSkillsExist(tempDir, ".codex/skills");

    // Codex-yaml supplements present
    for (const name of CANONICAL_SKILLS) {
      const yamlPath = join(tempDir, ".codex/skills", name, "agents", "openai.yaml");
      const content = await readFile(yamlPath, "utf-8");
      expect(content).toContain("interface:");
    }

    // .agents/skills/ should NOT exist
    const gitignore = await readFile(join(tempDir, ".gitignore"), "utf-8");
    expect(gitignore).toContain(".codex/skills/arc-*/");
    expect(gitignore).not.toContain(".agents/skills/arc-*/");
  });

  it("init with claude+cursor populates both standalone and universal directories", async () => {
    tempDir = await initWithTools(["claude", "cursor"]);

    // Standalone: .claude/skills/
    await assertSkillsExist(tempDir, ".claude/skills");

    // Universal: .agents/skills/ (cursor resolves here, no pre-existing .cursor/skills/)
    await assertSkillsExist(tempDir, ".agents/skills");
  });

  it("generated skill content matches canonical source byte-for-byte", async () => {
    tempDir = await initWithTools(["claude"]);

    for (const name of CANONICAL_SKILLS) {
      const canonical = await readFile(
        join(templateDir, "system/skills", name, "SKILL.md"),
        "utf-8",
      );
      const generated = await readFile(
        join(tempDir, ".claude/skills", name, "SKILL.md"),
        "utf-8",
      );
      expect(generated, `${name}/SKILL.md should match canonical`).toBe(canonical);
    }
  });

  it("init adds skill directory patterns to .gitignore", async () => {
    tempDir = await initWithTools(["claude", "cursor"]);
    const gitignore = await readFile(join(tempDir, ".gitignore"), "utf-8");

    expect(gitignore).toContain(".claude/skills/arc-*/");
    expect(gitignore).toContain(".agents/skills/arc-*/");
  });

  it("update regenerates skills with canonical content after modification", async () => {
    tempDir = await initWithTools(["claude"]);

    // Modify a generated skill file
    const skillPath = join(tempDir, ".claude/skills/arc-resume/SKILL.md");
    const originalContent = await readFile(skillPath, "utf-8");
    await writeFile(skillPath, "modified by user\n", "utf-8");

    // Run update
    const recipe = await loadRecipe();
    const io = makeIOContext(tempDir);
    await runUpdate({ cwd: tempDir, io, templateDir, recipe });

    // Verify canonical content restored
    const afterUpdate = await readFile(skillPath, "utf-8");
    expect(afterUpdate).toBe(originalContent);
  }, 15_000);
});
