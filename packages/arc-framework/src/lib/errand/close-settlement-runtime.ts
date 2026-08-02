/** Exact checkout restoration and caller-owned locus settlement for ordinary Errand close. */

import type { GitExec } from "../git/exec.js";
import {
  classifyTransientWorktreeProvenance,
  readWorktreeMarker,
  readWorktreeMarkerGeneration,
} from "../git/worktree-marker.js";
import { scanRegisteredWorktrees } from "../git/worktree-roster.js";
import {
  popOwnedLocusRole,
  validateOwnedLocusRole,
  type OwnedLocusRoleExpectations,
} from "../locus/mutation.js";
import type { ProcessInspector } from "../locus/process-inspector.js";
import { createNodeProvisioningDependencies } from "../locus/provisioning-runtime.js";
import type { LocusRecordReadResult } from "../locus/record-store.js";
import type { LocusAnchor, LocusRowV1, LocusStateV1 } from "../locus/schema/index.js";
import type {
  CloseAuthorityGuard,
  CloseLocusSettlementResult,
  CloseTarget,
} from "./close-locus.js";
import { acquireErrandCloseHeadLock } from "./close-head-lock.js";

/** Runtime authority and production boundaries for one selected close generation. */
export interface CloseLocusSettlementRuntimeOptions {
  readonly authority: "current-checkout" | "base-checkout";
  readonly target: CloseTarget;
  readonly state: LocusStateV1;
  readonly row: LocusRowV1;
  readonly currentCheckoutPath: string;
  readonly base: string;
  readonly identity: string;
  readonly postCreateScript: string;
  readonly registeredHarnessDirs: string;
  readonly anchor: LocusAnchor;
  readonly inspector: ProcessInspector;
  readonly pathFlavor: "windows" | "posix";
  readonly exec: GitExec;
}

interface PreparedBaseGuard {
  readonly guard: CloseAuthorityGuard;
  cancel(): Promise<void>;
}

type CleanBaseVerdict =
  | { kind: "valid" }
  | { kind: "refused"; message: string }
  | { kind: "error"; message: string };

/**
 * Restore or remove the exact owned checkout, then pop its role before identity retirement.
 *
 * @param options - Selected checkout, role generation, and runtime evidence boundaries.
 * @returns Settled role coordinates plus any authority guard needed by subsequent cleanup.
 */
export async function settleOrdinaryErrandCloseLocusAtRuntime(
  options: CloseLocusSettlementRuntimeOptions,
): Promise<CloseLocusSettlementResult> {
  const row = options.row;
  const role = row.role;
  const lease = row.lease;
  if (row.kind !== "managed-role" || row.checkoutPath === null || row.recordId === null || role === null) {
    return refused("record-malformed", "Errand close occupancy is incomplete.");
  }
  if (role.kind !== "errand" || lease === null || lease.state !== "live" || !lease.selfHeld) {
    return refused("role-conflict", "Errand close occupancy is not owned by this session.");
  }

  const runtime = createNodeProvisioningDependencies({
    exec: options.exec,
    identity: options.identity,
    anchor: options.anchor,
    inspector: options.inspector,
    pathFlavor: options.pathFlavor,
    base: options.base,
    branch: options.target.record.branch,
    postCreateScript: options.postCreateScript,
    registeredHarnessDirs: options.registeredHarnessDirs,
  });
  const acquired = await runtime.acquireRecordLock(row.checkoutPath);
  if (acquired.kind !== "acquired") {
    return refused(
      acquired.reason === "live" ? "lease-live" : "lease-unknown",
      "The Errand session locus lock is unavailable.",
    );
  }

  const read = () => runtime.readRecord(acquired.handle.recordPath, acquired.handle);
  const expectations: OwnedLocusRoleExpectations = {
    recordId: row.recordId,
    checkoutPath: row.checkoutPath,
    expectedSubject: role.subject,
    expectedLeaseId: lease.leaseId,
    enteringAnchor: options.anchor,
  };
  let result: CloseLocusSettlementResult;
  let preparedGuard: PreparedBaseGuard | null = null;
  try {
    const owned = validateOwnedLocusRole(await read(), expectations);
    if (owned.kind !== "owned") {
      result = refused(
        owned.kind === "absent" ? "role-conflict" : owned.reason,
        "The Errand session locus generation changed before checkout settlement.",
      );
    } else {
      const prepared = await prepareCheckout(options, row.checkoutPath, row.primary === true);
      if (prepared.kind === "refused" || prepared.kind === "error") {
        result = prepared;
      } else {
        if (prepared.guardPath !== null) {
          const guarded = await acquirePreparedBaseGuard(options, prepared.guardPath);
          if (guarded.kind === "refused" || guarded.kind === "error") {
            result = guarded;
          } else {
            preparedGuard = guarded.value;
            result = await popOwnedGeneration(options, expectations, read, runtime, acquired.handle);
          }
        } else {
          result = await popOwnedGeneration(options, expectations, read, runtime, acquired.handle);
        }
      }
    }
  } catch (error) {
    result = { kind: "error", message: errorMessage(error) };
  }

  try {
    await runtime.releaseRecordLock(acquired.handle);
  } catch (error) {
    await preparedGuard?.cancel().catch(() => undefined);
    return { kind: "error", message: `Could not release the Errand session locus lock: ${errorMessage(error)}` };
  }
  if (result.kind === "refused" || result.kind === "error") {
    try {
      await preparedGuard?.cancel();
    } catch (error) {
      return { kind: "error", message: `Could not release checkout authority: ${errorMessage(error)}` };
    }
    return result;
  }
  return { ...result, guard: preparedGuard?.guard ?? null };
}

