/** Marker- and topology-bound transaction for renaming a work-unit checkout. */

import { isDeepStrictEqual } from "node:util";
import { resolve } from "node:path";

import type { GitExec } from "../git/exec.js";
import {
  decodeWorktreeMarkerOwnership,
  readWorktreeMarkerGeneration,
  replaceWorktreeMarkerGeneration,
  restoreWorktreeMarkerGeneration,
  type WorktreeMarker,
  type WorktreeMarkerGenerationReadResult,
  type WorktreeRenameMovePending,
} from "../git/worktree-marker.js";
import {
  scanRegisteredWorktrees,
  type RegisteredWorktree,
} from "../git/worktree-roster.js";
import { digestBytes } from "../kernel/index.js";
import type { AdvisoryLockOptions } from "../user-sync/notes-lock.js";
import { withWorktreeOperationLock } from "./worktree-operation-lock.js";

const DIAGNOSTIC = "cannot rename work-unit checkout";

/** One physical move and its inverse, both supplied by the worktree mutator. */
export interface RenameWorktreeMove {
  readonly apply: () => Promise<void>;
  readonly rollback: () => Promise<void>;
}

/** Exact rename coordinates captured by the command preflight. */
export interface RenameWorktreeTransactionRequest {
  readonly sourceCheckoutPath: string;
  readonly targetCheckoutPath: string;
  readonly sourceSlug: string;
  readonly targetSlug: string;
  readonly expectedHead: string;
  readonly move?: RenameWorktreeMove;
  /** Explicit pending state; `null` clears a previously deferred move and `undefined` preserves it. */
  readonly renameMovePending?: WorktreeRenameMovePending | null;
}

/** Why a rename declined to mutate marker or checkout state. */
export type RenameWorktreeRefusal = "generation-changed" | "role-conflict" | "roster-changed";

/** Marker/topology result of one checkout rename transaction. */
export type RenameWorktreeTransactionOutcome =
  | {
      readonly kind: "renamed" | "idempotent";
      readonly checkoutPath: string;
      readonly markerGeneration: string;
    }
  | {
      readonly kind: "unmanaged";
      readonly checkoutPath: string;
      readonly markerGeneration: null;
    }
  | { readonly kind: "refused"; readonly reason: RenameWorktreeRefusal };

/** Driver for one repository-wide serialized checkout rename. */
export interface RenameWorktreeTransactionDriver {
  rename(request: RenameWorktreeTransactionRequest): Promise<RenameWorktreeTransactionOutcome>;
}

/**
 * Bind checkout rename to Git topology, exact marker bytes, and the shared operation mutex.
 *
 * @param options - Git executor and optional advisory-lock tuning
 * @returns A marker/topology rename driver
 */
export function createNodeRenameWorktreeTransactionDriver(options: {
  readonly exec: GitExec;
  readonly lockOptions?: AdvisoryLockOptions;
}): RenameWorktreeTransactionDriver {
  return { rename: (request) => renameWorktreeTransaction(options, normalizeRequest(request)) };
}

interface RenameSnapshot {
  readonly topology: readonly RegisteredWorktree[];
  readonly checkout: RegisteredWorktree;
  readonly marker: WorktreeMarkerGenerationReadResult;
}

async function renameWorktreeTransaction(
  runtime: { readonly exec: GitExec; readonly lockOptions?: AdvisoryLockOptions },
  request: RenameWorktreeTransactionRequest,
): Promise<RenameWorktreeTransactionOutcome> {
  const before = await captureSnapshot(runtime.exec, request);
  return withWorktreeOperationLock({
    exec: runtime.exec,
    cwd: before.checkout.path,
    ...(runtime.lockOptions === undefined ? {} : { lockOptions: runtime.lockOptions }),
    operation: async () => applyUnderMutex(runtime.exec, request, before),
  });
}

async function captureSnapshot(exec: GitExec, request: RenameWorktreeTransactionRequest): Promise<RenameSnapshot> {
  const topology = await readTopology(exec);
  const checkout = locateCheckout(topology, request);
  if (checkout === null || checkout.head !== request.expectedHead) {
    throw new Error(`${DIAGNOSTIC}: expected checkout topology is unavailable`);
  }
  return {
    topology,
    checkout,
    marker: await readWorktreeMarkerGeneration(checkout.path),
  };
}

