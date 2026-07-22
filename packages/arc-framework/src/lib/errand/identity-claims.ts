/** Complete-basis first-writer claims for transient grooming and housekeeping identities. */

import {
  TransientIdentityRecordV3Schema,
  serializeTransientIdentityRecord,
  type TransientIdentityRecord,
  type TransientIdentityRecordV3,
} from "./identity-record.js";
import type {
  IdentityConflictResolver,
  IdentityTransformDecision,
  IdentityTransactionOutcome,
} from "./identity-transaction.js";
import { transactTransientIdentities } from "./identity-transaction.js";
import type { ErrandRecordIO } from "./ref-tree.js";
import { uniqueRefToken } from "../git/ref-tree.js";
import { normalizeGitRejection } from "../git/process-error.js";
import type { GitExec } from "../git/exec.js";
import type { LocusChangeRequestV1 } from "../locus/schema/index.js";
import {
  evaluateChangeRequestReentry,
  type ChangeRequestLifecycleEvidence,
} from "./change-request-lifecycle.js";

/** Valid grooming identity generation. */
export type GroomIdentityRecord = Extract<TransientIdentityRecordV3, { kind: "groom" }>;

/** Semantic result of a grooming claim transform. */
export type GroomClaimVerdict =
  | { kind: "claimed"; record: GroomIdentityRecord }
  | { kind: "resume" | "wait"; record: GroomIdentityRecord };

/** Valid full-protection housekeeping routing identity generation. */
export type HousekeepIdentityRecord = Extract<
  TransientIdentityRecordV3,
  { kind: "errand"; purpose: "housekeep-routing" }
>;

/** Semantic result of a housekeeping routing claim transform. */
export type HousekeepClaimVerdict =
  | { kind: "claimed"; record: HousekeepIdentityRecord }
  | { kind: "resume" | "wait"; record: HousekeepIdentityRecord };

/** Exact open-generation request to persist a grooming change-request tail. */
export interface GroomAwaitMergeRequest {
  readonly previous: GroomIdentityRecord;
  readonly changeRequest: LocusChangeRequestV1;
  readonly updatedAt: string;
}

/** Exact awaiting-generation request to resume grooming without retiring identity. */
export interface GroomResumeRequest {
  readonly previous: GroomIdentityRecord;
  readonly lifecycle: ChangeRequestLifecycleEvidence;
  readonly updatedAt: string;
}

/** Exact open-generation request to persist a housekeeping change-request tail. */
export interface HousekeepAwaitMergeRequest {
  readonly previous: HousekeepIdentityRecord;
  readonly changeRequest: LocusChangeRequestV1;
  readonly updatedAt: string;
}

/** Inputs for retiring a claim after local locus allocation fails. */
export interface IdentityClaimRollbackParams {
  readonly remote: string | null;
  readonly message: string;
  readonly expected: TransientIdentityRecordV3;
}

/** Allocation rollback result, including explicit recovery work when retirement cannot be proven. */
export type IdentityClaimRollbackOutcome =
  | { kind: "retired"; tip: string | null }
  | {
      kind: "recovery-required";
      record: TransientIdentityRecordV3;
      actions: readonly ["resume", "abandon"];
      cause: Extract<IdentityTransactionOutcome<null>, { kind: "refused" | "error" }>;
    };

/** Remote base branch to fetch and pin before constructing a grooming claimant. */
export interface PinGroomOpenedBaseHeadParams {
  readonly remote: string;
  readonly baseRef: string;
}

/** Outcome of freshly pinning the configured remote base branch. */
export type PinGroomOpenedBaseHeadOutcome =
  | { kind: "pinned"; head: string }
  | { kind: "refused"; reason: string }
  | { kind: "error"; stage: "base-ref" | "fetch" | "resolve" | "cleanup"; message: string };

/**
 * Fetch and pin the configured remote base before a grooming claim transform runs.
 *
 * @param exec - Argument-array Git execution boundary.
 * @param params - Configured remote and base branch.
 * @returns Fresh remote commit identity or an explicit refusal/error.
 */
export async function pinGroomOpenedBaseHead(
  exec: GitExec,
  params: PinGroomOpenedBaseHeadParams,
): Promise<PinGroomOpenedBaseHeadOutcome> {
  const branchArgs = ["check-ref-format", "--branch", params.baseRef];
  try {
    await exec("git", branchArgs);
  } catch (error) {
    const normalized = normalizeGitRejection(error, { command: "git", args: branchArgs });
    return normalized.exitCode === 1 || normalized.exitCode === 128
      ? { kind: "refused", reason: "The configured base is not a valid Git branch" }
      : { kind: "error", stage: "base-ref", message: normalized.message };
  }

  const temporaryRef = `refs/arc/tmp/groom-base/${uniqueRefToken()}`;
  const remoteRef = `refs/heads/${params.baseRef}`;
  const outcome = await fetchGroomBase(exec, params.remote, remoteRef, temporaryRef);
  try {
    await exec("git", ["update-ref", "-d", temporaryRef]);
  } catch (error) {
    return claimGitError("cleanup", error, ["update-ref", "-d", temporaryRef]);
  }
  return outcome;
}

