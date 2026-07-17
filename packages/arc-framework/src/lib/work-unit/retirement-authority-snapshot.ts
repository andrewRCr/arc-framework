/**
 * Versioned compare-and-set snapshots for the in-repo retirement authority.
 *
 * A snapshot binds live refs, transition inventory, deterministic record state,
 * the Git index tree, and the adapter storage schema into one opaque digest.
 */

import { canonicalDigest, digestBytes } from "../canonical/canonical-json.js";
import { receiptId } from "../canonical/receipt-id.js";
import type { GitExec } from "../git/exec.js";
import { resolveRetirementRecordPath } from "./retirement-record-store.js";
import type {
  RetirementAuthorityScope,
  RetirementAuthoritySnapshot,
  TeardownAuthorizationRefusal,
} from "./retirement-authority.js";

/** Read-only filesystem seam used by snapshot projection. */
export interface RetirementSnapshotFs {
  readFile(path: string): Promise<string>;
}

/** Dependencies needed to project one in-repo authority snapshot. */
export interface RetirementSnapshotContext {
  cwd: string;
  exec: GitExec;
  fs: RetirementSnapshotFs;
  readInventory(scope: RetirementAuthorityScope): Promise<unknown>;
  storageVersion?: number;
}

type SnapshotResult =
  | { status: "resolved"; snapshot: RetirementAuthoritySnapshot }
  | { status: "refused"; reason: TeardownAuthorizationRefusal };

type RecordProjection =
  | { status: "resolved"; state: "absent"; digest: null }
  | { status: "resolved"; state: "prepared-decompose"; digest: string }
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
    const recordId = receiptId({
      schemaVersion: 1,
      subject: scope.subject,
      transition: scope.transition,
      sourceBranch: scope.source.branch,
      sourceHead: scope.source.head,
    });
    const [sourceRefOid, resultRefOid, indexTreeOid, inventory, record] = await Promise.all([
      resolveCommit(ctx.exec, `refs/heads/${scope.source.branch}`, ctx.cwd),
      resolveCommit(ctx.exec, `refs/heads/${scope.resultProjection.ref}`, ctx.cwd),
      resolveIndexTree(ctx.exec, ctx.cwd),
      ctx.readInventory(scope),
      readRecordProjection(ctx.fs, resolveRetirementRecordPath(ctx.cwd, recordId)),
    ]);
    if (record.status === "refused") return record;

    const authorityVersion = canonicalDigest({
      storageVersion: ctx.storageVersion ?? 1,
      scope,
      sourceRefOid,
      resultRefOid,
      indexTreeOid,
      inventory,
      record: {
        state: record.state,
        digest: record.digest,
      },
    });
    return {
      status: "resolved",
      sourceRefOid,
      resultRefOid,
      snapshot: {
        authorityVersion,
        sourceRefOid,
        resultRefOid,
        recordState: record.state,
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

async function readRecordProjection(fs: RetirementSnapshotFs, path: string): Promise<RecordProjection> {
  let content: string;
  try {
    content = await fs.readFile(path);
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return { status: "resolved", state: "absent", digest: null };
    }
    throw err;
  }

  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return { status: "refused", reason: "evidence-mismatch" };
  }
  if (!isPreparedDecomposeRecord(value)) {
    return { status: "refused", reason: "authority-conflict" };
  }
  return {
    status: "resolved",
    state: "prepared-decompose",
    digest: digestBytes(Buffer.from(content, "utf8")),
  };
}

function isPreparedDecomposeRecord(value: unknown): boolean {
  return typeof value === "object"
    && value !== null
    && (value as Record<string, unknown>).kind === "prepared-decompose"
    && (value as Record<string, unknown>).schemaVersion === 1;
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
