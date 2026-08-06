/** Recoverable marker-owned transient checkout provisioning. */

import { isDeepStrictEqual } from "node:util";

import type { LinkedWorktreeCreationReceipt } from "../git/linked-worktree.js";
import type { WorktreeMarker } from "../git/worktree-marker.js";
import type { ProvisioningAuthority } from "./provisioning-authority.js";
import { resolveProvisioningAuthority } from "./provisioning-authority.js";
import {
  establishReadyMarker,
  readyPrimaryMarker,
  transientMarkerSubject,
} from "./provisioning-marker.js";
import {
  PrimaryCheckoutResidueError,
  type PrimaryCheckoutReceipt,
  type ProvisioningEvidence,
  type ProvisioningRefusalReason,
  type ProvisionTransientLocusOptions,
  type ProvisionTransientLocusResult,
} from "./provisioning-types.js";

export type {
  PrimaryCheckoutReceipt,
  ProvisioningEvidence,
  ProvisioningMarkerReadResult,
  ProvisioningRefusalReason,
  ProvisionTransientLocusDependencies,
  ProvisionTransientLocusOptions,
  ProvisionTransientLocusResult,
  TransientProvisioningReceipt,
} from "./provisioning-types.js";

interface SpawnState {
  readonly checkoutPath: string;
  readonly rosterHead: string;
  readonly creation: LinkedWorktreeCreationReceipt | null;
  readonly marker: { marker: WorktreeMarker; bytes: Buffer; owned: boolean };
}

/** Compose one already-claimed transient identity into a marker-owned local checkout. */
export async function provisionTransientLocus(
  options: ProvisionTransientLocusOptions,
): Promise<ProvisionTransientLocusResult> {
  const authority = resolveProvisioningAuthority(options);
  if (authority === null) return refused("identity-conflict", { kind: "identity-only" });
  const root = options.proposal.allocation.kind === "spawn"
    ? options.proposal.allocation.primaryPath
    : options.proposal.allocation.checkoutPath;
  try {
    return await options.dependencies.withOperationLock(root, async () =>
      options.proposal.allocation.kind === "spawn"
        ? provisionSpawned(options)
        : provisionPrimary(options, authority));
  } catch (error) {
    return failure(error, error instanceof PrimaryCheckoutResidueError
      ? { kind: "marker-residue", checkoutPath: error.checkoutPath, markerBytes: null }
      : { kind: "identity-only" });
  }
}

async function provisionSpawned(
  options: ProvisionTransientLocusOptions,
): Promise<ProvisionTransientLocusResult> {
  if (options.protection !== "full") {
    return refused("full-protection-required", { kind: "identity-only" });
  }
  const subject = transientMarkerSubject(options.proposal);
  if (subject === null || options.branch === null || options.proposal.allocation.kind !== "spawn") {
    return refused("identity-conflict", { kind: "identity-only" });
  }
  let created: LinkedWorktreeCreationReceipt | null = null;
  let checkoutPath: string;
  try {
    const creation = await options.dependencies.createLinkedWorktree({
      locationTemplate: options.locationTemplate,
      primaryWorktreePath: options.proposal.allocation.primaryPath,
      repo: options.repo,
      placementName: `locus-${subject.kind}-${subject.slug}-${subject.claimId}`,
      branch: options.branch,
      createBranch: options.expectedBranchHead === null,
      base: options.base,
    });
    if (creation.kind === "error") return failure(creation.error, { kind: "identity-only" });
    if (creation.kind === "refused") checkoutPath = creation.worktreePath;
    else {
      created = creation.receipt;
      checkoutPath = creation.receipt.worktreePath;
    }
  } catch (error) {
    return failure(error, { kind: "identity-only" });
  }

  const topology = await safeCall(() => options.dependencies.scanWorktrees());
  if (topology.kind === "error") return rollbackSpawnFailure(options, created, null, topology.error);
  if (!topology.value.ok) return rollbackSpawnFailure(options, created, null, topology.value.message);
  const matches = topology.value.worktrees.filter((worktree) =>
    worktree.path === checkoutPath && worktree.branch === options.branch && !worktree.detached);
  const roster = matches[0];
  if (matches.length !== 1 || roster === undefined) {
    return rollbackSpawnRefusal(options, created, null, "topology-unknown");
  }
  if (options.expectedBranchHead !== null && roster.head !== options.expectedBranchHead) {
    return rollbackSpawnRefusal(options, created, roster.head, "identity-conflict");
  }
  const fresh = await options.dependencies.revalidateTarget({
    proposal: options.proposal,
    checkoutPath,
  });
  if (fresh.kind === "refused") return rollbackSpawnRefusal(options, created, roster.head, fresh.reason);

  const marker = await establishReadyMarker(options, checkoutPath, subject);
  if (marker.kind === "error") {
    return rollbackSpawnFailure(options, created, roster.head, marker.error, marker.rollback);
  }
  if (marker.kind === "refused") return refused(marker.reason, marker.evidence);
  const spawn: SpawnState = { checkoutPath, rosterHead: roster.head, creation: created, marker: marker.value };
  return provisioned(options, spawn, null);
}