async function applyUnderMutex(
  exec: GitExec,
  request: RenameWorktreeTransactionRequest,
  before: RenameSnapshot,
): Promise<RenameWorktreeTransactionOutcome> {
  const freshTopology = await readTopology(exec);
  if (!topologiesEqual(before.topology, freshTopology)) {
    return { kind: "refused", reason: "roster-changed" };
  }
  const checkout = locateCheckout(freshTopology, request);
  if (checkout === null || !sameWorktree(checkout, before.checkout) || checkout.head !== request.expectedHead) {
    return { kind: "refused", reason: "roster-changed" };
  }

  const current = await readWorktreeMarkerGeneration(checkout.path);
  if (!markerGenerationsEqual(before.marker, current)) {
    return { kind: "refused", reason: "generation-changed" };
  }
  if (current.kind === "absent") {
    return request.move === undefined
      ? { kind: "unmanaged", checkoutPath: checkout.path, markerGeneration: null }
      : { kind: "refused", reason: "role-conflict" };
  }
  if (current.kind === "malformed") return { kind: "refused", reason: "role-conflict" };

  const renamed = renamedMarker(current.marker, request);
  if (renamed === null) return { kind: "refused", reason: "role-conflict" };
  const alreadyRenamed = isDeepStrictEqual(renamed, current.marker);
  let renamedBytes = current.bytes;
  if (!alreadyRenamed) {
    const replaced = await replaceWorktreeMarkerGeneration(checkout.path, current.bytes, renamed);
    if (replaced.kind !== "replaced") return { kind: "refused", reason: "generation-changed" };
    renamedBytes = replaced.bytes;
  }

  const beforeMutationBoundary = await inspectBoundary(exec, before, checkout.path, renamedBytes);
  if (beforeMutationBoundary.reason !== null) {
    if (!alreadyRenamed) {
      await restoreMarker(
        checkout.path,
        renamedBytes,
        current.bytes,
        beforeMutationBoundary.reason === "generation-changed",
      );
    }
    return { kind: "refused", reason: beforeMutationBoundary.reason };
  }

  if (request.move === undefined) {
    return {
      kind: alreadyRenamed ? "idempotent" : "renamed",
      checkoutPath: checkout.path,
      markerGeneration: digestBytes(renamedBytes),
    };
  }

  try {
    await request.move.apply();
  } catch (error) {
    await rollbackAfterFailure(exec, request, before, current.bytes, renamedBytes, error);
    throw normalizeError(error);
  }

  const postReason = await validatePostMove(exec, request, before, renamedBytes);
  if (postReason !== null) {
    await rollbackAfterFailure(
      exec,
      request,
      before,
      current.bytes,
      renamedBytes,
      undefined,
      postReason === "generation-changed",
    );
    return { kind: "refused", reason: postReason };
  }

  return {
    kind: "renamed",
    checkoutPath: request.targetCheckoutPath,
    markerGeneration: digestBytes(renamedBytes),
  };
}

async function inspectBoundary(
  exec: GitExec,
  before: RenameSnapshot,
  checkoutPath: string,
  expectedMarkerBytes: Buffer,
): Promise<{ readonly reason: RenameWorktreeRefusal | null }> {
  const [topology, marker] = await Promise.all([
    readTopology(exec),
    readWorktreeMarkerGeneration(checkoutPath),
  ]);
  const checkout = exactWorktree(topology, checkoutPath);
  if (!topologiesEqual(before.topology, topology)
    || checkout === null
    || !sameWorktree(checkout, before.checkout)) {
    return { reason: "roster-changed" };
  }
  if (marker.kind !== "present" || !marker.bytes.equals(expectedMarkerBytes)) {
    return { reason: "generation-changed" };
  }
  return { reason: null };
}

async function validatePostMove(
  exec: GitExec,
  request: RenameWorktreeTransactionRequest,
  before: RenameSnapshot,
  renamedBytes: Buffer,
): Promise<RenameWorktreeRefusal | null> {
  const [topology, marker] = await Promise.all([
    readTopology(exec),
    readWorktreeMarkerGeneration(request.targetCheckoutPath),
  ]);
  if (!topologiesEqual(expectedMovedTopology(before.topology, request), topology)) return "roster-changed";
  if (marker.kind !== "present" || !marker.bytes.equals(renamedBytes)) return "generation-changed";
  return null;
}

async function rollbackAfterFailure(
  exec: GitExec,
  request: RenameWorktreeTransactionRequest,
  before: RenameSnapshot,
  originalBytes: Buffer,
  renamedBytes: Buffer,
  cause?: unknown,
  preserveChangedMarker = false,
): Promise<void> {
  const failures: Error[] = [];
  try {
    const topology = await readTopology(exec);
    const source = exactWorktree(topology, request.sourceCheckoutPath);
    const target = exactWorktree(topology, request.targetCheckoutPath);
    if (source === null && target !== null) await request.move?.rollback();
  } catch (error) {
    failures.push(normalizeError(error));
  }

  try {
    const topology = await readTopology(exec);
    const source = exactWorktree(topology, request.sourceCheckoutPath);
    const target = resolve(request.sourceCheckoutPath) === resolve(request.targetCheckoutPath)
      ? null
      : exactWorktree(topology, request.targetCheckoutPath);
    if (source === null || !sameWorktree(source, before.checkout) || target !== null) {
      throw new Error(`${DIAGNOSTIC}: physical rollback did not restore the source checkout`);
    }
    await restoreMarker(request.sourceCheckoutPath, renamedBytes, originalBytes, preserveChangedMarker);
  } catch (error) {
    failures.push(normalizeError(error));
  }

  if (failures.length > 0) {
    const primary = cause === undefined ? failures[0] : normalizeError(cause);
    if (primary === undefined) return;
    throw new AggregateError(
      cause === undefined ? failures : [primary, ...failures],
      primary.message,
      { cause: primary },
    );
  }
}

