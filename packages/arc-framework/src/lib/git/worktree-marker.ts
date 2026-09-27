/**
 * Worktree-ownership marker — a machine-local record that ARC created a given
 * worktree.
 *
 * The marker lives at `.arc/system/.internal/worktree-marker.json` and is
 * gitignored: it is machine-local and never synced (never added to notes,
 * never tracked). It is self-cleaning — it shares the worktree's lifetime, so
 * removing the worktree removes the marker. Its presence is the signal
 * consulted at every cleanup site; absence means the worktree was not
 * ARC-created and cleanup is advisory only.
 *
 * @module
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { atomicWriteJson, retryTransientFileSystemRefusal } from "../fs.js";
import { isCanonicalDigest } from "../canonical/canonical-json.js";
import { SlugSchema } from "../kernel/index.js";
import {
  LocusAbsolutePathSchema,
  LocusDigestSchema,
  LocusOpaqueTextSchema,
  LocusTokenSchema,
} from "../locus/schema/limits.js";
import type {
  HuskAuthorization,
  PersistedRetirementEvidence,
  RemoteRefProof,
  RetirementEvidenceRef,
} from "../work-unit/retirement-authority.js";
import type { GitExec } from "./exec.js";

/** Logical target a worktree was created for or terminally husked from. */
export type WorktreeSubject =
  | { kind: "work-unit"; name: string }
  | { kind: "errand"; slug: string }
  | { kind: "branch"; ref: string };

/** Generation-bearing transient target. */
export type TransientWorktreeSubject = {
  [Kind in "errand" | "groom" | "housekeep"]: {
    kind: Kind;
    slug: string;
    claimId: string;
  };
}["errand" | "groom" | "housekeep"];

/** Identity-free partial Errand occupancy carried only by its marker origin binding. */
export type PartialErrandWorktreeSubject = {
  kind: "partial-errand";
  slug: string;
  claimId: null;
};

/** Logical target carried by current and legacy worktree evidence. */
export type WorktreeMarkerSubject = WorktreeSubject | TransientWorktreeSubject | PartialErrandWorktreeSubject;

/** Terminal proof recorded after ARC detaches a worktree for safe later disposal. */
export interface WorktreeHuskStamp {
  /** Exact commit checked out when the worktree was detached. */
  sha: string;
  /** ISO-8601 timestamp of the detach transition. */
  at: string;
  /** Driver-supplied logical target completed by the transition. */
  subject: WorktreeSubject;
  /** Exact branch projection occupied immediately before detach. */
  branch: string;
  /** Persisted authorization; optional only for legacy read compatibility. */
  authorization?: string;
  /** Exact remote disposition; explicit `null` is a present current value. */
  remoteRef?: RemoteRefProof;
  /** Keyed retirement evidence; optional only for legacy read compatibility. */
  evidence?: PersistedRetirementEvidence;
}

/** Exact operational projection for a spawned rename whose directory move is deferred. */
export interface WorktreeRenameMovePending {
  oldSlug: string;
  newSlug: string;
  branch: string;
  head: string;
  from: string;
  to: string;
}

/** Trust classification for a structurally valid husk stamp. */
export type DecodedWorktreeHuskStamp =
  | { kind: "legacy"; authorization: "merged-preserved" }
  | {
      kind: "current";
      authorization: HuskAuthorization;
      remoteRef: RemoteRefProof;
      evidence: RetirementEvidenceRef;
    }
  | {
      kind: "manual-only";
      reason: "mixed-presence" | "unknown-authorization" | "unknown-evidence" | "evidence-mismatch";
    };

/** Trust classification for a structurally valid ownership marker. */
export type DecodedWorktreeMarkerOwnership =
  | {
      kind: "current";
      subject: Exclude<WorktreeMarkerSubject, { kind: "errand"; claimId?: never }>;
      provisioning: "pending" | "ready" | null;
    }
  | {
      kind: "manual-only";
      reason: "legacy-transient" | "unknown-provisioning" | "malformed-ownership";
    };

