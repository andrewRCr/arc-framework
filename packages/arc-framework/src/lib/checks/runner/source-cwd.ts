/** Resolve a routed cwd without crossing the selected source root. */
import { realpath, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { sourcePathContains } from "./source-paths.js";

/** Physical path geometry with the validated relative cwd used for transport. */
export interface SourceDirectoryGeometry {
  readonly root: string;
  readonly directory: string;
  readonly cwd: string;
}

/** Filesystem operations that establish where a directory physically resolves. */
export interface SourceDirectoryIO {
  realpath(path: string): Promise<string>;
  stat(path: string): Promise<{ isDirectory(): boolean }>;
}

const nodeSourceDirectoryIO: SourceDirectoryIO = { realpath, stat };

/** Validate lexical and resolved directory containment, returning a slash-relative cwd. */
export async function resolveSourceCwd(root: string, checkRoot: string, io: SourceDirectoryIO = nodeSourceDirectoryIO): Promise<string> {
  return (await resolveSourceDirectory(root, checkRoot, io)).cwd;
}

/** Establish physical file-argument coordinates and the captured directory's actual relative spelling. */
export async function resolveSourceDirectory(root: string, checkRoot: string,
  io: SourceDirectoryIO = nodeSourceDirectoryIO): Promise<SourceDirectoryGeometry> {
  try {
    const directory = resolve(root, checkRoot);
    if (checkRoot.includes("\0") || !sourcePathContains(root, directory)) throw new Error("Lexical cwd escapes source");
    const [actualRoot, actualDirectory] = await Promise.all([io.realpath(root), io.realpath(directory)]);
    if (!sourcePathContains(actualRoot, actualDirectory) || !(await io.stat(actualDirectory)).isDirectory()) {
      throw new Error("Resolved cwd is not a contained directory");
    }
    return { root: actualRoot, directory: actualDirectory, cwd: relative(actualRoot, actualDirectory).split(sep).join("/") || "." };
  } catch (cause) {
    throw new Error("Cannot establish a contained directory for check.root. Repair the directory or link and retry; keep the check local or declare an explicit input boundary for external files.", { cause });
  }
}
