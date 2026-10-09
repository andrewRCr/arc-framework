/** Repository content shared by built-CLI check fixtures. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFile, chmod, copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createTempRepoCore } from "../../helpers/temp-repo.js";
import { CLI_PATH } from "../../helpers/cli-spawn.js";

const execFileAsync = promisify(execFile);

/** Create a committed declaration with one worktree input change. */
export async function createDeclaredCheckRepository(checks: Record<string, unknown>, declaration: Record<string, unknown> = {}): Promise<string> {
  const cwd = await createTempRepoCore({ prefix: "arc-increment-declared-" });
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await mkdir(join(cwd, "src"));
  await mkdir(join(cwd, "docs"));
  await writeFile(join(cwd, ".gitignore"), "receipt.json\n");
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

/**
 * Install the shipped commit hook and a repository-local wrapper for the qualified built CLI.
 * @param cwd - Check fixture repository
 * @returns Resolves after the hook and CLI wrapper are ready
 */
export async function installDeclaredCommitHook(cwd: string): Promise<void> {
  const source = resolve(import.meta.dirname, "../../../arc/system/.internal");
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "hooks.pre_commit: enabled\npm.mode: none\n");
  await appendFile(join(cwd, ".gitignore"), "node_modules/\n");
  for (const path of ["githooks/pre-commit", "scripts/arc-lib.sh"]) {
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

