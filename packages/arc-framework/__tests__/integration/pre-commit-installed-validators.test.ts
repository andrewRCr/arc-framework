/** Full-hook coverage for the validators an installed project, which has no package source, reaches. */

import { execa } from "execa";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { CLI_PATH } from "../helpers/cli-spawn.js";
import { cleanupTempDir, createTempRepo } from "../helpers/integration.js";
import { restrictedGitPath } from "../helpers/restricted-git-path.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const hookPaths = [
  ".arc/system/.internal/githooks/pre-commit",
  "packages/arc-framework/arc/system/.internal/githooks/pre-commit",
];
const methodPath = ".arc/system/methods/project-check.md";
const domainRulesPath = ".arc/system/rules/DEV-RULES.FRONTEND.md";
const validMethod = "---\nname: project-check\ndescription: A project method\noverride-active: false\n---\n";
const validDomainRules = "---\ndomain: frontend\npurpose: UI standards\n---\n";

async function writeRepoFile(root: string, path: string, content: string): Promise<void> {
  const fullPath = join(root, path);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content);
}

describe.each(hookPaths)("installed-project validators through %s", (hookPath) => {
  const fixtures: string[] = [];

  afterEach(async () => {
    await Promise.all(fixtures.splice(0).map((root) => cleanupTempDir(root)));
  });

  async function fixture(install: "global" | "repo-local" | "none" = "global") {
    const root = await createTempRepo("arc-pre-commit-installed-");
    fixtures.push(root);
    await writeRepoFile(root, ".arc/system/arc-config.yml", [
      "hooks.pre_commit: enabled", "branch.protection: partial", "pm.mode: arc-in-git", "",
    ].join("\n"));
    // The built CLI stands in for the installed package: on PATH for a global install, or only in the
    // project's node_modules for a repository-local one.
    const bin = await restrictedGitPath(root);
    if (install === "global") await symlink(CLI_PATH, join(bin, "arc"));
    if (install === "repo-local") {
      await mkdir(join(root, "node_modules", ".bin"), { recursive: true });
      await symlink(CLI_PATH, join(root, "node_modules", ".bin", "arc"));
    }
    const env = { ...process.env, PATH: bin, FORCE_COLOR: undefined, NO_COLOR: "1" };
    const runHook = () => execa("bash", [resolve(repoRoot, hookPath)], { cwd: root, env, reject: false });
    const stage = (...paths: string[]) => execa("git", ["add", "--", ...paths], { cwd: root });
    return { root, runHook, stage };
  }

  it.each(["global", "repo-local"] as const)("validates staged frontmatter through a %s CLI install", async (install) => {
    const { root, runHook, stage } = await fixture(install);
    await writeRepoFile(root, methodPath, "---\ndescription: missing name\noverride-active: false\n---\n");
    await writeRepoFile(root, domainRulesPath, "---\npurpose: missing domain\n---\n");
    await stage(methodPath, domainRulesPath);

    const refused = await runHook();
    expect(refused.exitCode, refused.stdout).toBe(1);
    expect(refused.stdout).toContain("Error: Frontmatter schema validation failed:");
    expect(refused.stdout).toContain(`${methodPath}:`);
    expect(refused.stdout).toContain("Error: Domain-rules frontmatter validation failed:");
    expect(refused.stdout).toContain(`${domainRulesPath}:`);
    expect(refused.stdout).not.toContain("ERR_MODULE_NOT_FOUND");

    await writeRepoFile(root, methodPath, validMethod);
    await writeRepoFile(root, domainRulesPath, validDomainRules);
    await stage(methodPath, domainRulesPath);
    const corrected = await runHook();
    expect(corrected.exitCode, corrected.stdout).toBe(0);
    expect(corrected.stdout).toContain("Pre-commit checks PASSED");
  });

  it("refuses invalid staged frontmatter when the working copy has since been corrected", async () => {
    const { root, runHook, stage } = await fixture();
    await writeRepoFile(root, methodPath, "---\ndescription: missing name\noverride-active: false\n---\n");
    await stage(methodPath);
    await writeRepoFile(root, methodPath, validMethod);

    const refused = await runHook();
    expect(refused.exitCode, refused.stdout).toBe(1);
    expect(refused.stdout).toContain("Error: Frontmatter schema validation failed:");
    expect(refused.stdout).toContain(`${methodPath}:`);
  });

  it("passes valid staged frontmatter when the working copy has since been broken", async () => {
    const { root, runHook, stage } = await fixture();
    await writeRepoFile(root, methodPath, validMethod);
    await stage(methodPath);
    await writeRepoFile(root, methodPath, "---\ndescription: missing name\noverride-active: false\n---\n");

    const result = await runHook();
    expect(result.exitCode, result.stdout).toBe(0);
    expect(result.stdout).toContain("Pre-commit checks PASSED");
  });

  it("refuses staged frontmatter it cannot validate when no CLI is installed, naming why", async () => {
    const { root, runHook, stage } = await fixture("none");
    await writeRepoFile(root, methodPath, validMethod);
    await stage(methodPath);

    const refused = await runHook();
    expect(refused.exitCode, refused.stdout).toBe(1);
    expect(refused.stdout).toContain("Error: Frontmatter schema validation failed:");
    expect(refused.stdout).toContain("the ARC CLI could not be resolved");
  });

  it("skips the lifecycle checks an installed project has no source for, naming each", async () => {
    const { root, runHook, stage } = await fixture();
    await writeRepoFile(root, ".arc/backlog/planned/example/meta-example.md", "# Metadata: example\n");
    await writeRepoFile(root, ".arc/backlog/ROADMAP.md", "# Roadmap\n");
    await stage(".arc/backlog/planned/example/meta-example.md", ".arc/backlog/ROADMAP.md");

    const result = await runHook();
    expect(result.exitCode, result.stdout).toBe(0);
    expect(result.stdout).toContain(
      "Notice: Meta-file validation skipped; it needs ARC's package source, which this installation does not include.",
    );
    expect(result.stdout).toContain("Notice: Cohort-consistency validation skipped");
    expect(result.stdout).toContain("Notice: ROADMAP regeneration assert skipped");
    expect(result.stdout).not.toContain("ERR_MODULE_NOT_FOUND");
  });
});
