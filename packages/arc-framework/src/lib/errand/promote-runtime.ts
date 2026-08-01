/** Production local-frame transaction for ordinary Errand promotion. */

import { isDeepStrictEqual } from "node:util";
import { access, lstat, mkdir, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";

import { renderMetaFile, type MetaRenderOverrides } from "../active/meta-reader.js";
import { MetaPrioritySchema, MetaWorkClassSchema } from "../active/meta-schema.js";
import { atomicWriteFile } from "../fs.js";
import type { GitExec, GitExecInput } from "../git/exec.js";
import { normalizeGitRejection } from "../git/process-error.js";
import {
  decodeWorktreeMarkerOwnership,
  readWorktreeMarkerGeneration,
  replaceWorktreeMarkerGeneration,
  type WorktreeMarker,
} from "../git/worktree-marker.js";
import { resolveArcPath } from "../layout/index.js";
import { SlugSchema, type CanonicalDigest } from "../kernel/index.js";
import { createLocusEvidenceIO } from "../locus/evidence.js";
import { createLocusMutationResult, releaseLocusLease, updateLocusRole } from "../locus/mutation.js";
import {
  createPlatformProcessAncestryInspector,
  createPlatformProcessInspector,
} from "../locus/platform-inspectors.js";
import { acquireSessionAnchor } from "../locus/process-inspector.js";
import { readPrimarySafety } from "../locus/primary-safety.js";
import { createNodeProvisioningDependencies } from "../locus/provisioning-runtime.js";
import type { ProvisioningRecordLock } from "../locus/provisioning-types.js";
import { readLocusState } from "../locus/reader.js";
import { projectLocusRowRole } from "../locus/roster.js";
import { deriveLocusRecordId } from "../locus/path-identity.js";
import type {
  LocusMutationResultV1,
  LocusProcessAnchor,
  LocusRecordV1,
  LocusRowV1,
  LocusStateV1,
} from "../locus/schema/index.js";
import { ordinaryErrandTransform, type OrdinaryErrandRecord } from "./identity-transitions.js";
import { transactTransientIdentities } from "./identity-transaction.js";
import {
  promoteOrdinaryErrand,
  type PromoteFloor,
  type PromotionFrameReceipt,
  type PromotionFrameResult,
} from "./promote.js";

export interface PromoteOrdinaryErrandRuntimeOptions {
  readonly slug: string;
  readonly name: string;
  readonly type: string;
  readonly floor: PromoteFloor;
  readonly owner: string;
  readonly priority?: string;
  readonly class?: string;
  readonly protection: "full" | "partial";
  readonly base: string;
  readonly identity: string;
  readonly identityGlobalUserDir: string;
  readonly postCreateScript: string;
  readonly registeredHarnessDirs: string;
  readonly exec: GitExec;
  readonly execInput: GitExecInput;
  readonly settleInbox: (binding: {
    readonly originEntry: string;
    readonly originEntrySourceDigest: CanonicalDigest;
  }) => Promise<PromotionInboxSettlementResult>;
  /** Test seam for a preselected process anchor; production acquires it from ancestry. */
  readonly anchor?: LocusProcessAnchor;
}

export type PromotionInboxSettlementResult =
  | { readonly kind: "applied" | "idempotent" }
  | { readonly kind: "refused"; readonly message: string }
  | { readonly kind: "error"; readonly message: string };

/** Promote an exact live ordinary-v3 checkout and retire its identity after lock release. */
export async function promoteOrdinaryErrandAtRuntime(
  options: PromoteOrdinaryErrandRuntimeOptions,
): Promise<LocusMutationResultV1> {
  const io = { exec: options.exec, execInput: options.execInput, identity: options.identity };
  const remote = await configuredIdentityRemote(options.exec);
  const inspector = createPlatformProcessInspector();
  const anchor = options.anchor
    ?? await acquireSessionAnchor(process.pid, createPlatformProcessAncestryInspector());
  const pathFlavor = process.platform === "win32" ? "windows" : "posix";
  if (anchor.kind !== "process") {
    return createLocusMutationResult({
      outcome: "refused",
      operation: "errand-promote",
      reason: "lease-unknown",
      recommendedPromptText: `A durable session anchor is unavailable: ${anchor.reason}`,
    });
  }
  const readState = () => readRuntimeState(options, anchor, inspector, pathFlavor);
  return promoteOrdinaryErrand({
    ...options,
    dependencies: {
      readIdentity: async () => {
        const result = await transactTransientIdentities(io, {
          remote,
          message: `arc: reconcile errand identity ${options.slug}`,
          transform: (records) => ({ kind: "idempotent", value: records.get(options.slug) ?? null }),
        });
        if (result.kind === "applied" || result.kind === "idempotent") return { kind: "ready", record: result.value };
        return result.kind === "refused"
          ? { kind: "refused", reason: result.reason }
          : { kind: "error", message: result.message };
      },
      recoverPromoted: async () => recoverPromotedFrame(options, await readState()),
      replaceFrame: async (record) => replaceLocalFrame(options, record, await readState(), anchor, inspector, pathFlavor),
      retire: async (record) => {
        const result = await transactTransientIdentities(io, {
          remote,
          message: `arc: promote errand ${options.slug}`,
          transform: ordinaryErrandTransform({
            kind: "retire", previous: record, reason: "promotion", authorization: "local",
          }),
        });
        if (result.kind === "applied" || result.kind === "idempotent") return { kind: result.kind };
        return result.kind === "refused"
          ? { kind: "refused", reason: result.reason }
          : { kind: "error", message: result.message };
      },
      settlePromoted: async (frame) => settlePromotedFrame(options, frame, anchor, inspector, pathFlavor),
    },
  });
}

async function replaceLocalFrame(
  options: PromoteOrdinaryErrandRuntimeOptions,
  record: OrdinaryErrandRecord,
  state: LocusStateV1,
  anchor: Extract<Awaited<ReturnType<typeof acquireSessionAnchor>>, { kind: "process" }>,
  inspector: ReturnType<typeof createPlatformProcessInspector>,
  pathFlavor: "windows" | "posix",
): Promise<PromotionFrameResult> {
  const target = exactTarget(state, record, options.name);
  if (target.kind === "refused") return target.result;
  const row = target.row;
  if (row.checkoutPath === null || row.recordId === null || row.lease === null) {
    return refused("record-malformed", "Promotion target has no complete role and lease generation.");
  }
  if (row.lease.state !== "live") {
    return refused(row.lease.state === "unknown" ? "lease-unknown" : "promotion-source-invalid", "Promotion requires the live Errand lease.");
  }
  const branch = promotionBranch(options);
  const metaPath = promotionMetaPath(options.name);
  const expectedMeta = renderMetaFile(options.name, metaOverrides(options, branch));
  try {
    await options.exec("git", ["check-ref-format", "--branch", branch]);
  } catch {
    return refused("promotion-source-invalid", `Promotion branch '${branch}' is invalid.`);
  }
  const source = await inspectCheckout(options.exec, row.checkoutPath, record.branch, branch, metaPath, expectedMeta);
  if (source.kind !== "ready") return source;
  if (target.arm === "work-unit" && !carriesPromotedEvidence(source, branch)) {
    return refused(
      "promotion-source-invalid",
      `Work unit '${options.name}' carries no evidence of this promotion, so it is not the Errand's own frame.`,
    );
  }
  if (source.branch === record.branch && source.metaPresent) {
    return refused("work-unit-name-taken", `Work-unit meta '${metaPath}' already exists.`);
  }
  const parent = parentRow(state, row);
  if (row.role?.parentCheckoutPath !== null && parent === null) {
    return refused("role-conflict", "Warm promotion parent authority is missing.");
  }
  const paths = [row.checkoutPath, ...(parent?.checkoutPath === null || parent?.checkoutPath === undefined
    ? [] : [parent.checkoutPath])];
  const runtime = createNodeProvisioningDependencies({
    exec: options.exec,
    identity: options.identity,
    anchor,
    inspector,
    pathFlavor,
    base: options.base,
    branch: record.branch,
    postCreateScript: options.postCreateScript,
    registeredHarnessDirs: options.registeredHarnessDirs,
  });
  const acquired = await acquireOrderedLocks(runtime, paths, pathFlavor);
  if (acquired.kind === "refused") return acquired.result;
  const handles = acquired.handles;
  try {
    const targetHandle = handles.get(row.checkoutPath);
    if (targetHandle === undefined) return { kind: "error", message: "Target session locus lock was not acquired." };
    const lockedTarget = await runtime.readRecord(targetHandle.recordPath, targetHandle);
    if (lockedTarget.kind !== "valid" || lockedTarget.record.recordId !== row.recordId) {
      return refused("record-malformed", "Promotion target record changed under lock.");
    }
    const roleState = classifyTargetRole(lockedTarget.record, record, options.name, anchor);
    if (roleState === "conflict") return refused("role-conflict", "Promotion target role or lease changed.");
    const lockedParent = parent === null ? null : await readLockedParent(runtime, handles, parent, anchor);
    if (lockedParent?.kind === "refused") return lockedParent.result;

    const rechecked = await inspectCheckout(
      options.exec, row.checkoutPath, record.branch, branch, metaPath, expectedMeta, source.head,
    );
    if (rechecked.kind !== "ready") return rechecked;
    const local = await applyLocalEvidence(options, record, row, branch, metaPath, expectedMeta, rechecked);
    if (local.kind === "refused" || local.kind === "error") return local;

    let parentReleased = false;
    if (lockedParent !== null && lockedParent.record.lease !== null) {
      const parentHandle = handles.get(lockedParent.record.checkoutPath);
      if (parentHandle === undefined) return { kind: "error", message: "Parent session locus lock was not acquired." };
      const released = await releaseLocusLease({
        recordId: lockedParent.record.recordId,
        leaseId: lockedParent.record.lease.leaseId,
        io: recordIO(runtime, parentHandle),
      });
      if (released.kind === "refused") return refused(released.reason, "Warm parent lease changed.");
      parentReleased = released.kind === "applied";
    }
    let roleOutcome: "applied" | "idempotent" = roleState === "work-unit" ? "idempotent" : "applied";
    if (roleState === "errand") {
      const updated = await updateLocusRole({
        recordId: row.recordId,
        checkoutPath: row.checkoutPath,
        expectedRole: lockedTarget.record.role,
        expectedLeaseId: row.lease.leaseId,
        authority: {
          kind: "work-unit",
          key: options.name,
          originEntry: record.originEntry,
          originEntrySourceDigest: record.origin === "inbox"
            ? record.originEntrySourceDigest as CanonicalDigest
            : null,
          promotionSource: { slug: record.slug, claimId: record.claimId },
        },
        parentCheckoutPath: null,
        sessionHomePath: row.checkoutPath,
        establishedAt: record.updatedAt,
        io: recordIO(runtime, targetHandle),
      });
      if (updated.kind === "refused") return refused(updated.reason, "Promotion target role changed.");
      roleOutcome = updated.kind;
    }
    return receipt(
      roleOutcome === "applied" || local.kind === "applied" || parentReleased ? "applied" : "idempotent",
      row,
      branch,
      metaPath,
      parentReleased,
      record.originEntry,
      record.origin === "inbox" ? record.originEntrySourceDigest as CanonicalDigest : null,
      rechecked.metaCommitted,
    );
  } finally {
    await releaseLocks(runtime, handles);
  }
}

async function applyLocalEvidence(
  options: PromoteOrdinaryErrandRuntimeOptions,
  record: OrdinaryErrandRecord,
  row: LocusRowV1,
  branch: string,
  metaPath: string,
  expectedMeta: string,
  source: Extract<Awaited<ReturnType<typeof inspectCheckout>>, { kind: "ready" }>,
): Promise<{ kind: "applied" | "idempotent" } | Extract<PromotionFrameResult, { kind: "refused" | "error" }>> {
  if (row.checkoutPath === null) return refused("checkout-missing", "Promotion checkout is absent.");
  let changed = false;
  try {
    if (source.branch === record.branch) {
      if (await localBranchExists(options.exec, branch)) {
        return refused("work-unit-name-taken", `Target branch '${branch}' already exists.`);
      }
      await options.exec("git", ["branch", "-m", record.branch, branch], { cwd: row.checkoutPath });
      changed = true;
    }
    const absoluteMeta = join(row.checkoutPath, metaPath);
    const existing = await readFile(absoluteMeta, "utf8").catch((error: unknown) => {
      if (isMissing(error)) return null;
      throw error;
    });
    if (existing === null) {
      await mkdir(join(row.checkoutPath, resolveArcPath({ kind: "placement-root", tier: "active" })), { recursive: true });
      await atomicWriteFile(absoluteMeta, expectedMeta);
      changed = true;
    } else if (existing !== expectedMeta) {
      return refused("work-unit-name-taken", `Work-unit meta '${metaPath}' already exists with different content.`);
    }
    if (row.primary !== true) {
      const marker = await convertSpawnedMarker(row.checkoutPath, record, options.name);
      if (marker.kind === "refused" || marker.kind === "error") return marker;
      changed ||= marker.kind === "applied";
    }
    return { kind: changed ? "applied" : "idempotent" };
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

async function convertSpawnedMarker(
  checkoutPath: string,
  record: OrdinaryErrandRecord,
  name: string,
): Promise<{ kind: "applied" | "idempotent" } | Extract<PromotionFrameResult, { kind: "refused" | "error" }>> {
  const generation = await readWorktreeMarkerGeneration(checkoutPath);
  if (generation.kind !== "present") return refused("role-conflict", "Spawned promotion marker is missing or malformed.");
  const decoded = decodeWorktreeMarkerOwnership(generation.marker);
  if (decoded.kind === "current" && decoded.subject.kind === "work-unit" && decoded.subject.name === name) {
    return { kind: "idempotent" };
  }
  if (decoded.kind !== "current" || decoded.provisioning !== "ready"
    || decoded.subject.kind !== "errand" || decoded.subject.slug !== record.slug
    || !("claimId" in decoded.subject) || decoded.subject.claimId !== record.claimId) {
    return refused("role-conflict", "Spawned promotion marker does not match the exact Errand generation.");
  }
  const marker: WorktreeMarker = {
    spawnedByArc: generation.marker.spawnedByArc,
    wuName: name,
    createdFor: { kind: "work-unit", name },
    spawningIdentity: generation.marker.spawningIdentity,
    createdAt: generation.marker.createdAt,
  };
  const replaced = await replaceWorktreeMarkerGeneration(checkoutPath, generation.bytes, marker);
  return replaced.kind === "replaced"
    ? { kind: "applied" }
    : refused("role-conflict", "Spawned promotion marker changed.");
}

async function recoverPromotedFrame(
  options: PromoteOrdinaryErrandRuntimeOptions,
  state: LocusStateV1,
): Promise<PromotionFrameResult | null> {
  const matches = state.roster.rows.filter((row) => row.role?.kind === "work-unit"
    && row.role.subject.kind === "work-unit" && row.role.subject.key === options.name);
  if (matches.length === 0) return null;
  if (matches.length !== 1) return refused("duplicate-locus", "Promoted work-unit session locus is ambiguous.");
  const row = matches[0];
  if (row === undefined || row.checkoutPath === null || row.recordId === null || row.lease === null) {
    return refused("record-malformed", "Promoted work-unit session locus is incomplete.");
  }
  if (row.lease.state !== "live") {
    return refused(
      row.lease.state === "unknown" ? "lease-unknown" : "promotion-source-invalid",
      "Promoted work-unit recovery requires its live session lease.",
    );
  }
  if (!row.lease.selfHeld) {
    return refused("lease-live", "Promoted work-unit recovery requires the current session lease.");
  }
  // The identity is retired here, so the slug is the only source field comparable with the caller;
  // the persisted claim ID remains durable provenance on the promoted role.
  if (row.role?.promotionSource?.slug !== options.slug) {
    return refused(
      "promotion-source-invalid",
      "Promoted work-unit recovery does not match the originating Errand generation.",
    );
  }
  const branch = promotionBranch(options);
  const metaPath = promotionMetaPath(options.name);
  const expectedMeta = renderMetaFile(options.name, metaOverrides(options, branch));
  const inspected = await inspectCheckout(options.exec, row.checkoutPath, branch, branch, metaPath, expectedMeta);
  if (inspected.kind !== "ready") return inspected;
  if (!carriesPromotedEvidence(inspected, branch)) {
    return refused("promotion-source-invalid", "Promoted work-unit evidence is incomplete.");
  }
  return receipt(
    "idempotent",
    row,
    branch,
    metaPath,
    false,
    row.role.originEntry,
    (row.role.originEntrySourceDigest as CanonicalDigest | undefined) ?? null,
    inspected.metaCommitted,
  );
}

async function settlePromotedFrame(
  options: PromoteOrdinaryErrandRuntimeOptions,
  frame: PromotionFrameReceipt,
  anchor: Extract<Awaited<ReturnType<typeof acquireSessionAnchor>>, { kind: "process" }>,
  inspector: ReturnType<typeof createPlatformProcessInspector>,
  pathFlavor: "windows" | "posix",
): Promise<PromotionFrameResult> {
  if (frame.originEntry === null) return frame;
  if (frame.originEntrySourceDigest === null) {
    return refused("record-malformed", "Promoted capture settlement is missing its source digest.");
  }

  let settled: PromotionInboxSettlementResult;
  try {
    settled = await options.settleInbox({
      originEntry: frame.originEntry,
      originEntrySourceDigest: frame.originEntrySourceDigest,
    });
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
  if (settled.kind === "refused") return refused("inbox-link-conflict", settled.message);
  if (settled.kind === "error") return { kind: "error", message: settled.message };

  const runtime = createNodeProvisioningDependencies({
    exec: options.exec,
    identity: options.identity,
    anchor,
    inspector,
    pathFlavor,
    base: options.base,
    branch: frame.branch,
    postCreateScript: options.postCreateScript,
    registeredHarnessDirs: options.registeredHarnessDirs,
  });
  const acquired = await runtime.acquireRecordLock(frame.checkoutPath);
  if (acquired.kind !== "acquired") {
    return refused(
      acquired.reason === "live" ? "lease-live" : "lease-unknown",
      "Promoted work-unit capture settlement lock is unavailable.",
    );
  }
  try {
    const locked = await runtime.readRecord(acquired.handle.recordPath, acquired.handle);
    if (locked.kind !== "valid" || locked.record.recordId !== frame.recordId
      || locked.record.checkoutPath !== frame.checkoutPath || locked.record.lease?.leaseId !== frame.leaseId
      || locked.record.role.kind !== "work-unit" || locked.record.role.subject.kind !== "work-unit"
      || locked.record.role.subject.key !== options.name || locked.record.role.subject.claimId !== null) {
      return refused("role-conflict", "Promoted work-unit generation changed during capture settlement.");
    }
    const roleDigest = (locked.record.role.originEntrySourceDigest as CanonicalDigest | undefined) ?? null;
    if (locked.record.role.originEntry === null && roleDigest === null) {
      return {
        ...frame,
        kind: settled.kind,
        originEntry: null,
        originEntrySourceDigest: null,
      };
    }
    if (locked.record.role.originEntry !== frame.originEntry || roleDigest !== frame.originEntrySourceDigest) {
      return refused("role-conflict", "Promoted capture generation changed during settlement.");
    }
    const updated = await updateLocusRole({
      recordId: frame.recordId,
      checkoutPath: frame.checkoutPath,
      expectedRole: locked.record.role,
      expectedLeaseId: frame.leaseId,
      authority: {
        kind: "work-unit",
        key: options.name,
        promotionSource: locked.record.role.promotionSource,
      },
      parentCheckoutPath: null,
      sessionHomePath: frame.checkoutPath,
      establishedAt: locked.record.role.establishedAt,
      io: recordIO(runtime, acquired.handle),
    });
    if (updated.kind === "refused") {
      return refused(updated.reason, "Promoted work-unit generation changed during capture settlement.");
    }
    return {
      ...frame,
      kind: settled.kind === "applied" || updated.kind === "applied" ? "applied" : "idempotent",
      originEntry: null,
      originEntrySourceDigest: null,
    };
  } finally {
    await runtime.releaseRecordLock(acquired.handle);
  }
}

async function inspectCheckout(
  exec: GitExec,
  checkoutPath: string,
  sourceBranch: string,
  targetBranch: string,
  metaPath: string,
  expectedMeta: string,
  expectedHead?: string,
): Promise<
  | {
      kind: "ready";
      branch: string;
      head: string;
      metaPresent: boolean;
      metaMatches: boolean;
      metaCommitted: boolean;
    }
  | Extract<PromotionFrameResult, { kind: "refused" | "error" }>
> {
  try {
    const branch = (await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: checkoutPath })).stdout.trim();
    const head = (await exec("git", ["rev-parse", "HEAD"], { cwd: checkoutPath })).stdout.trim();
    if ((branch !== sourceBranch && branch !== targetBranch) || (expectedHead !== undefined && head !== expectedHead)) {
      return refused("promotion-source-invalid", "Promotion checkout branch or head changed.");
    }
    const absoluteMeta = join(checkoutPath, metaPath);
    const meta = await readOptionalFile(absoluteMeta);
    const status = (await exec("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: checkoutPath })).stdout;
    const entries = status.split(/\r?\n/u).filter(Boolean);
    // Only the promotion's own write is recoverable dirt, and it produces exactly one untracked
    // meta. Any other index or worktree state on that path is the user's, not the transaction's.
    const recoverable = branch === targetBranch && meta === expectedMeta;
    const allowedDirty = recoverable
      ? entries.every((entry) => entry === `?? ${metaPath}`)
      : entries.length === 0;
    if (!allowedDirty) {
      return refused("promotion-source-invalid", recoverable
        ? "Promotion checkout carries changes beyond its own untracked meta."
        : "Promotion checkout has uncommitted changes.");
    }
    return {
      kind: "ready",
      branch,
      head,
      metaPresent: meta !== null,
      metaMatches: meta === expectedMeta,
      metaCommitted: recoverable && entries.length === 0,
    };
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

function exactTarget(
  state: LocusStateV1,
  record: OrdinaryErrandRecord,
  name: string,
): { kind: "ready"; row: LocusRowV1; arm: "errand" | "work-unit" }
  | { kind: "refused"; result: Extract<PromotionFrameResult, { kind: "refused" }> } {
  const errandRows = state.roster.rows.filter((row) => row.role?.subject.kind === "errand"
    && row.role.subject.key === record.slug && row.role.subject.claimId === record.claimId);
  const workUnitRows = state.roster.rows.filter((row) => row.role?.kind === "work-unit"
    && row.role.subject.kind === "work-unit"
    && row.role.subject.key === name && row.role.subject.claimId === null);
  const matches = [...errandRows, ...workUnitRows];
  if (matches.length !== 1 || matches[0] === undefined) {
    return {
      kind: "refused",
      result: refused(matches.length === 0 ? "checkout-missing" : "duplicate-locus", "Exact live Errand session locus is unavailable."),
    };
  }
  const arm = errandRows.length === 1 ? "errand" : "work-unit";
  if (arm === "work-unit" && !matchesPromotionSource(matches[0].role?.promotionSource, record)) {
    return {
      kind: "refused",
      result: refused(
        "promotion-source-invalid",
        "Promoted work-unit role does not match the exact Errand generation.",
      ),
    };
  }
  return { kind: "ready", row: matches[0], arm };
}

/**
 * Whether a checkout carries the evidence a completed promotion leaves behind.
 *
 * Persisted source provenance establishes identity; the renamed branch and exact meta additionally
 * prove that the checkout-local half of the promotion reached its intended frame.
 */
function carriesPromotedEvidence(
  inspected: { branch: string; metaMatches: boolean },
  promotedBranch: string,
): boolean {
  return inspected.branch === promotedBranch && inspected.metaMatches;
}

function parentRow(state: LocusStateV1, target: LocusRowV1): LocusRowV1 | null {
  const path = target.role?.parentCheckoutPath;
  if (path === null || path === undefined) return null;
  const matches = state.roster.rows.filter((row) => row.checkoutPath === path && row.role?.kind === "work-unit");
  return matches.length === 1 ? matches[0] ?? null : null;
}

async function acquireOrderedLocks(
  runtime: ReturnType<typeof createNodeProvisioningDependencies>,
  paths: readonly string[],
  pathFlavor: "windows" | "posix",
): Promise<
  | { kind: "ready"; handles: Map<string, ProvisioningRecordLock> }
  | { kind: "refused"; result: Extract<PromotionFrameResult, { kind: "refused" }> }
> {
  const ordered = orderPromotionLockPaths(paths, pathFlavor);
  const handles = new Map<string, ProvisioningRecordLock>();
  for (const path of ordered) {
    const acquired = await runtime.acquireRecordLock(path);
    if (acquired.kind !== "acquired") {
      await releaseLocks(runtime, handles);
      return {
        kind: "refused",
        result: refused(acquired.reason === "live" ? "lease-live" : "lease-unknown", "Promotion session locus lock is unavailable."),
      };
    }
    handles.set(path, acquired.handle);
  }
  return { kind: "ready", handles };
}

/** Return checkout paths in deterministic record-ID lock order. */
export function orderPromotionLockPaths(
  paths: readonly string[],
  pathFlavor: "windows" | "posix",
): string[] {
  return [...paths].sort((left, right) => deriveLocusRecordId(left, pathFlavor).recordId
    .localeCompare(deriveLocusRecordId(right, pathFlavor).recordId));
}

async function releaseLocks(
  runtime: ReturnType<typeof createNodeProvisioningDependencies>,
  handles: ReadonlyMap<string, ProvisioningRecordLock>,
): Promise<void> {
  for (const handle of [...handles.values()].reverse()) await runtime.releaseRecordLock(handle);
}

async function readLockedParent(
  runtime: ReturnType<typeof createNodeProvisioningDependencies>,
  handles: ReadonlyMap<string, ProvisioningRecordLock>,
  parent: LocusRowV1,
  anchor: Extract<Awaited<ReturnType<typeof acquireSessionAnchor>>, { kind: "process" }>,
): Promise<
  | { kind: "ready"; record: LocusRecordV1 }
  | { kind: "refused"; result: Extract<PromotionFrameResult, { kind: "refused" }> }
> {
  if (parent.checkoutPath === null || parent.recordId === null || parent.role === null || parent.lease === null) {
    return { kind: "refused", result: refused("record-malformed", "Warm parent record is incomplete.") };
  }
  const handle = handles.get(parent.checkoutPath);
  if (handle === undefined) return { kind: "refused", result: refused("record-malformed", "Warm parent lock is missing.") };
  const read = await runtime.readRecord(handle.recordPath, handle);
  if (read.kind !== "valid" || read.record.recordId !== parent.recordId
    || read.record.checkoutPath !== parent.checkoutPath
    || read.record.lease === null
    || parent.lease.state !== "live"
    || !parent.lease.selfHeld
    || read.record.lease.leaseId !== parent.lease.leaseId
    || read.record.lease.sessionHomePath !== parent.lease.sessionHomePath
    || !isDeepStrictEqual(read.record.lease.anchor, anchor)
    || !isDeepStrictEqual(projectLocusRowRole(read.record.role), parent.role)) {
    return { kind: "refused", result: refused("role-conflict", "Warm parent generation changed.") };
  }
  return { kind: "ready", record: read.record };
}

function classifyTargetRole(
  record: LocusRecordV1,
  identity: OrdinaryErrandRecord,
  name: string,
  anchor: Extract<Awaited<ReturnType<typeof acquireSessionAnchor>>, { kind: "process" }>,
): "errand" | "work-unit" | "conflict" {
  if (record.lease === null || !isDeepStrictEqual(record.lease.anchor, anchor)) return "conflict";
  const subject = record.role.subject;
  if (record.role.kind === "errand" && subject.kind === "errand"
    && subject.key === identity.slug && subject.claimId === identity.claimId
    && record.lease.sessionHomePath === (record.role.parentCheckoutPath ?? record.checkoutPath)) return "errand";
  if (record.role.kind === "work-unit" && subject.kind === "work-unit"
    && subject.key === name && subject.claimId === null && record.role.parentCheckoutPath === null
    && record.lease.sessionHomePath === record.checkoutPath
    && matchesPromotionSource(record.role.promotionSource, identity)
    && record.role.originEntry === identity.originEntry
    && (record.role.originEntrySourceDigest ?? null)
      === (identity.origin === "inbox" ? identity.originEntrySourceDigest : null)) return "work-unit";
  return "conflict";
}

function matchesPromotionSource(
  source: { readonly slug: string; readonly claimId: string } | undefined,
  identity: Pick<OrdinaryErrandRecord, "slug" | "claimId">,
): boolean {
  return source?.slug === identity.slug && source.claimId === identity.claimId;
}

function recordIO(
  runtime: ReturnType<typeof createNodeProvisioningDependencies>,
  handle: ProvisioningRecordLock,
) {
  return {
    read: () => runtime.readRecord(handle.recordPath, handle),
    replace: (expectedBytes: Buffer, record: LocusRecordV1) =>
      runtime.replaceRecord(handle.recordPath, expectedBytes, record, handle),
  };
}

function receipt(
  kind: "applied" | "idempotent",
  row: LocusRowV1,
  branch: string,
  metaPath: string,
  parentReleased: boolean,
  originEntry: string | null,
  originEntrySourceDigest: PromotionFrameReceipt["originEntrySourceDigest"],
  metaCommitted: boolean,
): PromotionFrameReceipt {
  if (row.checkoutPath === null || row.recordId === null || row.lease === null) throw new Error("Incomplete promotion row");
  return {
    kind,
    branch,
    metaPath,
    recordId: row.recordId,
    leaseId: row.lease.leaseId,
    checkoutPath: row.checkoutPath,
    allocation: row.primary === true ? "primary" : "spawned",
    parentReleased,
    originEntry,
    originEntrySourceDigest,
    metaCommitted,
  };
}

function promotionBranch(options: Pick<PromoteOrdinaryErrandRuntimeOptions, "floor" | "name" | "type">): string {
  return options.floor === "derivation" ? `plan/${options.name}` : `${options.type}/${options.name}`;
}

function promotionMetaPath(name: string): string {
  return resolveArcPath({
    kind: "work-unit-artifact",
    placement: { kind: "active", scope: { kind: "project" } },
    slug: SlugSchema.parse(name),
    artifact: "meta",
  });
}

function metaOverrides(
  options: Pick<PromoteOrdinaryErrandRuntimeOptions, "owner" | "priority" | "class" | "floor">,
  branch: string,
): MetaRenderOverrides {
  const overrides: MetaRenderOverrides = {
    owner: options.owner,
    branch,
    lastCompleted: "Errand promoted to work unit",
  };
  if (options.priority !== undefined) overrides.priority = MetaPrioritySchema.parse(options.priority);
  if (options.class !== undefined) overrides.workClass = MetaWorkClassSchema.parse(options.class);
  if (options.floor === "derivation") {
    overrides.state = "Planning";
    overrides.currentWorkflow = "draft-design";
    overrides.nextAction = "Resolve the design before further implementation.";
  } else {
    overrides.state = "Active";
    overrides.nextAction = "Backfill a brief spec and task list, then continue implementation.";
  }
  return overrides;
}

async function localBranchExists(exec: GitExec, branch: string): Promise<boolean> {
  const args = ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`];
  try {
    await exec("git", args);
    return true;
  } catch (error) {
    if (normalizeGitRejection(error, { command: "git", args }).exitCode === 1) return false;
    throw error;
  }
}

async function readRuntimeState(
  options: PromoteOrdinaryErrandRuntimeOptions,
  anchor: Extract<Awaited<ReturnType<typeof acquireSessionAnchor>>, { kind: "process" }>,
  inspector: ReturnType<typeof createPlatformProcessInspector>,
  pathFlavor: "windows" | "posix",
): Promise<LocusStateV1> {
  return readLocusState({
    identity: options.identity,
    pathFlavor,
    evidenceIO: createLocusEvidenceIO({ exec: options.exec, identity: options.identity, inspector }),
    subjectMetaIO: {
      readFile: (path) => readFile(path, "utf8"),
      pathExists: async (path) => access(path).then(() => true, () => false),
      realpath,
      lstat,
    },
    identityGlobalUserDir: options.identityGlobalUserDir,
    enteringAnchor: anchor,
    readPrimarySafety: (path) => readPrimarySafety({ primaryPath: path, baseBranch: options.base, exec: options.exec }),
  });
}

async function configuredIdentityRemote(exec: GitExec): Promise<"origin" | null> {
  try {
    return (await exec("git", ["remote", "get-url", "origin"])).stdout.trim() === "" ? null : "origin";
  } catch {
    return null;
  }
}

function refused(
  reason: Extract<PromotionFrameResult, { kind: "refused" }> ["reason"],
  message: string,
): Extract<PromotionFrameResult, { kind: "refused" }> {
  return { kind: "refused", reason, message };
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code?: unknown }).code === "ENOENT";
}

async function readOptionalFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}
