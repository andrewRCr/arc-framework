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

import { dirname, isAbsolute, join, relative } from "node:path";

import { toForwardSlash } from "./fs.js";
import type { GitExec } from "./git/exec.js";
import { resolvePrimaryWorktreePath } from "./git/worktree-roster.js";
import type { Slug } from "./kernel/index.js";
import { materializeArcPath, resolveArcPath } from "./layout/index.js";

/** Filename of the derived identity status view, outside stored personal records. */
export const IDENTITY_STATUS_FILENAME = "STATUS.USER.md";

export interface UserSurfaceResolverOptions {
  /** Current ARC project root / active worktree root. */
  cwd: string;
  /** Resolved ARC identity. */
  identity: Slug;
  /** Canonical identity-global user root. Defaults to the active checkout. */
  identityGlobalRoot?: string;
}

export interface UserSurfaceResolver {
  /** Current ARC project root / active worktree root. */
  cwd: string;
  /** Resolved ARC identity. */
  identity: Slug;
  /** Canonical root for identity-global visible user surfaces. */
  identityGlobalRoot: string;
  /** Resolve a path below the identity-global user root. */
  identityGlobalPath: (...segments: readonly string[]) => string;
  /** Render an identity-global path for status envelopes and recovery manifests. */
  identityGlobalDisplayPath: (...segments: readonly string[]) => string;
  /** Resolve the identity-global WORKING-MEMORY path. */
  workingMemoryPath: string;
  /** Render the identity-global WORKING-MEMORY path for status envelopes. */
  workingMemoryDisplayPath: string;
  /** Resolve the active worktree's per-WU user workspace root. */
  workUnitRoot: (workUnitName: Slug) => string;
  /** Resolve the active worktree's per-WU SESSION-NOTES path. */
  sessionNotesPath: (workUnitName: Slug) => string;
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
  const identityGlobalArcRoot = materializeArcPath(
    options.identityGlobalRoot === undefined ? cwd : identityGlobalArcRootFromUserRoot(options.identityGlobalRoot),
    resolveArcPath({ kind: "arc-root" }),
  );
  const identityGlobalRoot = options.identityGlobalRoot ?? join(identityGlobalArcRoot, "user", identity);

  const identityGlobalPath = (...segments: readonly string[]): string =>
    join(identityGlobalRoot, ...segments);

  const identityGlobalDisplayPath = (...segments: readonly string[]): string =>
    displayPath(cwd, identityGlobalPath(...segments));

  const sessionNotesPath = (workUnitName: Slug): string => materializeArcPath(cwd, resolveArcPath({
    kind: "user-document",
    identity,
    document: { kind: "session-notes", workUnit: workUnitName },
  }));
  const workingMemoryPath = materializeArcPath(
    options.identityGlobalRoot === undefined ? cwd : identityGlobalArcRootFromUserRoot(options.identityGlobalRoot),
    resolveArcPath({ kind: "user-document", identity, document: { kind: "working-memory" } }),
  );
  const workUnitRoot = (workUnitName: Slug): string => dirname(sessionNotesPath(workUnitName));

  return {
    cwd,
    identity,
    identityGlobalRoot,
    identityGlobalPath,
    identityGlobalDisplayPath,
    workingMemoryPath,
    workingMemoryDisplayPath: displayPath(cwd, workingMemoryPath),
    workUnitRoot,
    sessionNotesPath,
  };
}

/**
 * Resolve user-surface paths from local git topology.
 *
 * The primary worktree is the zero-config identity-global backing store. If git
 * topology cannot be read, the active checkout is the safe single-worktree
 * fallback. Resolution is read-only: legacy linked copies are reconciled only
 * by explicit worktree cleanup flows.
 *
 * @param options - Current root, identity, and git executor
 * @returns A semantic user-surface resolver
 */
export async function resolveUserSurfaceResolver(options: {
  cwd: string;
  identity: Slug;
  exec: GitExec;
}): Promise<UserSurfaceResolver> {
  const primaryWorktree = await resolvePrimaryWorktreePath(options.exec);
  return createUserSurfaceResolver({
    cwd: options.cwd,
    identity: options.identity,
    ...(primaryWorktree !== null
      ? { identityGlobalRoot: join(primaryWorktree, ".arc", "user", options.identity) }
      : {}),
  });
}

function identityGlobalArcRootFromUserRoot(userRoot: string): string {
  return join(userRoot, "..", "..", "..");
}

function displayPath(cwd: string, path: string): string {
  if (!isAbsolute(path)) return toForwardSlash(path);
  const rel = toForwardSlash(relative(cwd, path));
  if (rel === "") return ".";
  if (rel.startsWith("../") || rel === "..") return toForwardSlash(path);
  return rel;
}
