/**
 * Unit tests for skill generation.
 *
 * Tests canonical skill copying to per-tool directories, codex YAML supplement
 * generation, modification detection, and frontmatter parsing using injectable
 * I/O dependencies.
 */

import { describe, it, expect } from "vitest";
import {
  generateSkills,
  parseSkillFrontmatter,
  buildCodexYaml,
  validateTools,
  VALID_TOOL_IDS,
  CANONICAL_SKILLS,
  type CanonicalSkillName,
  type SkillGenerationIO,
} from "../../../src/lib/skills/index.js";

// --- Test helpers ---

/** Minimal SKILL.md content with YAML frontmatter. */
function skillMd(name: string, description: string): string {
  return [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    "disable-model-invocation: false",
    "---",
    "",
    `# ${name}`,
    "",
    "Do the thing.",
    "",
  ].join("\n");
}

/** Build a file system map with all canonical skills. */
function buildCanonicalFiles(
  skillsDir: string,
): Record<string, string> {
  const files: Record<string, string> = {};
  const descriptions: Record<CanonicalSkillName, string> = {
    "arc-session": "Initialize and resume the active working ARC session.",
    "arc-commit": "Commit current repository changes with atomic boundaries.",
    "arc-errand": "Run an isolated ARC errand.",
    "arc-handoff": "Update and finalize current ARC session documentation.",
    "arc-housekeep": "Drain and route captured ARC inbox entries.",
    "arc-inbox": "Capture deferred ARC work into the user inbox.",
    "arc-plan": "Begin or resume ARC planning.",
    "arc-recover": "Recover ARC context after harness compaction.",
    "arc-setup": "Run post-install ARC setup.",
    "arc-task-audit": "Audit task readiness before implementation.",
    "arc-task-review": "Review a completed task increment.",
    "arc-verify": "Run ARC installation health checks.",
  };
  for (const name of CANONICAL_SKILLS) {
    files[`${skillsDir}/${name}/SKILL.md`] = skillMd(
      name,
      descriptions[name]!,
    );
  }
  return files;
}

/** Build a SkillGenerationIO from a file map. */
function buildIO(files: Record<string, string>): SkillGenerationIO {
  return {
    readFile: async (path: string) => {
      if (path in files) return files[path]!;
      const err = new Error(`ENOENT: ${path}`) as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    },
  };
}

const SKILLS_DIR = "/repo/.arc/system/.internal/skills";
const CWD = "/repo";

// --- Tests ---