async function popOwnedGeneration(
  options: CloseLocusSettlementRuntimeOptions,
  expectations: OwnedLocusRoleExpectations,
  read: () => Promise<LocusRecordReadResult>,
  runtime: ReturnType<typeof createNodeProvisioningDependencies>,
  handle: Parameters<ReturnType<typeof createNodeProvisioningDependencies>["releaseRecordLock"]>[0],
): Promise<CloseLocusSettlementResult> {
  const popped = await popOwnedLocusRole({
    ...expectations,
    operation: "errand-close",
    recommendedPromptText: "Errand checkout occupancy removed.",
    io: {
      read,
      remove: (bytes) => runtime.removeRecord(handle.recordPath, bytes, handle),
    },
  });
  if (popped.outcome === "refused") {
    return refused(popped.reason, popped.recommendedPromptText);
  }
  if (popped.outcome === "error") return { kind: "error", message: popped.error.message };
  return {
    kind: popped.outcome,
    guard: null,
    recordId: options.row.recordId,
    sessionHomePath: options.row.lease?.sessionHomePath ?? null,
    restoredParent: restoredParent(options.state, options.row),
  };
}

async function prepareCheckout(
  options: CloseLocusSettlementRuntimeOptions,
  checkoutPath: string,
  primary: boolean,
): Promise<
  | { kind: "ready"; guardPath: string | null }
  | Extract<CloseLocusSettlementResult, { kind: "refused" | "error" }>
> {
  const topology = await scanRegisteredWorktrees(options.exec);
  if (!topology.ok) return refused("role-conflict", `Errand checkout topology is unavailable: ${topology.message}`);
  const matches = topology.worktrees.filter((worktree) => worktree.path === checkoutPath);
  const worktree = matches.length === 1 ? matches[0] : undefined;
  if (worktree === undefined || worktree.detached || worktree.primary !== primary) {
    return refused("role-conflict", "The Errand checkout is no longer the selected worktree generation.");
  }
  if (await worktreeIsDirty(options.exec, checkoutPath)) {
    return refused("preservation-unproven", "The Errand checkout has uncommitted changes.");
  }

  if (options.authority === "base-checkout") {
    if (!primary || worktree.branch !== options.base || checkoutPath !== options.currentCheckoutPath) {
      return refused("role-conflict", "The selected primary checkout is no longer on the configured base.");
    }
    const marker = await readWorktreeMarker(checkoutPath);
    return marker.kind === "absent"
      ? { kind: "ready", guardPath: checkoutPath }
      : refused("role-conflict", "The selected primary checkout carries unexpected ownership provenance.");
  }

  if (checkoutPath !== options.currentCheckoutPath
    || worktree.branch !== options.target.record.branch
    || worktree.head !== options.target.changeRequest.headSha) {
    return refused("preservation-unproven", "The occupied Errand checkout no longer carries the merged head.");
  }
  if (primary) {
    const marker = await readWorktreeMarker(checkoutPath);
    if (marker.kind !== "absent") {
      return refused("role-conflict", "The selected primary checkout carries unexpected ownership provenance.");
    }
    try {
      await options.exec("git", ["switch", options.base], { cwd: checkoutPath });
    } catch (error) {
      return { kind: "error", message: errorMessage(error) };
    }
    const ready = await verifyCleanBase(options.exec, checkoutPath, options.base);
    if (ready.kind === "valid") return { kind: "ready", guardPath: checkoutPath };
    return ready.kind === "error" ? ready : refused("role-conflict", ready.message);
  }

  const marker = await readWorktreeMarkerGeneration(checkoutPath);
  const provenance = classifyTransientWorktreeProvenance(marker, {
    kind: "errand",
    slug: options.target.record.slug,
    claimId: options.target.record.claimId,
  });
  if (provenance?.kind !== "ready") {
    return refused("role-conflict", "Spawned Errand provenance is not exact.");
  }
  try {
    await options.exec("git", ["worktree", "remove", checkoutPath], { cwd: options.state.roster.primaryPath });
  } catch (error) {
    return { kind: "error", message: errorMessage(error) };
  }
  const after = await scanRegisteredWorktrees(options.exec);
  if (!after.ok || after.worktrees.some((candidate) => candidate.path === checkoutPath)) {
    return refused("role-conflict", "The spawned Errand checkout could not be proven removed.");
  }
  return { kind: "ready", guardPath: null };
}