async function provisionPrimary(
  options: ProvisionTransientLocusOptions,
  authority: ProvisioningAuthority,
): Promise<ProvisionTransientLocusResult> {
  if (options.proposal.allocation.kind !== "primary") {
    return refused("identity-conflict", { kind: "identity-only" });
  }
  const checkoutPath = options.proposal.allocation.checkoutPath;
  const fresh = await options.dependencies.revalidateTarget({ proposal: options.proposal, checkoutPath });
  if (fresh.kind === "refused") return refused(fresh.reason, { kind: "identity-only" });
  const marker = await establishPrimaryMarker(options, authority, checkoutPath);
  if (marker.kind === "returned") return marker.result;
  let checkout: PrimaryCheckoutReceipt;
  try {
    checkout = await options.dependencies.checkoutPrimary(
      checkoutPath,
      options.branch,
      options.expectedBranchHead,
    );
  } catch (error) {
    const rolledBack = await rollbackPrimaryMarker(options, marker.marker);
    return failure(error, rolledBack
      ? { kind: "identity-only" }
      : { kind: "marker-residue", checkoutPath, markerBytes: marker.marker.bytes });
  }
  return provisioned(options, null, { checkout, marker: marker.marker });
}

function provisioned(
  options: ProvisionTransientLocusOptions,
  spawn: SpawnState | null,
  primary: { checkout: PrimaryCheckoutReceipt; marker: { marker: WorktreeMarker; bytes: Buffer; owned: boolean } } | null,
): ProvisionTransientLocusResult {
  const checkoutPath = spawn?.checkoutPath
    ?? (options.proposal.allocation.kind === "primary" ? options.proposal.allocation.checkoutPath : "");
  const head = spawn?.rosterHead ?? primary?.checkout.head;
  const marker = spawn?.marker ?? primary?.marker;
  if (head === undefined || marker === undefined) {
    return failure(new Error("Provisioning target has no checkout or marker proof"), { kind: "identity-only" });
  }
  const applied = spawn?.creation !== null && spawn?.creation !== undefined
    || marker.owned
    || primary?.checkout.kind === "applied";
  return {
    kind: "provisioned",
    receipt: {
      disposition: applied ? "applied" : "idempotent",
      allocation: spawn === null ? "primary" : "spawned",
      checkoutPath,
      branch: {
        name: options.branch,
        created: spawn?.creation?.branchCreated ?? primary?.checkout.branchCreated ?? false,
        head,
        base: spawn?.creation?.base ?? null,
      },
      worktree: { path: checkoutPath, created: spawn?.creation !== null && spawn !== null, head },
      marker: { state: "ready", bytes: marker.bytes },
    },
  };
}

async function establishPrimaryMarker(
  options: ProvisionTransientLocusOptions,
  authority: ProvisioningAuthority,
  checkoutPath: string,
): Promise<
  | { kind: "ready"; marker: { marker: WorktreeMarker; bytes: Buffer; owned: boolean } }
  | { kind: "returned"; result: ProvisionTransientLocusResult }
