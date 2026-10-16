/**
 * Regression coverage for the ARC integrity verifier.
 */

import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_PROMPTS, createTempRepo, initInTempRepo, removeGitBackedDir } from "../../helpers/integration.js";
import { runScript } from "../../helpers/run-script.js";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const repoRoot = join(dirname(__filename), "..", "..", "..", "..", "..");
const verifyIntegrityScript = join(
  repoRoot,
  "packages/arc-framework/arc/system/.internal/scripts/verify-integrity.sh",
);

async function write(path: string, content = "\n"): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf-8");
}

async function writeExecutable(path: string, content: string): Promise<void> {
  await write(path, content);
  await chmod(path, 0o755);
}

async function writeMinimalArcInstall(root: string): Promise<void> {
  const arc = join(root, ".arc");
  const coreFiles = [
    "reference/briefs/AGENT-BRIEF.ARC.md",
    "reference/briefs/AGENT-BRIEF.PROJECT.md",
    "system/rules/DEV-RULES.ARC.md",
    "system/rules/DEV-RULES.PROJECT.md",
    "reference/QUICK-REFERENCE.md",
    "system/arc-config.yml",
    "reference/strategies/STRATEGY-INDEX.md",
    "system/workflows/arc/session-lifecycle/session-init.md",
    "system/workflows/arc/process-task-loop.md",
  ];
  for (const file of coreFiles) await write(join(arc, file), "# Test\n");

  await mkdir(join(arc, "reference/strategies/arc"), { recursive: true });
  await write(
    join(arc, "system/methods/example.md"),
    "---\nname: example\ndescription: Example method\noverride-active: false\n---\n",
  );

  await writeExecutable(
    join(arc, "system/.internal/scripts/arc-lib.sh"),
    "ARC_RED=\nARC_YELLOW=\nARC_GREEN=\nARC_NC=\narc_config_get() { echo \"$2\"; }\n",
  );
  await writeExecutable(join(arc, "system/.internal/scripts/validate-config.sh"), "echo PASS config\n");
  for (const hook of ["pre-commit", "commit-msg", "pre-push"]) {
    await writeExecutable(join(arc, "system/.internal/githooks", hook), "#!/usr/bin/env bash\nexit 0\n");
  }
}

