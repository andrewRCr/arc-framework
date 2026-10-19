/** Display and machine-local personal paths; content is read through Store. */
import { dirname, isAbsolute, join, relative } from "node:path";
import { resolveArcPath } from "./layout/index.js";
import { resolvePrimaryWorktreePath } from "./git/worktree-roster.js";
import type { GitExec } from "./git/exec.js";
import { SlugSchema, type Slug } from "./kernel/index.js";
/** Addresses for personal displays and machine-local documents. */
export interface PersonalPaths {
  workingMemoryPath: string; workingMemoryDisplayPath: string;
  identityGlobalPath: (...segments: readonly string[]) => string;
  identityGlobalDisplayPath: (...segments: readonly string[]) => string;
  sessionNotesPath: (workUnit: Slug) => string;
  workUnitRoot: (workUnit: Slug) => string;
}
/** Resolve addresses without reading or granting write authority over personal content. */
export async function resolvePersonalPaths(input: { cwd: string; identity: string; exec: GitExec }): Promise<PersonalPaths> {
  const identity = SlugSchema.parse(input.identity);
  const primary = await resolvePrimaryWorktreePath(input.exec) ?? input.cwd;
  const root = join(primary, resolveArcPath({ kind: "user-root", identity }));
  const identityGlobalPath = (...segments: readonly string[]) => join(root, ...segments);
  const sessionNotesPath = (workUnit: Slug) => join(input.cwd, resolveArcPath({ kind: "user-document", identity,
    document: { kind: "session-notes", workUnit } }));
  const workingMemoryPath = join(primary, resolveArcPath({ kind: "user-document", identity, document: { kind: "working-memory" } }));
  return { identityGlobalPath, identityGlobalDisplayPath: (...segments) => displayPath(input.cwd, identityGlobalPath(...segments)),
    workingMemoryPath, workingMemoryDisplayPath: displayPath(input.cwd, workingMemoryPath), sessionNotesPath,
    workUnitRoot: workUnit => dirname(sessionNotesPath(workUnit)) };
}
function displayPath(cwd: string, path: string): string {
  const normalized = (value: string) => value.replaceAll("\\", "/");
  if (!isAbsolute(path)) return normalized(path);
  const local = normalized(relative(cwd, path));
  return local === "" ? "." : local === ".." || local.startsWith("../") ? normalized(path) : local;
}
