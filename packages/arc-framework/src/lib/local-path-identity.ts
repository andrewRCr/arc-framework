/**
 * Ephemeral local-filesystem path identity.
 *
 * Git and the host runtime can spell the same checkout differently (for
 * example, macOS exposes `/var` through `/private/var`). These helpers resolve
 * existing paths through the filesystem before making same-locus or containment
 * decisions while preserving the caller's original spelling for display and
 * persistence.
 *
 * @module
 */

import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

/** Filesystem boundary used to resolve one existing path to its physical spelling. */
export type RealpathFn = (path: string) => Promise<string>;

/**
 * Resolve a path to its local filesystem identity.
 *
 * Paths that do not exist yet retain lexical absolute-path behavior. The
 * result is an ephemeral comparison key: callers must not persist or sync it,
 * nor treat it as work-unit, project, or storage identity.
 *
 * @param path - Local path to identify
 * @param resolveRealpath - Injectable filesystem boundary
 * @returns Canonical existing path, or a lexical absolute fallback
 */
export async function canonicalLocalPath(
  path: string,
  resolveRealpath: RealpathFn = realpath,
): Promise<string> {
  const absolutePath = resolve(path);
  try {
    return await resolveRealpath(absolutePath);
  } catch {
    return absolutePath;
  }
}

/**
 * Compare whether two local paths refer to the same filesystem locus.
 *
 * @param left - First local path
 * @param right - Second local path
 * @param resolveRealpath - Injectable filesystem boundary
 * @returns Whether both paths share one canonical local identity
 */
export async function localPathsEqual(
  left: string,
  right: string,
  resolveRealpath: RealpathFn = realpath,
): Promise<boolean> {
  const [leftIdentity, rightIdentity] = await Promise.all([
    canonicalLocalPath(left, resolveRealpath),
    canonicalLocalPath(right, resolveRealpath),
  ]);
  return leftIdentity === rightIdentity;
}

/**
 * Test whether a local candidate path is the root itself or one of its descendants.
 *
 * @param root - Candidate ancestor path
 * @param candidate - Path whose containment is tested
 * @param resolveRealpath - Injectable filesystem boundary
 * @returns Whether `candidate` is at or beneath `root`
 */
export async function localPathContains(
  root: string,
  candidate: string,
  resolveRealpath: RealpathFn = realpath,
): Promise<boolean> {
  const [rootIdentity, candidateIdentity] = await Promise.all([
    canonicalLocalPath(root, resolveRealpath),
    canonicalLocalPath(candidate, resolveRealpath),
  ]);
  const rel = relative(rootIdentity, candidateIdentity);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
