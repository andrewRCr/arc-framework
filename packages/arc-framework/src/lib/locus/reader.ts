/** Single bounded reader for the public locus roster envelope. */

import { join } from "node:path";

import {
  acquireLocusEvidence,
  createLocusEvidenceScheduler,
  type LocusEvidenceIO,
  type LocusEvidenceResult,
  type LocusEvidenceScheduler,
} from "./evidence.js";
import type { PathFlavor } from "./path-identity.js";
import {
  projectManagedSubject,
  projectProvisionalRoster,
  type ManagedSubjectProjection,
} from "./roster.js";
import { deriveLocusRecordId } from "./path-identity.js";
import type { PrimarySafetyResult } from "./primary-safety.js";
import { deriveLocusReconciliation } from "./reconciliation.js";
import {
  LocusEnvelopeV1Schema,
  LocusStateV1Schema,
  MAX_LOCUS_OPAQUE_CHARS,
  type LocusAnchor,
  type LocusEnvelopeV1,
  type LocusStateV1,
} from "./schema/index.js";
import {
  assembleLocusState,
  deriveLocusFrames,
  deriveLocusOperationalState,
} from "./state.js";
import {
  projectCheckoutSubjectMeta,
  type SubjectMetaIO,
  type SubjectMetaProjection,
} from "./subject-meta.js";

export interface ReadLocusEnvelopeOptions {
  identity: string | null;
  pathFlavor: PathFlavor;
  evidenceIO: LocusEvidenceIO;
  subjectMetaIO: SubjectMetaIO;
  identityGlobalUserDir?: string | null;
  concurrency?: number;
}

/** Acquire, join, derive, and producer-validate one complete public roster. */
export async function readLocusEnvelope(options: ReadLocusEnvelopeOptions): Promise<LocusEnvelopeV1> {
  const scheduler = createLocusEvidenceScheduler(options.concurrency);
  const evidence = await acquireLocusEvidence({
    identity: options.identity,
    pathFlavor: options.pathFlavor,
    io: options.evidenceIO,
    scheduler,
  });
  if (evidence.kind === "error") {
    return LocusEnvelopeV1Schema.parse({
      mode: "locus",
      ok: false,
      error: { code: evidence.code, message: normalizeEvidenceErrorMessage(evidence) },
    });
  }
  const subjects = await projectSubjects(evidence, options, scheduler);
  const provisional = projectProvisionalRoster({ evidence, subjects });
  const frames = deriveLocusFrames({
    rows: provisional.rows,
    enteringAnchor: { kind: "unverifiable", reason: "Read-only roster query" },
  });
  return LocusEnvelopeV1Schema.parse({
    mode: "locus",
    ok: true,
    primaryPath: evidence.root.primaryPath,
    rows: frames.rows,
    diagnostics: provisional.diagnostics,
  });
}

function normalizeEvidenceErrorMessage(
  evidence: Extract<LocusEvidenceResult, { kind: "error" }>,
): string {
  return evidence.message.slice(0, MAX_LOCUS_OPAQUE_CHARS) || evidence.code;
}

/** Read the mutation-facing locus state from the same bounded evidence and projection pipeline. */
export async function readLocusState(options: ReadLocusEnvelopeOptions & {
  enteringAnchor: LocusAnchor;
  readPrimarySafety(primaryPath: string): Promise<PrimarySafetyResult>;
  /** Ignore the exact record retired by marker-owned Errand leave while the old allocation reader remains. */
  tolerateMarkerRetiredTerminalRecord?: boolean;
}): Promise<LocusStateV1> {
  const scheduler = createLocusEvidenceScheduler(options.concurrency);
  const evidence = await acquireLocusEvidence({
    identity: options.identity,
    pathFlavor: options.pathFlavor,
    io: options.evidenceIO,
    scheduler,
  });
  if (evidence.kind === "error") throw new Error(`${evidence.code}: ${evidence.message}`);
  const mutationEvidence = options.tolerateMarkerRetiredTerminalRecord === true
    ? tolerateMarkerRetiredTerminalRecords(evidence)
    : evidence;
  const subjects = await projectSubjects(mutationEvidence, options, scheduler);
  const provisional = projectProvisionalRoster({ evidence: mutationEvidence, subjects });
  const frames = deriveLocusFrames({ rows: provisional.rows, enteringAnchor: options.enteringAnchor });
  const safety = await options.readPrimarySafety(mutationEvidence.root.primaryPath);
  if (safety.kind === "error") throw new Error(`${safety.code}: ${safety.message}`);
  const operational = deriveLocusOperationalState({
    primaryPath: mutationEvidence.root.primaryPath,
    rows: frames.rows,
    current: frames.current,
    primarySafety: safety,
    primaryLock: primaryLockState(mutationEvidence, options.pathFlavor),
  });
  const reconciliation = deriveLocusReconciliation({
    primaryPath: mutationEvidence.root.primaryPath,
    rows: frames.rows,
    diagnostics: provisional.diagnostics,
    current: frames.current,
    adoptionCandidates: [],
    records: mutationEvidence.records,
    locks: mutationEvidence.locks,
  });
  return LocusStateV1Schema.parse(assembleLocusState({
    primaryPath: mutationEvidence.root.primaryPath,
    frames,
    diagnostics: provisional.diagnostics,
    ...operational,
    reconciliation: reconciliation.reconciliation,
  }));
}

