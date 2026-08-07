/**
 * Versioned compare-and-set snapshots for the in-repo retirement authority.
 *
 * A snapshot binds live refs, transition inventory, the Git index tree, and the
 * adapter storage schema into one opaque digest.
 */

import { canonicalDigest } from "../canonical/canonical-json.js";
import type { GitExec } from "../git/exec.js";
import type {
  RetirementAuthorityScope,
  RetirementAuthoritySnapshot,
  TeardownAuthorizationRefusal,
} from "./retirement-authority.js";

/** Dependencies needed to project one in-repo authority snapshot. */
export interface RetirementSnapshotContext {
  cwd: string;
  exec: GitExec;
  readInventory(scope: RetirementAuthorityScope): Promise<unknown>;
  storageVersion?: number;
}

type SnapshotResult =
  | { status: "resolved"; snapshot: RetirementAuthoritySnapshot }
  | { status: "refused"; reason: TeardownAuthorizationRefusal };

/**
 * Read the exact live snapshot for a retirement scope.
 *
 * @param ctx - Git, filesystem, and transition-inventory dependencies
 * @param scope - Exact source and result projections
 * @returns A resolved opaque snapshot or semantic refusal
 */
export async function readRetirementAuthoritySnapshot(
  ctx: RetirementSnapshotContext,
  scope: RetirementAuthorityScope,
): Promise<SnapshotResult> {
  const projection = await captureSnapshotProjection(ctx, scope);
  if (projection.status === "refused") return projection;
  if (projection.sourceRefOid !== scope.source.head || projection.resultRefOid !== scope.resultProjection.head) {
    return { status: "refused", reason: "projection-mismatch" };
  }
  return { status: "resolved", snapshot: projection.snapshot };
}

/**
 * Re-read a scope and compare its opaque token byte-for-byte.
 *
 * @param ctx - Git, filesystem, and transition-inventory dependencies
 * @param scope - Exact source and result projections
 * @param expectedAuthorityVersion - Token returned by the preceding snapshot
 * @returns The current snapshot when unchanged, otherwise `authority-conflict`
 */
export async function revalidateRetirementAuthoritySnapshot(
  ctx: RetirementSnapshotContext,
  scope: RetirementAuthorityScope,
  expectedAuthorityVersion: string,
): Promise<
  | { status: "valid"; snapshot: RetirementAuthoritySnapshot }
  | { status: "refused"; reason: TeardownAuthorizationRefusal }
> {
  const current = await captureSnapshotProjection(ctx, scope);
  if (current.status === "refused") return current;
  if (
    current.sourceRefOid !== scope.source.head
    || current.resultRefOid !== scope.resultProjection.head
    || current.snapshot.authorityVersion !== expectedAuthorityVersion
  ) {
    return { status: "refused", reason: "authority-conflict" };
  }
  return { status: "valid", snapshot: current.snapshot };
}

async function captureSnapshotProjection(
  ctx: RetirementSnapshotContext,
  scope: RetirementAuthorityScope,
): Promise<
  | {
      status: "resolved";
      sourceRefOid: string;
      resultRefOid: string;
      snapshot: RetirementAuthoritySnapshot;
    }
  | { status: "refused"; reason: TeardownAuthorizationRefusal }
> {
  try {
    const [sourceRefOid, resultRefOid, indexTreeOid, inventory] = await Promise.all([
      resolveCommit(ctx.exec, `refs/heads/${scope.source.branch}`, ctx.cwd),
      resolveCommit(ctx.exec, `refs/heads/${scope.resultProjection.ref}`, ctx.cwd),
      resolveIndexTree(ctx.exec, ctx.cwd),
      ctx.readInventory(scope),
    ]);

    const authorityVersion = canonicalDigest({
      storageVersion: ctx.storageVersion ?? 1,
      scope,
      sourceRefOid,
      resultRefOid,
      indexTreeOid,
      inventory,
    });
    return {
      status: "resolved",
      sourceRefOid,
      resultRefOid,
      snapshot: {
        authorityVersion,
        sourceRefOid,
        resultRefOid,
      },
    };
  } catch {
    return { status: "refused", reason: "authority-unavailable" };
  }
}

async function resolveCommit(exec: GitExec, ref: string, cwd: string): Promise<string> {
  const { stdout } = await exec("git", ["rev-parse", "--verify", `${ref}^{commit}`], { cwd });
  const oid = stdout.trim();
  if (oid === "") throw new Error(`empty commit OID for ${ref}`);
  return oid;
}

async function resolveIndexTree(exec: GitExec, cwd: string): Promise<string> {
  const { stdout } = await exec("git", ["write-tree"], { cwd });
  const oid = stdout.trim();
  if (oid === "") throw new Error("empty Git index tree OID");
  return oid;
}