/** Diagnostic-only trust projection for transient ownership provenance. */
export type TransientWorktreeProvenance =
  | { kind: "ready" | "pending"; subject: TransientWorktreeSubject }
  | { kind: "legacy"; subject: Extract<WorktreeSubject, { kind: "errand" }> }
  | {
      kind: "claim-mismatch";
      subject: TransientWorktreeSubject;
      expected: TransientWorktreeSubject;
    }
  | { kind: "unknown"; reason: "unknown-provisioning" }
  | { kind: "malformed"; message: string };

interface WorktreeMarkerBase {
  /** ARC-created provenance; written `true` — the marker's presence is the signal. */
  spawnedByArc: boolean;
  /** Identity that created the worktree. */
  spawningIdentity: string;
  /** ISO-8601 timestamp of marker creation. */
  createdAt: string;
  /** Optional machine-local checkout to return to after transient completion. */
  parentCheckoutPath?: string;
  /** Exact partial-Errand inbox entry, present only with its source digest. */
  originEntry?: string;
  /** Digest binding {@link WorktreeMarkerBase.originEntry} to its capture source. */
  originEntrySourceDigest?: string;
  /** Optional proof that ARC completed the terminal detach transition. */
  husk?: WorktreeHuskStamp;
  /** Exact deferred directory move for a renamed spawned worktree. */
  renameMovePending?: WorktreeRenameMovePending;
  /** Exact decomposition-candidate claim generation occupying this worktree. */
  decompositionCandidate?: {
    claimId: string;
    generation: number;
    candidateWorktree: string;
  };
}

/** Machine-local marker recording that ARC created a worktree. */
export type WorktreeMarker = WorktreeMarkerBase &
  (
    | {
        wuName: string;
        createdFor?: Extract<WorktreeSubject, { kind: "work-unit" }>;
        provisioning?: never;
      }
    | { wuName?: never; createdFor: WorktreeSubject; provisioning?: never }
    | { wuName?: never; createdFor: TransientWorktreeSubject; provisioning: string }
    | {
        wuName?: never;
        createdFor: PartialErrandWorktreeSubject;
        provisioning: "pending" | "ready";
      }
  );

/** Outcome of reading the marker: present, absent, or present-but-invalid. */
export type WorktreeMarkerReadResult =
  | { kind: "present"; marker: WorktreeMarker }
  | { kind: "absent" }
  | { kind: "malformed"; message: string; path: string };

/** Exact marker-file generation retained for compare-and-swap authority proofs. */
export type WorktreeMarkerGenerationReadResult =
  | { kind: "present"; marker: WorktreeMarker; bytes: Buffer }
  | Extract<WorktreeMarkerReadResult, { kind: "absent" | "malformed" }>;

/** Outcome of extending an existing valid marker with terminal husk proof. */
export type WorktreeHuskStampResult =
  | { kind: "stamped"; marker: WorktreeMarker }
  | Extract<WorktreeMarkerReadResult, { kind: "absent" | "malformed" }>;

const MARKER_PATH_SEGMENTS = [".arc", "system", ".internal", "worktree-marker.json"] as const;
const MARKER_IGNORE_PATTERN = ".arc/system/.internal/worktree-marker.json";

/** Filesystem seam for registering the marker's Git ignore rule. */
export interface WorktreeMarkerIgnoreFs {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  mkdir(path: string, options: { recursive: boolean }): Promise<void>;
}

/** Production filesystem adapter for marker ignore registration. */
export const nodeWorktreeMarkerIgnoreFs: WorktreeMarkerIgnoreFs = {
  readFile: (path) => readFile(path, "utf8"),
  writeFile,
  mkdir: async (path, options) => {
    await mkdir(path, options);
  },
};

/**
 * Resolve the marker's absolute path under a worktree root. Pure path math —
 * does not touch the filesystem.
 *
 * @param cwd - Worktree root containing `.arc/`
 * @returns Absolute path to `worktree-marker.json`
 */
export function resolveWorktreeMarkerPath(cwd: string): string {
  return join(cwd, ...MARKER_PATH_SEGMENTS);
}

