/** Fail-closed primary-backed locus store resolution. */

import { join } from "node:path";

import type { GitExec } from "../git/exec.js";
import {
  scanRegisteredWorktrees,
  type RegisteredWorktreeScanResult,
} from "../git/worktree-roster.js";

export interface LocusRoot {
  readonly primaryPath: string;
  readonly userRoot: string;
  readonly lociRoot: string;
  readonly locksRoot: string;
}

type Scan = () => Promise<RegisteredWorktreeScanResult>;

/** Derive the locus store from one already-pinned topology snapshot. */
export function deriveLocusRoot(
  identity: string,
  topology: Extract<RegisteredWorktreeScanResult, { ok: true }>,
): ({ ok: true } & LocusRoot) | { ok: false; message: string } {
  const primaries = topology.worktrees.filter((worktree) => worktree.primary);
  if (primaries.length !== 1) {
    return { ok: false, message: `Expected exactly one primary worktree; found ${primaries.length}` };
  }
  const primary = primaries[0];
  if (primary === undefined) return { ok: false, message: "Primary worktree is unavailable" };
  const userRoot = join(primary.path, ".arc", "user", identity);
  const lociRoot = join(userRoot, ".internal", "loci");
  return {
    ok: true,
    primaryPath: primary.path,
    userRoot,
    lociRoot,
    locksRoot: join(lociRoot, ".locks"),
  };
}

/** Resolve the locus store only from a complete, uniquely-primary topology snapshot. */
export async function resolveLocusRoot(options: {
  identity: string;
  exec?: GitExec;
  scan?: Scan;
}): Promise<{ ok: true } & LocusRoot | { ok: false; message: string }> {
  const scan = options.scan ?? (options.exec === undefined
    ? undefined
    : async () => scanRegisteredWorktrees(options.exec as GitExec));
  if (scan === undefined) return { ok: false, message: "Git topology reader is unavailable" };

  const topology = await scan();
  if (!topology.ok) return { ok: false, message: topology.message };
  return deriveLocusRoot(options.identity, topology);
}

/** Resolve a record path from a validated lowercase path digest. */
export function locusRecordPath(root: LocusRoot, digest: string): string {
  assertPathDigest(digest);
  return join(root.lociRoot, `locus-${digest}.json`);
}

/** Resolve a record-scoped lock path from a validated lowercase path digest. */
export function locusLockPath(root: LocusRoot, digest: string): string {
  assertPathDigest(digest);
  return join(root.locksRoot, `locus-${digest}.lock`);
}

function assertPathDigest(digest: string): void {
  if (!/^[0-9a-f]{64}$/u.test(digest)) throw new Error("Invalid locus path digest");
}