describe("generateSkills", () => {
  it("copies all canonical skills to universal default directory", async () => {
    const files = buildCanonicalFiles(SKILLS_DIR);
    const io = buildIO(files);

    const result = await generateSkills(
      ["cursor", "windsurf"],
      SKILLS_DIR,
      [],
      CWD,
      io,
    );

    // Should produce one SKILL.md per canonical skill in .agents/skills/
    const skillOutputs = result.outputs.filter((o) =>
      o.path.endsWith("/SKILL.md"),
    );
    expect(skillOutputs).toHaveLength(CANONICAL_SKILLS.length);

    for (const name of CANONICAL_SKILLS) {
      const output = result.outputs.find(
        (o) => o.path === `.agents/skills/${name}/SKILL.md`,
      );
      expect(output).toBeDefined();
      // Content matches canonical source
      expect(output!.content).toBe(files[`${SKILLS_DIR}/${name}/SKILL.md`]);
    }

    expect(result.warnings).toHaveLength(0);
  });

  it("copies all canonical skills to standalone tool directory", async () => {
    const files = buildCanonicalFiles(SKILLS_DIR);
    const io = buildIO(files);

    const result = await generateSkills(
      ["claude"],
      SKILLS_DIR,
      [],
      CWD,
      io,
    );

    const skillOutputs = result.outputs.filter((o) =>
      o.path.endsWith("/SKILL.md"),
    );
    expect(skillOutputs).toHaveLength(CANONICAL_SKILLS.length);

    for (const name of CANONICAL_SKILLS) {
      const output = result.outputs.find(
        (o) => o.path === `.claude/skills/${name}/SKILL.md`,
      );
      expect(output).toBeDefined();
      expect(output!.content).toBe(files[`${SKILLS_DIR}/${name}/SKILL.md`]);
    }

    expect(result.warnings).toHaveLength(0);
  });

  it("produces outputs for multiple resolved directories", async () => {
    const files = buildCanonicalFiles(SKILLS_DIR);
    const io = buildIO(files);

    // claude (standalone: .claude/skills/) + cursor (universal: .agents/skills/)
    const result = await generateSkills(
      ["claude", "cursor"],
      SKILLS_DIR,
      [],
      CWD,
      io,
    );

    // Two directories times the canonical skill set.
    const skillOutputs = result.outputs.filter((o) =>
      o.path.endsWith("/SKILL.md"),
    );
    expect(skillOutputs).toHaveLength(CANONICAL_SKILLS.length * 2);

    // Verify both directories are represented
    const claudeOutputs = skillOutputs.filter((o) =>
      o.path.startsWith(".claude/skills/"),
    );
    const agentsOutputs = skillOutputs.filter((o) =>
      o.path.startsWith(".agents/skills/"),
    );
    expect(claudeOutputs).toHaveLength(CANONICAL_SKILLS.length);
    expect(agentsOutputs).toHaveLength(CANONICAL_SKILLS.length);
  });

  it("emits warning when existing skill file differs from canonical", async () => {
    const canonicalFiles = buildCanonicalFiles(SKILLS_DIR);
    // Add a modified existing file at the target path
    const existingFiles: Record<string, string> = {
      ...canonicalFiles,
      [`${CWD}/.agents/skills/arc-session/SKILL.md`]: "modified content\n",
    };
    const io = buildIO(existingFiles);

    const result = await generateSkills(
      ["cursor"],
      SKILLS_DIR,
      [],
      CWD,
      io,
    );

    // Should emit exactly one warning for the modified file
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toBe(
      "Overwriting modified skill file: .agents/skills/arc-session/SKILL.md",
    );

    // Output still contains canonical content (overwrite)
    const resumeOutput = result.outputs.find(
      (o) => o.path === ".agents/skills/arc-session/SKILL.md",
    );
    expect(resumeOutput!.content).toBe(
      canonicalFiles[`${SKILLS_DIR}/arc-session/SKILL.md`],
    );
  });

  it("does not warn when existing skill file matches canonical", async () => {
    const canonicalFiles = buildCanonicalFiles(SKILLS_DIR);
    // Existing file with identical content
    const existingFiles: Record<string, string> = {
      ...canonicalFiles,
      [`${CWD}/.agents/skills/arc-session/SKILL.md`]:
        canonicalFiles[`${SKILLS_DIR}/arc-session/SKILL.md`]!,
    };
    const io = buildIO(existingFiles);

    const result = await generateSkills(
      ["cursor"],
      SKILLS_DIR,
      [],
      CWD,
      io,
    );

    expect(result.warnings).toHaveLength(0);
  });

  it("preserves .arc/ references in skill content unchanged", async () => {
    const contentWithRef = [
      "---",
      "name: arc-session",
      "description: Resume the session.",
      "disable-model-invocation: false",
      "---",
      "",
      "Read `.arc/system/workflows/arc/session-lifecycle/session-init.md`.",
      "",
    ].join("\n");

    const files: Record<string, string> = {
      ...buildCanonicalFiles(SKILLS_DIR),
      [`${SKILLS_DIR}/arc-session/SKILL.md`]: contentWithRef,
    };
    const io = buildIO(files);

    const result = await generateSkills(
      ["cursor"],
      SKILLS_DIR,
      [],
      CWD,
      io,
    );

    const output = result.outputs.find(
      (o) => o.path === ".agents/skills/arc-session/SKILL.md",
    );
    expect(output!.content).toBe(contentWithRef);
    expect(output!.content).toContain(".arc/system/workflows/");
  });

  it("generates codex openai.yaml supplement when codex is selected", async () => {
    const files = buildCanonicalFiles(SKILLS_DIR);
    const io = buildIO(files);

    const result = await generateSkills(
      ["codex"],
      SKILLS_DIR,
      [],
      CWD,
      io,
    );

    // Should have SKILL.md + openai.yaml for each canonical skill
    const skillOutputs = result.outputs.filter((o) =>
      o.path.endsWith("/SKILL.md"),
    );
    const yamlOutputs = result.outputs.filter((o) =>
      o.path.endsWith("/agents/openai.yaml"),
    );
    expect(skillOutputs).toHaveLength(CANONICAL_SKILLS.length);
    expect(yamlOutputs).toHaveLength(CANONICAL_SKILLS.length);

    // Verify one yaml output structure
    const resumeYaml = result.outputs.find(
      (o) => o.path === ".agents/skills/arc-session/agents/openai.yaml",
    );
    expect(resumeYaml).toBeDefined();
    expect(resumeYaml!.content).toContain('display_name: "ARC Session"');
    expect(resumeYaml!.content).toContain("short_description:");
    expect(resumeYaml!.content).toContain("default_prompt:");
  });
});

describe("parseSkillFrontmatter", () => {
  it("extracts name and description from valid frontmatter", () => {
    const content = skillMd("arc-session", "Resume the session.");
    const result = parseSkillFrontmatter(content);
    expect(result).toEqual({
      name: "arc-session",
      description: "Resume the session.",
    });
  });

  it("returns null for content without frontmatter", () => {
    expect(parseSkillFrontmatter("# Just a heading\n")).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    const content = "---\ntitle: something\n---\n";
    expect(parseSkillFrontmatter(content)).toBeNull();
  });
});

describe("validateTools", () => {
  it("accepts all known tool IDs", () => {
    expect(() => validateTools([...VALID_TOOL_IDS])).not.toThrow();
  });

  it("accepts an empty array", () => {
    expect(() => validateTools([])).not.toThrow();
  });

  it("throws on a single unknown tool", () => {
    expect(() => validateTools(["claude", "unknown-tool"])).toThrow(
      "Unknown tool: unknown-tool",
    );
  });

  it("throws on multiple unknown tools", () => {
    expect(() => validateTools(["foo", "bar"])).toThrow(
      "Unknown tools: foo, bar",
    );
  });

  it("includes valid tools list in the error message", () => {
    expect(() => validateTools(["nope"])).toThrow("Valid tools:");
  });
});

describe("buildCodexYaml", () => {
  it("produces valid yaml from frontmatter", () => {
    const yaml = buildCodexYaml({
      name: "arc-session",
      description: "Initialize and resume the active working ARC session.",
    });

    expect(yaml).toContain('display_name: "ARC Session"');
    expect(yaml).toContain(
      'short_description: "Initialize and resume the active working ARC session."',
    );
    expect(yaml).toContain("default_prompt:");
    expect(yaml).toContain("interface:");
  });
});
