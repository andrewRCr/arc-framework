/** Machine-owned record settlement for one driven delivery correction. */

import { createHash } from "node:crypto";

import { canonicalize, sortByCanonicalBytes } from "../kernel/index.js";
import type { DeliveryRevisionedRecord } from "./ports.js";
import { carryDeliveryReviewFixPublicBoundary } from "./review-fix.js";
import type { DeliveryPlanV1, DeliveryStateV1 } from "./schema.js";
import {
  reduceCandidateDurableBaseline,
  type CandidateManagedRecordV1,
} from "../work-unit/candidate-attestation.js";
import { resolveCandidateRecordRelativePath } from "../work-unit/candidate-record-store.js";
import { resolveSubmissionBoundaryPath } from "../work-unit/submission-boundary-store.js";
import type { IntegrationBoundaryLocus } from
  "../../scripts/review-gate/policy/integration-boundary-locus.js";
import type { DeliveryReviewFixDriveEffect } from "./review-fix-driver.js";

export type DeliveryReviewFixRecordClass =
  | "candidate-boundary-projection"
  | "review-applicability-selection"
  | "boundary-projection";

export interface DeliveryReviewFixExpectedRecord {
  readonly path: string;
  readonly digest: string;
}

type RecoverableDeliveryReviewFixRecordClass = Exclude<
  DeliveryReviewFixRecordClass,
  "review-applicability-selection"
>;

/**
 * Reconstruct an interrupted driver-owned correction projection from its semantic before/after records.
 *
 * @param input - Exact supported record class, parsed records, and current delivery authority.
 * @returns Exact-byte expectations only when the records prove one supported driver effect.
 */
export function reconstructDeliveryReviewFixExpectedRecords(input: {
  readonly recordClass: RecoverableDeliveryReviewFixRecordClass;
  readonly plan: DeliveryPlanV1;
  readonly state: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly beforeCandidate: CandidateManagedRecordV1;
  readonly currentCandidate: CandidateManagedRecordV1;
  readonly beforeBoundary: IntegrationBoundaryLocus;
  readonly currentBoundary: IntegrationBoundaryLocus;
  readonly candidateRecord: {
    readonly path: string;
    readonly content: string;
  };
  readonly boundaryRecord: {
    readonly path: string;
    readonly content: string;
  };
}): readonly DeliveryReviewFixExpectedRecord[] | null {
  const { beforeCandidate, currentCandidate } = input;
  if (input.recordClass === "boundary-projection") {
    if (canonicalize(beforeCandidate) !== canonicalize(currentCandidate)) return null;
  } else {
    if (currentCandidate.transitions.length !== beforeCandidate.transitions.length + 1) return null;
    const appended = currentCandidate.transitions.at(-1);
    if (appended?.transitionKind !== "verification-response") return null;
    const currentBeforeAppend = {
      ...currentCandidate,
      transitions: currentCandidate.transitions.slice(0, -1),
    };
    if (canonicalize(beforeCandidate) !== canonicalize(currentBeforeAppend)) return null;
  }
  if (canonicalize(input.beforeBoundary) === canonicalize(input.currentBoundary)) return null;
  const baseline = reduceCandidateDurableBaseline(currentCandidate);
  const carried = carryDeliveryReviewFixPublicBoundary({
    plan: input.plan,
    state: input.state,
    boundary: input.beforeBoundary,
    candidateId: currentCandidate.attestation.candidateId,
    sourceCandidateSubjectDigest: input.beforeBoundary.candidateSubjectDigest ?? "",
    candidateSubjectDigest: baseline.target.subject.subjectDigest,
  });
  if (carried.status === "refused"
    || canonicalize(carried.boundary) !== canonicalize(input.currentBoundary)) {
    return null;
  }
  const records = input.recordClass === "candidate-boundary-projection"
    ? [input.candidateRecord, input.boundaryRecord]
    : [input.boundaryRecord];
  return sortByCanonicalBytes(records.map(({ path }) => path)).map((path) => {
    const record = records.find((candidate) => candidate.path === path);
    if (record === undefined) throw new Error("delivery review-fix record path disappeared");
    return { path, digest: deliveryReviewFixRecordDigest(record.content) };
  });
}

/**
 * Bind one record expectation to its exact UTF-8 bytes.
 *
 * @param content - Record content as read or staged.
 * @returns Canonical SHA-256 digest of its UTF-8 bytes.
 */
