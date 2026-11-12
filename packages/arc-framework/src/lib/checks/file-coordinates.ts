/** Resolve directory coordinates used by native file-check arguments. */
import { realpath } from "node:fs/promises";

/** Absolute base paths for native relative file arguments. */
export interface CheckFileCoordinates { root: string; cwd: string }

/**
 * Resolve the repository and working directories without dereferencing selected file paths.
 * @param root - Absolute repository root
 * @param cwd - Absolute authored check working directory
 * @param resolveDirectory - Filesystem directory lookup
 * @returns Physical coordinates; directory-resolution errors propagate to the caller
 */
export async function resolveCheckFileCoordinates(root: string, cwd: string,
  resolveDirectory: (path: string) => Promise<string> = realpath): Promise<CheckFileCoordinates> {
  const [physicalRoot, physicalCwd] = await Promise.all([resolveDirectory(root), resolveDirectory(cwd)]);
  return { root: physicalRoot, cwd: physicalCwd };
}
