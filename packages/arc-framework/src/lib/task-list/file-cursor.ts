/**
 * File-backed task-list cursor resolution.
 *
 * @module
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { resolveTaskListCursor, type TaskListCursorResult } from "./cursor.js";

interface ResolveTaskListCursorFromFileOptions {
  cwd: string;
  taskListPath: string;
  readFile?: (path: string) => Promise<string>;
}

/**
 * Resolve the first open task cursor from a task-list file path.
 *
 * @param options - Repository root, repository-relative task-list path, and optional file reader.
 * @returns The structured cursor result; a missing file returns `status: "missing"`.
 */
export async function resolveTaskListCursorFromFile(
  options: ResolveTaskListCursorFromFileOptions,
): Promise<TaskListCursorResult> {
  try {
    const read = options.readFile ?? readUtf8File;
    return resolveTaskListCursor(await read(join(options.cwd, options.taskListPath)));
  } catch (err) {
    if (isNotFoundError(err)) return { status: "missing", path: options.taskListPath };
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
