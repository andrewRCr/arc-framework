/** Expected-state transitions for ordinary v3 Errand identities. */

import {
  TransientIdentityRecordV3Schema,
  serializeTransientIdentityRecord,
  type TransientIdentityRecord,
  type TransientIdentityRecordV3,
} from "./identity-record.js";
import { uniqueRefToken } from "../git/ref-tree.js";
import { normalizeGitRejection } from "../git/process-error.js";
import type { GitExec } from "../git/exec.js";
import type { IdentityTransformDecision } from "./identity-transaction.js";
import type { ChangeRequestLifecycleEvidence } from "./change-request-lifecycle.js";
import type { LocusChangeRequestV1 } from "../locus/schema/index.js";

const pauseHeadEvidenceBrand: unique symbol = Symbol("PauseHeadEvidence");

/** Ordinary, non-routing v3 Errand identity. */
export type OrdinaryErrandRecord = Extract<
  TransientIdentityRecordV3,
  { kind: "errand"; purpose: "errand" }
>;

/** Exact pre-transaction proof that a pause head is durably remote-backed. */
export interface PauseHeadEvidence {
  readonly [pauseHeadEvidenceBrand]: true;
  readonly terminalHead: string;
  readonly remoteBranchTip: string;
  readonly savedHeadIsAncestor: boolean;
}

/** Inputs for proving that an ordinary Errand branch head is durably remote-backed. */
export interface ProvePauseHeadParams {
  readonly remote: string;
  readonly branch: string;
  readonly savedHead: string;
}

/** Outcome of an exact local-head and fetched-remote ancestry proof. */
export type ProvePauseHeadOutcome =
  | { kind: "proven"; evidence: PauseHeadEvidence }
  | { kind: "refused"; reason: string }
  | { kind: "error"; stage: "local-head" | "fetch" | "remote-head" | "ancestry" | "cleanup"; message: string };

/** Repository coordinates configured for an awaiting-merge transition. */
export type AwaitMergeConfiguredCoordinates = Pick<
  LocusChangeRequestV1,
  "repositoryRef" | "hostRef" | "baseRef"
>;

/** Closed ordinary-Errand transition vocabulary. */
export type OrdinaryErrandTransition =
  | { kind: "create"; record: OrdinaryErrandRecord }
  | {
      kind: "link";
      previous: OrdinaryErrandRecord;
      originEntry: string;
      dispatchId: string | null;
      updatedAt: string;
    }
  | {
      kind: "pause";
      previous: OrdinaryErrandRecord;
      savedHead: string;
      evidence: PauseHeadEvidence;
      updatedAt: string;
    }
  | {
      kind: "await-merge";
      previous: OrdinaryErrandRecord;
      changeRequest: LocusChangeRequestV1;
      configured: AwaitMergeConfiguredCoordinates;
      observed: LocusChangeRequestV1;
      updatedAt: string;
    }
  | {
      kind: "resume";
      previous: OrdinaryErrandRecord;
      authorization: PauseHeadEvidence | ChangeRequestLifecycleEvidence;
      updatedAt: string;
    }
  | { kind: "retire"; previous: OrdinaryErrandRecord; reason: "promotion"; authorization: "local" }
  | { kind: "retire"; previous: OrdinaryErrandRecord; reason: "close"; lifecycle: ChangeRequestLifecycleEvidence }
  | { kind: "retire"; previous: OrdinaryErrandRecord; reason: "abandon"; authorization: "local" }
  | { kind: "retire"; previous: OrdinaryErrandRecord; reason: "abandon"; lifecycle: ChangeRequestLifecycleEvidence };

/** Synchronous pure transform for an ordinary Errand request. */
export type OrdinaryErrandTransform = (
  records: ReadonlyMap<string, TransientIdentityRecord>,
) => IdentityTransformDecision<OrdinaryErrandRecord | null>;

/**
 * Build an idempotent complete-basis transform for one ordinary Errand edge.
 *
 * @param request - Exact previous generation, requested edge, and required evidence.
 * @returns A transform suitable for {@link transactTransientIdentities}.
 */
export function ordinaryErrandTransform(
  request: OrdinaryErrandTransition,
): OrdinaryErrandTransform {
  return (basis) => transitionOrdinaryErrand(basis, request);
}