describe("verify-integrity.sh", () => {
  let tmpDir: string | undefined;

  afterEach(async () => {
    if (tmpDir !== undefined) {
      await removeGitBackedDir(tmpDir);
      tmpDir = undefined;
    }
  });

  describe("frontmatter boundaries", () => {
    const copies = [
      { label: "package", script: verifyIntegrityScript },
      { label: "project", script: join(repoRoot, ".arc/system/.internal/scripts/verify-integrity.sh") },
    ];
    const fields = ["name: example", "description: Example method", "override-active: false"];

    async function verifyMethod(script: string, lines: string[]) {
      tmpDir = await createTempRepo("arc-verify-frontmatter-");
      await writeMinimalArcInstall(tmpDir);
      await execFileAsync("git", ["config", "core.hooksPath", ".arc/system/.internal/githooks"], { cwd: tmpDir });
      await write(join(tmpDir, ".arc/system/methods/example.md"), [...lines, ""].join("\n"));
      return runScript(script, [], { cwd: tmpDir });
    }

    it.each(copies)("accepts keys and a closing fence beyond line 20 in the $label copy", async ({ script }) => {
      const result = await verifyMethod(script, [
        "---", ...Array.from({ length: 30 }, (_, index) => `# padding ${index}`), ...fields, "---", "# Body",
      ]);

      expect(result.exitCode, result.stdout).toBe(0);
      expect(result.stdout).toContain("PASS  example.md: frontmatter present");
    });

    it.each(copies.flatMap((copy) => fields.map((field) => ({ ...copy, field }))))(
      "ignores body text posing as $field in the $label copy",
      async ({ script, field }) => {
        const key = field.split(":")[0];
        const result = await verifyMethod(script, [
          "---", ...fields.filter((candidate) => candidate !== field), "---", "# Body", field,
        ]);

        expect(result.exitCode).toBe(2);
        expect(result.stdout).toContain(`example.md: missing frontmatter key(s): ${key}`);
      },
    );

    it.each(copies)("still rejects a missing opening fence in the $label copy", async ({ script }) => {
      const result = await verifyMethod(script, ["# Body", ...fields, "---"]);

      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain("example.md: missing frontmatter (file must start with ---)");
    });

    it.each(copies)("still rejects a missing closing fence in the $label copy", async ({ script }) => {
      const result = await verifyMethod(script, ["---", ...fields]);

      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain("example.md: frontmatter block not closed");
    });
  });

  it("checks surviving method structure without the retired directory", async () => {
    tmpDir = await initInTempRepo(DEFAULT_PROMPTS);
    await rm(join(tmpDir, ".arc/system/extensions"), { recursive: true, force: true });
    const script = join(tmpDir, ".arc/system/.internal/scripts/verify-integrity.sh");
    const clean = await runScript(script, [], { cwd: tmpDir });
    expect(clean.exitCode).toBe(0);
    expect(clean.stdout).not.toContain("Extensions directory missing");
    await write(join(tmpDir, ".arc/system/methods/example.md"),
      "---\nname: example\ndescription: Example method\n---\n");
    const malformed = await runScript(script, [], { cwd: tmpDir });
    expect(malformed.exitCode).toBe(2);
    expect(malformed.stdout).toContain("example.md: missing frontmatter key(s): override-active");
  }, 30_000);

  it.each([
    ["none", false],
    ["none", true],
    ["external", false],
    ["external", true],
    ["arc-in-git", false],
    ["arc-in-git", true],
  ] as const)("reports a completely clean fresh install for pm=%s, team=%s", async (pm_mode, team_mode) => {
    tmpDir = await initInTempRepo({ ...DEFAULT_PROMPTS, pm_mode, team_mode });
    const result = await runScript(join(tmpDir, ".arc/system/.internal/scripts/verify-integrity.sh"), [], {
      cwd: tmpDir,
    });

    expect(result.stdout).not.toMatch(/^ERROR |^WARN /m);
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Integrity check: all clear");
  }, 30_000);

  it.each([
    "strategy-work-organization.md",
    "strategy-planning-module.md",
    "strategy-team-coordination.md",
  ])("still reports a missing installed strategy: %s", async (strategy) => {
    tmpDir = await initInTempRepo({ ...DEFAULT_PROMPTS, pm_mode: "arc-in-git", team_mode: true });
    await rm(join(tmpDir, ".arc/reference/strategies/arc", strategy));
    const result = await runScript(join(tmpDir, ".arc/system/.internal/scripts/verify-integrity.sh"), [], {
      cwd: tmpDir,
    });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain(`ERROR Strategy indexed but file missing: arc/${strategy}`);
  }, 30_000);

  it("retains manifest expectations when the current mode changes", async () => {
    tmpDir = await initInTempRepo({ ...DEFAULT_PROMPTS, pm_mode: "arc-in-git", team_mode: true });
    const configPath = join(tmpDir, ".arc/system/arc-config.yml");
    const config = await readFile(configPath, "utf-8");
    await writeFile(configPath, config
      .replace("pm.mode: arc-in-git", "pm.mode: none")
      .replace("team.mode: true", "team.mode: false"));
    for (const strategy of ["strategy-planning-module.md", "strategy-team-coordination.md"]) {
      await rm(join(tmpDir, ".arc/reference/strategies/arc", strategy));
    }
    const result = await runScript(join(tmpDir, ".arc/system/.internal/scripts/verify-integrity.sh"), [], {
      cwd: tmpDir,
    });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain("ERROR Strategy indexed but file missing: arc/strategy-planning-module.md");
    expect(result.stdout).toContain("ERROR Strategy indexed but file missing: arc/strategy-team-coordination.md");
  }, 30_000);

  it("requires newly enabled mode strategies even when the manifest excludes them", async () => {
    tmpDir = await initInTempRepo(DEFAULT_PROMPTS);
    const configPath = join(tmpDir, ".arc/system/arc-config.yml");
    const config = await readFile(configPath, "utf-8");
    await writeFile(configPath, config
      .replace("pm.mode: none", "pm.mode: arc-in-git")
      .replace("team.mode: false", "team.mode: true"));
    const result = await runScript(join(tmpDir, ".arc/system/.internal/scripts/verify-integrity.sh"), [], {
      cwd: tmpDir,
    });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain("ERROR Strategy indexed but file missing: arc/strategy-planning-module.md");
    expect(result.stdout).toContain("ERROR Strategy indexed but file missing: arc/strategy-team-coordination.md");
  }, 30_000);

  it("uses the active modes when an installation has no manifest", async () => {
    tmpDir = await initInTempRepo(DEFAULT_PROMPTS);
    await rm(join(tmpDir, ".arc/system/.internal/manifest.json"));
    const result = await runScript(join(tmpDir, ".arc/system/.internal/scripts/verify-integrity.sh"), [], {
      cwd: tmpDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Integrity check: all clear");
  }, 30_000);

  it.each(["{", '{"files":null}'])("reports an unreadable manifest instead of a clean result: %s", async (contents) => {
    tmpDir = await initInTempRepo(DEFAULT_PROMPTS);
    await writeFile(join(tmpDir, ".arc/system/.internal/manifest.json"), contents);
    const result = await runScript(join(tmpDir, ".arc/system/.internal/scripts/verify-integrity.sh"), [], {
      cwd: tmpDir,
    });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain("ERROR Could not read installed strategy inventory from manifest");
  }, 30_000);

  it("flags lifecycle metas missing the closing metadata rule", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "arc-verify-integrity-"));
    await writeMinimalArcInstall(tmpDir);
    await write(
      join(tmpDir, ".arc/backlog/planned/foo/meta-foo.md"),
      [
        "# Metadata: Foo",
        "",
        "| **State** | **Owner** | **Branch** | **Class** | **Priority** |",
        "| --------- | --------- | ---------- | --------- | ------------ |",
        "| `Planning` | `andrew` | `[none]` | `Light` | `P1` |",
        "",
        "- **Design:** `draft-foo.md`",
        "- **Task List:** [none]",
        "",
      ].join("\n"),
    );

    await expect(execFileAsync("bash", [verifyIntegrityScript], { cwd: tmpDir })).rejects.toMatchObject({
      code: 2,
      stdout: expect.stringContaining("closing `---`"),
    });
  });

  it("finds every core file it requires in a real installed ARC tree", async () => {
    // The repository's own .arc/ is a rendered installation, so it carries the installed file names;
    // other sections may report unrelated findings there, so only the file-structure section is asserted.
    const stdout = await execFileAsync("bash", [verifyIntegrityScript], { cwd: repoRoot }).then(
      (result) => result.stdout,
      (error: { stdout?: string }) => error.stdout ?? "",
    );
    const fileStructure = stdout.split("--- File Structure ---")[1]?.split("\n\n")[0] ?? "";

    expect(fileStructure).toContain("PASS  Process task loop: .arc/system/workflows/arc/process-task-loop.md");
    expect(fileStructure).not.toContain("ERROR");
  });

  it("reports an unexpected config-validator exit as an error", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "arc-verify-integrity-"));
    await writeMinimalArcInstall(tmpDir);
    await writeExecutable(
      join(tmpDir, ".arc/system/.internal/scripts/validate-config.sh"),
      "echo validator crashed\nexit 127\n",
    );

    await expect(execFileAsync("bash", [verifyIntegrityScript], { cwd: tmpDir })).rejects.toMatchObject({
      code: 2,
      stdout: expect.stringContaining("ERROR Config validation exited unexpectedly with status 127"),
    });
  });
});
