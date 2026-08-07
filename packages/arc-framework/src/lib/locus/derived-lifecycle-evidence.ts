/** Dormant projections from injected lifecycle evidence into authority-only facts. */

import { relative, sep } from "node:path";

import { parseMetaRecord } from "../active/meta-reader.js";
import type { TransientIdentitySnapshot } from "../errand/identity-snapshot.js";
import type { CompletedEvidenceRead } from "../work-unit/completed-index.js";
import {
  validateOccupancyMarkerTopology,
  type OccupancyMarker,
} from "./occupancy-marker.js";
import type {
  DerivedTransientSubject,
  DerivedWorkUnitSubject,
  ErrandIdentityProjection,
  OwnershipMarkerProjection,
  SubjectTopologyExpectation,
  WorkUnitLifecycleProjection,
} from "./role-derivation.js";
import type { LocusIdentityV1 } from "./schema/identity.js";

/** Narrow injected active-meta read evidence, independent of legacy record acquisition. */
export type DormantMetaEvidence =
  | { readonly kind: "read"; readonly name: string; readonly path: string; readonly text: string }
  | { readonly kind: "error"; readonly name: string; readonly path: string; readonly message: string };

/** Injected exact-generation result for the dormant future marker projection. */
export type DormantMarkerGenerationEvidence =
  | { readonly kind: "present"; readonly marker: OccupancyMarker; readonly generation: string }
  | { readonly kind: "absent" }
  | { readonly kind: "malformed"; readonly reason: string }
  | { readonly kind: "error"; readonly reason: string };

interface SelectedActiveMeta {
  readonly kind: "present";
  readonly location: "active";
  readonly subject: DerivedWorkUnitSubject;
  readonly expectedTopology: SubjectTopologyExpectation;
  readonly metaRoot: { readonly kind: "maintainer" } | {
    readonly kind: "contributor";
    readonly identity: string;
  };
  readonly candidates: readonly DormantMetaEvidence[];
}

interface SelectedArchivedMeta {
  readonly kind: "present";
  readonly location: "completed";
  readonly subject: DerivedWorkUnitSubject;
  readonly expectedTopology: SubjectTopologyExpectation;
  readonly metaRoot: { readonly kind: "completed"; readonly path: string };
  readonly candidates: readonly DormantMetaEvidence[];
}

/** Exact active-meta evidence retained before it is narrowed into lifecycle authority. */
export type ActiveMetaEvidence =
  | { readonly kind: "absent" }
  | { readonly kind: "unreadable"; readonly reason: string; readonly path: string | null }
  | { readonly kind: "duplicate"; readonly subjectKey: string; readonly paths: readonly string[] }
  | { readonly kind: "conflicting"; readonly reason: string; readonly paths: readonly string[] }
  | SelectedActiveMeta;

/** Exact archived-meta evidence for a marker-selected work unit. */
export type ArchivedMetaEvidence =
  | { readonly kind: "absent" }
  | { readonly kind: "unreadable"; readonly reason: string; readonly path: string | null }
  | { readonly kind: "duplicate"; readonly subjectKey: string; readonly paths: readonly string[] }
  | { readonly kind: "conflicting"; readonly reason: string; readonly paths: readonly string[] }
  | SelectedArchivedMeta;

/** Injected listing evidence for one active-meta root directory. */
export type MetaRootEvidence = { readonly kind: "listed"; readonly path: string }
  | { readonly kind: "error"; readonly path: string; readonly message: string };

interface ParsedCandidate {
  readonly evidence: Extract<DormantMetaEvidence, { kind: "read" }>;
  readonly key: string;
  readonly owner: string | null;
  readonly branch: string | null;
  readonly metaRoot: SelectedActiveMeta["metaRoot"];
}