/**
 * Register the machine-local ownership marker in Git's exclude file.
 *
 * @param cwd - Worktree root the marker belongs to.
 * @param exec - Git executor pinned to this repository.
 * @param fs - Filesystem adapter.
 */
export async function ensureWorktreeMarkerIgnored(
  cwd: string,
  exec: GitExec,
  fs: WorktreeMarkerIgnoreFs,
): Promise<void> {
  const { stdout } = await exec("git", ["rev-parse", "--git-path", "info/exclude"], { cwd });
  const rawPath = stdout.trim();
  const excludePath = isAbsolute(rawPath) ? rawPath : resolve(cwd, rawPath);

  let content = "";
  try {
    content = await fs.readFile(excludePath);
  } catch (err) {
    if (!isNodeError(err) || err.code !== "ENOENT") throw err;
  }

  const lines = content.split(/\r?\n/u);
  if (lines.includes(MARKER_IGNORE_PATTERN)) return;

  const prefix = content.length === 0 || content.endsWith("\n") ? content : `${content}\n`;
  await fs.mkdir(dirname(excludePath), { recursive: true });
  await fs.writeFile(excludePath, `${prefix}${MARKER_IGNORE_PATTERN}\n`);
}

/**
 * Runtime guard for the marker schema.
 *
 * @param value - Unverified value from parsed JSON
 * @returns Whether `value` is a well-formed {@link WorktreeMarker}
 */
export function isWorktreeMarker(value: unknown): value is WorktreeMarker {
  if (typeof value !== "object" || value === null) return false;
  const marker = value as Record<string, unknown>;
  const wuNameValid = marker.wuName === undefined || typeof marker.wuName === "string";
  const createdForValid = marker.createdFor === undefined || isWorktreeMarkerSubject(marker.createdFor);
  const hasWuName = typeof marker.wuName === "string";
  const hasCreatedFor = isWorktreeMarkerSubject(marker.createdFor);
  const huskValid = marker.husk === undefined || isWorktreeHuskStamp(marker.husk);
  const renameMoveValid = marker.renameMovePending === undefined
    || isWorktreeRenameMovePending(marker.renameMovePending);
  const candidate = marker.decompositionCandidate;
  const decompositionCandidateValid = candidate === undefined
    || (typeof candidate === "object"
      && candidate !== null
      && Object.keys(candidate).sort().join("\0")
        === ["candidateWorktree", "claimId", "generation"].join("\0")
      && isCanonicalDigest((candidate as Record<string, unknown>).claimId)
      && typeof (candidate as Record<string, unknown>).generation === "number"
      && Number.isInteger((candidate as Record<string, unknown>).generation)
      && ((candidate as Record<string, unknown>).generation as number) > 0
      && isCanonicalDigest((candidate as Record<string, unknown>).candidateWorktree));
  const parentValid = marker.parentCheckoutPath === undefined
    || LocusAbsolutePathSchema.safeParse(marker.parentCheckoutPath).success;
  const partial = isPartialErrandWorktreeSubject(marker.createdFor);
  const hasOriginEntry = marker.originEntry !== undefined;
  const hasOriginDigest = marker.originEntrySourceDigest !== undefined;
  const originValid = partial
    ? hasOriginEntry === hasOriginDigest
      && (!hasOriginEntry
        || (LocusOpaqueTextSchema.safeParse(marker.originEntry).success
          && LocusDigestSchema.safeParse(marker.originEntrySourceDigest).success))
    : !hasOriginEntry && !hasOriginDigest;
  const primaryOccupancyValid = marker.spawnedByArc !== false
    || ((isTransientWorktreeSubject(marker.createdFor) || partial)
      && marker.husk === undefined
      && marker.renameMovePending === undefined
      && marker.decompositionCandidate === undefined);
  const transientOnlyFieldsValid = isTransientWorktreeSubject(marker.createdFor) || partial
    ? true
    : marker.parentCheckoutPath === undefined;
  return typeof marker.spawnedByArc === "boolean"
    && wuNameValid
    && createdForValid
    && (hasWuName || hasCreatedFor)
    && ownershipIsConsistent(marker.wuName, marker.createdFor)
    && provisioningIsConsistent(marker.createdFor, marker.provisioning)
    && huskValid
    && renameMoveValid
    && decompositionCandidateValid
    && parentValid
    && originValid
    && primaryOccupancyValid
    && transientOnlyFieldsValid
    && !(marker.husk !== undefined && marker.renameMovePending !== undefined)
    && typeof marker.spawningIdentity === "string"
    && typeof marker.createdAt === "string";
}