async function restoreMarker(
  path: string,
  renamedBytes: Buffer,
  originalBytes: Buffer,
  preserveChangedMarker = false,
): Promise<void> {
  const current = await readWorktreeMarkerGeneration(path);
  if (current.kind === "present" && current.bytes.equals(originalBytes)) return;
  if (current.kind !== "present" || !current.bytes.equals(renamedBytes)) {
    if (preserveChangedMarker) return;
    throw new Error(`${DIAGNOSTIC}: marker generation changed during rollback`);
  }
  const restored = await restoreWorktreeMarkerGeneration(path, renamedBytes, originalBytes);
  if (restored.kind !== "replaced") throw new Error(`${DIAGNOSTIC}: marker rollback lost its generation`);
}

function renamedMarker(
  marker: WorktreeMarker,
  request: RenameWorktreeTransactionRequest,
): WorktreeMarker | null {
  const ownership = decodeWorktreeMarkerOwnership(marker);
  if (ownership.kind !== "current"
    || ownership.subject.kind !== "work-unit"
    || (ownership.subject.name !== request.sourceSlug && ownership.subject.name !== request.targetSlug)
    || ownership.provisioning !== null) {
    return null;
  }

  const base = { ...marker };
  if (request.renameMovePending !== undefined) delete base.renameMovePending;
  return {
    ...base,
    wuName: request.targetSlug,
    createdFor: { kind: "work-unit", name: request.targetSlug },
    ...(request.renameMovePending === null || request.renameMovePending === undefined
      ? {}
      : { renameMovePending: request.renameMovePending }),
  } as WorktreeMarker;
}

async function readTopology(exec: GitExec): Promise<readonly RegisteredWorktree[]> {
  const result = await scanRegisteredWorktrees(exec);
  if (!result.ok) throw new Error(`${DIAGNOSTIC}: ${result.message}`);
  return result.worktrees;
}

function locateCheckout(
  topology: readonly RegisteredWorktree[],
  request: RenameWorktreeTransactionRequest,
): RegisteredWorktree | null {
  const source = exactWorktree(topology, request.sourceCheckoutPath);
  const samePath = resolve(request.sourceCheckoutPath) === resolve(request.targetCheckoutPath);
  const target = samePath ? source : exactWorktree(topology, request.targetCheckoutPath);
  if (request.move !== undefined) return source !== null && target === null ? source : null;
  if (samePath) return source;
  return source === null && target !== null ? target : null;
}

function exactWorktree(topology: readonly RegisteredWorktree[], path: string): RegisteredWorktree | null {
  const normalized = resolve(path);
  const matches = topology.filter((entry) => resolve(entry.path) === normalized);
  return matches.length === 1 ? matches[0] ?? null : null;
}

function expectedMovedTopology(
  topology: readonly RegisteredWorktree[],
  request: RenameWorktreeTransactionRequest,
): readonly RegisteredWorktree[] {
  return topology.map((entry) => resolve(entry.path) === resolve(request.sourceCheckoutPath)
    ? { ...entry, path: request.targetCheckoutPath }
    : entry);
}

function topologiesEqual(left: readonly RegisteredWorktree[], right: readonly RegisteredWorktree[]): boolean {
  return isDeepStrictEqual(normalizedTopology(left), normalizedTopology(right));
}

function normalizedTopology(topology: readonly RegisteredWorktree[]): readonly RegisteredWorktree[] {
  return topology
    .map((entry) => ({ ...entry, path: resolve(entry.path) }))
    .sort((left, right) => Buffer.compare(Buffer.from(left.path, "utf8"), Buffer.from(right.path, "utf8")));
}

function sameWorktree(left: RegisteredWorktree, right: RegisteredWorktree): boolean {
  return isDeepStrictEqual(
    { ...left, path: resolve(left.path) },
    { ...right, path: resolve(right.path) },
  );
}

function markerGenerationsEqual(
  left: WorktreeMarkerGenerationReadResult,
  right: WorktreeMarkerGenerationReadResult,
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "present" && right.kind === "present") return left.bytes.equals(right.bytes);
  if (left.kind === "malformed" && right.kind === "malformed") {
    return left.path === right.path && left.message === right.message;
  }
  return true;
}

function normalizeRequest(request: RenameWorktreeTransactionRequest): RenameWorktreeTransactionRequest {
  return {
    ...request,
    sourceCheckoutPath: resolve(request.sourceCheckoutPath),
    targetCheckoutPath: resolve(request.targetCheckoutPath),
  };
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