async function worktreeIsDirty(exec: GitExec, checkoutPath: string): Promise<boolean> {
  try {
    return (await exec("git", ["status", "--porcelain"], { cwd: checkoutPath })).stdout.trim() !== "";
  } catch {
    return true;
  }
}

async function verifyCleanBase(exec: GitExec, checkoutPath: string, base: string): Promise<CleanBaseVerdict> {
  try {
    const branch = (await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: checkoutPath })).stdout.trim();
    const dirty = (await exec("git", ["status", "--porcelain"], { cwd: checkoutPath })).stdout;
    const marker = await readWorktreeMarker(checkoutPath);
    return branch === base && dirty === "" && marker.kind === "absent"
      ? { kind: "valid" }
      : { kind: "refused", message: `Errand close lost base-checkout authority at '${checkoutPath}'.` };
  } catch (error) {
    return { kind: "error", message: errorMessage(error) };
  }
}

async function acquirePreparedBaseGuard(
  options: CloseLocusSettlementRuntimeOptions,
  checkoutPath: string,
): Promise<
  | { kind: "ready"; value: PreparedBaseGuard }
  | Extract<CloseLocusSettlementResult, { kind: "refused" | "error" }>
> {
  const guard = createBaseCheckoutCloseGuard(options, checkoutPath);
  const acquired = await guard.acquire();
  if (acquired.kind === "refused" || acquired.kind === "error") return acquired;
  let transferred = false;
  const prepared: CloseAuthorityGuard = {
    revalidate: () => guard.revalidate(),
    acquire: () => {
      if (transferred) {
        return Promise.resolve({ kind: "error" as const, message: "Checkout authority was already transferred." });
      }
      transferred = true;
      return Promise.resolve(acquired);
    },
  };
  return {
    kind: "ready",
    value: {
      guard: prepared,
      cancel: async () => {
        if (transferred) throw new Error("Checkout authority was already transferred.");
        transferred = true;
        await acquired.release();
      },
    },
  };
}

function createBaseCheckoutCloseGuard(
  options: CloseLocusSettlementRuntimeOptions,
  checkoutPath: string,
): CloseAuthorityGuard {
  const revalidate: CloseAuthorityGuard["revalidate"] = async () => {
    const verdict = await verifyCleanBase(options.exec, checkoutPath, options.base);
    return verdict.kind === "refused"
      ? { ...verdict, reason: "role-conflict" }
      : verdict;
  };
  return {
    revalidate,
    acquire: () => acquireErrandCloseHeadLock({
      exec: options.exec,
      checkoutPath,
      identity: {
        slug: options.target.record.slug,
        claimId: options.target.record.claimId,
      },
      revalidate,
    }),
  };
}

function restoredParent(
  state: LocusStateV1,
  row: LocusRowV1,
): Extract<CloseLocusSettlementResult, { kind: "applied" | "idempotent" }>["restoredParent"] {
  const parentPath = row.role?.parentCheckoutPath;
  if (parentPath === null || parentPath === undefined) return null;
  const parent = state.roster.rows.find((candidate) => candidate.checkoutPath === parentPath
    && candidate.role?.kind === "work-unit" && candidate.recordId !== null);
  return parent?.recordId !== null && parent?.recordId !== undefined && parent.checkoutPath !== null
    ? { recordId: parent.recordId, checkoutPath: parent.checkoutPath }
    : null;
}

function refused(
  reason: Extract<CloseLocusSettlementResult, { kind: "refused" }>["reason"],
  message: string,
): Extract<CloseLocusSettlementResult, { kind: "refused" }> {
  return { kind: "refused", reason, message };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
