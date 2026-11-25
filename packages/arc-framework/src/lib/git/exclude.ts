/** Idempotent clone-local Git exclude registration. */
import { dirname, isAbsolute, resolve } from "node:path";
import type { GitExec } from "./exec.js";

export interface GitExcludeFs {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  mkdir(path: string, options: { recursive: boolean }): Promise<void>;
  withLock<T>(path: string, operation: () => Promise<T>): Promise<T>;
}
export type GitExcludeResult = { ok: true; path: string } | { ok: false; path?: string; error: unknown };

/**
 * Append one clone-local exclusion pattern, preserving existing content.
 * @param root - Checkout against which Git resolves its shared exclude file.
 * @param pattern - Exact Git ignore pattern to append once.
 * @param exec - Caller-owned Git executor.
 * @param fs - Injectable exclude-file operations.
 * @returns The resolved absolute path, or the original failure and any established path.
 */
export async function ensureGitExcludePattern(
  root: string, pattern: string, exec: GitExec, fs: GitExcludeFs,
): Promise<GitExcludeResult> {
  return ensureGitExcludePatterns(root, [pattern], exec, fs);
}

/**
 * Append each clone-local exclusion pattern not yet present, in order, with one Git call and at most one write.
 * @param root - Checkout against which Git resolves its shared exclude file.
 * @param patterns - Exact Git ignore patterns to append once each.
 * @param exec - Caller-owned Git executor.
 * @param fs - Injectable exclude-file operations.
 * @returns The resolved absolute path, or the original failure and any established path.
 */
export async function ensureGitExcludePatterns(
  root: string, patterns: readonly string[], exec: GitExec, fs: GitExcludeFs,
): Promise<GitExcludeResult> {
  let path: string | undefined;
  try {
    const { stdout } = await exec("git", ["rev-parse", "--git-path", "info/exclude"], { cwd: root });
    const rawPath = stdout.trim();
    if (rawPath.length === 0) throw new Error("Git returned no exclude path");
    const excludePath = isAbsolute(rawPath) ? rawPath : resolve(root, rawPath);
    path = excludePath;
    await fs.withLock(`${excludePath}.arc.lock`, async () => {
      const content = await readExclude(excludePath, fs);
      const present = new Set(content.split(/\r?\n/u));
      const missing = patterns.filter((pattern) => !present.has(pattern));
      if (missing.length === 0) return;
      const prefix = content.length === 0 || content.endsWith("\n") ? content : `${content}\n`;
      await fs.mkdir(dirname(excludePath), { recursive: true });
      await fs.writeFile(excludePath, `${prefix}${missing.map((pattern) => `${pattern}\n`).join("")}`);
    });
    return { ok: true, path };
  } catch (error) {
    return { ok: false, ...(path === undefined ? {} : { path }), error };
  }
}

async function readExclude(path: string, fs: GitExcludeFs): Promise<string> {
  try { return await fs.readFile(path); }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return "";
    throw error;
  }
}
