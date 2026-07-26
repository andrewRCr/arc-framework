/** Target-lock transaction for physical worktree retirement. */

import { createHash } from "node:crypto";
import { resolve } from "node:path";

import type { GitExec } from "../git/exec.js";
import type { WorktreeSubject } from "../git/worktree-marker.js";
import { scanRegisteredWorktrees } from "../git/worktree-roster.js";
import { acquireLocusLock, releaseLocusLock } from "../locus/lock.js";
import { selectLocusMutationAnchor } from "../locus/mutation-anchor.js";
import { deriveLocusRecordId } from "../locus/path-identity.js";
import { createPlatformProcessInspector } from "../locus/platform-inspectors.js";
import { verifyProcessAnchor } from "../locus/process-inspector.js";
import { readLocusRecord, removeLocusRecord } from "../locus/record-store.js";
import { locusLockPath, locusRecordPath, resolveLocusRoot } from "../locus/root.js";
import type { TeardownOccupancyDecision } from "./teardown-occupancy.js";

export interface RetireCheckoutLocusOptions {
  readonly checkoutPath: string;
  readonly expectedHead: string;
  readonly subject: WorktreeSubject;
  readonly expectedOccupancy: Extract<TeardownOccupancyDecision, { kind: "clear" }>;
  readonly revalidateLocal: () => Promise<void>;
  readonly retireProjection: () => Promise<void>;
}

export interface TeardownLocusDriver {
  retire(options: RetireCheckoutLocusOptions): Promise<{ readonly roleRemoved: boolean }>;
}

/** Bind physical removal to the target checkout's machine-local locus lock. */
export function createNodeTeardownLocusDriver(options: {
  readonly exec: GitExec;
  readonly identity: string;
}): TeardownLocusDriver {
  return { retire: (request) => retireNodeCheckoutLocus(options, request) };
}

async function retireNodeCheckoutLocus(
  runtime: { readonly exec: GitExec; readonly identity: string },
  options: RetireCheckoutLocusOptions,
): Promise<{ readonly roleRemoved: boolean }> {
  const checkoutPath = resolve(options.checkoutPath);
  const topology = await scanRegisteredWorktrees(runtime.exec);
  if (!topology.ok) throw new Error(`cannot retire checkout session locus: ${topology.message}`);
  const initial = exactTarget(topology.worktrees, checkoutPath);
  if (initial === null || initial.head !== options.expectedHead) {
    throw new Error("cannot retire checkout session locus: target is not the expected live roster generation");
  }
  const inspector = createPlatformProcessInspector();
  const anchor = await selectLocusMutationAnchor(inspector, "cannot retire checkout session locus");
  const root = await resolveLocusRoot({ identity: runtime.identity, scan: () => Promise.resolve(topology) });
  if (!root.ok) throw new Error(`cannot retire checkout session locus: ${root.message}`);
  const pathFlavor = process.platform === "win32" ? "windows" : "posix";
  const identity = deriveLocusRecordId(checkoutPath, pathFlavor);
  const recordPath = locusRecordPath(root, identity.digest);
  const acquired = await acquireLocusLock({
    path: locusLockPath(root, identity.digest),
    anchor,
    inspector,
  });
  if (acquired.kind !== "acquired") throw new Error(`cannot retire checkout session locus: record lock is ${acquired.reason}`);

  const applyUnderLock = async (): Promise<{ readonly roleRemoved: boolean }> => {
    const freshTopology = await scanRegisteredWorktrees(runtime.exec);
    if (!freshTopology.ok) throw new Error("cannot retire checkout session locus: target roster is unavailable under lock");
    const fresh = exactTarget(freshTopology.worktrees, checkoutPath);
    if (fresh === null || fresh.head !== options.expectedHead) {
      throw new Error("cannot retire checkout session locus: target roster generation changed under lock");
    }
    const current = await readLocusRecord({ path: recordPath, expectedDigest: identity.digest, pathFlavor });
    await validateRecordGeneration(current, identity.recordId, checkoutPath, options, inspector);
    await options.revalidateLocal();
    await options.retireProjection();
    if (current.kind === "valid") {
      const removed = await removeLocusRecord({ path: recordPath, expectedBytes: current.bytes });
      if (removed.kind !== "removed") {
        throw new Error("cannot retire checkout session locus: role generation changed before pop");
      }
    }
    return { roleRemoved: current.kind === "valid" };
  };
  let outcome:
    | { readonly kind: "success"; readonly value: { readonly roleRemoved: boolean } }
    | { readonly kind: "failure"; readonly error: unknown };
  try {
    outcome = { kind: "success", value: await applyUnderLock() };
  } catch (error) {
    outcome = { kind: "failure", error };
  }
  const released = await releaseLocusLock(acquired.handle);
  if (released.kind !== "released") throw new Error(`cannot release checkout session locus lock: ${released.kind}`);
  if (outcome.kind === "failure") throw outcome.error;
  return outcome.value;
}

async function validateRecordGeneration(
  current: Awaited<ReturnType<typeof readLocusRecord>>,
  recordId: string,
  checkoutPath: string,
  options: RetireCheckoutLocusOptions,
  inspector: ReturnType<typeof createPlatformProcessInspector>,
): Promise<void> {
  const expected = options.expectedOccupancy;
  if (current.kind === "absent") {
    if (expected.recordId !== null || expected.recordGeneration !== null) {
      throw new Error("cannot retire checkout session locus: expected record generation is absent");
    }
    return;
  }
  if (current.kind !== "valid"
    || current.record.recordId !== recordId
    || current.record.checkoutPath !== checkoutPath
    || expected.recordId !== current.record.recordId
    || expected.recordGeneration !== digestBytes(current.bytes)
    || expected.leaseId !== (current.record.lease?.leaseId ?? null)) {
    throw new Error("cannot retire checkout session locus: role or lease generation changed under lock");
  }
  if (!recordMatchesSubject(current.record.role, options.subject)) {
    throw new Error("cannot retire checkout session locus: role does not match the teardown subject");
  }
  if (current.record.lease !== null) {
    const liveness = current.record.lease.anchor.kind === "process"
      ? await verifyProcessAnchor(current.record.lease.anchor, inspector)
      : "unknown";
    if (liveness !== "dead") throw new Error(`cannot retire checkout session locus: lease is ${liveness}`);
  }
}

function recordMatchesSubject(
  role: import("../locus/schema/index.js").LocusRole,
  subject: WorktreeSubject,
): boolean {
  return subject.kind === "work-unit"
    && role.kind === "work-unit"
    && role.subject.kind === "work-unit"
    && role.subject.key === subject.name
    && role.subject.claimId === null;
}

function exactTarget(
  worktrees: readonly { readonly path: string; readonly head: string }[],
  checkoutPath: string,
): { readonly path: string; readonly head: string } | null {
  const matches = worktrees.filter((candidate) => resolve(candidate.path) === checkoutPath);
  return matches.length === 1 ? matches[0] ?? null : null;
}

function digestBytes(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