function isWorktreeRenameMovePending(value: unknown): value is WorktreeRenameMovePending {
  if (typeof value !== "object" || value === null) return false;
  const pending = value as Record<string, unknown>;
  const keys = Object.keys(pending).sort();
  const expected = ["branch", "from", "head", "newSlug", "oldSlug", "to"];
  return keys.length === expected.length
    && keys.every((key, index) => key === expected[index])
    && typeof pending.oldSlug === "string"
    && pending.oldSlug !== ""
    && typeof pending.newSlug === "string"
    && pending.newSlug !== ""
    && typeof pending.branch === "string"
    && pending.branch !== ""
    && typeof pending.head === "string"
    && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(pending.head)
    && typeof pending.from === "string"
    && isAbsolute(pending.from)
    && typeof pending.to === "string"
    && isAbsolute(pending.to)
    && pending.from !== pending.to;
}

function ownershipIsConsistent(wuName: unknown, createdFor: unknown): boolean {
  if (typeof wuName !== "string" || !isWorktreeMarkerSubject(createdFor)) return true;
  return createdFor.kind === "work-unit" && createdFor.name === wuName;
}

function provisioningIsConsistent(createdFor: unknown, provisioning: unknown): boolean {
  if (!isWorktreeMarkerSubject(createdFor)) return provisioning === undefined;
  if (isPartialErrandWorktreeSubject(createdFor)) {
    return provisioning === "pending" || provisioning === "ready";
  }
  return isTransientWorktreeSubject(createdFor)
    ? typeof provisioning === "string"
    : provisioning === undefined;
}

function isWorktreeHuskStamp(value: unknown): value is WorktreeHuskStamp {
  if (typeof value !== "object" || value === null) return false;
  const husk = value as Record<string, unknown>;
  if (
    typeof husk.sha !== "string"
    || typeof husk.at !== "string"
    || !isWorktreeSubject(husk.subject)
    || typeof husk.branch !== "string"
  ) {
    return false;
  }
  if (husk.authorization !== undefined && typeof husk.authorization !== "string") return false;
  if (Object.prototype.hasOwnProperty.call(husk, "remoteRef") && !isRemoteRefProof(husk.remoteRef)) return false;
  if (husk.evidence !== undefined && !isPersistedRetirementEvidence(husk.evidence)) return false;
  return husk.subject.kind !== "branch" || husk.subject.ref === husk.branch;
}

/** Decode authorization-bearing fields without granting authority to partial or future shapes. */
export function decodeWorktreeHuskStamp(stamp: WorktreeHuskStamp): DecodedWorktreeHuskStamp {
  const presence = [
    stamp.authorization !== undefined,
    Object.prototype.hasOwnProperty.call(stamp, "remoteRef"),
    stamp.evidence !== undefined,
  ];
  if (presence.every((present) => !present)) return { kind: "legacy", authorization: "merged-preserved" };
  if (!presence.every(Boolean)) return { kind: "manual-only", reason: "mixed-presence" };
  if (!isHuskAuthorization(stamp.authorization)) {
    return { kind: "manual-only", reason: "unknown-authorization" };
  }
  const evidence = decodeKnownEvidence(stamp.evidence);
  if (evidence === null) return { kind: "manual-only", reason: "unknown-evidence" };
  if (!huskEvidenceMatchesAuthorization(stamp.authorization, evidence)) {
    return { kind: "manual-only", reason: "evidence-mismatch" };
  }
  return { kind: "current", authorization: stamp.authorization, remoteRef: stamp.remoteRef ?? null, evidence };
}

