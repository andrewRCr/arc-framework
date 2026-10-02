/** Complete-basis reconciliation and compare-and-swap identity transactions. */

import {
  isCasRejectionError,
  isRemoteUnavailableError,
  MAX_RECONCILE_ATTEMPTS,
  uniqueRefToken,
} from "../git/ref-tree.js";
import { gitFailureText, normalizeGitRejection } from "../git/process-error.js";
import { classifyPublicationFailure, type RemotePublicationFailure } from "../git/publication-failure.js";
import {
  serializeTransientIdentityRecord,
  type TransientIdentityRecord,
} from "./identity-record.js";
import {
  readTransientIdentitySnapshotAtRef,
} from "./identity-snapshot.js";
import {
  errandsRef,
  hashBlob,
  writeTreeCommit,
  type ErrandRecordIO,
} from "./ref-tree.js";

/** Result of reconciling local and remote identity objects from a common basis. */
export type IdentityObjectReconcile =
  | { kind: "merged"; objects: Map<string, string> }
  | { kind: "conflict"; keys: string[] };

/**
 * Three-way reconcile per-key identity blob changes.
 *
 * @param base - Common-history key to blob-OID state.
 * @param local - Tip-pinned local key to blob-OID state.
 * @param remote - Tip-pinned fetched-remote key to blob-OID state.
 * @returns The union of independent changes or every divergently changed key.
 */
export function reconcileIdentityObjects(
  base: ReadonlyMap<string, string>,
  local: ReadonlyMap<string, string>,
  remote: ReadonlyMap<string, string>,
): IdentityObjectReconcile {
  const keys = [...new Set([...base.keys(), ...local.keys(), ...remote.keys()])].sort();
  const objects = new Map<string, string>();
  const conflicts: string[] = [];
  for (const key of keys) {
    const baseOid = base.get(key);
    const localOid = local.get(key);
    const remoteOid = remote.get(key);
    let selected: string | undefined;
    if (localOid === remoteOid) selected = localOid;
    else if (localOid === baseOid) selected = remoteOid;
    else if (remoteOid === baseOid) selected = localOid;
    else {
      conflicts.push(key);
      continue;
    }
    if (selected !== undefined) objects.set(key, selected);
  }
  return conflicts.length > 0 ? { kind: "conflict", keys: conflicts } : { kind: "merged", objects };
}

/** Caller decision over one freshly reconciled complete identity basis. */
export type IdentityTransformDecision<T> =
  | { kind: "applied"; records: ReadonlyMap<string, TransientIdentityRecord>; value: T }
  | { kind: "idempotent"; value: T }
  | { kind: "refused"; reason: string };

/** Pure expected-state transform re-entered after every bounded retry. */
export type IdentityTransform<T> = (
  records: ReadonlyMap<string, TransientIdentityRecord>,
  objects?: ReadonlyMap<string, string>,
) => IdentityTransformDecision<T> | Promise<IdentityTransformDecision<T>>;

/** Inputs for a complete-basis identity transaction. */
export interface IdentityTransactionParams<T> {
  /** Configured remote name, or `null` for local-only identity authority. */
  readonly remote: string | null;
  /** Commit message used when the transaction changes or reconciles the tree. */
  readonly message: string;
  /** Idempotent expected-state transform. */
  readonly transform: IdentityTransform<T>;
}

/** The step of an identity transaction a failure reached. */
export type IdentityTransactionStage = "fetch" | "basis" | "transform" | "write" | "push" | "cleanup";

/** Single-channel transaction outcome. */
export type IdentityTransactionOutcome<T> =
  | { kind: "applied"; value: T; tip: string }
  | { kind: "idempotent"; value: T; tip: string | null }
  | { kind: "refused"; reason: string; divergentKeys?: string[]; divergentRecords?: ReadonlyMap<string, TransientIdentityRecord> }
  | { kind: "error"; stage: IdentityTransactionStage; message: string; remoteFailure?: RemotePublicationFailure; invalidKeys?: string[]; retriesExhausted?: boolean; retryCount?: number; error?: unknown };

interface CompleteBasis {
  readonly kind: "complete";
  readonly tip: string | null;
  readonly objects: ReadonlyMap<string, string>;
  readonly records: ReadonlyMap<string, TransientIdentityRecord>;
}

type RetryResult =
  | { kind: "retry"; stage: "write" }
  | { kind: "retry"; stage: "push"; message: string; error: unknown };

type AttemptResult<T> = IdentityTransactionOutcome<T> | RetryResult;

/**
 * Run an idempotent transform over a complete local/remote identity basis.
 *
 * @param io - Identity ref read/write boundaries.
 * @param params - Remote selection, commit message, and expected-state transform.
 * @returns Applied, idempotent, refused, or operational error without throwing.
 */
