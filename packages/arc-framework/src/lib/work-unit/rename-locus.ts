/**
 * Lock-bound rekey transaction for a renamed work unit's locus record.
 *
 * A record binds its subject on two axes: `role.subject.key` carries the work-unit slug, and
 * `recordId` is the canonical checkout-path digest. A rename invalidates the first on every shape
 * and the second whenever the worktree moves, so both rekey inside one transaction that holds the
 * affected record locks in deterministic record-ID order.
 *
 * @module
 */

import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { resolve } from "node:path";

import type { GitExec } from "../git/exec.js";
import { scanRegisteredWorktrees } from "../git/worktree-roster.js";
import { acquireLocusLock, releaseLocusLock, type LocusLockHandle } from "../locus/lock.js";
import { selectLocusMutationAnchor } from "../locus/mutation-anchor.js";
import { deriveLocusRecordId, type LocusPathIdentity } from "../locus/path-identity.js";
import { createPlatformProcessInspector } from "../locus/platform-inspectors.js";
import { verifyProcessAnchor, type ProcessInspector } from "../locus/process-inspector.js";
import {
  mintLocusRecord,
  readLocusRecord,
  removeLocusRecord,
  replaceLocusRecord,
} from "../locus/record-store.js";
import { locusLockPath, locusRecordPath, resolveLocusRoot } from "../locus/root.js";
import type { LocusAnchor, LocusRecordV1 } from "../locus/schema/index.js";

const DIAGNOSTIC = "cannot rekey renamed checkout session locus";

/** One rename's exact source and target identity coordinates. */
export interface RenameLocusRequest {
  /** Registered checkout path before the rename. */
  readonly sourceCheckoutPath: string;
  /** Checkout path after the rename; equal to the source for an in-place subject. */
  readonly targetCheckoutPath: string;
  /** Work-unit slug before the rename. */
  readonly sourceSlug: string;
  /** Work-unit slug after the rename. */
  readonly targetSlug: string;
  /** Exact head the source checkout must still carry when the lock is taken. */
  readonly expectedHead: string;
  /** Physical relocation, executed under lock; omitted when the checkout does not move. */
  readonly moveWorktree?: () => Promise<void>;
}

/** Why a rekey declined to mutate either record generation. */
export type RenameLocusRefusal =
  | "lease-live"
  | "lease-unknown"
  | "generation-changed"
  | "role-conflict"
  | "roster-changed";

/** Outcome of one rekey attempt; every non-`rekeyed` case leaves both records untouched. */
export type RenameLocusOutcome =
  | { readonly kind: "rekeyed" | "idempotent"; readonly recordId: string }
  | { readonly kind: "absent" }
  | { readonly kind: "refused"; readonly reason: RenameLocusRefusal };

export interface RenameLocusDriver {
  rekey(request: RenameLocusRequest): Promise<RenameLocusOutcome>;
}

/** Bind a renamed work unit's record rekey to its machine-local locus locks. */
export function createNodeRenameLocusDriver(options: {
  readonly exec: GitExec;
  readonly identity: string;
}): RenameLocusDriver {
  return { rekey: (request) => rekeyNodeRenamedLocus(options, request) };
}

async function rekeyNodeRenamedLocus(
  runtime: { readonly exec: GitExec; readonly identity: string },
  request: RenameLocusRequest,
): Promise<RenameLocusOutcome> {
  const sourceCheckoutPath = resolve(request.sourceCheckoutPath);
  const targetCheckoutPath = resolve(request.targetCheckoutPath);
  const topology = await scanRegisteredWorktrees(runtime.exec);
  if (!topology.ok) throw new Error(`${DIAGNOSTIC}: ${topology.message}`);
  const inspector = createPlatformProcessInspector();
  const anchor = await selectLocusMutationAnchor(inspector, DIAGNOSTIC);
  const root = await resolveLocusRoot({ identity: runtime.identity, scan: () => Promise.resolve(topology) });
  if (!root.ok) throw new Error(`${DIAGNOSTIC}: ${root.message}`);
  const pathFlavor = process.platform === "win32" ? "windows" : "posix";
  const source = deriveLocusRecordId(sourceCheckoutPath, pathFlavor);
  const target = deriveLocusRecordId(targetCheckoutPath, pathFlavor);

  const handles = await acquireOrderedLocks({
    digests: source.digest === target.digest ? [source.digest] : [source.digest, target.digest],
    lockPath: (digest) => locusLockPath(root, digest),
    anchor,
    inspector,
  });

  let outcome:
    | { readonly kind: "success"; readonly value: RenameLocusOutcome }
    | { readonly kind: "failure"; readonly error: unknown };
  try {
    outcome = {
      kind: "success",
      value: await applyRekeyUnderLock({
        runtime,
        request,
        sourceCheckoutPath,
        targetCheckoutPath,
        source,
        target,
        pathFlavor,
        anchor,
        inspector,
        sourceRecordPath: locusRecordPath(root, source.digest),
        targetRecordPath: locusRecordPath(root, target.digest),
      }),
    };
  } catch (error) {
    outcome = { kind: "failure", error };
  }
  await releaseOrderedLocks(handles);
  if (outcome.kind === "failure") throw outcome.error;
  return outcome.value;
}

