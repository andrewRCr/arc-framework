/**
 * File-backed task-list cursor resolution.
 *
 * @module
 */

import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";

import { resolveTaskListCursor, type TaskListCursorResult } from "./cursor.js";

interface ResolveTaskListCursorFromFileOptions {
  cwd: string;
  taskListPath: string;
  readFile?: (path: string) => Promise<string>;
  realpath?: (path: string) => Promise<string>;
}

/** File-backed task-list cursor result, including absent file handling. */
export type TaskListCursorFileResult =
  | TaskListCursorResult
  | { status: "missing"; path: string };

/**
 * Resolve the first open task cursor from a task-list file path.
 *
 * @param options - Repository root, repository-relative task-list path, and optional file reader.
 * @returns The structured cursor result; a missing file returns `status: "missing"`.
 */
export async function resolveTaskListCursorFromFile(
  options: ResolveTaskListCursorFromFileOptions,
): Promise<TaskListCursorFileResult> {
  const taskListPath = resolveRepoRelativeTaskListPath(options.cwd, options.taskListPath);

  try {
    const safePath = await assertRealPathInsideRepo({
      cwd: options.cwd,
      absolutePath: taskListPath.absolutePath,
      taskListPath: options.taskListPath,
      realpath: options.realpath ?? realpath,
    });
    const read = options.readFile ?? readUtf8File;
    return resolveTaskListCursor(await read(safePath));
  } catch (err) {
    if (isNotFoundError(err)) return { status: "missing", path: taskListPath.relativePath };
    throw err;
  }
}

function readUtf8File(path: string): Promise<string> {
  return readFile(path, "utf8");
}

function isNotFoundError(err: unknown): boolean {
  return typeof err === "object"
    && err !== null
    && "code" in err
    && (err as { code?: unknown }).code === "ENOENT";
}

function resolveRepoRelativeTaskListPath(
  cwd: string,
  taskListPath: string,
): { absolutePath: string; relativePath: string } {
  const normalizedInput = taskListPath.replaceAll("\\", "/");
  if (
    normalizedInput.length === 0
    || normalizedInput === "."
    || normalizedInput.startsWith("/")
    || normalizedInput.startsWith("//")
    || isAbsolute(taskListPath)
    || /^[A-Za-z]:/u.test(taskListPath)
    || normalizedInput.split("/").includes("..")
  ) {
    throw new Error(`Task list path must be repository-relative: ${taskListPath}`);
  }

  const absolutePath = join(cwd, ...normalizedInput.split("/"));
  const relativePath = relative(cwd, absolutePath).replaceAll("\\", "/");
  if (
    relativePath.length === 0
    || relativePath.startsWith("../")
    || relativePath === ".."
    || relativePath.startsWith("/")
  ) {
    throw new Error(`Task list path must be repository-relative: ${taskListPath}`);
  }

  return { absolutePath, relativePath };
}

async function assertRealPathInsideRepo(options: {
  cwd: string;
  absolutePath: string;
  taskListPath: string;
  realpath: (path: string) => Promise<string>;
}): Promise<string> {
  let repoRealPath: string;
  try {
    repoRealPath = await options.realpath(options.cwd);
  } catch (err) {
    if (isNotFoundError(err)) {
      throw new Error(`Repository root not found: ${options.cwd}`, { cause: err });
    }
    throw err;
  }
  try {
    const fileRealPath = await options.realpath(options.absolutePath);
    assertPathInsideRepo({
      repoRealPath,
      candidateRealPath: fileRealPath,
      taskListPath: options.taskListPath,
      allowRoot: false,
    });
    return fileRealPath;
  } catch (err) {
    if (!isNotFoundError(err)) throw err;
    await assertNearestExistingAncestorInsideRepo({
      repoRealPath,
      absolutePath: options.absolutePath,
      taskListPath: options.taskListPath,
      realpath: options.realpath,
    });
    throw err;
  }
}

async function assertNearestExistingAncestorInsideRepo(options: {
  repoRealPath: string;
  absolutePath: string;
  taskListPath: string;
  realpath: (path: string) => Promise<string>;
}): Promise<void> {
  let candidate = dirname(options.absolutePath);
  for (;;) {
    try {
      const ancestorRealPath = await options.realpath(candidate);
      assertPathInsideRepo({
        repoRealPath: options.repoRealPath,
        candidateRealPath: ancestorRealPath,
        taskListPath: options.taskListPath,
        allowRoot: true,
      });
      return;
    } catch (err) {
      if (!isNotFoundError(err)) throw err;
      const parent = dirname(candidate);
      if (parent === candidate) throw err;
      candidate = parent;
    }
  }
}

function assertPathInsideRepo(options: {
  repoRealPath: string;
  candidateRealPath: string;
  taskListPath: string;
  allowRoot: boolean;
}): void {
  const relativeRealPath = relative(options.repoRealPath, options.candidateRealPath).replaceAll("\\", "/");
  if (
    (relativeRealPath.length === 0 && !options.allowRoot)
    || relativeRealPath.startsWith("../")
    || relativeRealPath === ".."
    || relativeRealPath.startsWith("/")
    || /^[A-Za-z]:(?:\/|$)/u.test(relativeRealPath)
  ) {
    throw new Error(`Task list path must stay within the repository: ${options.taskListPath}`);
  }
}
