/** Repository content shared by built-CLI check fixtures. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFile, chmod, copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createTempRepoCore } from "../../helpers/temp-repo.js";
import { CLI_PATH } from "../../helpers/cli-spawn.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { PERSONAL_NPM_IGNORE, PERSONAL_NPM_IGNORE_CONTENT } from "../../../src/lib/personal-npm-ignore.js";
import { guardedProjectionRoots, type IgnoreLineFile } from "../../../src/lib/store/projection/ignore-guard.js";

const execFileAsync = promisify(execFile);

/** A checkout that tracks ARC state, as one on the in-repo store does, leaves its lifecycle roots unexcluded. */
export interface DeclaredCheckRepositoryOptions { readonly tracksState?: boolean }

/** Create a committed declaration with one worktree input change. */
export async function createDeclaredCheckRepository(checks: Record<string, unknown>,
  declaration: Record<string, unknown> = {}, options: DeclaredCheckRepositoryOptions = {}): Promise<string> {
  const cwd = await createTempRepoCore({ prefix: "arc-increment-declared-" });
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await mkdir(join(cwd, "src"));
  await mkdir(join(cwd, "docs"));
  await writeFile(join(cwd, ".gitignore"), `receipt.json\n${projectedRootLines(".gitignore")}`);
  if (options.tracksState !== true) {
    await appendFile(join(cwd, ".git/info/exclude"), projectedRootLines("info/exclude"));
  }
  await mkdir(join(cwd, ".arc/user"));
  await writeFile(join(cwd, PERSONAL_NPM_IGNORE), PERSONAL_NPM_IGNORE_CONTENT);
  await writeFile(join(cwd, "src/a.ts"), "base\n");
  await writeFile(join(cwd, "src/deleted.ts"), "deleted\n");
  await writeFile(join(cwd, "docs/b.md"), "base\n");
  await writeFile(join(cwd, "capture.cjs"), "require('node:fs').writeFileSync('receipt.json', JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }));\n");
  await writeFile(join(cwd, ".arc/system/arc-checks.yml"), JSON.stringify({ ...declaration, checks }));
  await execFileAsync("git", ["add", "-A"], { cwd });
  await execFileAsync("git", ["commit", "-m", "base"], { cwd });
  await writeFile(join(cwd, "src/a.ts"), "changed\n");
  return cwd;
}

/** The lines an initialized checkout holds in one ignore file, so the projection's ignore guard passes. */
function projectedRootLines(file: IgnoreLineFile): string {
  return guardedProjectionRoots(SlugSchema.parse("test-user")).filter(root => root.file === file)
    .map(root => `${root.line}\n`).join("");
}

/**
 * Install the shipped commit hook and a repository-local wrapper for the qualified built CLI.
 * @param cwd - Check fixture repository
 * @returns Resolves after the hook and CLI wrapper are ready
 */
export async function installDeclaredCommitHook(cwd: string): Promise<void> {
  const source = resolve(import.meta.dirname, "../../../arc/system/.internal");
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "hooks.pre_commit: enabled\npm.mode: none\n");
  await appendFile(join(cwd, ".gitignore"), "node_modules/\n");
  for (const path of ["githooks/pre-commit", "scripts/arc-lib.sh", "scripts/validate-links.sh"]) {
    const target = join(cwd, ".arc/system/.internal", path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(source, path), target);
    await chmod(target, 0o755);
  }
  const wrapper = join(cwd, "node_modules/.bin/arc");
  await mkdir(dirname(wrapper), { recursive: true });
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  await writeFile(wrapper, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(CLI_PATH)} "$@"\n`);
  await chmod(wrapper, 0o755);
  await execFileAsync("git", ["config", "core.hooksPath", ".arc/system/.internal/githooks"], { cwd });
}