async function applyRekeyUnderLock(context: {
  runtime: { readonly exec: GitExec; readonly identity: string };
  request: RenameLocusRequest;
  sourceCheckoutPath: string;
  targetCheckoutPath: string;
  source: LocusPathIdentity;
  target: LocusPathIdentity;
  pathFlavor: "posix" | "windows";
  anchor: Extract<LocusAnchor, { kind: "process" }>;
  inspector: ProcessInspector;
  sourceRecordPath: string;
  targetRecordPath: string;
}): Promise<RenameLocusOutcome> {
  const fresh = await scanRegisteredWorktrees(context.runtime.exec);
  if (!fresh.ok) throw new Error(`${DIAGNOSTIC}: roster is unavailable under lock`);
  // A pending move still expects the checkout at its source path; without one — an in-place subject,
  // or a resumed rename whose move already landed — the target path is what must be registered.
  const registered = exactTarget(
    fresh.worktrees,
    context.request.moveWorktree === undefined ? context.targetCheckoutPath : context.sourceCheckoutPath,
  );
  const current = await readLocusRecord({
    path: context.sourceRecordPath,
    expectedDigest: context.source.digest,
    pathFlavor: context.pathFlavor,
  });

  if (current.kind === "absent") {
    return settledOutcome(context);
  }
  if (registered === null || registered.head !== context.request.expectedHead) {
    return { kind: "refused", reason: "roster-changed" };
  }
  if (current.kind !== "valid"
    || current.record.recordId !== context.source.recordId
    || current.record.checkoutPath !== context.sourceCheckoutPath) {
    return { kind: "refused", reason: "generation-changed" };
  }
  const role = current.record.role;
  if (role.kind !== "work-unit"
    || role.subject.kind !== "work-unit"
    || role.subject.key !== context.request.sourceSlug) {
    return { kind: "refused", reason: "role-conflict" };
  }

  const lease = await resolveLeaseDisposition(current.record, context);
  if (lease.kind === "refused") return { kind: "refused", reason: lease.reason };

  const next: LocusRecordV1 = {
    ...current.record,
    recordId: context.target.recordId,
    checkoutPath: context.targetCheckoutPath,
    role: { ...role, subject: { ...role.subject, key: context.request.targetSlug } },
    lease: lease.lease,
  };

  if (context.request.moveWorktree !== undefined) await context.request.moveWorktree();

  if (context.source.digest === context.target.digest) {
    const replaced = await replaceLocusRecord({
      path: context.sourceRecordPath,
      expectedBytes: current.bytes,
      record: next,
    });
    if (replaced.kind !== "replaced") return { kind: "refused", reason: "generation-changed" };
    return { kind: "rekeyed", recordId: next.recordId };
  }

  // Mint before remove: an interruption between the two leaves a stale record at a path that no
  // longer exists — visible and cleanable — where the inverse order would leave a live checkout
  // carrying no role at all.
  const minted = await mintLocusRecord({ path: context.targetRecordPath, record: next });
  if (minted.kind !== "created") return { kind: "refused", reason: "generation-changed" };
  const removed = await removeLocusRecord({
    path: context.sourceRecordPath,
    expectedBytes: current.bytes,
  });
  if (removed.kind !== "removed") return { kind: "refused", reason: "generation-changed" };
  return { kind: "rekeyed", recordId: next.recordId };
}

