/** Declared commit gates through the installed pre-commit hook and real Git. */
import { execFile } from "node:child_process";
import { chmod, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import { restrictedGitPath } from "../helpers/restricted-git-path.js";
import { CLI_PATH } from "../helpers/cli-spawn.js";
import { createTempRepoCore, removeGitBackedDirs } from "../helpers/temp-repo.js";

const exec = promisify(execFile);
const repositories: string[] = [];
const source = resolve(import.meta.dirname, "../../arc/system/.internal");
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

async function installCli(cwd: string, path = join(cwd, "node_modules/.bin/arc")): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(CLI_PATH)} "$@"\n`);
  await chmod(path, 0o755);
}

async function fixture(options: { disabled?: boolean; absent?: boolean; missingCli?: boolean; failed?: boolean } = {}): Promise<string> {
  const cwd = await createTempRepoCore({ prefix: "arc-installed-pre-commit-" });
  repositories.push(cwd);
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), `hooks.pre_commit: ${options.disabled ? "disabled" : "enabled"}\npm.mode: none\n`);
  await writeFile(join(cwd, ".gitignore"), "receipt.txt\nnode_modules/\n");
  await writeFile(join(cwd, "data.txt"), "base\n");
  if (!options.absent) await writeFile(join(cwd, ".arc/system/arc-checks.yml"), JSON.stringify({ checks: {
    content: { command: [process.execPath, "-e", `require('node:fs').writeFileSync('receipt.txt', 'executed'); process.exit(${options.failed ? 1 : 0});`], inputs: ["data.txt"], gate: "commit" },
  } }));
  await exec("git", ["add", "-A"], { cwd });
  await exec("git", ["commit", "-m", "base"], { cwd });
  for (const path of ["githooks/pre-commit", "scripts/arc-lib.sh"]) {
    const target = join(cwd, ".arc/system/.internal", path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(source, path), target);
    await chmod(target, 0o755);
  }
  await exec("git", ["config", "core.hooksPath", ".arc/system/.internal/githooks"], { cwd });
  if (!options.missingCli) await installCli(cwd);
  await writeFile(join(cwd, "data.txt"), "changed\n");
  await exec("git", ["add", "data.txt"], { cwd });
  return cwd;
}

async function commit(cwd: string, executableDirectories: string[] = []): Promise<{ exitCode: number; output: string }> {
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, PATH: [...executableDirectories, await restrictedGitPath(cwd)].join(delimiter), NO_COLOR: "1" };
    delete env.FORCE_COLOR;
    const result = await exec("git", ["commit", "-m", "changed"], { cwd, env });
    return { exitCode: 0, output: result.stdout + result.stderr };
  } catch (error) {
    const result = error as { code?: number; stdout?: string; stderr?: string };
    return { exitCode: result.code ?? 1, output: (result.stdout ?? "") + (result.stderr ?? "") };
  }
}

it("does not dispatch the gate when the hook is disabled", async () => {
  const cwd = await fixture({ disabled: true, failed: true });
  expect((await commit(cwd)).exitCode).toBe(0);
  await expect(readFile(join(cwd, "receipt.txt"))).rejects.toMatchObject({ code: "ENOENT" });
});

it.each([false, true])("gates the real commit on its declared check failure: %s", async failed => {
  const cwd = await fixture({ failed });
  const result = await commit(cwd);
  expect(result.exitCode, result.output).toBe(failed ? 1 : 0);
  expect(result.output).toContain(`content: ${failed ? "failed" : "passed"}`);
  expect(await readFile(join(cwd, "receipt.txt"), "utf8")).toBe("executed");
});

it("refuses with CLI installation guidance and succeeds after installing it", async () => {
  const cwd = await fixture({ missingCli: true });
  const refused = await commit(cwd);
  expect(refused.exitCode, refused.output).toBe(1);
  expect(refused.output).toContain("commit gate");
  expect(refused.output).toContain("Install @arc-framework/cli");
  await installCli(cwd);
  const repaired = await commit(cwd);
  expect(repaired.exitCode, repaired.output).toBe(0);
  expect(await readFile(join(cwd, "receipt.txt"), "utf8")).toBe("executed");
});

it("commits without a CLI when no declaration is present", async () => {
  const cwd = await fixture({ missingCli: true, absent: true });
  const result = await commit(cwd);
  expect(result.exitCode, result.output).toBe(0);
  expect(result.output).not.toContain("could not be resolved");
});

it("dispatches through a global CLI when no repository-local CLI is installed", async () => {
  const cwd = await fixture({ missingCli: true });
  const globalBin = join(cwd, "tools/bin");
  await installCli(cwd, join(globalBin, "arc"));
  const result = await commit(cwd, [globalBin]);
  expect(result.exitCode, result.output).toBe(0);
  expect(result.output).toContain("content: passed");
  expect(await readFile(join(cwd, "receipt.txt"), "utf8")).toBe("executed");
});

it("prefers the repository-local CLI over a failing global executable", async () => {
  const cwd = await fixture();
  const globalBin = join(cwd, "tools/bin");
  await mkdir(globalBin, { recursive: true });
  await writeFile(join(globalBin, "arc"), "#!/bin/sh\nexit 1\n");
  await chmod(join(globalBin, "arc"), 0o755);
  const result = await commit(cwd, [globalBin]);
  expect(result.exitCode, result.output).toBe(0);
  expect(result.output).toContain("content: passed");
  expect(await readFile(join(cwd, "receipt.txt"), "utf8")).toBe("executed");
});
