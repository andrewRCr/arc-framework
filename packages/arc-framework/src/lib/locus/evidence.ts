/** Bounded, network-free acquisition of locus authority evidence. */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { readTransientIdentitySnapshot, type TransientIdentitySnapshot } from "../errand/identity-snapshot.js";
import type { GitExec } from "../git/exec.js";
import { scanRegisteredWorktrees, type RegisteredWorktree, type RegisteredWorktreeScanResult } from "../git/worktree-roster.js";
import { readWorktreeMarker, type WorktreeMarkerReadResult } from "../git/worktree-marker.js";
import { canonicalLocalPath } from "../local-path-identity.js";
import type { PathFlavor } from "./path-identity.js";
import { verifyProcessAnchor, type ProcessInspector, type ProcessLiveness } from "./process-inspector.js";
import { readLocusLockHolder, type LocusLockReadResult } from "./lock.js";
import { readLocusRecord, type LocusRecordReadResult } from "./record-store.js";
import { deriveLocusRoot, type LocusRoot } from "./root.js";
import type { LocusProcessAnchor } from "./schema/index.js";

export interface LocusEvidenceIO {
  scanWorktrees(): Promise<RegisteredWorktreeScanResult>;
  listDirectory(path: string): Promise<string[]>;
  readText(path: string): Promise<string>;
  readRecord(options: { path: string; expectedDigest: string; pathFlavor: PathFlavor }): Promise<LocusRecordReadResult>;
  readMarker(path: string): Promise<WorktreeMarkerReadResult>;
  readLock(path: string): Promise<LocusLockReadResult>;
  readIdentities(): Promise<TransientIdentitySnapshot>;
  canonicalPath(path: string): Promise<string>;
  inspectAnchor(anchor: LocusProcessAnchor): Promise<ProcessLiveness>;
}

export interface CheckoutEvidence {
  readonly worktree: RegisteredWorktree;
  readonly canonical: { kind: "resolved"; path: string } | { kind: "error"; message: string };
  readonly marker: WorktreeMarkerReadResult | { kind: "error"; message: string };
  readonly metaRoots: readonly ({ path: string } & (
    { kind: "listed" } | { kind: "error"; message: string }
  ))[];
  readonly metas: readonly MetaEvidence[];
}

export type MetaEvidence =
  | { kind: "read"; name: string; path: string; text: string }
  | { kind: "error"; name: string; path: string; message: string };

export type RecordEntryEvidence =
  | {
      kind: "record";
      name: string;
      digest: string;
      path: string;
      result: LocusRecordReadResult;
      liveness?: ProcessLiveness;
    }
  | { kind: "unexpected"; name: string };

type LockReadEvidence = LocusLockReadResult | { kind: "unreadable"; message: string };

export type LockEntryEvidence =
  | {
      kind: "lock";
      name: string;
      digest: string;
      path: string;
      result: LockReadEvidence;
      liveness?: ProcessLiveness;
    }
  | { kind: "unexpected"; name: string };

export type LocusEvidenceErrorCode =
  | "identity-missing"
  | "identity-root-unavailable"
  | "git-topology-unavailable"
  | "record-root-unavailable";

export type LocusEvidenceResult =
  | { kind: "error"; code: LocusEvidenceErrorCode; message: string }
  | {
      kind: "complete";
      root: LocusRoot;
      topology: Extract<RegisteredWorktreeScanResult, { ok: true }>;
      checkouts: readonly CheckoutEvidence[];
      recordEntries: readonly RecordEntryEvidence[];
      records: readonly Extract<RecordEntryEvidence, { kind: "record" }>[];
      lockEntries: readonly LockEntryEvidence[];
      locks: readonly Extract<LockEntryEvidence, { kind: "lock" }>[];
      identities: TransientIdentitySnapshot;
    };