export async function transactTransientIdentities<T>(
  io: ErrandRecordIO,
  params: IdentityTransactionParams<T>,
): Promise<IdentityTransactionOutcome<T>> {
  const ref = errandsRef(io.identity);
  let lastRetry: RetryResult | null = null;
  for (let attempt = 0; attempt < MAX_RECONCILE_ATTEMPTS; attempt += 1) {
    const remote = params.remote;
    if (remote === null) {
      const result = await transactLocalAttempt(io, ref, params);
      if (result.kind !== "retry") return result;
      lastRetry = result;
      continue;
    }

    const temporaryRef = `${ref}__transaction__${uniqueRefToken()}`;
    const result = await transactRemoteAttempt(io, ref, temporaryRef, { ...params, remote });
    const cleanup = await deleteTemporaryRef(io, temporaryRef);
    if (cleanup !== null) return cleanup;
    if (result.kind !== "retry") return result;
    lastRetry = result;
  }
  if (lastRetry?.stage === "push") {
    return { kind: "error", stage: "push", message: lastRetry.message, remoteFailure: classifyPublicationFailure(lastRetry.error, MAX_RECONCILE_ATTEMPTS), error: lastRetry.error };
  }
  return { kind: "error", stage: "write", message: "Identity transaction exceeded retry attempts", retriesExhausted: true, retryCount: MAX_RECONCILE_ATTEMPTS };
}

async function transactLocalAttempt<T>(
  io: ErrandRecordIO,
  ref: string,
  params: IdentityTransactionParams<T>,
): Promise<AttemptResult<T>> {
  const local = await readCompleteBasis(io, ref);
  if (local.kind === "error") return local;
  return applyAndPublish(io, ref, local, local, params, false, null);
}

