/** Exact-generation pending-to-ready marker transaction for transient checkout setup. */

import { isDeepStrictEqual } from "node:util";

import {
  decodeWorktreeMarkerOwnership,
  type TransientWorktreeSubject,
  type WorktreeMarker,
} from "../git/worktree-marker.js";
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
      const raced = await options.dependencies.readMarker(checkoutPath);
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
  if (decoded.kind === "current" && decoded.provisioning === "ready") {
    return { kind: "ready", value: observed };
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
  return proposal.subject.claimId === null
    ? null
    : { kind: proposal.subject.kind, slug: proposal.subject.key, claimId: proposal.subject.claimId };
}

function pendingMarker(
  options: ProvisionTransientLocusOptions,
  subject: TransientWorktreeSubject,
): WorktreeMarker {
  return {
    spawnedByArc: true,
    createdFor: subject,
    provisioning: "pending",
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
