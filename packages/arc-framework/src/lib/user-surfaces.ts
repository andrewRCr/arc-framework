/**
 * Semantic user-surface path resolution.
 *
 * Identity-global surfaces are one machine-local materialization per repository,
 * rooted at the primary worktree. Per-WU surfaces stay adjacent to the active
 * worktree, so a linked worktree reads and writes its own SESSION-NOTES while
 * sharing USER-INBOX / WORKING-MEMORY / STATUS.USER with the primary checkout.
 *
 * @module
 */

import { isAbsolute, join, relative, resolve } from "node:path";

import { toForwardSlash } from "./fs.js";
import type { GitExec } from "./git/exec.js";
import { resolvePrimaryWorktreePath } from "./git/worktree-roster.js";
import {
  nodeUserSurfaceMigrationFs,
  reconcileLinkedIdentityGlobalUserSurfaces,
} from "./user-surface-migration.js";

export interface UserSurfaceResolverOptions {
  /** Current ARC project root / active worktree root. */
  cwd: string;
  /** Resolved ARC identity. */
  identity: string;
  /** Canonical identity-global user root. Defaults to the active checkout. */
  identityGlobalRoot?: string;
}

export interface UserSurfaceResolver {
  /** Current ARC project root / active worktree root. */
  cwd: string;
  /** Resolved ARC identity. */
  identity: string;
  /** Canonical root for identity-global visible user surfaces. */
  identityGlobalRoot: string;
  /** Resolve a path below the identity-global user root. */
  identityGlobalPath: (...segments: readonly string[]) => string;
  /** Render an identity-global path for status envelopes and recovery manifests. */
  identityGlobalDisplayPath: (...segments: readonly string[]) => string;
  /** Resolve the active worktree's per-WU user workspace root. */
  workUnitRoot: (workUnitName: string) => string;
  /** Resolve the active worktree's per-WU SESSION-NOTES path. */
  sessionNotesPath: (workUnitName: string) => string;
}

/**
 * Build a resolver from already-known roots.
 *
 * @param options - Current root, identity, and optional canonical identity-global root
 * @returns Resolver functions for identity-global and per-WU surfaces
 */
export function createUserSurfaceResolver(
  options: UserSurfaceResolverOptions,
): UserSurfaceResolver {
  const { cwd, identity } = options;
  const identityGlobalRoot = options.identityGlobalRoot ?? join(cwd, ".arc", "user", identity);

  const identityGlobalPath = (...segments: readonly string[]): string =>
    join(identityGlobalRoot, ...segments);

  const identityGlobalDisplayPath = (...segments: readonly string[]): string =>
    displayPath(cwd, identityGlobalPath(...segments));

  const workUnitRoot = (workUnitName: string): string =>
    join(cwd, ".arc", "user", identity, workUnitName);

  return {
    cwd,
    identity,
    identityGlobalRoot,
    identityGlobalPath,
    identityGlobalDisplayPath,
    workUnitRoot,
    sessionNotesPath: (workUnitName) => join(workUnitRoot(workUnitName), "SESSION-NOTES.md"),
  };
}

/**
 * Resolve user surfaces from local git topology.
 *
 * The primary worktree is the zero-config identity-global backing store. If git
 * topology cannot be read, the active checkout is the safe single-worktree
 * fallback.
 *
 * @param options - Current root, identity, and git executor
 * @returns A semantic user-surface resolver
 */
export async function resolveUserSurfaceResolver(options: {
  cwd: string;
  identity: string;
  exec: GitExec;
}): Promise<UserSurfaceResolver> {
  const primaryWorktree = await resolvePrimaryWorktreePath(options.exec);
  if (primaryWorktree !== null && resolve(primaryWorktree) !== resolve(options.cwd)) {
    const migration = await reconcileLinkedIdentityGlobalUserSurfaces({
      worktreePath: options.cwd,
      primaryWorktreePath: primaryWorktree,
      fs: nodeUserSurfaceMigrationFs,
    });
    if (migration.status === "blocked") throw new Error(migration.reason);
  }

  return createUserSurfaceResolver({
    cwd: options.cwd,
    identity: options.identity,
    ...(primaryWorktree !== null
      ? { identityGlobalRoot: join(primaryWorktree, ".arc", "user", options.identity) }
      : {}),
  });
}

function displayPath(cwd: string, path: string): string {
  if (!isAbsolute(path)) return toForwardSlash(path);
  const rel = toForwardSlash(relative(cwd, path));
  if (rel === "") return ".";
  if (rel.startsWith("../") || rel === "..") return toForwardSlash(path);
  return rel;
}