/** Select one owner-eligible active meta without consulting registered branch shape. */
export function projectActiveMetaEvidence(options: {
  cwd: string;
  identity: string;
  candidates: readonly DormantMetaEvidence[];
  metaRoots: readonly MetaRootEvidence[];
  expectedSubjectKey?: string;
}): ActiveMetaEvidence {
  const relevantCandidates = options.expectedSubjectKey === undefined
    ? options.candidates
    : options.candidates.filter((candidate) => metaKey(candidate.name) === options.expectedSubjectKey);
  const unreadableRoot = options.metaRoots.find((root) => root.kind === "error");
  if (unreadableRoot?.kind === "error") {
    return {
      kind: "unreadable",
      reason: unreadableRoot.message,
      path: normalizedRelative(options.cwd, unreadableRoot.path),
    };
  }
  const unreadableCandidate = relevantCandidates.find((candidate) => candidate.kind === "error");
  if (unreadableCandidate?.kind === "error") {
    return {
      kind: "unreadable",
      reason: unreadableCandidate.message,
      path: normalizedRelative(options.cwd, unreadableCandidate.path),
    };
  }

  const parsed: ParsedCandidate[] = [];
  for (const candidate of relevantCandidates) {
    if (candidate.kind !== "read") continue;
    const location = activeMetaLocation(options.cwd, options.identity, candidate.path);
    if (location === null) continue;
    const key = metaKey(candidate.name);
    if (key === null) continue;
    let record;
    try {
      record = parseMetaRecord(candidate.text);
    } catch (error) {
      return {
        kind: "unreadable",
        reason: error instanceof Error ? error.message : String(error),
        path: normalizedRelative(options.cwd, candidate.path),
      };
    }
    parsed.push({
      evidence: candidate,
      key,
      owner: normalizePointer(record.owner),
      branch: normalizePointer(record.branch),
      metaRoot: location,
    });
  }

  if (options.expectedSubjectKey !== undefined) {
    const exactOtherOwner = parsed.find((candidate) =>
      candidate.key === options.expectedSubjectKey && candidate.owner !== options.identity);
    if (exactOtherOwner !== undefined) {
      return {
        kind: "conflicting",
        reason: "The marker-named work unit is owned by another identity",
        paths: [normalizedRelative(options.cwd, exactOtherOwner.evidence.path)],
      };
    }
  }
  const eligible = parsed.filter((candidate) =>
    candidate.owner === options.identity
    && (options.expectedSubjectKey === undefined || candidate.key === options.expectedSubjectKey));
  if (eligible.length === 0) return { kind: "absent" };
  const paths = eligible.map((candidate) => normalizedRelative(options.cwd, candidate.evidence.path)).sort();
  if (eligible.length > 1) {
    const first = eligible[0];
    if (first !== undefined && eligible.every((candidate) =>
      candidate.key === first.key && candidate.branch === first.branch)) {
      return { kind: "duplicate", subjectKey: first.key, paths };
    }
    return {
      kind: "conflicting",
      reason: "Active-meta evidence selects different work-unit subjects or branches",
      paths,
    };
  }
  const selected = eligible[0];
  if (selected === undefined) return { kind: "absent" };
  return {
    kind: "present",
    location: "active",
    subject: { kind: "work-unit", key: selected.key },
    expectedTopology: {
      ...(selected.branch === null ? {} : { branch: selected.branch, detached: false }),
    },
    metaRoot: selected.metaRoot,
    candidates: relevantCandidates,
  };
}

