/** Initialized built-CLI repositories shared as independent copies within each E2E file. */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterAll, expect } from "vitest";

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

/**
 * The initialized repositories most describe blocks start from: `arc init` alone, `arc init` with an empty `init`
 * commit, and the same in arc-in-git mode.
 */
type InitializedStart = "initialized" | "initialized-and-committed" | "arc-in-git-and-committed";

const initializedTemplates = new Map<InitializedStart, Promise<PreparedRepositoryTemplate>>();

function initializedShape(start: InitializedStart): PreparedRepositoryShape {
  return { kind: "plain", key: `errand-e2e-${start}-v1` };
}

/** Run `arc init` once for one start, so each test copies the result instead of initializing its own. */
async function buildInitializedStart(start: InitializedStart): Promise<string> {
  const root = await createTempRepo();
  try {
    const pmMode = start === "arc-in-git-and-committed" ? ["--pm-mode", "arc-in-git"] : [];
    const init = await runArc(["init", "--yes", "--name", "test-project", ...pmMode], root);
    expect(init.exitCode, init.stderr || init.stdout).toBe(0);
    if (start !== "initialized") await git(root, ["commit", "--allow-empty", "--no-verify", "-m", "init"]);
    return root;
  } catch (error) {
    await cleanupTempDir(root);
    throw error;
  }
}

/** An independent copy of one initialized start, built on first use. */
export async function initializedRepository(start: InitializedStart): Promise<string> {
  let template = initializedTemplates.get(start);
  if (template === undefined) {
    template = prepareRepositoryTemplate(initializedShape(start), () => buildInitializedStart(start));
    initializedTemplates.set(start, template);
  }
  return copyPreparedRepository(await template, initializedShape(start));
}

afterAll(async () => {
  const built = await Promise.allSettled(initializedTemplates.values());
  await Promise.all(built.flatMap((result) => result.status === "fulfilled" ? [cleanupTempDir(result.value.root)] : []));
});