> {
  const candidate = readyPrimaryMarker(options, authority);
  if (candidate === null) {
    return { kind: "returned", result: refused("identity-conflict", { kind: "identity-only" }) };
  }
  let current;
  try {
    current = await options.dependencies.readMarker(checkoutPath);
  } catch (error) {
    return { kind: "returned", result: failure(error, { kind: "identity-only" }) };
  }
  if (current.kind === "present") {
    return isDeepStrictEqual(current.marker, candidate)
      ? { kind: "ready", marker: { marker: candidate, bytes: current.bytes, owned: false } }
      : { kind: "returned", result: refused("marker-conflict", {
          kind: "marker-residue", checkoutPath, markerBytes: current.bytes,
        }) };
  }
  if (current.kind === "malformed") {
    return { kind: "returned", result: refused("marker-conflict", {
      kind: "marker-residue", checkoutPath, markerBytes: null,
    }) };
  }
  try {
    const created = await options.dependencies.createMarker(checkoutPath, candidate);
    if (created.kind === "created") {
      return { kind: "ready", marker: { marker: candidate, bytes: created.bytes, owned: true } };
    }
    const raced = await options.dependencies.readMarker(checkoutPath);
    if (raced.kind === "present" && isDeepStrictEqual(raced.marker, candidate)) {
      return { kind: "ready", marker: { marker: candidate, bytes: raced.bytes, owned: false } };
    }
    return { kind: "returned", result: refused("marker-conflict", {
      kind: "marker-residue", checkoutPath, markerBytes: raced.kind === "present" ? raced.bytes : null,
    }) };
  } catch (error) {
    return { kind: "returned", result: failure(error, { kind: "identity-only" }) };
  }
}

async function rollbackPrimaryMarker(
  options: ProvisionTransientLocusOptions,
  marker: { marker: WorktreeMarker; bytes: Buffer; owned: boolean },
): Promise<boolean> {
  if (!marker.owned || options.proposal.allocation.kind !== "primary") return true;
  const checkoutPath = options.proposal.allocation.checkoutPath;
  const removed = await safeCall(() => options.dependencies.removeMarker(
    checkoutPath,
    marker.bytes,
  ));
  return removed.kind === "value" && removed.value.kind === "removed";
}

async function rollbackSpawnFailure(
  options: ProvisionTransientLocusOptions,
  creation: LinkedWorktreeCreationReceipt | null,
  rosterHead: string | null,
  error: unknown,
  markerRollback: { markerBytes: Buffer; markerOwned: boolean; checkoutPath: string } | null = null,
): Promise<ProvisionTransientLocusResult> {
  return failure(error, await rollbackSpawn(options, creation, rosterHead, markerRollback));
}

async function rollbackSpawnRefusal(
  options: ProvisionTransientLocusOptions,
  creation: LinkedWorktreeCreationReceipt | null,
  rosterHead: string | null,
  reason: ProvisioningRefusalReason,
): Promise<ProvisionTransientLocusResult> {
  return refused(reason, await rollbackSpawn(options, creation, rosterHead, null));
}

async function rollbackSpawn(
  options: ProvisionTransientLocusOptions,
  creation: LinkedWorktreeCreationReceipt | null,
  rosterHead: string | null,
  markerRollback: { markerBytes: Buffer; markerOwned: boolean; checkoutPath: string } | null,
): Promise<ProvisioningEvidence> {
  if (markerRollback !== null) {
    if (!markerRollback.markerOwned) {
      return { kind: "pending-marker", checkoutPath: markerRollback.checkoutPath, markerBytes: markerRollback.markerBytes };
    }
    const removed = await safeCall(() =>
      options.dependencies.removeMarker(markerRollback.checkoutPath, markerRollback.markerBytes));
    if (removed.kind === "error" || removed.value.kind !== "removed") {
      return { kind: "marker-residue", checkoutPath: markerRollback.checkoutPath, markerBytes: markerRollback.markerBytes };
    }
  }
  if (creation !== null && rosterHead !== null && options.proposal.allocation.kind === "spawn") {
    const rolledBack = await safeCall(() => options.dependencies.rollbackSpawned(
      creation,
      rosterHead,
      options.proposal.allocation.kind === "spawn" ? options.proposal.allocation.primaryPath : "",
    ));
    if (rolledBack.kind === "error" || rolledBack.value.kind !== "rolled-back") {
      return { kind: "marker-residue", checkoutPath: creation.worktreePath, markerBytes: null };
    }
  } else if (creation !== null) {
    return { kind: "marker-residue", checkoutPath: creation.worktreePath, markerBytes: null };
  }
  return { kind: "identity-only" };
}

function refused(reason: ProvisioningRefusalReason, evidence: ProvisioningEvidence): ProvisionTransientLocusResult {
  return { kind: "refused", reason, evidence };
}

function failure(error: unknown, evidence: ProvisioningEvidence): ProvisionTransientLocusResult {
  return { kind: "error", error: error instanceof Error ? error : new Error(String(error)), evidence };
}

async function safeCall<Value>(run: () => Promise<Value>): Promise<
  { kind: "value"; value: Value } | { kind: "error"; error: unknown }
> {
  try {
    return { kind: "value", value: await run() };
  } catch (error) {
    return { kind: "error", error };
  }
}
