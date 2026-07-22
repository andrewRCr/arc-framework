/** Network-free locus occupancy authorization for worktree teardown. */

import { createHash } from "node:crypto";
import { resolve } from "node:path";

import type { GitExec } from "../git/exec.js";
import type { WorktreeMarker, WorktreeMarkerReadResult, WorktreeSubject } from "../git/worktree-marker.js";
import { canonicalDigest } from "../canonical/canonical-json.js";
import { canonicalLocalPath } from "../local-path-identity.js";
import {
  acquireLocusEvidence,
  createLocusEvidenceIO,
  type LocusEvidenceResult,
} from "../locus/evidence.js";
import { deriveLocusRecordId, type PathFlavor } from "../locus/path-identity.js";
import { createPlatformProcessInspector } from "../locus/platform-inspectors.js";
import type { LocusRole } from "../locus/schema/index.js";

export type TeardownOccupancyManualReason =
  | "state-unavailable"
  | "lock-live"
  | "lock-unknown"
  | "record-malformed"
  | "legacy-record"
  | "cross-identity"
  | "duplicate-locus"
  | "markerless"
  | "subject-mismatch";

export type TeardownOccupancyDecision =
  | {
      readonly kind: "clear";
      readonly recordId: string | null;
      readonly leaseId: string | null;
      readonly leaseState: "absent" | "dead";
      readonly recordGeneration: string | null;
      readonly lockGeneration: string | null;
      readonly markerGeneration: string | null;
    }
  | { readonly kind: "suppress"; readonly reason: "lease-live"; readonly message: string }
  | { readonly kind: "manual"; readonly reason: TeardownOccupancyManualReason; readonly message: string };

export interface TeardownOccupancyRequest {
  readonly checkoutPath: string;
  readonly subject: WorktreeSubject;
}

export type TeardownOccupancyReader = (
  request: TeardownOccupancyRequest,
) => Promise<TeardownOccupancyDecision>;

/** Bind teardown occupancy reads to the machine-local locus store. */
export function createNodeTeardownOccupancyReader(options: {
  readonly exec: GitExec;
  readonly identity: string;
}): TeardownOccupancyReader {
  return async (request) => {
    const pathFlavor = process.platform === "win32" ? "windows" : "posix";
    let canonicalPath: string;
    try {
      canonicalPath = await canonicalLocalPath(resolve(request.checkoutPath));
    } catch (error) {
      return manual("state-unavailable", `Cannot resolve teardown occupancy path: ${message(error)}.`);
    }
    const inspector = createPlatformProcessInspector();
    const evidence = await acquireLocusEvidence({
      identity: options.identity,
      pathFlavor,
      io: createLocusEvidenceIO({ exec: options.exec, identity: options.identity, inspector }),
    });
    return classifyTeardownOccupancy({
      evidence,
      identity: options.identity,
      pathFlavor,
      canonicalPath,
      subject: request.subject,
    });
  };
}