function huskEvidenceMatchesAuthorization(
  authorization: HuskAuthorization,
  evidence: RetirementEvidenceRef,
): boolean {
  if (evidence.kind === "shipped") return authorization === "merged-preserved";
  if (evidence.transition === "park-planning") {
    return authorization === "planning-relocated";
  }
  return authorization === "discard-confirmed";
}

function isHuskAuthorization(value: unknown): value is HuskAuthorization {
  return value === "merged-preserved" || value === "discard-confirmed" || value === "planning-relocated";
}

function isRemoteRefProof(value: unknown): value is RemoteRefProof {
  if (value === null) return true;
  if (typeof value !== "object") return false;
  const proof = value as Record<string, unknown>;
  return typeof proof.remote === "string" && proof.remote !== ""
    && typeof proof.oid === "string" && proof.oid !== ""
    && (proof.disposition === "delete" || proof.disposition === "retain");
}

function isPersistedRetirementEvidence(value: unknown): value is PersistedRetirementEvidence {
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as Record<string, unknown>).kind === "string";
}

function decodeKnownEvidence(value: PersistedRetirementEvidence | undefined): RetirementEvidenceRef | null {
  if (value?.kind === "shipped") {
    const candidate = value as Record<string, unknown>;
    return candidate.expectedLifecycle === "completed"
      && isCanonicalDigest(candidate.resultDigest)
      && typeof candidate.baseProofOid === "string"
      && candidate.baseProofOid !== ""
      ? value as RetirementEvidenceRef
      : null;
  }
  if (value?.kind === "git-transition") {
    const candidate = value as Record<string, unknown>;
    const keys = Object.keys(candidate).sort();
    return keys.length === 3
      && keys[0] === "kind"
      && keys[1] === "resultDigest"
      && keys[2] === "transition"
      && (candidate.transition === "abandon" || candidate.transition === "park-planning")
      && isCanonicalDigest(candidate.resultDigest)
      ? value as RetirementEvidenceRef
      : null;
  }
  return null;
}

function isWorktreeSubject(value: unknown): value is WorktreeSubject {
  if (typeof value !== "object" || value === null) return false;
  const subject = value as Record<string, unknown>;
  switch (subject.kind) {
    case "work-unit":
      return typeof subject.name === "string";
    case "errand":
      return typeof subject.slug === "string" && subject.claimId === undefined;
    case "branch":
      return typeof subject.ref === "string";
    default:
      return false;
  }
}

function isWorktreeMarkerSubject(value: unknown): value is WorktreeMarkerSubject {
  return isWorktreeSubject(value)
    || isTransientWorktreeSubject(value)
    || isPartialErrandWorktreeSubject(value);
}

function isTransientWorktreeSubject(value: unknown): value is TransientWorktreeSubject {
  if (typeof value !== "object" || value === null) return false;
  const subject = value as Record<string, unknown>;
  return (subject.kind === "errand" || subject.kind === "groom" || subject.kind === "housekeep")
    && SlugSchema.safeParse(subject.slug).success
    && LocusTokenSchema.safeParse(subject.claimId).success;
}

function isPartialErrandWorktreeSubject(value: unknown): value is PartialErrandWorktreeSubject {
  if (typeof value !== "object" || value === null) return false;
  const subject = value as Record<string, unknown>;
  return subject.kind === "partial-errand"
    && SlugSchema.safeParse(subject.slug).success
    && subject.claimId === null;
}