async function transactRemoteAttempt<T>(
  io: ErrandRecordIO,
  ref: string,
  temporaryRef: string,
  params: IdentityTransactionParams<T> & { remote: string },
): Promise<AttemptResult<T>> {
  let remoteAbsent = false;
  const fetchArgs = ["fetch", params.remote, `+${ref}:${temporaryRef}`];
  try {
    await io.exec("git", fetchArgs);
  } catch (error) {
    const normalized = normalizeGitRejection(error, { command: "git", args: fetchArgs });
    const absent = normalized.kind === "nonzero-exit" && normalized.exitCode === 128
      && (normalized.expectedOutcome === "absent-remote-ref" || /(?:could(?:n't| not)|cannot) find remote ref/iu.test(gitFailureText(error)));
    if (absent) remoteAbsent = true;
    else return { kind: "error", stage: "fetch", message: errorMessage(error), remoteFailure: classifyPublicationFailure(error), error };
  }

  const local = await readCompleteBasis(io, ref);
  if (local.kind === "error") return local;
  const remote = remoteAbsent ? emptyBasis() : await readCompleteBasis(io, temporaryRef);
  if (remote.kind === "error") return remote;
  const base = await readCommonBasis(io, local.tip, remote.tip);
  if (base.kind === "error") return base;
  const reconciled = reconcileIdentityObjects(base.objects, local.objects, remote.objects);
  if (reconciled.kind === "conflict") {
    return { kind: "refused", reason: `Divergent identity keys: ${reconciled.keys.join(", ")}`, divergentKeys: reconciled.keys,
      divergentRecords: new Map([...remote.records, ...local.records]) };
  }
  const records = materializeReconciledRecords(reconciled.objects, base, local, remote);
  if (records === null) {
    return { kind: "error", stage: "basis", message: "Reconciled identity objects lack decoded records" };
  }
  return applyAndPublish(
    io,
    ref,
    local,
    { kind: "complete", tip: remote.tip, objects: reconciled.objects, records },
    params,
    true,
    remote.objects,
  );
}

async function applyAndPublish<T>(
  io: ErrandRecordIO,
  ref: string,
  local: CompleteBasis,
  basis: CompleteBasis,
  params: IdentityTransactionParams<T>,
  push: boolean,
  remoteObjects: ReadonlyMap<string, string> | null,
): Promise<AttemptResult<T>> {
  let decision: IdentityTransformDecision<T>;
  try {
    decision = await params.transform(new Map(basis.records), new Map(basis.objects));
  } catch (error) {
    return { kind: "error", stage: "transform", message: errorMessage(error) };
  }
  if (decision.kind === "refused") return decision;
  const finalRecords = decision.kind === "applied" ? new Map(decision.records) : new Map(basis.records);
  let objects: Map<string, string>;
  try {
    objects = await hashIdentityRecords(io, finalRecords);
  } catch (error) {
    return { kind: "error", stage: "transform", message: errorMessage(error) };
  }
  const localAlreadyExact = equalObjects(objects, local.objects);
  const basisAlreadyExact = equalObjects(objects, basis.objects);
  const remoteAlreadyExact = remoteObjects === null || equalObjects(objects, remoteObjects);
  if (localAlreadyExact && basisAlreadyExact && remoteAlreadyExact) {
    return { kind: "idempotent", value: decision.value, tip: local.tip };
  }

  let tip: string;
  try {
    const parents = [...new Set([local.tip, basis.tip].filter((value): value is string => value !== null))];
    tip = await writeTreeCommit(io, objects, params.message, parents, local.tip);
  } catch (error) {
    return isCasRejectionError(gitFailureText(error))
      ? { kind: "retry", stage: "write" }
      : { kind: "error", stage: "write", message: errorMessage(error), error };
  }
  if (push && params.remote !== null) {
    try {
      await io.exec("git", ["push", params.remote, `${ref}:${ref}`]);
    } catch (error) {
      if (isRemoteUnavailableError(gitFailureText(error))) {
        return { kind: "error", stage: "push", message: errorMessage(error), remoteFailure: classifyPublicationFailure(error), error };
      }
      return { kind: "retry", stage: "push", message: errorMessage(error), error };
    }
  }
  return decision.kind === "applied"
    ? { kind: "applied", value: decision.value, tip }
    : { kind: "idempotent", value: decision.value, tip };
}

async function readCompleteBasis(
  io: ErrandRecordIO,
  ref: string,
): Promise<CompleteBasis | Extract<IdentityTransactionOutcome<never>, { kind: "error" }>> {
  const snapshot = await readTransientIdentitySnapshotAtRef(io, ref);
  if (snapshot.kind === "absent") return emptyBasis();
  if (snapshot.kind === "error") return { kind: "error", stage: "basis", message: snapshot.message };
  if (snapshot.diagnostics.length > 0) {
    return {
      kind: "error",
      stage: "basis",
      message: `Identity basis contains invalid entries: ${snapshot.diagnostics.map((item) => item.key).join(", ")}`,
      invalidKeys: snapshot.diagnostics.map((item) => item.key),
    };
  }
  return { kind: "complete", tip: snapshot.tip, objects: snapshot.objects, records: snapshot.records };
}

async function readCommonBasis(
  io: ErrandRecordIO,
  localTip: string | null,
  remoteTip: string | null,
): Promise<CompleteBasis | Extract<IdentityTransactionOutcome<never>, { kind: "error" }>> {
  if (localTip === null || remoteTip === null) return emptyBasis();
  if (localTip === remoteTip) return readCompleteBasis(io, localTip);
  let commonTip: string;
  try {
    commonTip = (await io.exec("git", ["merge-base", localTip, remoteTip])).stdout.trim();
  } catch (error) {
    const normalized = normalizeGitRejection(error, {
      command: "git",
      args: ["merge-base", localTip, remoteTip],
    });
    if (normalized.exitCode === 1) return emptyBasis();
    return { kind: "error", stage: "basis", message: errorMessage(error) };
  }
  return commonTip === "" ? emptyBasis() : readCompleteBasis(io, commonTip);
}

async function hashIdentityRecords(
  io: ErrandRecordIO,
  records: ReadonlyMap<string, TransientIdentityRecord>,
): Promise<Map<string, string>> {
  const objects = new Map<string, string>();
  for (const [key, record] of [...records].sort(([left], [right]) => left.localeCompare(right))) {
    if (record.slug !== key) throw new Error(`Identity transform key mismatch: ${key}`);
    objects.set(key, await hashBlob(io.execInput, serializeTransientIdentityRecord(record)));
  }
  return objects;
}

function materializeReconciledRecords(
  objects: ReadonlyMap<string, string>,
  ...sources: CompleteBasis[]
): Map<string, TransientIdentityRecord> | null {
  const records = new Map<string, TransientIdentityRecord>();
  for (const [key, oid] of objects) {
    const source = sources.find((candidate) => candidate.objects.get(key) === oid);
    const record = source?.records.get(key);
    if (record === undefined) return null;
    records.set(key, record);
  }
  return records;
}

function emptyBasis(): CompleteBasis {
  return { kind: "complete", tip: null, objects: new Map(), records: new Map() };
}

function equalObjects(left: ReadonlyMap<string, string>, right: ReadonlyMap<string, string>): boolean {
  return left.size === right.size && [...left].every(([key, oid]) => right.get(key) === oid);
}

async function deleteTemporaryRef(
  io: ErrandRecordIO,
  ref: string,
): Promise<Extract<IdentityTransactionOutcome<never>, { kind: "error" }> | null> {
  try {
    await io.exec("git", ["update-ref", "-d", ref]);
    return null;
  } catch (error) {
    return { kind: "error", stage: "cleanup", message: errorMessage(error) };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