function tolerateMarkerRetiredTerminalRecords(
  evidence: Extract<LocusEvidenceResult, { kind: "complete" }>,
): Extract<LocusEvidenceResult, { kind: "complete" }> {
  if (evidence.identities.kind !== "complete") return evidence;
  const identities = evidence.identities;
  const retiredDigests = new Set(evidence.records.flatMap((entry) => {
    if (entry.result.kind !== "valid" || entry.canonical?.kind !== "resolved") return [];
    const canonicalPath = entry.canonical.path;
    const role = entry.result.record.role;
    if (role.kind !== "errand" || role.subject.kind !== "errand" || role.subject.claimId === null) return [];
    const identity = identities.projections.get(role.subject.key);
    if (identity?.kind !== "errand"
      || identity.purpose !== "errand"
      || identity.claimId !== role.subject.claimId
      || (identity.state !== "paused" && identity.state !== "awaiting-merge")) return [];
    const checkouts = evidence.checkouts.filter((checkout) => checkout.canonical.kind === "resolved"
      && checkout.canonical.path === canonicalPath);
    const checkout = checkouts.length === 1 ? checkouts[0] : undefined;
    return checkout?.marker.kind === "absent" ? [entry.digest] : [];
  }));
  if (retiredDigests.size === 0) return evidence;
  return {
    ...evidence,
    recordEntries: evidence.recordEntries.filter((entry) =>
      entry.kind !== "record" || !retiredDigests.has(entry.digest)),
    records: evidence.records.filter((entry) => !retiredDigests.has(entry.digest)),
    lockEntries: evidence.lockEntries.filter((entry) =>
      entry.kind !== "lock" || !retiredDigests.has(entry.digest)),
    locks: evidence.locks.filter((entry) => !retiredDigests.has(entry.digest)),
  };
}

function primaryLockState(
  evidence: Extract<LocusEvidenceResult, { kind: "complete" }>,
  pathFlavor: PathFlavor,
): "absent" | "live" | "dead" | "unknown" {
  const digest = deriveLocusRecordId(evidence.root.primaryPath, pathFlavor).digest;
  const matches = evidence.locks.filter((entry) => entry.digest === digest);
  const lock = matches[0];
  if (matches.length === 0) return "absent";
  if (matches.length !== 1 || lock === undefined || lock.result.kind !== "valid") return "unknown";
  return lock.liveness ?? "unknown";
}

async function projectSubjects(
  evidence: Extract<LocusEvidenceResult, { kind: "complete" }>,
  options: ReadLocusEnvelopeOptions,
  scheduler: LocusEvidenceScheduler,
): Promise<ReadonlyMap<string, ManagedSubjectProjection>> {
  const projected = new Map<string, ManagedSubjectProjection>();
  if (options.identity === null) return projected;
  const identity = options.identity;
  await Promise.all(evidence.records.map((entry) => scheduler(async () => {
    if (entry.result.kind !== "valid" || entry.canonical?.kind !== "resolved") return;
    const recordCanonicalPath = entry.canonical.path;
    const checkouts = evidence.checkouts.filter((checkout) =>
      checkout.canonical.kind === "resolved" && checkout.canonical.path === recordCanonicalPath);
    const checkout = checkouts.length === 1 ? checkouts[0] : undefined;
    if (checkout === undefined) return;
    const record = entry.result.record;
    const meta = record.role.kind === "work-unit"
      ? await projectWorkUnitMeta(checkout, record.role.subject.key, { ...options, identity })
      : null;
    projected.set(record.recordId, projectManagedSubject({
      identity,
      checkout: checkout.worktree,
      record,
      marker: checkout.marker,
      identities: evidence.identities,
      meta,
    }));
  })));
  return projected;
}

async function projectWorkUnitMeta(
  checkout: Extract<LocusEvidenceResult, { kind: "complete" }>["checkouts"][number],
  subjectKey: string,
  options: ReadLocusEnvelopeOptions & { identity: string },
): Promise<SubjectMetaProjection> {
  const maintainerPath = join(checkout.worktree.path, ".arc", "active", `meta-${subjectKey}.md`);
  const contributorPath = join(
    checkout.worktree.path,
    ".arc",
    "user",
    options.identity,
    "active",
    `meta-${subjectKey}.md`,
  );
  const maintainerCount = checkout.metas.filter((candidate) => candidate.path === maintainerPath).length;
  const contributorCount = checkout.metas.filter((candidate) => candidate.path === contributorPath).length;
  if (maintainerCount + contributorCount !== 1) {
    return {
      kind: "unresolved",
      code: "subject-unresolved",
      message: `Expected one exact subject meta for ${subjectKey}; found ${maintainerCount + contributorCount}`,
      metaPath: null,
    };
  }
  const metaRoot = maintainerCount === 1
    ? { kind: "maintainer" as const }
    : { kind: "contributor" as const, identity: options.identity };
  return projectCheckoutSubjectMeta({
    cwd: checkout.worktree.path,
    subjectKey,
    identity: options.identity,
    identityGlobalUserDir: options.identityGlobalUserDir,
    metaRoot,
    candidates: checkout.metas,
    io: options.subjectMetaIO,
  });
}