/** Decode marker ownership without granting authority to legacy or future transient shapes. */
export function decodeWorktreeMarkerOwnership(marker: WorktreeMarker): DecodedWorktreeMarkerOwnership {
  let subject: WorktreeMarkerSubject;
  if (marker.createdFor !== undefined) {
    subject = marker.createdFor;
  } else {
    const wuName = marker.wuName;
    if (wuName === undefined) return { kind: "manual-only", reason: "malformed-ownership" };
    subject = { kind: "work-unit", name: wuName };
  }
  if (isTransientWorktreeSubject(subject) || isPartialErrandWorktreeSubject(subject)) {
    if (marker.provisioning !== "pending" && marker.provisioning !== "ready") {
      return { kind: "manual-only", reason: "unknown-provisioning" };
    }
    return { kind: "current", subject, provisioning: marker.provisioning };
  }
  if (subject.kind === "errand") return { kind: "manual-only", reason: "legacy-transient" };
  return { kind: "current", subject, provisioning: null };
}

/**
 * Preserve transient marker state without turning diagnostic evidence into ownership authority.
 *
 * @param result - Marker read result at the checkout boundary
 * @param expected - Optional exact identity generation to compare with the marker
 * @returns A transient provenance classification, or `null` for absent/non-transient markers
 */
export function classifyTransientWorktreeProvenance(
  result: WorktreeMarkerReadResult,
  expected?: TransientWorktreeSubject,
): TransientWorktreeProvenance | null {
  if (result.kind === "absent") return null;
  if (result.kind === "malformed") return { kind: "malformed", message: result.message };
  const decoded = decodeWorktreeMarkerOwnership(result.marker);
  if (decoded.kind === "manual-only") {
    if (decoded.reason === "legacy-transient") {
      const subject = result.marker.createdFor;
      return subject?.kind === "errand" && !("claimId" in subject)
        ? { kind: "legacy", subject }
        : { kind: "malformed", message: "Legacy transient ownership is incomplete" };
    }
    return decoded.reason === "unknown-provisioning"
      ? { kind: "unknown", reason: decoded.reason }
      : null;
  }
  if (!isTransientWorktreeSubject(decoded.subject)) return null;
  if (expected !== undefined && !transientSubjectsEqual(decoded.subject, expected)) {
    return { kind: "claim-mismatch", subject: decoded.subject, expected };
  }
  return decoded.provisioning === "ready"
    ? { kind: "ready", subject: decoded.subject }
    : { kind: "pending", subject: decoded.subject };
}

function transientSubjectsEqual(left: TransientWorktreeSubject, right: TransientWorktreeSubject): boolean {
  return left.kind === right.kind && left.slug === right.slug && left.claimId === right.claimId;
}

/**
 * Write the worktree-ownership marker to its machine-local location. The
 * `.arc/system/.internal/` parent directory is created as needed.
 *
 * @param cwd - Worktree root the marker belongs to
 * @param marker - Marker contents to persist
 */
export async function writeWorktreeMarker(cwd: string, marker: WorktreeMarker): Promise<void> {
  await atomicWriteJson(resolveWorktreeMarkerPath(cwd), marker);
}

/** Inputs for {@link writeWorktreeOwnershipMarker}. */
export interface WriteWorktreeOwnershipMarkerOptions {
  /**
   * Whether ARC created this worktree. When `false`, no marker is written —
   * the worktree is externally-created and its cleanup stays advisory.
   */
  createdByArc: boolean;
  /** Logical target the worktree was created to host. */
  createdFor: WorktreeSubject;
  /** Identity that created the worktree. */
  spawningIdentity: string;
  /** Marker creation time in epoch millis; defaults to `Date.now()`. Injectable for tests. */
  now?: number;
  /** Exact decomposition candidate generation, present only for candidate worktrees. */
  decompositionCandidate?: WorktreeMarkerBase["decompositionCandidate"];
}

/**
 * Write the worktree-ownership marker when ARC created the worktree, and do
 * nothing when it did not. The `createdByArc` flag is the single switch: a
 * spawn passes `true` (the marker lands, its presence the ARC-created signal),
 * a cold-start into an externally-created worktree passes `false` (no marker —
 * cleanup there is advisory). A written marker always records
 * `spawnedByArc: true`; absence, not a `false` field, is the "not ARC-created"
 * signal.
 *
 * @param cwd - Worktree root the marker belongs to
 * @param options - The created-by-arc flag plus marker context
 */