/** Acquire a complete local evidence snapshot while preserving source-level degradation. */
export async function acquireLocusEvidence(options: {
  identity: string | null;
  pathFlavor: PathFlavor;
  io: LocusEvidenceIO;
  concurrency?: number;
}): Promise<LocusEvidenceResult> {
  if (options.identity === null || options.identity === "") {
    return { kind: "error", code: "identity-missing", message: "ARC identity is unavailable" };
  }
  const identity = options.identity;
  let topology: RegisteredWorktreeScanResult;
  try {
    topology = await options.io.scanWorktrees();
  } catch (error) {
    return { kind: "error", code: "git-topology-unavailable", message: message(error) };
  }
  if (!topology.ok) return { kind: "error", code: "git-topology-unavailable", message: topology.message };
  const root = deriveLocusRoot(identity, topology);
  if (!root.ok) return { kind: "error", code: "git-topology-unavailable", message: root.message };

  const run = createLimiter(Math.max(1, Math.floor(options.concurrency ?? 8)));
  let recordNames: string[];
  let lockNames: string[];
  try {
    [recordNames, lockNames] = await Promise.all([
      run(() => listOrEmpty(options.io, root.lociRoot)),
      run(() => listOrEmpty(options.io, root.locksRoot)),
    ]);
  } catch (error) {
    return { kind: "error", code: "record-root-unavailable", message: message(error) };
  }
  let identities: TransientIdentitySnapshot;
  try {
    identities = await run(() => options.io.readIdentities());
  } catch (error) {
    return { kind: "error", code: "identity-root-unavailable", message: message(error) };
  }
  if (identities.kind === "error") {
    return { kind: "error", code: "identity-root-unavailable", message: identities.message };
  }

  const [checkouts, recordEntries, lockEntries] = await Promise.all([
    Promise.all(topology.worktrees.map((worktree) =>
      readCheckoutEvidence(worktree, identity, options.io, run))),
    Promise.all(recordNames.filter((name) => name !== ".locks")
      .map((name) => readRecordEntry(name, root, options.pathFlavor, options.io, run))),
    Promise.all(lockNames.map((name) => readLockEntry(name, root, options.io, run))),
  ]);
  return {
    kind: "complete",
    root,
    topology,
    checkouts,
    recordEntries,
    records: recordEntries.filter(
      (entry): entry is Extract<RecordEntryEvidence, { kind: "record" }> => entry.kind === "record",
    ),
    lockEntries,
    locks: lockEntries.filter(
      (entry): entry is Extract<LockEntryEvidence, { kind: "lock" }> => entry.kind === "lock",
    ),
    identities,
  };
}

type RunBounded = <T>(operation: () => Promise<T>) => Promise<T>;

async function readCheckoutEvidence(
  worktree: RegisteredWorktree,
  identity: string,
  io: LocusEvidenceIO,
  run: RunBounded,
): Promise<CheckoutEvidence> {
  const activePaths = [
    join(worktree.path, ".arc", "active"),
    join(worktree.path, ".arc", "user", identity, "active"),
  ];
  const [canonical, marker, metaListings] = await Promise.all([
    run(() => io.canonicalPath(worktree.path)).then(
      (path) => ({ kind: "resolved" as const, path }),
      (error: unknown) => ({ kind: "error" as const, message: message(error) }),
    ),
    run(() => io.readMarker(worktree.path)).catch(
      (error: unknown) => ({ kind: "error" as const, message: message(error) }),
    ),
    Promise.all(activePaths.map(async (path) => run(() => listOrEmpty(io, path)).then(
      (names) => ({ kind: "listed" as const, path, names }),
      (error: unknown) => ({ kind: "error" as const, path, message: message(error), names: [] as string[] }),
    ))),
  ]);
  const metas = await Promise.all(
    metaListings.flatMap((listing) => listing.names
      .filter((name) => /^meta-.*\.md$/u.test(name))
      .map((name) => ({ root: listing.path, name })))
      .map(async ({ root, name }): Promise<MetaEvidence> => {
        const path = join(root, name);
        try {
          return { kind: "read", name, path, text: await run(() => io.readText(path)) };
        } catch (error) {
          return { kind: "error", name, path, message: message(error) };
        }
      }),
  );
  const metaRoots = metaListings.map((listing) => listing.kind === "listed"
    ? { kind: "listed" as const, path: listing.path }
    : { kind: "error" as const, path: listing.path, message: listing.message });
  return { worktree, canonical, marker, metaRoots, metas };
}