async function fetchGroomBase(
  exec: GitExec,
  remote: string,
  remoteRef: string,
  temporaryRef: string,
): Promise<PinGroomOpenedBaseHeadOutcome> {
  const fetchArgs = ["fetch", "--", remote, `+${remoteRef}:${temporaryRef}`];
  try {
    await exec("git", fetchArgs);
  } catch (error) {
    const normalized = normalizeGitRejection(error, { command: "git", args: fetchArgs });
    return normalized.expectedOutcome === "absent-remote-ref"
      ? { kind: "refused", reason: "The configured remote base branch does not exist" }
      : { kind: "error", stage: "fetch", message: normalized.message };
  }
  const resolveArgs = ["rev-parse", "--verify", "--end-of-options", `${temporaryRef}^{commit}`];
  try {
    return { kind: "pinned", head: (await exec("git", resolveArgs)).stdout.trim() };
  } catch (error) {
    return claimGitError("resolve", error, resolveArgs);
  }
}

function claimGitError(
  stage: Extract<PinGroomOpenedBaseHeadOutcome, { kind: "error" }>["stage"],
  error: unknown,
  args: string[],
): Extract<PinGroomOpenedBaseHeadOutcome, { kind: "error" }> {
  return { kind: "error", stage, message: normalizeGitRejection(error, { command: "git", args }).message };
}

/**
 * Build a first-writer grooming claim over a complete identity basis.
 *
 * @param candidate - Fresh open claim carrying the already-pinned base head.
 * @returns A complete-basis transaction transform.
 */
export function groomClaimTransform(candidate: GroomIdentityRecord) {
  return (
    basis: ReadonlyMap<string, TransientIdentityRecord>,
  ): IdentityTransformDecision<GroomClaimVerdict> => {
    const parsed = TransientIdentityRecordV3Schema.safeParse(candidate);
    if (!parsed.success || parsed.data.kind !== "groom" || parsed.data.state !== "open") {
      return { kind: "refused", reason: "A grooming claim must be a valid open identity" };
    }
    const occupied = basis.get(candidate.slug);
    if (occupied !== undefined && isGroom(occupied) && sameMembers(occupied.members, candidate.members)) {
      const kind = occupied.state === "open" ? "resume" : "wait";
      return { kind: "idempotent", value: { kind, record: occupied } };
    }
    if (occupied !== undefined && !isGroom(occupied)) {
      return { kind: "refused", reason: `Identity '${candidate.slug}' is already occupied` };
    }
    const candidateMembers = new Set(candidate.members);
    const conflicts = new Set<string>();
    for (const record of basis.values()) {
      if (!isGroom(record)) continue;
      for (const member of record.members) {
        if (candidateMembers.has(member)) conflicts.add(member);
      }
    }
    if (conflicts.size > 0) {
      return { kind: "refused", reason: `Groom member conflict: ${[...conflicts].sort().join(", ")}` };
    }
    const records = new Map(basis);
    records.set(candidate.slug, candidate);
    return { kind: "applied", records, value: { kind: "claimed", record: candidate } };
  };
}

/**
 * Resolve only an exact-set grooming race by adopting the remote first writer.
 *
 * @param candidate - This claimant's fresh generation.
 * @returns A resolver suitable for the complete-basis transaction.
 */
export function groomClaimConflictResolver(candidate: GroomIdentityRecord): IdentityConflictResolver {
  return ({ key, local, remote }) => {
    if (key === candidate.slug
      && local !== undefined && remote !== undefined
      && isGroom(local) && isGroom(remote)
      && sameRecord(local, candidate)
      && sameMembers(local.members, candidate.members)
      && sameMembers(remote.members, candidate.members)) {
      return { kind: "select-remote" };
    }
    return { kind: "refused", reason: `Divergent identity key cannot be adopted: ${key}` };
  };
}

/**
 * Build an exact-generation open-to-awaiting-merge grooming transition.
 *
 * @param request - Previous generation, observed change request, and advancing timestamp.
 * @returns A complete-basis transaction transform.
 */
