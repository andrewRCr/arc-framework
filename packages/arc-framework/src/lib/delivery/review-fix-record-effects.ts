/** Machine-owned record settlement for one driven delivery correction. */

import { sortByCanonicalBytes } from "../kernel/index.js";
import { resolveCandidateRecordRelativePath } from "../work-unit/candidate-record-store.js";
import { resolveSubmissionBoundaryPath } from "../work-unit/submission-boundary-store.js";
import type { DeliveryReviewFixDriveEffect } from "./review-fix-driver.js";

export type DeliveryReviewFixRecordClass =
  | "candidate-boundary-projection"
  | "review-applicability-selection"
  | "boundary-projection";

export type DeliveryReviewFixStagedRecordClassification =
  | { readonly status: "idle" }
  | {
      readonly status: "ready";
      readonly recordClass: DeliveryReviewFixRecordClass;
      readonly paths: readonly string[];
    }
  | {
      readonly status: "refused";
      readonly reason: "record-effect-stage-contaminated";
      readonly paths: readonly string[];
    };

/** Restrict autonomous commits to the two exact correction record paths. */
export function classifyDeliveryReviewFixStagedRecords(input: {
  readonly workUnitId: string;
  readonly paths: readonly string[];
}): DeliveryReviewFixStagedRecordClassification {
  const paths = sortByCanonicalBytes([...new Set(input.paths)]);
  if (paths.length === 0) return { status: "idle" };
  const candidatePath = resolveCandidateRecordRelativePath(input.workUnitId);
  const boundaryPath = resolveSubmissionBoundaryPath(input.workUnitId);
  const unexpected = paths.filter((path) => path !== candidatePath && path !== boundaryPath);
  if (unexpected.length > 0) {
    return { status: "refused", reason: "record-effect-stage-contaminated", paths: unexpected };
  }
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
      }
    | { readonly status: "refused"; readonly reason: string }
  >;
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

function commitMessage(recordClass: DeliveryReviewFixRecordClass, context: string): string {
  const subject = recordClass === "review-applicability-selection"
    ? "chore(review): record applicability selection"
    : "chore(delivery): carry correction review boundary";
  return `${subject}\n\nRecord the machine-owned ${recordClass} effect for the active correction.\n\nContext: ${context}`;
}

/** Commit and publish one exact staged correction-record batch. */
export async function settleDeliveryReviewFixRecordEffects(input: {
  readonly workUnitId: string;
  readonly context: string;
  readonly ports: DeliveryReviewFixRecordEffectPorts;
}): Promise<DeliveryReviewFixRecordEffectSettlement> {
  const classified = classifyDeliveryReviewFixStagedRecords({
    workUnitId: input.workUnitId,
    paths: await input.ports.listStagedPaths(),
  });
  if (classified.status === "refused") return classified;
  let recordClass: DeliveryReviewFixRecordClass;
  let head: string;
  let branch: string;
  let beforeHead: string | null;
  let replayed = false;
  if (classified.status === "idle") {
    const candidatePath = resolveCandidateRecordRelativePath(input.workUnitId);
    const boundaryPath = resolveSubmissionBoundaryPath(input.workUnitId);
    const recoverable = await input.ports.readRecoverableCommit({
      candidates: [
        {
          recordClass: "review-applicability-selection",
          paths: [candidatePath],
          message: commitMessage("review-applicability-selection", input.context),
        },
        {
          recordClass: "boundary-projection",
          paths: [boundaryPath],
          message: commitMessage("boundary-projection", input.context),
        },
        {
          recordClass: "candidate-boundary-projection",
          paths: sortByCanonicalBytes([candidatePath, boundaryPath]),
          message: commitMessage("candidate-boundary-projection", input.context),
        },
      ],
    });
    if (recoverable.status === "none") return { status: "idle", effects: [] };
    if (recoverable.status === "refused") return recoverable;
    ({ recordClass, head, branch, beforeHead } = recoverable);
    replayed = true;
  } else {
    recordClass = classified.recordClass;
    const committed = await input.ports.commit({
      paths: classified.paths,
      message: commitMessage(recordClass, input.context),
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
