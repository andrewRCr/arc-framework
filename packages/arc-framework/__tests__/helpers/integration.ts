/**
 * Shared helpers for integration tests.
 *
 * Provides temp git repo setup, real I/O context construction, and
 * a full `arc init` runner for tests that need a working installation.
 */

import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  mkdir,
  access,
  readdir,
  stat,
} from "node:fs/promises";
import { join, dirname, relative } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";

import { runInit } from "../../src/commands/init.js";
import type { IOContext } from "../../src/commands/init.js";
import type { GitExec } from "../../src/lib/git.js";
import type { Recipe } from "../../src/lib/types.js";
import type { InitPromptResult } from "../../src/prompts/init-prompts.js";
import { getArcTemplatePath, getInternalTemplatePath } from "../../src/lib/paths.js";

const execFileAsync = promisify(execFile);

/** Create a real GitExec bound to a specific cwd. */
export function makeGitExec(cwd: string): GitExec {
  return async (cmd, args) => {
    const { stdout, stderr } = await execFileAsync(cmd, args, { cwd });
    return { stdout: stdout.trimEnd(), stderr };
  };
}

/** Create a real IOContext for a given cwd. */
export function makeIOContext(cwd: string): IOContext {
  return {
    readFile: (path) => readFile(path, "utf-8"),
    writeFile: (path, content) => writeFile(path, content, "utf-8"),
    mkdir: (path, opts) => mkdir(path, opts).then(() => undefined),
    access: (path) => access(path),
    exec: makeGitExec(cwd),
  };
}

/** SHA-256 hex digest of a string. */
export function sha256(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

/** Ensure a directory exists (recursive). */
export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

/** Initialize a temp directory with git repo and config. */
export async function createTempRepo(
  prefix = "arc-test-",
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  await execFileAsync("git", ["init", dir]);
  await execFileAsync("git", ["config", "user.email", "test@test.com"], {
    cwd: dir,
  });
  await execFileAsync("git", ["config", "user.name", "Test User"], {
    cwd: dir,
  });
  return dir;
}

/** Clean up a temp directory. */
export async function cleanupTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

/** Load the real init recipe from the template directory. */
export async function loadRecipe(): Promise<Recipe> {
  const templateDir = getArcTemplatePath();
  const content = await readFile(
    join(templateDir, "..", "init-recipe.json"),
    "utf-8",
  );
  return JSON.parse(content) as Recipe;
}

/**
 * Run a full `arc init` in a temp repo with the given prompt values.
 *
 * Returns the temp directory path. Caller is responsible for cleanup.
 */
export async function initInTempRepo(
  prompts: InitPromptResult,
  identity = "test-user",
): Promise<string> {
  const dir = await createTempRepo();
  const templateDir = getArcTemplatePath();
  const recipe = await loadRecipe();
  const io = makeIOContext(dir);

  await runInit({
    cwd: dir,
    io,
    templateDir,
    internalTemplateDir: getInternalTemplatePath(),
    recipe,
    prompts,
    identityResult: identity,
  });

  return dir;
}

/**
 * Recursively list files under a directory (relative paths).
 * Skips `.pristine/` by default.
 */
export async function listFiles(
  dir: string,
  opts: { skipPristine?: boolean } = {},
): Promise<string[]> {
  const { skipPristine = true } = opts;
  const results: string[] = [];
  async function walk(current: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(current);
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(current, entry);
      const relPath = relative(dir, fullPath);
      if (skipPristine && (relPath === ".pristine" || relPath.startsWith(".pristine/"))) {
        continue;
      }
      // Skip user/{identity}/ directories (gitignored personal workspace)
      if (/^user\/[^/]+\//.test(relPath)) continue;
      const s = await stat(fullPath);
      if (s.isDirectory()) {
        await walk(fullPath);
      } else {
        results.push(relPath);
      }
    }
  }
  await walk(dir);
  return results.sort();
}

/** Check whether a file exists. */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

// Re-export for convenience
export { readFile, writeFile, mkdir, rm, readdir, stat, join, dirname };
export { execFileAsync };
export { getArcTemplatePath, getInternalTemplatePath };
export type { IOContext, GitExec, Recipe, InitPromptResult };