/** Restore an exact resumed generation to its previous identity tail after allocation failure. */
export function rollbackOrdinaryErrandResumeTransform(
  previous: OrdinaryErrandRecord,
  resumed: OrdinaryErrandRecord,
): OrdinaryErrandTransform {
  return (basis) => {
    const actual = basis.get(previous.slug);
    if (actual !== undefined && recordsEqual(actual, previous)) {
      return { kind: "idempotent", value: previous };
    }
    if (actual === undefined || !recordsEqual(actual, resumed)) {
      return { kind: "refused", reason: `Identity '${previous.slug}' changed before resume rollback` };
    }
    const records = new Map(basis);
    records.set(previous.slug, previous);
    return { kind: "applied", records, value: previous };
  };
}

/**
 * Prove a pause head against the exact local branch tip and a freshly fetched remote branch tip.
 *
 * @param exec - Argument-array Git execution boundary.
 * @param params - Remote, branch, and caller-observed terminal head.
 * @returns Proven evidence, a state refusal, or a typed operational failure.
 */
export async function provePauseHead(
  exec: GitExec,
  params: ProvePauseHeadParams,
): Promise<ProvePauseHeadOutcome> {
  const branchCheckArgs = ["check-ref-format", "--branch", params.branch];
  try {
    await exec("git", branchCheckArgs);
  } catch (error) {
    const normalized = normalizeGitRejection(error, { command: "git", args: branchCheckArgs });
    return normalized.exitCode === 1 || normalized.exitCode === 128
      ? { kind: "refused", reason: "The Errand branch name is not a valid Git branch" }
      : { kind: "error", stage: "local-head", message: normalized.message };
  }
  const localRef = `refs/heads/${params.branch}`;
  let terminalHead: string;
  const resolveLocalArgs = ["rev-parse", "--verify", "--end-of-options", `${localRef}^{commit}`];
  try {
    terminalHead = (await exec("git", resolveLocalArgs)).stdout.trim();
  } catch (error) {
    return gitError("local-head", error, resolveLocalArgs);
  }
  if (terminalHead !== params.savedHead) {
    return { kind: "refused", reason: "savedHead does not match the terminal branch head" };
  }

  const temporaryRef = `refs/arc/tmp/errand-pause/${uniqueRefToken()}`;
  const remoteRef = `refs/heads/${params.branch}`;
  const proof = await fetchAndProvePauseHead(exec, params.remote, remoteRef, temporaryRef, terminalHead);
  try {
    await exec("git", ["update-ref", "-d", temporaryRef]);
  } catch (error) {
    return gitError("cleanup", error, ["update-ref", "-d", temporaryRef]);
  }
  return proof;
}

async function fetchAndProvePauseHead(
  exec: GitExec,
  remote: string,
  remoteRef: string,
  temporaryRef: string,
  terminalHead: string,
): Promise<ProvePauseHeadOutcome> {
  const fetchArgs = ["fetch", "--", remote, `+${remoteRef}:${temporaryRef}`];
  try {
    await exec("git", fetchArgs);
  } catch (error) {
    const normalized = normalizeGitRejection(error, { command: "git", args: fetchArgs });
    return normalized.expectedOutcome === "absent-remote-ref"
      ? { kind: "refused", reason: "The remote branch does not exist" }
      : { kind: "error", stage: "fetch", message: normalized.message };
  }

  let remoteBranchTip: string;
  const resolveArgs = ["rev-parse", "--verify", "--end-of-options", `${temporaryRef}^{commit}`];
  try {
    remoteBranchTip = (await exec("git", resolveArgs)).stdout.trim();
  } catch (error) {
    return gitError("remote-head", error, resolveArgs);
  }

  const ancestryArgs = ["merge-base", "--is-ancestor", terminalHead, remoteBranchTip];
  try {
    await exec("git", ancestryArgs);
  } catch (error) {
    const normalized = normalizeGitRejection(error, { command: "git", args: ancestryArgs });
    return normalized.exitCode === 1
      ? { kind: "refused", reason: "savedHead is not present on the fetched remote branch" }
      : { kind: "error", stage: "ancestry", message: normalized.message };
  }
  return {
    kind: "proven",
    evidence: {
      [pauseHeadEvidenceBrand]: true,
      terminalHead,
      remoteBranchTip,
      savedHeadIsAncestor: true,
    },
  };
}

