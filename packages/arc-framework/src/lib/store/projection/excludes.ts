/** The clone-local Git exclude entries the projection registers before it writes into its roots. */
import { PROJECTED_LIFECYCLE_PATTERNS } from "../../layout/index.js";

/** Folder for the projection's machine-local files, which holds its aside folder. */
export const PROJECTION_LOCAL_ROOT = ".arc/system/.local";

/**
 * The exclude list: each shared projected root and the machine-local folder, as directory patterns. The personal
 * root stays ignored by `.gitignore` alone, so it never enters the clone-local exclude file.
 * @returns Git ignore patterns, in the order they are appended.
 */
export function projectionExcludePatterns(): readonly string[] {
  return [...PROJECTED_LIFECYCLE_PATTERNS, `${PROJECTION_LOCAL_ROOT}/`];
}