export async function writeWorktreeOwnershipMarker(
  cwd: string,
  options: WriteWorktreeOwnershipMarkerOptions,
): Promise<void> {
  if (!options.createdByArc) return;
  const ownership = options.createdFor.kind === "work-unit"
    ? { wuName: options.createdFor.name, createdFor: options.createdFor }
    : { createdFor: options.createdFor };
  await writeWorktreeMarker(cwd, {
    spawnedByArc: true,
    ...ownership,
    spawningIdentity: options.spawningIdentity,
    createdAt: new Date(options.now ?? Date.now()).toISOString(),
    ...(options.decompositionCandidate === undefined
      ? {}
      : { decompositionCandidate: options.decompositionCandidate }),
  });
}

/**
 * Add terminal husk proof to an existing valid ownership marker.
 *
 * Missing and malformed markers are returned unchanged: this operation never
 * creates provenance or repairs an invalid record.
 *
 * @param cwd - Worktree root whose marker should be extended
 * @param husk - Driver-supplied terminal proof
 * @returns Whether the marker was stamped, absent, or malformed
 */
export async function stampWorktreeHusk(
  cwd: string,
  husk: WorktreeHuskStamp,
): Promise<WorktreeHuskStampResult> {
  const current = await readWorktreeMarker(cwd);
  if (current.kind !== "present") return current;

  const ownedMarker = { ...current.marker };
  delete ownedMarker.renameMovePending;
  const marker: WorktreeMarker = { ...ownedMarker, husk };
  await writeWorktreeMarker(cwd, marker);
  return { kind: "stamped", marker };
}

/**
 * Read the worktree-ownership marker. A missing file is reported as `absent`
 * (not an error) — absence is the documented "not ARC-created" signal. A file
 * that exists but is not valid marker JSON is reported as `malformed`.
 *
 * @param cwd - Worktree root to read the marker from
 * @returns The parsed marker, `absent`, or `malformed`
 */
export async function readWorktreeMarker(cwd: string): Promise<WorktreeMarkerReadResult> {
  const result = await readWorktreeMarkerGeneration(cwd);
  return result.kind === "present"
    ? { kind: "present", marker: result.marker }
    : result;
}

/** Read and retain the exact marker bytes used by owned-generation transactions. */
export async function readWorktreeMarkerGeneration(
  cwd: string,
): Promise<WorktreeMarkerGenerationReadResult> {
  const path = resolveWorktreeMarkerPath(cwd);

  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return { kind: "absent" };
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    return { kind: "malformed", message: "worktree marker contains malformed JSON", path };
  }

  if (!isWorktreeMarker(parsed)) {
    return { kind: "malformed", message: "worktree marker does not match the expected schema", path };
  }

  return { kind: "present", marker: parsed, bytes };
}

/** Exclusively create one exact worktree-marker generation. */
export async function createWorktreeMarkerGeneration(
  cwd: string,
  marker: WorktreeMarker,
): Promise<{ kind: "created"; bytes: Buffer } | { kind: "exists" }> {
  const path = resolveWorktreeMarkerPath(cwd);
  const bytes = serializeWorktreeMarker(marker);
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
    return { kind: "created", bytes };
  } catch (error) {
    if (isNodeError(error) && error.code === "EEXIST") return { kind: "exists" };
    throw error;
  }
}

/** Replace one worktree-marker generation after an exact byte comparison. */
export async function replaceWorktreeMarkerGeneration(
  cwd: string,
  expectedBytes: Buffer,
  marker: WorktreeMarker,
): Promise<{ kind: "replaced"; bytes: Buffer } | { kind: "generation-mismatch" }> {
  return replaceWorktreeMarkerBytesGeneration(cwd, expectedBytes, serializeWorktreeMarker(marker));
}