function gitError(
  stage: Extract<ProvePauseHeadOutcome, { kind: "error" }>["stage"],
  error: unknown,
  args: string[],
): Extract<ProvePauseHeadOutcome, { kind: "error" }> {
  return { kind: "error", stage, message: normalizeGitRejection(error, { command: "git", args }).message };
}

function transitionOrdinaryErrand(
  basis: ReadonlyMap<string, TransientIdentityRecord>,
  request: OrdinaryErrandTransition,
): IdentityTransformDecision<OrdinaryErrandRecord | null> {
  if (request.kind === "create") return createDecision(basis, request.record);

  const desired = desiredRecord(request);
  if (desired.kind === "refused") return desired;
  const key = request.previous.slug;
  const actual = basis.get(key);
  if (desired.record === null && actual === undefined) return { kind: "idempotent", value: null };
  if (desired.record !== null && actual !== undefined && recordsEqual(actual, desired.record)) {
    return { kind: "idempotent", value: desired.record };
  }
  if (actual === undefined) return { kind: "refused", reason: `Identity '${key}' is missing` };
  if (!isOrdinaryErrand(actual)) return { kind: "refused", reason: `Identity '${key}' has an incompatible kind` };
  if (!recordsEqual(actual, request.previous)) {
    return { kind: "refused", reason: `Identity '${key}' no longer matches the expected generation and state` };
  }
  const records = new Map(basis);
  if (desired.record === null) records.delete(key);
  else records.set(key, desired.record);
  return { kind: "applied", records, value: desired.record };
}

function createDecision(
  basis: ReadonlyMap<string, TransientIdentityRecord>,
  record: OrdinaryErrandRecord,
): IdentityTransformDecision<OrdinaryErrandRecord | null> {
  if (record.state !== "open") return { kind: "refused", reason: "New ordinary Errands must begin open" };
  const actual = basis.get(record.slug);
  if (actual !== undefined && recordsEqual(actual, record)) return { kind: "idempotent", value: record };
  if (actual !== undefined) return { kind: "refused", reason: `Identity '${record.slug}' is already occupied` };
  const records = new Map(basis);
  records.set(record.slug, record);
  return { kind: "applied", records, value: record };
}

type DesiredResult =
  | { kind: "desired"; record: OrdinaryErrandRecord | null }
  | { kind: "refused"; reason: string };

function desiredRecord(request: Exclude<OrdinaryErrandTransition, { kind: "create" }>): DesiredResult {
  if (request.kind === "retire") return retirementDesired(request);
  if (request.kind === "link" && request.previous.state === "open" && request.previous.origin === "inbox") {
    return request.previous.originEntry === request.originEntry
      && request.previous.dispatchId === request.dispatchId
      ? { kind: "desired", record: request.previous }
      : { kind: "refused", reason: "Errand is already linked to a different inbox generation" };
  }
  if (!timestampAdvances(request.previous.updatedAt, request.updatedAt)) {
    return { kind: "refused", reason: "updatedAt must advance monotonically" };
  }

  let value: unknown;
  switch (request.kind) {
    case "link": {
      if (request.previous.state !== "open" || request.previous.origin !== "description") {
        return { kind: "refused", reason: "Only an open description-origin Errand can be linked" };
      }
      value = {
        ...request.previous,
        origin: "inbox",
        originEntry: request.originEntry,
        dispatchId: request.dispatchId,
        updatedAt: request.updatedAt,
      };
      break;
    }
    case "pause": {
      if (request.previous.state !== "open") return { kind: "refused", reason: "Only an open Errand can pause" };
      if (request.savedHead !== request.evidence.terminalHead) {
        return { kind: "refused", reason: "savedHead does not match the terminal branch head" };
      }
      if (!isGitOid(request.evidence.remoteBranchTip) || !request.evidence.savedHeadIsAncestor) {
        return { kind: "refused", reason: "savedHead is not proven on the fetched remote branch" };
      }
      value = {
        ...request.previous,
        state: "paused",
        savedHead: request.savedHead,
        changeRequest: null,
        updatedAt: request.updatedAt,
      };
      break;
    }
    case "await-merge": {
      if (request.previous.state !== "open") {
        return { kind: "refused", reason: "Only an open Errand can enter awaiting-merge" };
      }
      if (request.observed.headRef !== request.previous.branch
        || !changeRequestsEqual(request.changeRequest, request.observed)
        || !configuredCoordinatesMatch(request.changeRequest, request.configured)) {
        return { kind: "refused", reason: "Change-request coordinates do not match configured and observed state" };
      }
      value = {
        ...request.previous,
        state: "awaiting-merge",
        savedHead: null,
        changeRequest: request.changeRequest,
        updatedAt: request.updatedAt,
      };
      break;
    }
    case "resume": {
      if (request.previous.state === "paused") {
        if (!("terminalHead" in request.authorization)
          || request.authorization.terminalHead !== request.previous.savedHead
          || !isGitOid(request.authorization.remoteBranchTip)
          || !request.authorization.savedHeadIsAncestor) {
          return { kind: "refused", reason: "Paused resume requires exact remote preservation proof" };
        }
      } else if (request.previous.state === "awaiting-merge") {
        if (!("kind" in request.authorization)
          || !lifecycleAuthorizes(request.authorization, request.previous.changeRequest, "requested-work")) {
          return { kind: "refused", reason: "Awaiting resume requires exact requested-work host truth" };
        }
      } else {
        return { kind: "refused", reason: "Only a paused or awaiting-merge Errand can resume" };
      }
      value = {
        ...request.previous,
        state: "open",
        savedHead: null,
        changeRequest: null,
        updatedAt: request.updatedAt,
      };
      break;
    }
  }
  const parsed = TransientIdentityRecordV3Schema.safeParse(value);
  return parsed.success && isOrdinaryErrand(parsed.data)
    ? { kind: "desired", record: parsed.data }
    : { kind: "refused", reason: "Requested transition does not form a valid ordinary Errand record" };
}