/** Select one exact shipped meta from the marker-selected checkout archive. */
export function projectArchivedMetaEvidence(options: {
  cwd: string;
  identity: string;
  subjectKey: string;
  candidates: readonly DormantMetaEvidence[];
  metaRoots: readonly MetaRootEvidence[];
}): ArchivedMetaEvidence {
  const unreadableRoot = options.metaRoots.find((root) => root.kind === "error");
  if (unreadableRoot?.kind === "error") {
    return {
      kind: "unreadable",
      reason: unreadableRoot.message,
      path: normalizedRelative(options.cwd, unreadableRoot.path),
    };
  }
  const exact = options.candidates.filter((candidate) => metaKey(candidate.name) === options.subjectKey);
  const unreadableCandidate = exact.find((candidate) => candidate.kind === "error");
  if (unreadableCandidate?.kind === "error") {
    return {
      kind: "unreadable",
      reason: unreadableCandidate.message,
      path: normalizedRelative(options.cwd, unreadableCandidate.path),
    };
  }
  if (exact.length === 0) return { kind: "absent" };
  const paths = exact.map((candidate) => normalizedRelative(options.cwd, candidate.path)).sort();
  if (exact.length > 1) return { kind: "duplicate", subjectKey: options.subjectKey, paths };
  const selected = exact[0];
  if (selected === undefined || selected.kind !== "read") return { kind: "absent" };
  let record;
  try {
    record = parseMetaRecord(selected.text);
  } catch (error) {
    return {
      kind: "unreadable",
      reason: error instanceof Error ? error.message : String(error),
      path: normalizedRelative(options.cwd, selected.path),
    };
  }
  const owner = normalizePointer(record.owner);
  if (owner !== options.identity || record.state !== "Shipped") {
    return {
      kind: "conflicting",
      reason: owner !== options.identity
        ? "The archived work unit is owned by another identity"
        : "The archived work-unit meta is not Shipped",
      paths,
    };
  }
  return {
    kind: "present",
    location: "completed",
    subject: { kind: "work-unit", key: options.subjectKey },
    expectedTopology: {},
    metaRoot: { kind: "completed", path: selected.path },
    candidates: exact,
  };
}

/** Narrow future marker evidence into ownership authority. */
export function projectMarkerAuthority(
  evidence: DormantMarkerGenerationEvidence,
  topology: { readonly primary: boolean },
): OwnershipMarkerProjection {
  if (evidence.kind === "absent") return evidence;
  if (evidence.kind !== "present") {
    return { kind: "unreadable", reason: evidence.reason };
  }
  const validTopology = validateOccupancyMarkerTopology(evidence.marker, topology);
  if (validTopology.kind === "unresolved") {
    return { kind: "unreadable", reason: "Marker spawn provenance conflicts with physical topology" };
  }
  const marker = validTopology.marker;
  const subject = marker.createdFor;
  if (subject.kind !== "work-unit" && marker.provisioning !== "ready") {
    return { kind: "unreadable", reason: "Transient occupancy marker is not ready" };
  }
  return {
    kind: "present",
    subject: markerSubject(subject),
    expectedTopology: {},
  };
}

/** Combine active-meta and completed-index facts for one already marker-selected WU. */
export function projectWorkUnitLifecycle(options: {
  activeMeta: ActiveMetaEvidence;
  archivedMeta?: ArchivedMetaEvidence;
  markerSubject: DerivedWorkUnitSubject | null;
  completed: CompletedEvidenceRead;
}): WorkUnitLifecycleProjection {
  const archivedMeta = options.archivedMeta ?? { kind: "absent" };
  if (options.activeMeta.kind === "present") {
    return {
      kind: "present",
      state: "active",
      subject: options.activeMeta.subject,
      expectedTopology: options.activeMeta.expectedTopology,
    };
  }
  if (options.activeMeta.kind !== "absent") {
    return { kind: "unreadable", reason: activeMetaFailure(options.activeMeta) };
  }
  if (options.markerSubject === null) return { kind: "absent" };
  if (archivedMeta.kind === "present") {
    return {
      kind: "present",
      state: "integration",
      subject: archivedMeta.subject,
      expectedTopology: archivedMeta.expectedTopology,
    };
  }
  if (archivedMeta.kind !== "absent") {
    return { kind: "unreadable", reason: archivedMetaFailure(archivedMeta) };
  }
  if (options.completed.status !== "unavailable"
    && options.completed.records.has(options.markerSubject.key)) {
    return {
      kind: "present",
      state: "retired",
      subject: options.markerSubject,
      expectedTopology: {},
    };
  }
  if (options.completed.status !== "unavailable") return { kind: "absent" };
  return {
    kind: "unreadable",
    reason: "Completed-index evidence is unavailable; retirement cannot be determined",
  };
}