export function deliveryReviewFixRecordDigest(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

export type DeliveryReviewFixStagedRecordClassification =
  | { readonly status: "idle" }
  | {
      readonly status: "ready";
      readonly recordClass: DeliveryReviewFixRecordClass;
      readonly paths: readonly string[];
    };

/** Select only the exact correction records from the current staged set. */
export function classifyDeliveryReviewFixStagedRecords(input: {
  readonly workUnitId: string;
  readonly paths: readonly string[];
}): DeliveryReviewFixStagedRecordClassification {
  const candidatePath = resolveCandidateRecordRelativePath(input.workUnitId);
  const boundaryPath = resolveSubmissionBoundaryPath(input.workUnitId);
  const paths = sortByCanonicalBytes([...new Set(input.paths)])
    .filter((path) => path === candidatePath || path === boundaryPath);
  if (paths.length === 0) return { status: "idle" };
  const hasCandidate = paths.includes(candidatePath);
  const hasBoundary = paths.includes(boundaryPath);
  return {
    status: "ready",
    recordClass: hasCandidate && hasBoundary
      ? "candidate-boundary-projection"
      : hasCandidate ? "review-applicability-selection" : "boundary-projection",
    paths,
  };
}

export interface DeliveryReviewFixRecordEffectPorts {
  listStagedPaths(): Promise<readonly string[]>;
  readStagedRecordDigest(path: string): Promise<string | null>;
  readRecoverableCommit(input: {
    readonly candidates: readonly {
      readonly recordClass: DeliveryReviewFixRecordClass;
      readonly paths: readonly string[];
      readonly message: string;
    }[];
  }): Promise<
    | { readonly status: "none" }
    | {
        readonly status: "recoverable";
        readonly recordClass: DeliveryReviewFixRecordClass;
        readonly branch: string;
        readonly head: string;
        readonly beforeHead: string;
        readonly paths: readonly string[];
      }
    | { readonly status: "refused"; readonly reason: string }
  >;
  readCommittedRecordDigest(head: string, path: string): Promise<string | null>;
  readCurrentBranch(): Promise<string | null>;
  readRemoteHead(ref: string): Promise<string | null>;
  commit(input: {
    readonly paths: readonly string[];
    readonly message: string;
  }): Promise<
    | { readonly status: "committed"; readonly head: string }
    | { readonly status: "refused"; readonly reason: string; readonly diagnostics?: readonly string[] }
  >;
  push(input: { readonly branch: string }): Promise<
    | { readonly status: "pushed" }
    | { readonly status: "refused"; readonly reason: string; readonly diagnostics?: readonly string[] }
  >;
}

export type DeliveryReviewFixRecordEffectSettlement =
  | { readonly status: "idle" | "settled"; readonly effects: readonly DeliveryReviewFixDriveEffect[] }
  | {
      readonly status: "refused";
      readonly reason: string;
      readonly diagnostics?: readonly string[];
      readonly paths?: readonly string[];
    };

/**
 * Compose the exact machine-owned commit message for one correction record effect.
 *
 * @param recordClass - Supported correction record shape.
 * @param context - Work-unit integration context for the commit footer.
 * @returns The complete commit message expected by recovery.
 */
export function deliveryReviewFixRecordCommitMessage(
  recordClass: DeliveryReviewFixRecordClass,
  context: string,
): string {
  const subject = recordClass === "review-applicability-selection"
    ? "chore(review): record applicability selection"
    : "chore(delivery): carry correction review boundary";
  return `${subject}\n\nRecord the machine-owned ${recordClass} effect for the active correction.\n\nContext: ${context}`;
}

/** Commit and publish one exact staged correction-record batch. */
export async function settleDeliveryReviewFixRecordEffects(input: {
  readonly workUnitId: string;
  readonly context: string;
  readonly expectedRecords: readonly DeliveryReviewFixExpectedRecord[];
  readonly ports: DeliveryReviewFixRecordEffectPorts;
}): Promise<DeliveryReviewFixRecordEffectSettlement> {
  const classified = classifyDeliveryReviewFixStagedRecords({
    workUnitId: input.workUnitId,
    paths: await input.ports.listStagedPaths(),
  });
  let recordClass: DeliveryReviewFixRecordClass;
  let head: string;
  let branch: string;
  let beforeHead: string | null;
  let replayed = false;
  const expectedRecords = [...input.expectedRecords]
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  if (classified.status === "idle") {
    if (expectedRecords.length === 0) return { status: "idle", effects: [] };
    const candidatePath = resolveCandidateRecordRelativePath(input.workUnitId);
    const boundaryPath = resolveSubmissionBoundaryPath(input.workUnitId);
    const recoverable = await input.ports.readRecoverableCommit({
      candidates: [
        {
          recordClass: "review-applicability-selection",
          paths: [candidatePath],
          message: deliveryReviewFixRecordCommitMessage("review-applicability-selection", input.context),
        },
        {
          recordClass: "boundary-projection",
          paths: [boundaryPath],
          message: deliveryReviewFixRecordCommitMessage("boundary-projection", input.context),
        },
        {
          recordClass: "candidate-boundary-projection",
          paths: sortByCanonicalBytes([candidatePath, boundaryPath]),
          message: deliveryReviewFixRecordCommitMessage("candidate-boundary-projection", input.context),
        },
      ],
    });
    if (recoverable.status === "none") {
      return {
        status: "refused",
        reason: "record-effect-expected-records-missing",
        paths: expectedRecords.map(({ path }) => path),
      };
    }
    if (recoverable.status === "refused") return recoverable;
    const expectedPaths = expectedRecords.map(({ path }) => path);
    if (expectedPaths.length !== recoverable.paths.length
      || expectedPaths.some((path, index) => path !== recoverable.paths[index])) {
      return {
        status: "refused",
        reason: "record-effect-path-mismatch",
        paths: recoverable.paths,
      };
    }
    const observedDigests = await Promise.all(recoverable.paths.map(
      (path) => input.ports.readCommittedRecordDigest(recoverable.head, path),
    ));
    if (observedDigests.some((digest, index) => digest === null
      || digest !== expectedRecords[index]?.digest)) {
      return {
        status: "refused",
        reason: "record-effect-content-mismatch",
        paths: recoverable.paths,
      };
    }
    ({ recordClass, head, branch, beforeHead } = recoverable);
    replayed = true;
  } else {
    const expectedPaths = sortByCanonicalBytes(expectedRecords.map(({ path }) => path));
    if (expectedPaths.length === 0) {
      return {
        status: "refused",
        reason: "record-effect-unexpected-staged-records",
        paths: classified.paths,
      };
    }
    if (expectedPaths.length !== classified.paths.length
      || expectedPaths.some((path, index) => path !== classified.paths[index])) {
      return {
        status: "refused",
        reason: "record-effect-path-mismatch",
        paths: classified.paths,
      };
    }
    const observedDigests = await Promise.all(classified.paths.map(
      (path) => input.ports.readStagedRecordDigest(path),
    ));
    if (observedDigests.some((digest, index) => digest === null
      || digest !== expectedRecords.find(({ path }) => path === classified.paths[index])?.digest)) {
      return {
        status: "refused",
        reason: "record-effect-content-mismatch",
        paths: classified.paths,
      };
    }
    recordClass = classified.recordClass;
    const committed = await input.ports.commit({
      paths: classified.paths,
      message: deliveryReviewFixRecordCommitMessage(recordClass, input.context),
    });
    if (committed.status === "refused") return committed;
    head = committed.head;
    const current = await input.ports.readCurrentBranch();
    if (current === null) {
      return { status: "refused", reason: "record-effect-branch-unavailable" };
    }
    branch = current;
    beforeHead = await input.ports.readRemoteHead(`refs/heads/${branch}`);
  }
  const effects: DeliveryReviewFixDriveEffect[] = [{
    kind: "commit",
    recordClass,
    head,
    ...(replayed ? { replayed: true as const } : {}),
  }];
  const ref = `refs/heads/${branch}`;
  if (beforeHead === head) return { status: "settled", effects };
  const pushed = await input.ports.push({ branch });
  if (pushed.status === "refused") return pushed;
  const afterHead = await input.ports.readRemoteHead(ref);
  if (afterHead !== head) {
    return { status: "refused", reason: "record-effect-push-unconfirmed" };
  }
  effects.push({ kind: "push", ref, beforeHead, afterHead });
  return { status: "settled", effects };
}