export function groomAwaitMergeTransform(request: GroomAwaitMergeRequest) {
  return (
    basis: ReadonlyMap<string, TransientIdentityRecord>,
  ): IdentityTransformDecision<GroomIdentityRecord> => {
    if (request.previous.state !== "open") {
      return { kind: "refused", reason: "Only an open grooming identity can enter awaiting-merge" };
    }
    if (Date.parse(request.updatedAt) <= Date.parse(request.previous.updatedAt)) {
      return { kind: "refused", reason: "updatedAt must advance monotonically" };
    }
    const parsed = TransientIdentityRecordV3Schema.safeParse({
      ...request.previous,
      state: "awaiting-merge",
      changeRequest: request.changeRequest,
      updatedAt: request.updatedAt,
    });
    if (!parsed.success || !isGroom(parsed.data)) {
      return { kind: "refused", reason: "Awaiting-merge transition does not form a valid grooming identity" };
    }
    const desired = parsed.data;
    const actual = basis.get(request.previous.slug);
    if (actual !== undefined && sameRecord(actual, desired)) {
      return { kind: "idempotent", value: desired };
    }
    if (actual === undefined || !sameRecord(actual, request.previous)) {
      return { kind: "refused", reason: `Identity '${request.previous.slug}' changed before awaiting-merge` };
    }
    const records = new Map(basis);
    records.set(desired.slug, desired);
    return { kind: "applied", records, value: desired };
  };
}

/** Build an exact-generation awaiting-merge-to-open grooming transition. */
export function groomResumeTransform(request: GroomResumeRequest) {
  return (
    basis: ReadonlyMap<string, TransientIdentityRecord>,
  ): IdentityTransformDecision<GroomIdentityRecord> => {
    if (request.previous.state !== "awaiting-merge"
      || evaluateChangeRequestReentry(request.lifecycle, request.previous.changeRequest).kind !== "authorized") {
      return { kind: "refused", reason: "Grooming resume requires open or operator-confirmed host truth" };
    }
    if (Date.parse(request.updatedAt) <= Date.parse(request.previous.updatedAt)) {
      return { kind: "refused", reason: "updatedAt must advance monotonically" };
    }
    const parsed = TransientIdentityRecordV3Schema.safeParse({
      ...request.previous,
      state: "open",
      changeRequest: null,
      updatedAt: request.updatedAt,
    });
    if (!parsed.success || !isGroom(parsed.data)) {
      return { kind: "refused", reason: "Resume does not form a valid grooming identity" };
    }
    const desired = parsed.data;
    const actual = basis.get(request.previous.slug);
    if (actual !== undefined && sameRecord(actual, desired)) return { kind: "idempotent", value: desired };
    if (actual === undefined || !sameRecord(actual, request.previous)) {
      return { kind: "refused", reason: `Identity '${request.previous.slug}' changed before resume` };
    }
    const records = new Map(basis);
    records.set(desired.slug, desired);
    return { kind: "applied", records, value: desired };
  };
}

/** Restore an exact grooming tail after local resume allocation fails. */
export function rollbackGroomResumeTransform(
  previous: GroomIdentityRecord,
  resumed: GroomIdentityRecord,
) {
  return (
    basis: ReadonlyMap<string, TransientIdentityRecord>,
  ): IdentityTransformDecision<GroomIdentityRecord> => {
    const actual = basis.get(previous.slug);
    if (actual !== undefined && sameRecord(actual, previous)) return { kind: "idempotent", value: previous };
    if (actual === undefined || !sameRecord(actual, resumed)) {
      return { kind: "refused", reason: `Identity '${previous.slug}' changed before resume rollback` };
    }
    const records = new Map(basis);
    records.set(previous.slug, previous);
    return { kind: "applied", records, value: previous };
  };
}

/** Build an exact-generation open-to-awaiting-merge housekeeping transition. */
export function housekeepAwaitMergeTransform(request: HousekeepAwaitMergeRequest) {
  return (
    basis: ReadonlyMap<string, TransientIdentityRecord>,
  ): IdentityTransformDecision<HousekeepIdentityRecord> => {
    if (request.previous.state !== "open") {
      return { kind: "refused", reason: "Only an open housekeeping identity can enter awaiting-merge" };
    }
    if (Date.parse(request.updatedAt) <= Date.parse(request.previous.updatedAt)) {
      return { kind: "refused", reason: "updatedAt must advance monotonically" };
    }
    const parsed = TransientIdentityRecordV3Schema.safeParse({
      ...request.previous,
      state: "awaiting-merge",
      changeRequest: request.changeRequest,
      updatedAt: request.updatedAt,
    });
    if (!parsed.success || !isHousekeep(parsed.data)) {
      return { kind: "refused", reason: "Awaiting-merge transition does not form a valid housekeeping identity" };
    }
    const desired = parsed.data;
    const actual = basis.get(request.previous.slug);
    if (actual !== undefined && sameRecord(actual, desired)) {
      return { kind: "idempotent", value: desired };
    }
    if (actual === undefined || !sameRecord(actual, request.previous)) {
      return { kind: "refused", reason: `Identity '${request.previous.slug}' changed before awaiting-merge` };
    }
    const records = new Map(basis);
    records.set(desired.slug, desired);
    return { kind: "applied", records, value: desired };
  };
}