/** Restore one exact valid worktree-marker byte generation after an exact comparison. */
export async function restoreWorktreeMarkerGeneration(
  cwd: string,
  expectedBytes: Buffer,
  restoreBytes: Buffer,
): Promise<{ kind: "replaced"; bytes: Buffer } | { kind: "generation-mismatch" }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(restoreBytes.toString("utf8"));
  } catch {
    throw new Error("Cannot restore malformed worktree marker bytes");
  }
  if (!isWorktreeMarker(parsed)) throw new Error("Cannot restore invalid worktree marker bytes");
  return replaceWorktreeMarkerBytesGeneration(cwd, expectedBytes, restoreBytes);
}

async function replaceWorktreeMarkerBytesGeneration(
  cwd: string,
  expectedBytes: Buffer,
  replacementBytes: Buffer,
): Promise<{ kind: "replaced"; bytes: Buffer } | { kind: "generation-mismatch" }> {
  const path = resolveWorktreeMarkerPath(cwd);
  let current: Buffer;
  try {
    current = await readFile(path);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return { kind: "generation-mismatch" };
    throw error;
  }
  if (!current.equals(expectedBytes)) return { kind: "generation-mismatch" };
  const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  let published = false;
  try {
    await writeFile(temporaryPath, replacementBytes, { flag: "wx", mode: 0o600 });
    const replaced = await retryTransientFileSystemRefusal(async () => {
      const recheck = await readFile(path);
      if (!recheck.equals(expectedBytes)) return false;
      await rename(temporaryPath, path);
      return true;
    });
    if (!replaced) return { kind: "generation-mismatch" };
    published = true;
    return { kind: "replaced", bytes: replacementBytes };
  } finally {
    if (!published) await unlink(temporaryPath).catch(() => undefined);
  }
}

/** Remove one worktree-marker generation after an exact byte comparison. */
export async function removeWorktreeMarkerGeneration(
  cwd: string,
  expectedBytes: Buffer,
): Promise<{ kind: "removed" } | { kind: "generation-mismatch" }> {
  const path = resolveWorktreeMarkerPath(cwd);
  let current: Buffer;
  try {
    current = await readFile(path);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return { kind: "generation-mismatch" };
    throw error;
  }
  if (!current.equals(expectedBytes)) return { kind: "generation-mismatch" };
  try {
    await unlink(path);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return { kind: "generation-mismatch" };
    throw error;
  }
  return { kind: "removed" };
}

/** Remove one exact ready primary-transient marker without granting spawned-cleanup authority. */
export async function removePrimaryTransientOccupancy(
  cwd: string,
  expected: TransientWorktreeSubject | PartialErrandWorktreeSubject,
): Promise<
  | { kind: "removed" | "absent" }
  | { kind: "refused"; reason: "malformed" | "subject-mismatch" | "generation-mismatch" }
> {
  const generation = await readWorktreeMarkerGeneration(cwd);
  if (generation.kind === "absent") return { kind: "absent" };
  if (generation.kind === "malformed") return { kind: "refused", reason: "malformed" };
  const decoded = decodeWorktreeMarkerOwnership(generation.marker);
  if (generation.marker.spawnedByArc
    || decoded.kind !== "current"
    || decoded.provisioning !== "ready"
    || !transientMarkerSubjectsEqual(decoded.subject, expected)) {
    return { kind: "refused", reason: "subject-mismatch" };
  }
  const removed = await removeWorktreeMarkerGeneration(cwd, generation.bytes);
  return removed.kind === "removed"
    ? removed
    : { kind: "refused", reason: "generation-mismatch" };
}

function transientMarkerSubjectsEqual(
  actual: Exclude<WorktreeMarkerSubject, { kind: "errand"; claimId?: never }>,
  expected: TransientWorktreeSubject | PartialErrandWorktreeSubject,
): boolean {
  if (!("slug" in actual) || actual.kind !== expected.kind || actual.slug !== expected.slug) return false;
  return "claimId" in actual && actual.claimId === expected.claimId;
}

function serializeWorktreeMarker(marker: WorktreeMarker): Buffer {
  if (!isWorktreeMarker(marker)) throw new Error("Worktree marker does not match the expected schema");
  return Buffer.from(`${JSON.stringify(marker, null, 2)}\n`, "utf8");
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