async function readRecordEntry(
  name: string,
  root: LocusRoot,
  pathFlavor: PathFlavor,
  io: LocusEvidenceIO,
  run: RunBounded,
): Promise<RecordEntryEvidence> {
  const matched = /^locus-([0-9a-f]{64})\.json$/u.exec(name);
  const digest = matched?.[1];
  if (digest === undefined) return { kind: "unexpected", name };
  const path = join(root.lociRoot, name);
  let result: LocusRecordReadResult;
  try {
    result = await run(() => io.readRecord({ path, expectedDigest: digest, pathFlavor }));
  } catch (error) {
    result = { kind: "unreadable", message: message(error) };
  }
  const anchor = result.kind === "valid" ? result.record.lease?.anchor : undefined;
  const liveness = anchor === undefined
    ? undefined
    : anchor.kind === "unverifiable"
      ? "unknown"
      : await inspectOrUnknown(io, run, anchor);
  return { kind: "record", name, digest, path, result, ...(liveness === undefined ? {} : { liveness }) };
}

async function readLockEntry(
  name: string,
  root: LocusRoot,
  io: LocusEvidenceIO,
  run: RunBounded,
): Promise<LockEntryEvidence> {
  const matched = /^locus-([0-9a-f]{64})\.lock$/u.exec(name);
  const digest = matched?.[1];
  if (digest === undefined) return { kind: "unexpected", name };
  const path = join(root.locksRoot, name);
  let result: LockReadEvidence;
  try {
    result = await run(() => io.readLock(path));
  } catch (error) {
    result = { kind: "unreadable", message: message(error) };
  }
  const liveness = result.kind === "valid"
    ? await inspectOrUnknown(io, run, result.holder.anchor)
    : undefined;
  return { kind: "lock", name, digest, path, result, ...(liveness === undefined ? {} : { liveness }) };
}

async function listOrEmpty(io: LocusEvidenceIO, path: string): Promise<string[]> {
  try {
    return await io.listDirectory(path);
  } catch (error) {
    if (errorCode(error) === "ENOENT") return [];
    throw error;
  }
}

function createLimiter(limit: number): RunBounded {
  let active = 0;
  const pending: Array<() => void> = [];
  return async <T>(operation: () => Promise<T>): Promise<T> => {
    if (active >= limit) await new Promise<void>((resolve) => pending.push(resolve));
    active += 1;
    try {
      return await operation();
    } finally {
      active -= 1;
      pending.shift()?.();
    }
  };
}

async function inspectOrUnknown(
  io: LocusEvidenceIO,
  run: RunBounded,
  anchor: LocusProcessAnchor,
): Promise<ProcessLiveness> {
  try {
    return await run(() => io.inspectAnchor(anchor));
  } catch {
    return "unknown";
  }
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Production filesystem primitives for evidence adapters. */
export const nodeLocusEvidenceFs = {
  listDirectory: (path: string): Promise<string[]> => readdir(path),
  readText: (path: string): Promise<string> => readFile(path, "utf8"),
};

/** Compose the production evidence boundary without capturing ambient checkout state. */
export function createLocusEvidenceIO(options: {
  exec: GitExec;
  identity: string;
  inspector: ProcessInspector;
}): LocusEvidenceIO {
  return {
    scanWorktrees: () => scanRegisteredWorktrees(options.exec),
    ...nodeLocusEvidenceFs,
    readRecord: readLocusRecord,
    readMarker: readWorktreeMarker,
    readLock: readLocusLockHolder,
    readIdentities: () => readTransientIdentitySnapshot({ exec: options.exec, identity: options.identity }),
    canonicalPath: (path) => canonicalLocalPath(path),
    inspectAnchor: (anchor) => verifyProcessAnchor(anchor, options.inspector),
  };
}
