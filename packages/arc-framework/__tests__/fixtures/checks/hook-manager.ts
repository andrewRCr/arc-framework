/** Real native hook-manager installation around the built CLI. */
import { execa } from "execa";
import { createRequire } from "node:module";
import { appendFile, chmod, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { environmentForGitCwd } from "../../../src/lib/git/process-executor.js";
import { CLI_PATH } from "../../helpers/cli-spawn.js";
import type { HookManagerTools } from "../../helpers/hook-manager-tools.js";
import { cleanupTempDir, createTempRepo, git, runArc } from "../../e2e/helpers.js";

/** Supported repository integrations exercised through native installers. */
export type NativeHookManager = "husky" | "lefthook" | "pre-commit" | "core.hooksPath";
/** Manager matrix shared by native commit and push scenarios. */
export const HOOK_MANAGERS: NativeHookManager[] = ["husky", "lefthook", "pre-commit", "core.hooksPath"];
/** Valid content whose policy is checked by the installed commit-message hook. */
export const VALID_MESSAGE = "test(fixture): change input\n\nContext: standalone (maintenance)";

/**
 * Prepare committed inputs and invoke the manager's ordinary installer.
 * @param manager - Repository integration to configure through real init
 * @param tools - Verified native manager executables from E2E setup
 * @param disabled - Persist the disabled commit-hook setting before installing
 * @returns Caller-owned repository with installed hooks and committed source inputs
 */
export async function createHookManagerRepository(
  manager: NativeHookManager, tools: HookManagerTools, disabled = false,
): Promise<string> {
  const root = await createTempRepo("arc-native-hooks-");
  try {
    const require = createRequire(import.meta.url);
    const huskyDirectory = dirname(require.resolve("husky"));
    if (manager === "husky") await mkdir(join(root, ".husky"));
    if (manager === "lefthook") await writeFile(join(root, "lefthook.yml"), "{}\n");
    if (manager === "pre-commit") await writeFile(join(root, ".pre-commit-config.yaml"), "repos: []\n");
    await writeFile(join(root, "package.json"), JSON.stringify({ private: true,
      scripts: { prepare: "node node_modules/husky/bin.js" } }));
    const initialized = await runArc(["init", "--yes", "--name", "native-hook-test"], root);
    if (initialized.exitCode !== 0) throw new Error(initialized.stdout + initialized.stderr);
    await appendFile(join(root, ".gitignore"), "\nreceipt.json\nnode_modules/\n");
    if (disabled) {
      const configPath = join(root, ".arc/system/arc-config.yml");
      await writeFile(configPath, (await readFile(configPath, "utf8")).replace("hooks.pre_commit: enabled", "hooks.pre_commit: disabled"));
    }
    await writeFile(join(root, ".arc/system/arc-checks.yml"), JSON.stringify({ checks: { content: {
      gate: "commit", cache: false, inputs: ["src/**"], command: [process.execPath, "-e",
        "require('node:fs').appendFileSync('receipt.json', 'executed\\n')"],
    } } }));
    await mkdir(join(root, "src"));
    for (let index = 0; index < 24; index++) await writeFile(join(root, "src", `${index}.txt`), "base\n");
    await git(root, ["add", "-A"]);
    await git(root, ["commit", "-m", "base"]);
    await git(root, ["switch", "-c", "feat/native-hooks"]);
    const wrapper = join(root, "node_modules/.bin/arc");
    await mkdir(dirname(wrapper), { recursive: true });
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
    await writeFile(wrapper, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(CLI_PATH)} "$@"\n`);
    await chmod(wrapper, 0o755);
    const installationOptions = { cwd: root,
      env: { ...environmentForGitCwd(root), PRE_COMMIT_HOME: join(root, ".git/test-pre-commit-cache") }, timeout: 30_000 };
    if (manager === "husky") {
      await symlink(huskyDirectory, join(root, "node_modules/husky"), "junction");
      await execa("npm", ["run", "prepare"], installationOptions);
    }
    if (manager === "lefthook") await execa(tools.lefthook, ["install"], installationOptions);
    if (manager === "pre-commit") await execa(tools.preCommit, ["install"], installationOptions);
    return root;
  } catch (error) { await cleanupTempDir(root); throw error; }
}

/**
 * Commit staged fixture inputs through installed hooks, preserving native status.
 * @param root - Prepared fixture repository
 * @param message - Message that Git passes to the installed validation hook
 * @param environment - Process overrides scoped to the fixture commit
 * @returns Git's exit code and captured hook diagnostics
 */
export async function commitThroughManager(root: string, message = VALID_MESSAGE, environment: NodeJS.ProcessEnv = {}): Promise<{ exitCode: number; output: string }> {
  const result = await execa("git", ["commit", "-m", message], {
    cwd: root, reject: false, timeout: 30_000, env: { ...environmentForGitCwd(root), FORCE_COLOR: undefined, NO_COLOR: "1", LEFTHOOK: undefined, HUSKY: "1", PRE_COMMIT_HOME: join(root, ".git/test-pre-commit-cache"), ...environment },
  });
  return { exitCode: result.exitCode ?? 2, output: result.stdout + result.stderr };
}

/**
 * Read actual declared-check executions; absence means no execution occurred.
 * @param root - Prepared fixture repository
 * @returns Complete execution receipt or an empty string when absent
 */
export async function executionReceipt(root: string): Promise<string> {
  try { return await readFile(join(root, "receipt.json"), "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}
