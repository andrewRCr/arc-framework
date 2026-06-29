/**
 * File-backed task-list cursor resolution.
 *
 * @module
 */

import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";

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
    if (options.readFile === undefined || options.realpath !== undefined) {
      await assertRealPathInsideRepo({
        cwd: options.cwd,
        absolutePath: taskListPath.absolutePath,
        taskListPath: options.taskListPath,
        realpath: options.realpath ?? realpath,
      });
    }
    const read = options.readFile ?? readUtf8File;
    return resolveTaskListCursor(await read(taskListPath.absolutePath));
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
}): Promise<void> {
  const [repoRealPath, fileRealPath] = await Promise.all([
    options.realpath(options.cwd),
    options.realpath(options.absolutePath),
  ]);
  const relativeRealPath = relative(repoRealPath, fileRealPath).replaceAll("\\", "/");
  if (
    relativeRealPath.length === 0
    || relativeRealPath.startsWith("../")
    || relativeRealPath === ".."
    || relativeRealPath.startsWith("/")
  ) {
    throw new Error(`Task list path must stay within the repository: ${options.taskListPath}`);
  }
}
