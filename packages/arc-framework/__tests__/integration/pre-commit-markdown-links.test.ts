/** Full-hook coverage for literal staged Markdown filenames and link restrictions. */

import { execa } from "execa";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempRepo } from "../helpers/integration.js";
import { restrictedGitPath } from "../helpers/restricted-git-path.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const hookPaths = [
  ".arc/system/.internal/githooks/pre-commit",
  "packages/arc-framework/arc/system/.internal/githooks/pre-commit",
];
const filenameCases = [
  { source: "source with spaces.md", target: "/.arc/active/meta-example.md", reason: "link to movable artifact" },
  { source: "source with spaces.md", target: "/.arc/user/alice/private.md", reason: "link to ignored ARC path" },
  { source: "source\twith-tab.md", target: "/.arc/active/meta-example.md", reason: "link to movable artifact" },
  { source: "source[ab].md", target: "/.arc/active/meta-example.md", reason: "link to movable artifact" },
].filter(({ source }) => process.platform !== "win32" || !source.includes("\t")); // Windows forbids tabs in filenames.

async function writeRepoFile(root: string, path: string, content: string): Promise<void> {
  const fullPath = join(root, path);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content);
}

describe.each(hookPaths)("literal Markdown filenames through %s", (hookPath) => {
  const fixtures: string[] = [];

  afterEach(async () => {
    await Promise.all(fixtures.splice(0).map((root) => cleanupTempDir(root)));
  });

  it.each(filenameCases)("rejects forbidden links in $source to $target and accepts a corrected retry", async ({ source, target, reason }) => {
    const root = await createTempRepo("arc-pre-commit-links-");
    fixtures.push(root);
    await writeRepoFile(root, ".arc/system/arc-config.yml", [
      "hooks.pre_commit: enabled", "branch.protection: partial", "pm.mode: none", "",
    ].join("\n"));
    await writeRepoFile(root, ".gitignore", ".arc/user/*\n");
    await writeRepoFile(root, ".arc/user/README.md", "# Tracked user documentation\n");
    await execa("git", ["add", "-f", ".arc/user/README.md"], { cwd: root });
    await writeRepoFile(root, ".arc/active/meta-example.md", "# Record\n");
    await writeRepoFile(root, ".arc/user/alice/private.md", "# Private\n");
    await writeRepoFile(root, "sourcea.md", "# Unrelated wildcard match\n");
    await writeRepoFile(root, source, `[record](${target})\n`);
    await execa("git", ["add", "--", source], { cwd: root });
    const env = { ...process.env, PATH: await restrictedGitPath(root), FORCE_COLOR: undefined, NO_COLOR: "1" };
    const runHook = () => execa("bash", [resolve(repoRoot, hookPath)], { cwd: root, env, reject: false });

    const refused = await runHook();
    expect(refused.exitCode, refused.stdout).toBe(1);
    expect(refused.stdout).toContain(reason);
    expect(refused.stdout).toContain(source);

    await writeRepoFile(root, source, "[users](/.arc/user/README.md)\n");
    await execa("git", ["add", "--", source], { cwd: root });
    const corrected = await runHook();
    expect(corrected.exitCode, corrected.stdout).toBe(0);
    expect(corrected.stdout).toContain("Pre-commit checks PASSED");
    expect(corrected.stdout).not.toContain("Markdown link resolution failed");
  });
});