/**
 * Build a global first-writer housekeeping routing claim over a complete identity basis.
 *
 * @param candidate - Fresh open routing claim.
 * @returns A complete-basis transaction transform.
 */
export function housekeepClaimTransform(candidate: HousekeepIdentityRecord) {
  return (
    basis: ReadonlyMap<string, TransientIdentityRecord>,
  ): IdentityTransformDecision<HousekeepClaimVerdict> => {
    const parsed = TransientIdentityRecordV3Schema.safeParse(candidate);
    if (!parsed.success || !isHousekeep(parsed.data) || parsed.data.state !== "open") {
      return { kind: "refused", reason: "A housekeeping claim must be a valid open routing identity" };
    }
    const occupied = basis.get(candidate.slug);
    const routingRecords = [...basis.values()].filter(isHousekeep);
    if (occupied !== undefined && !isHousekeep(occupied)) {
      return { kind: "refused", reason: `Identity '${candidate.slug}' is already occupied` };
    }
    if (occupied !== undefined) {
      if (routingRecords.some((record) => record.slug !== candidate.slug)) {
        return { kind: "refused", reason: "Multiple live housekeeping routing identities already exist" };
      }
      return {
        kind: "idempotent",
        value: { kind: occupied.state === "open" ? "resume" : "wait", record: occupied },
      };
    }
    if (routingRecords.length > 0) {
      const [winner] = routingRecords;
      return routingRecords.length === 1 && winner !== undefined
        ? { kind: "refused", reason: `Live housekeeping routing identity '${winner.slug}' already exists` }
        : { kind: "refused", reason: "Multiple live housekeeping routing identities already exist" };
    }
    const records = new Map(basis);
    records.set(candidate.slug, candidate);
    return { kind: "applied", records, value: { kind: "claimed", record: candidate } };
  };
}

/**
 * Build a rollback transform that retires only one exact unchanged claim generation.
 *
 * @param expected - Exact claim record created before local allocation began.
 * @returns A complete-basis transaction transform.
 */
export function identityClaimRollbackTransform(expected: TransientIdentityRecordV3) {
  return (
    basis: ReadonlyMap<string, TransientIdentityRecord>,
  ): IdentityTransformDecision<null> => {
    const actual = basis.get(expected.slug);
    if (actual === undefined) return { kind: "idempotent", value: null };
    if (!sameRecord(actual, expected)) {
      return { kind: "refused", reason: `Identity '${expected.slug}' changed after allocation began` };
    }
    const records = new Map(basis);
    records.delete(expected.slug);
    return { kind: "applied", records, value: null };
  };
}

/**
 * Retire an unchanged allocation claim or preserve explicit resume/abandon recovery work.
 *
 * @param io - Complete-basis identity transaction boundaries.
 * @param params - Remote, commit message, and exact claimed generation.
 * @returns Successful retirement or a recovery-required outcome retaining the claim.
 */
export async function rollbackIdentityClaim(
  io: ErrandRecordIO,
  params: IdentityClaimRollbackParams,
): Promise<IdentityClaimRollbackOutcome> {
  const outcome = await transactTransientIdentities(io, {
    remote: params.remote,
    message: params.message,
    transform: identityClaimRollbackTransform(params.expected),
  });
  if (outcome.kind === "applied" || outcome.kind === "idempotent") {
    return { kind: "retired", tip: outcome.tip };
  }
  return {
    kind: "recovery-required",
    record: params.expected,
    actions: ["resume", "abandon"],
    cause: outcome,
  };
}

function isGroom(record: TransientIdentityRecord): record is GroomIdentityRecord {
  return record.version === 3 && record.kind === "groom";
}

function isHousekeep(record: TransientIdentityRecord): record is HousekeepIdentityRecord {
  return record.version === 3 && record.kind === "errand" && record.purpose === "housekeep-routing";
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((member, index) => member === right[index]);
}

function sameRecord(left: TransientIdentityRecord, right: TransientIdentityRecord): boolean {
  return serializeTransientIdentityRecord(left) === serializeTransientIdentityRecord(right);
}
