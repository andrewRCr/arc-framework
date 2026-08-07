/** Exact-generation pending-to-ready marker transaction for transient checkout setup. */

import { isDeepStrictEqual } from "node:util";

import {
  decodeWorktreeMarkerOwnership,
  type PartialErrandWorktreeSubject,
  type TransientWorktreeSubject,
  type WorktreeMarker,
} from "../git/worktree-marker.js";
import { isSlugSafe } from "../kernel/index.js";
import type { LocusRoleAuthority } from "./mutation.js";
import type {
  ProvisioningEvidence,
  ProvisioningMarkerReadResult,
  ProvisionTransientLocusOptions,
  ProvisioningProposal,
} from "./provisioning-types.js";

export interface ReadyProvisioningMarker {
  readonly marker: WorktreeMarker;
  readonly bytes: Buffer;
  readonly owned: boolean;
}

export type MarkerEstablishmentResult =
  | { kind: "ready"; value: ReadyProvisioningMarker }
  | {
      kind: "error";
      error: Error;
      rollback: { markerBytes: Buffer; markerOwned: boolean; checkoutPath: string } | null;
    }
  | { kind: "refused"; reason: "marker-conflict"; evidence: ProvisioningEvidence };

/** Establish exact pending provenance, run setup, and promote only the observed bytes. */
export async function establishReadyMarker(
  options: ProvisionTransientLocusOptions,
  checkoutPath: string,
  subject: TransientWorktreeSubject,
): Promise<MarkerEstablishmentResult> {
  let current: ProvisioningMarkerReadResult;
  try {
    current = await options.dependencies.readMarker(checkoutPath);
  } catch (error) {
    return { kind: "error", error: toError(error), rollback: null };
  }
  let observed: ReadyProvisioningMarker;
  if (current.kind === "absent") {
    const pending = pendingMarker(options, subject);
    let created;
    try {
      created = await options.dependencies.createMarker(checkoutPath, pending);
    } catch (error) {
      return { kind: "error", error: toError(error), rollback: null };
    }
    if (created.kind === "created") {
      observed = { marker: pending, bytes: created.bytes, owned: true };
    } else {
      // This arm runs after the checkout exists, so a throw here would escape
      // the composition with a spawned worktree already on disk. `rollback` is
      // null because a raced marker belongs to the session that won the create.
      let raced: ProvisioningMarkerReadResult;
      try {
        raced = await options.dependencies.readMarker(checkoutPath);
      } catch (error) {
        return { kind: "error", error: toError(error), rollback: null };
      }
      const matched = matchingTransientMarker(raced, subject, options.spawningIdentity);
      if (matched === null) {
        return {
          kind: "refused",
          reason: "marker-conflict",
          evidence: markerMismatchEvidence(checkoutPath, raced),
        };
      }
      observed = { ...matched, owned: false };
    }
  } else {
    const matched = matchingTransientMarker(current, subject, options.spawningIdentity);
    if (matched === null) {
      return {
        kind: "refused",
        reason: "marker-conflict",
        evidence: markerMismatchEvidence(checkoutPath, current),
      };
    }
    observed = { ...matched, owned: false };
  }

  const decoded = decodeWorktreeMarkerOwnership(observed.marker);
  if (decoded.kind !== "current" || decoded.provisioning === null || !("claimId" in decoded.subject)) {
    return {
      kind: "refused",
      reason: "marker-conflict",
      evidence: markerMismatchEvidence(checkoutPath, {
        kind: "present",
        marker: observed.marker,
        bytes: observed.bytes,
      }),
    };
  }
  if (decoded.provisioning === "ready") {
    return { kind: "ready", value: observed };
  }
  if (!observed.owned) {
    return {
      kind: "refused",
      reason: "marker-conflict",
      evidence: {
        kind: "pending-marker",
        checkoutPath,
        markerBytes: observed.bytes,
      },
    };
  }
  try {
    await options.dependencies.setupWorktree(
      checkoutPath,
      options.proposal.allocation.kind === "spawn" ? options.proposal.allocation.primaryPath : checkoutPath,
    );
  } catch (error) {
    return {
      kind: "error",
      error: toError(error),
      rollback: { markerBytes: observed.bytes, markerOwned: observed.owned, checkoutPath },
    };
  }
  const ready = { ...observed.marker, provisioning: "ready" } as WorktreeMarker;
  let promoted;
  try {
    promoted = await options.dependencies.replaceMarker(checkoutPath, observed.bytes, ready);
  } catch (error) {
    return {
      kind: "error",
      error: toError(error),
      rollback: { markerBytes: observed.bytes, markerOwned: observed.owned, checkoutPath },
    };
  }
  if (promoted.kind !== "replaced") {
    return {
      kind: "refused",
      reason: "marker-conflict",
      evidence: {
        kind: "marker-record-mismatch",
        checkoutPath,
        markerBytes: observed.bytes,
        recordBytes: null,
      },
    };
  }
  return { kind: "ready", value: { marker: ready, bytes: promoted.bytes, owned: observed.owned } };
}