/**
 * Classify a completed or never-started rekey when the source record is already gone.
 *
 * Re-entry after a successful transaction finds the target record already carrying the renamed
 * subject; a checkout ARC never recorded finds nothing at either key.
 */
async function settledOutcome(context: {
  request: RenameLocusRequest;
  targetCheckoutPath: string;
  target: LocusPathIdentity;
  pathFlavor: "posix" | "windows";
  targetRecordPath: string;
}): Promise<RenameLocusOutcome> {
  const settled = await readLocusRecord({
    path: context.targetRecordPath,
    expectedDigest: context.target.digest,
    pathFlavor: context.pathFlavor,
  });
  if (settled.kind !== "valid") return { kind: "absent" };
  const role = settled.record.role;
  const renamed = role.kind === "work-unit"
    && role.subject.kind === "work-unit"
    && role.subject.key === context.request.targetSlug
    && settled.record.checkoutPath === context.targetCheckoutPath;
  return renamed ? { kind: "idempotent", recordId: settled.record.recordId } : { kind: "absent" };
}

/**
 * Resolve what happens to the source lease across the rekey.
 *
 * Follows the read-time frame matrix rather than teardown's stricter predicate: rename preserves
 * the work unit instead of retiring it, so a conclusively dead lease is reaped exactly as the next
 * attaching operation would reap it, while unverifiable liveness never authorizes a mutation.
 */
async function resolveLeaseDisposition(
  record: LocusRecordV1,
  context: {
    sourceCheckoutPath: string;
    targetCheckoutPath: string;
    anchor: Extract<LocusAnchor, { kind: "process" }>;
    inspector: ProcessInspector;
  },
): Promise<
  { readonly kind: "resolved"; readonly lease: LocusRecordV1["lease"] }
  | { readonly kind: "refused"; readonly reason: "lease-live" | "lease-unknown" }
> {
  const lease = record.lease;
  if (lease === null) return { kind: "resolved", lease: null };
  const liveness = lease.anchor.kind === "process"
    ? await verifyProcessAnchor(lease.anchor, context.inspector)
    : "unknown";
  if (liveness === "dead") return { kind: "resolved", lease: null };
  if (liveness !== "live") return { kind: "refused", reason: "lease-unknown" };
  if (!isDeepStrictEqual(lease.anchor, context.anchor)) return { kind: "refused", reason: "lease-live" };
  return {
    kind: "resolved",
    lease: {
      ...lease,
      sessionHomePath: lease.sessionHomePath === context.sourceCheckoutPath
        ? context.targetCheckoutPath
        : lease.sessionHomePath,
    },
  };
}

async function acquireOrderedLocks(options: {
  digests: readonly string[];
  lockPath: (digest: string) => string;
  anchor: LocusAnchor;
  inspector: ProcessInspector;
}): Promise<LocusLockHandle[]> {
  const ordered = [...options.digests].sort(compareUtf8);
  const handles: LocusLockHandle[] = [];
  for (const digest of ordered) {
    const acquired = await acquireLocusLock({
      path: options.lockPath(digest),
      anchor: options.anchor,
      inspector: options.inspector,
    });
    if (acquired.kind !== "acquired") {
      await releaseOrderedLocks(handles);
      throw new Error(`${DIAGNOSTIC}: record lock is ${acquired.reason}`);
    }
    handles.push(acquired.handle);
  }
  return handles;
}

async function releaseOrderedLocks(handles: readonly LocusLockHandle[]): Promise<void> {
  for (const handle of [...handles].reverse()) {
    const released = await releaseLocusLock(handle);
    if (released.kind !== "released") {
      throw new Error(`cannot release renamed checkout session locus lock: ${released.kind}`);
    }
  }
}

function exactTarget(
  worktrees: readonly { readonly path: string; readonly head: string }[],
  checkoutPath: string,
): { readonly path: string; readonly head: string } | null {
  const matches = worktrees.filter((candidate) => resolve(candidate.path) === checkoutPath);
  return matches.length === 1 ? matches[0] ?? null : null;
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

/** Digest one record generation for callers threading expected-generation facts. */
export function renameLocusRecordGeneration(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