function retirementDesired(
  request: Extract<OrdinaryErrandTransition, { kind: "retire" }>,
): DesiredResult {
  const { previous, reason } = request;
  if (reason === "promotion" && previous.state === "open" && hasLocalAuthorization(request)) {
    return { kind: "desired", record: null };
  }
  if (reason === "close" && previous.state === "awaiting-merge"
    && lifecycleAuthorizes(request.lifecycle, previous.changeRequest, "merged")) {
    return { kind: "desired", record: null };
  }
  if (reason === "abandon" && previous.state !== "awaiting-merge"
    && hasLocalAuthorization(request)) {
    return { kind: "desired", record: null };
  }
  if (reason === "abandon" && previous.state === "awaiting-merge"
    && "lifecycle" in request
    && lifecycleAuthorizes(request.lifecycle, previous.changeRequest, "closed-unmerged")) {
    return { kind: "desired", record: null };
  }
  return { kind: "refused", reason: `Retirement authorization is invalid for ${reason}@${previous.state}` };
}

function hasLocalAuthorization(request: object): boolean {
  return "authorization" in request
    && (request as { authorization?: unknown }).authorization === "local";
}

function lifecycleAuthorizes(
  evidence: ChangeRequestLifecycleEvidence,
  changeRequest: LocusChangeRequestV1,
  required: "merged" | "closed-unmerged" | "requested-work",
): boolean {
  return evidence.kind === required && changeRequestsEqual(evidence.changeRequest, changeRequest);
}

function isOrdinaryErrand(record: TransientIdentityRecord): record is OrdinaryErrandRecord {
  return record.version === 3 && record.kind === "errand" && record.purpose === "errand";
}

function recordsEqual(left: TransientIdentityRecord, right: TransientIdentityRecord): boolean {
  return serializeTransientIdentityRecord(left) === serializeTransientIdentityRecord(right);
}

function timestampAdvances(previous: string, next: string): boolean {
  return Date.parse(next) > Date.parse(previous);
}

function changeRequestsEqual(left: LocusChangeRequestV1, right: LocusChangeRequestV1): boolean {
  return left.repositoryRef === right.repositoryRef
    && left.hostRef === right.hostRef
    && left.baseRef === right.baseRef
    && left.headRef === right.headRef
    && left.headSha === right.headSha;
}

function configuredCoordinatesMatch(
  changeRequest: LocusChangeRequestV1,
  configured: AwaitMergeConfiguredCoordinates,
): boolean {
  return changeRequest.repositoryRef === configured.repositoryRef
    && changeRequest.hostRef === configured.hostRef
    && changeRequest.baseRef === configured.baseRef;
}

function isGitOid(value: string): boolean {
  return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value);
}