export function transientMarkerSubject(proposal: ProvisioningProposal): TransientWorktreeSubject | null {
  return proposal.subject.claimId === null || !isSlugSafe(proposal.subject.key)
    ? null
    : { kind: proposal.subject.kind, slug: proposal.subject.key, claimId: proposal.subject.claimId };
}

/** Project a primary transient proposal and its authority into unified marker ownership. */
export function readyPrimaryMarker(
  options: ProvisionTransientLocusOptions,
  authority: LocusRoleAuthority,
): WorktreeMarker | null {
  const subject = primaryMarkerSubject(options.proposal);
  if (subject === null) return null;
  const origin = subject.kind === "partial-errand"
    ? partialOrigin(authority)
    : {};
  if (origin === null) return null;
  const common = {
    spawnedByArc: false as const,
    provisioning: "ready" as const,
    ...(options.parentCheckoutPath === null ? {} : { parentCheckoutPath: options.parentCheckoutPath }),
    ...origin,
    spawningIdentity: options.spawningIdentity,
    createdAt: options.establishedAt,
  };
  return subject.kind === "partial-errand"
    ? { ...common, createdFor: subject }
    : { ...common, createdFor: subject };
}

function primaryMarkerSubject(
  proposal: ProvisioningProposal,
): TransientWorktreeSubject | PartialErrandWorktreeSubject | null {
  if (!isSlugSafe(proposal.subject.key)) return null;
  if (proposal.subject.claimId !== null) {
    return {
      kind: proposal.subject.kind,
      slug: proposal.subject.key,
      claimId: proposal.subject.claimId,
    };
  }
  return proposal.subject.kind === "errand"
    ? { kind: "partial-errand", slug: proposal.subject.key, claimId: null }
    : null;
}

function partialOrigin(
  authority: LocusRoleAuthority,
): { originEntry?: string; originEntrySourceDigest?: string } | null {
  if (authority.kind !== "partial-errand") return null;
  if (authority.originEntry === null && authority.originEntrySourceDigest === null) return {};
  return authority.originEntry !== null && authority.originEntrySourceDigest !== null
    ? {
        originEntry: authority.originEntry,
        originEntrySourceDigest: authority.originEntrySourceDigest,
      }
    : null;
}

function pendingMarker(
  options: ProvisionTransientLocusOptions,
  subject: TransientWorktreeSubject,
): WorktreeMarker {
  return {
    spawnedByArc: true,
    createdFor: subject,
    provisioning: "pending",
    ...(options.parentCheckoutPath === null ? {} : { parentCheckoutPath: options.parentCheckoutPath }),
    spawningIdentity: options.spawningIdentity,
    createdAt: options.establishedAt,
  };
}

function matchingTransientMarker(
  result: ProvisioningMarkerReadResult,
  subject: TransientWorktreeSubject,
  spawningIdentity: string,
): { marker: WorktreeMarker; bytes: Buffer } | null {
  if (result.kind !== "present" || result.marker.spawningIdentity !== spawningIdentity) return null;
  const decoded = decodeWorktreeMarkerOwnership(result.marker);
  if (decoded.kind !== "current" || decoded.provisioning === null) return null;
  return isDeepStrictEqual(decoded.subject, subject)
    ? { marker: result.marker, bytes: result.bytes }
    : null;
}

function markerMismatchEvidence(
  checkoutPath: string,
  result: ProvisioningMarkerReadResult,
): ProvisioningEvidence {
  return {
    kind: "marker-record-mismatch",
    checkoutPath,
    markerBytes: result.kind === "present" ? result.bytes : null,
    recordBytes: null,
  };
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
