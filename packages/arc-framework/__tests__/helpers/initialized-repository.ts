/** Initialized built-CLI repositories shared as independent copies within each E2E file. */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterAll, expect } from "vitest";

import { IN_REPO_STORE_OVERRIDE } from "../../src/lib/store/selection.js";
import { cleanupTempDir, createTempRepo, runArc } from "../e2e/helpers.js";
import {
  copyPreparedRepository,
  prepareRepositoryTemplate,
  type PreparedRepositoryShape,
  type PreparedRepositoryTemplate,
} from "./prepared-repository.js";

const execFileAsync = promisify(execFile);

/** Run a fixture Git command with the repository's configured hooks. */
async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout;
}

/** Init-only default or Claude starts, plus committed default or arc-in-git starts. */
type InitializedStart = "initialized" | "claude-initialized" | "initialized-and-committed" | "arc-in-git-and-committed";

const initializedTemplates = new Map<string, Promise<PreparedRepositoryTemplate>>();

function initializedShape(start: InitializedStart, selection: string): PreparedRepositoryShape {
  return { kind: "plain", key: `errand-e2e-${start}-${selection}-v1` };
}

/** Run `arc init` once for one start, so each test copies the result instead of initializing its own. */
async function buildInitializedStart(start: InitializedStart): Promise<string> {
  const root = await createTempRepo();
  try {
    const pmMode = start === "arc-in-git-and-committed" ? ["--pm-mode", "arc-in-git"] : [];
    const tools = start === "claude-initialized" ? ["--tools", "claude"] : [];
    const init = await runArc(["init", "--yes", "--name", "test-project", ...pmMode, ...tools], root);
    expect(init.exitCode, init.stderr || init.stdout).toBe(0);
    if (start === "initialized-and-committed" || start === "arc-in-git-and-committed") {
      await git(root, ["commit", "--allow-empty", "--no-verify", "-m", "init"]);
    }
    return root;
  } catch (error) {
    await cleanupTempDir(root);
    throw error;
  }
}

/** An independent copy of one initialized start, built on first use for each store the test process selects, so the
 * template matches the store the test's commands open.
 * @param start - The start to initialize.
 * @returns The copy's root.
 */
export async function initializedRepository(start: InitializedStart): Promise<string> {
  const selection = process.env[IN_REPO_STORE_OVERRIDE] ? "in-repo" : "ref";
  const shape = initializedShape(start, selection), key = `${start}:${selection}`;
  let template = initializedTemplates.get(key);
  if (template === undefined) {
    template = prepareRepositoryTemplate(shape, () => buildInitializedStart(start));
    initializedTemplates.set(key, template);
  }
  return copyPreparedRepository(await template, shape);
}

afterAll(async () => {
  const built = await Promise.allSettled(initializedTemplates.values());
  await Promise.all(built.flatMap((result) => result.status === "fulfilled" ? [cleanupTempDir(result.value.root)] : []));
});