/** Classify one exact registered checkout without granting deletion authority. */
export function classifyTeardownOccupancy(options: {
  readonly evidence: LocusEvidenceResult;
  readonly identity: string;
  readonly pathFlavor: PathFlavor;
  readonly canonicalPath: string;
  readonly subject: WorktreeSubject;
}): TeardownOccupancyDecision {
  if (options.evidence.kind === "error") {
    return manual("state-unavailable", `Locus occupancy is unavailable: ${options.evidence.message}.`);
  }
  const checkouts = options.evidence.checkouts.filter(
    (entry) => entry.canonical.kind === "resolved" && entry.canonical.path === options.canonicalPath,
  );
  const checkout = checkouts[0];
  if (checkouts.length !== 1 || checkout === undefined) {
    return manual("duplicate-locus", "The teardown target does not resolve to one exact roster entry.");
  }

  const targetDigest = deriveLocusRecordId(checkout.worktree.path, options.pathFlavor).digest;
  const directRecords = options.evidence.records.filter((entry) => entry.digest === targetDigest);
  const aliasRecords = options.evidence.records.filter((entry) =>
    entry.digest !== targetDigest
      && entry.canonical?.kind === "resolved"
      && entry.canonical.path === options.canonicalPath);
  if (directRecords.length > 1 || aliasRecords.length > 0) {
    return manual("duplicate-locus", "More than one locus record projects onto the teardown target.");
  }

  const locks = options.evidence.locks.filter((entry) => entry.digest === targetDigest);
  if (locks.length > 1) return manual("lock-unknown", "The teardown target has ambiguous lock state.");
  const lock = locks[0];
  if (lock !== undefined) {
    if (lock.result.kind !== "valid" || lock.liveness === "unknown" || lock.liveness === undefined) {
      return manual("lock-unknown", "The teardown target lock cannot be verified.");
    }
    if (lock.liveness === "live") {
      return manual("lock-live", "The teardown target is currently being mutated.");
    }
  }

  const direct = directRecords[0];
  const lockGeneration = lock?.result.kind === "valid" ? digestBytes(lock.result.bytes) : null;
  if (direct === undefined) {
    const markerDecision = validateMarker(checkout.marker, checkout.worktree.primary, options.identity, options.subject);
    if (markerDecision !== null) return markerDecision;
    return {
      kind: "clear",
      recordId: null,
      leaseId: null,
      leaseState: "absent",
      recordGeneration: null,
      lockGeneration,
      markerGeneration: deriveTeardownMarkerGeneration(checkout.marker),
    };
  }
  if (direct.result.kind === "unsupported") {
    return manual("legacy-record", "The teardown target has an unsupported locus record version.");
  }
  if (direct.result.kind !== "valid") {
    return manual("record-malformed", "The teardown target locus record is not valid current authority.");
  }
  if (direct.canonical?.kind !== "resolved" || direct.canonical.path !== options.canonicalPath) {
    return manual("record-malformed", "The teardown target locus record path cannot be verified.");
  }
  if (!recordMatchesSubject(direct.result.record.role, options.subject)) {
    return manual("subject-mismatch", "The teardown target locus role belongs to a different subject.");
  }
  const markerDecision = validateMarker(checkout.marker, checkout.worktree.primary, options.identity, options.subject);
  if (markerDecision !== null) return markerDecision;

  const lease = direct.result.record.lease;
  if (lease === null) {
    return {
      kind: "clear",
      recordId: direct.result.record.recordId,
      leaseId: null,
      leaseState: "absent",
      recordGeneration: digestBytes(direct.result.bytes),
      lockGeneration,
      markerGeneration: deriveTeardownMarkerGeneration(checkout.marker),
    };
  }
  if (direct.liveness === "live") {
    return { kind: "suppress", reason: "lease-live", message: "The teardown target has a live session lease." };
  }
  if (direct.liveness !== "dead") {
    return manual("state-unavailable", "The teardown target lease liveness cannot be verified.");
  }
  return {
    kind: "clear",
    recordId: direct.result.record.recordId,
    leaseId: lease.leaseId,
    leaseState: "dead",
    recordGeneration: digestBytes(direct.result.bytes),
    lockGeneration,
    markerGeneration: deriveTeardownMarkerGeneration(checkout.marker),
  };
}

function validateMarker(
  marker: Extract<LocusEvidenceResult, { kind: "complete" }>["checkouts"][number]["marker"],
  primary: boolean,
  identity: string,
  subject: WorktreeSubject,
): TeardownOccupancyDecision | null {
  if (primary) return null;
  if (marker.kind === "error" || marker.kind === "malformed") {
    return manual("record-malformed", "The teardown target ownership marker is unreadable or malformed.");
  }
  if (marker.kind === "absent") {
    return manual("markerless", "The teardown target has no ARC ownership marker.");
  }
  if (marker.marker.spawningIdentity !== identity) {
    return manual("cross-identity", "The teardown target ownership marker belongs to another identity.");
  }
  if (!markerMatchesSubject(marker.marker, subject)) {
    return manual("subject-mismatch", "The teardown target ownership marker belongs to a different subject.");
  }
  return null;
}

function markerMatchesSubject(marker: WorktreeMarker, subject: WorktreeSubject): boolean {
  if (subject.kind === "work-unit") {
    return marker.wuName === subject.name
      || (marker.createdFor?.kind === "work-unit" && marker.createdFor.name === subject.name);
  }
  if (subject.kind === "branch") {
    return marker.createdFor?.kind === "branch" && marker.createdFor.ref === subject.ref;
  }
  if (!("claimId" in subject)) return false;
  const createdFor = marker.createdFor;
  return createdFor?.kind === subject.kind
    && createdFor.slug === subject.slug
    && "claimId" in createdFor
    && createdFor.claimId === subject.claimId;
}

function recordMatchesSubject(
  role: LocusRole,
  subject: WorktreeSubject,
): boolean {
  if (subject.kind !== "work-unit") return false;
  return role.kind === "work-unit"
    && role.subject.kind === "work-unit"
    && role.subject.key === subject.name
    && role.subject.claimId === null;
}

function manual(reason: TeardownOccupancyManualReason, messageText: string): TeardownOccupancyDecision {
  return { kind: "manual", reason, message: messageText };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function digestBytes(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

/** Derive a stable semantic generation for a successfully read ownership marker. */
export function deriveTeardownMarkerGeneration(
  marker: WorktreeMarkerReadResult | { readonly kind: "error"; readonly message: string },
): string | null {
  return marker.kind === "present" ? canonicalDigest(marker.marker) : null;
}
