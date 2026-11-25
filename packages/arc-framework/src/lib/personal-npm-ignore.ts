/** The fixed npm exclusion policy protecting every identity's personal directory. */
import { lstat, readFile } from "node:fs/promises";
import type { Stats } from "node:fs";
import { join } from "node:path";
import { PROJECTED_PERSONAL_ROOT } from "./layout/index.js";

/** Repository-relative policy path, outside the identity directories it excludes. */
export const PERSONAL_NPM_IGNORE = `${PROJECTED_PERSONAL_ROOT}/.npmignore`;
/** Complete contents published when no personal npm policy exists. */
export const PERSONAL_NPM_IGNORE_CONTENT = "# Keep personal ARC state out of npm packages.\n*\n";
/** Metadata needed to refuse links and aliased write targets. */
export type IgnorePathStat = Pick<Stats, "isSymbolicLink" | "isFile"> & {
  nlink: number | bigint;
  dev: number | bigint;
  ino: number | bigint;
};
/** Read path metadata without following its last component. */
export type IgnoreLstat = (path: string) => Promise<IgnorePathStat>;

/** Accept only blank/comment lines and at least one literal wildcard, without any overriding patterns. */
export function isPersonalNpmIgnore(content: string): boolean {
  const lines = content.split(/\r?\n/u);
  return lines.includes("*") && lines.every((line) => line === "*" || line.trim() === "" || line.startsWith("#"));
}

/** Read a regular policy without accepting a symlink, distinguishing absence from conflicting content or type. */
export async function readPersonalNpmIgnore(
  root: string,
  read: (path: string) => Promise<string> = (path) => readFile(path, "utf8"),
  stat: IgnoreLstat = lstat,
): Promise<"absent" | "accepted" | "conflict"> {
  const path = join(root, PERSONAL_NPM_IGNORE);
  try {
    if (!(await stat(path)).isFile()) return "conflict";
    return isPersonalNpmIgnore(await read(path)) ? "accepted" : "conflict";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "absent";
    throw error;
  }
}
