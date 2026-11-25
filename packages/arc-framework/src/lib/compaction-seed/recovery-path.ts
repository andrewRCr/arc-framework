/** Resolve a compaction seed against registered worktree topology. */

import { isAbsolute, resolve } from "node:path";

import type { GitExec } from "../git/exec.js";
import { scanRegisteredWorktrees } from "../git/worktree-roster.js";
import { resolveCompactionSeedPath } from "./emitter.js";
import type { CompactionSeed } from "./schema.js";

/** A seed-path resolution or a typed locus failure suitable for recovery output. */
export type RecoverySeedPathResolution =
  | { ok: true; path: string; source: "checkout-local" | "explicit" }
  | { ok: false; message: string; detail?: unknown };

/** A validated registered checkout selected by the seed's exact locus hint. */
export type RecoverySeedCheckoutResolution =
  | { ok: true; checkoutPath: string }
  | { ok: false; message: string; detail?: unknown };

/**
 * Resolve either the invocation checkout's seed or an explicit adapter-supplied
 * path that exactly names one registered checkout's identity-local seed.
 */
export async function resolveRecoverySeedPath(options: {
  cwd: string;
  identity: string;
  exec: GitExec;
  requestedPath?: string;
}): Promise<RecoverySeedPathResolution> {
  if (options.requestedPath === undefined) {
    return {
      ok: true,
      path: resolveCompactionSeedPath({ cwd: options.cwd, identity: options.identity }),
      source: "checkout-local",
    };
  }

  const candidate = isAbsolute(options.requestedPath)
    ? resolve(options.requestedPath)
    : resolve(options.cwd, options.requestedPath);
  const worktrees = await scanRegisteredWorktrees(options.exec);
  if (!worktrees.ok) {
    return {
      ok: false,
      message: `recovery seed locus topology could not be read: ${worktrees.message}`,
      detail: { seedPath: candidate },
    };
  }
  const matches = worktrees.worktrees.filter((worktree) =>
    resolveCompactionSeedPath({ cwd: worktree.path, identity: options.identity }) === candidate,
  );
  if (matches.length !== 1) {
    return {
      ok: false,
      message: matches.length === 0
        ? "recovery seed locus is not a registered checkout"
        : "recovery seed locus is ambiguous across registered checkouts",
      detail: { seedPath: candidate },
    };
  }
  return { ok: true, path: candidate, source: "explicit" };
}

/** Validate that a parsed seed names the one registered checkout that owns its path. */
export async function resolveRecoverySeedCheckout(options: {
  seedPath: string;
  seed: CompactionSeed;
  identity: string;
  exec: GitExec;
}): Promise<RecoverySeedCheckoutResolution> {
  const worktrees = await scanRegisteredWorktrees(options.exec);
  if (!worktrees.ok) {
    return { ok: false, message: `recovery seed locus topology could not be read: ${worktrees.message}` };
  }
  const expectedPath = resolve(options.seedPath);
  const matches = worktrees.worktrees.filter((worktree) =>
    resolve(worktree.path) === resolve(options.seed.locus.checkoutPath)
    && resolveCompactionSeedPath({ cwd: worktree.path, identity: options.identity }) === expectedPath,
  );
  if (matches.length === 1) {
    const [match] = matches;
    if (match !== undefined) return { ok: true, checkoutPath: match.path };
  }
  return {
    ok: false,
    message: matches.length === 0
      ? "compaction seed path and locus do not select one registered checkout"
      : "compaction seed path and locus are ambiguous across registered checkouts",
    detail: {
      seedPath: expectedPath,
      checkoutPath: options.seed.locus.checkoutPath,
    },
  };
}