/** Select exact identity authority for one marker-selected identity-backed transient. */
export function projectIdentityAuthority(
  snapshot: TransientIdentitySnapshot,
  markerSubject: Exclude<DerivedTransientSubject, { kind: "partial-errand" }> | null,
): ErrandIdentityProjection {
  if (markerSubject === null) return { kind: "absent" };
  if (snapshot.kind === "absent") {
    return { kind: "unreadable", reason: "Transient identity snapshot is absent" };
  }
  if (snapshot.kind === "error") {
    return { kind: "unreadable", reason: snapshot.message };
  }
  const identity = snapshot.projections.get(markerSubject.key);
  if (identity === undefined) {
    const diagnostic = snapshot.diagnostics.find((item) => item.key === markerSubject.key);
    return {
      kind: "unreadable",
      reason: diagnostic === undefined
        ? "Marker-selected transient has no exact identity entry"
        : `Transient identity entry is ${diagnostic.kind}${
          "message" in diagnostic ? `: ${diagnostic.message}` : ""
        }`,
    };
  }
  return {
    kind: "present",
    subject: identitySubject(identity),
    expectedTopology: identityExpectedTopology(identity),
  };
}

function identitySubject(identity: LocusIdentityV1): Exclude<DerivedTransientSubject, { kind: "partial-errand" }> {
  if (identity.kind === "groom") {
    return { kind: "groom", key: identity.key, claimId: identity.claimId };
  }
  return {
    kind: identity.purpose === "housekeep-routing" ? "housekeep" : "errand",
    key: identity.key,
    claimId: identity.claimId,
  };
}

function markerSubject(subject: OccupancyMarker["createdFor"]):
  DerivedWorkUnitSubject | DerivedTransientSubject {
  if (subject.kind === "work-unit") return { kind: "work-unit", key: subject.name };
  if (subject.kind === "partial-errand") {
    return { kind: "partial-errand", key: subject.slug, claimId: null };
  }
  return { kind: subject.kind, key: subject.slug, claimId: subject.claimId };
}

function identityExpectedTopology(identity: LocusIdentityV1): SubjectTopologyExpectation {
  const head = identity.state === "paused"
    ? identity.savedHead
    : identity.state === "awaiting-merge"
      ? identity.changeRequest.headSha
      : undefined;
  return {
    ...(identity.branch === null ? {} : { branch: identity.branch, detached: false }),
    ...(head === undefined ? {} : { head }),
  };
}

function activeMetaFailure(evidence: Exclude<ActiveMetaEvidence, { kind: "present" | "absent" }>): string {
  if (evidence.kind === "unreadable") return evidence.reason;
  if (evidence.kind === "duplicate") return `Duplicate active meta for ${evidence.subjectKey}`;
  return evidence.reason;
}

function archivedMetaFailure(evidence: Exclude<ArchivedMetaEvidence, { kind: "present" | "absent" }>): string {
  if (evidence.kind === "unreadable") return evidence.reason;
  if (evidence.kind === "duplicate") return `Duplicate archived meta for ${evidence.subjectKey}`;
  return evidence.reason;
}

function activeMetaLocation(
  cwd: string,
  identity: string,
  path: string,
): SelectedActiveMeta["metaRoot"] | null {
  const normalized = normalizedRelative(cwd, path);
  if (normalized.startsWith(".arc/active/")) return { kind: "maintainer" };
  if (normalized.startsWith(`.arc/user/${identity}/active/`)) {
    return { kind: "contributor", identity };
  }
  return null;
}

function metaKey(name: string): string | null {
  return /^meta-(.+)\.md$/u.exec(name)?.[1] ?? null;
}

function normalizedRelative(cwd: string, path: string): string {
  return relative(cwd, path).split(sep).join("/");
}

function normalizePointer(value: string | null): string | null {
  return value === null || value === "" || value === "[none]" ? null : value;
}
