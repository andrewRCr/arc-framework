/** Closure of a review subject's opening frontline phase, with a durable skip marker for singleton Candidates. */

import { canonicalDigest } from "../../../lib/kernel/index.js";
import { currentApprovedDispositionNode } from "../core/advisory-records.js";
import {
  FrontlinePhaseStateSchema,
  type FrontlinePhaseState,
} from "../core/operation-state-schema.js";
import type { LaneSubjectLineage } from "../core/lane-admission.js";
import type {
  ApprovedDispositionRecordStore,
  ReviewOperationStateStore,
  ReviewResultReader,
} from "../core/ports.js";
import { isReviewVersionConflict, REVIEW_VERSION_RETRY_ATTEMPTS } from
  "../core/version-conflict.js";
import { readLaneProgressOwner } from "../lane-progress.js";
import { projectFrontlineFollowUpAdvice, type FrontlineFollowUpAdvice } from "./frontline-follow-up.js";
import { nativeFrontlineWindowSkipped, nativeFrontlineCapContinues } from "../runtime/native-frontline-window.js";
import type { ConfirmResponseHeadContinuation } from "../core/response-head-continuation.js";

export function singletonFrontlinePhaseOperationId(input: {
  repositoryId: string;
  candidateId: string;
}): string {
  const digest = canonicalDigest({
    domain: "arc.review.singleton-frontline-phase/v1",
    repositoryId: input.repositoryId,
    candidateId: input.candidateId,
  });
  return `frontline-phase/${digest.slice("sha256:".length)}`;
}

/** Read only the current Candidate and its explicitly validated supersession ancestors. */
export async function readSingletonFrontlinePhaseClosure(
  store: Pick<ReviewOperationStateStore, "readOperation">,
  input: { repositoryId: string; candidateIds: readonly string[] },
): Promise<FrontlinePhaseState | null> {
  for (const candidateId of new Set(input.candidateIds)) {
    const operationId = singletonFrontlinePhaseOperationId({
      repositoryId: input.repositoryId,
      candidateId,
    });
    const { state } = await store.readOperation(operationId);
    if (state === null) continue;
    const marker = FrontlinePhaseStateSchema.parse(state);
    if (marker.operationId !== operationId
      || marker.repositoryId !== input.repositoryId
      || marker.candidateId !== candidateId) {
      throw new Error("singleton frontline phase closure does not match its Candidate owner");
    }
    return marker;
  }
  return null;
}

/**
 * Read the follow-up advice a settled frontline producer's current approved dispositions carry.
 *
 * @param resultReader - Immutable review result reader.
 * @param dispositionStore - Approved disposition records keyed by producer.
 * @returns A reader that projects one producer's advice, refusing a non-frontline or unapproved producer.
 */
export function settledFrontlineAdviceReader(
  resultReader: Pick<ReviewResultReader, "readResult">,
  dispositionStore: Pick<ApprovedDispositionRecordStore, "readDispositionRecord">,
): (producerId: string) => Promise<FrontlineFollowUpAdvice> {
  return async (producerId) => {
    const result = await resultReader.readResult(producerId);
    if (result.kind !== "frontline") {
      throw new Error("settled frontline owner does not match its immutable result");
    }
    const dispositions = await dispositionStore.readDispositionRecord(producerId);
    if (dispositions === null) {
      throw new Error("settled frontline findings lack an approved disposition record");
    }
    return projectFrontlineFollowUpAdvice({
      outcome: result.outcome,
      dispositionState: currentApprovedDispositionNode(dispositions).approvedDisposition,
    });
  };
}

/**
 * Close the opening phase after a durable skip, terminal result, or standard admission. Lane progress is owned per
 * subject rather than per head, so a closure recorded on an earlier head holds for every later one, except a native
 * pass-cap stop, which stays open on a later head whose response continues it.
 *
 * @param store - Versioned operation-state storage boundary.
 * @param input - The subject's lineages, the current head and its continuation reader, and the reader that settles
 *   findings follow-up advice.
 * @returns Whether any lineage has closed the phase.
 */
export async function frontlinePhaseClosed(
  store: Pick<ReviewOperationStateStore, "readOperation" | "nativeFacts">,
  input: {
    repositoryId: string;
    lineages: readonly LaneSubjectLineage[];
    headSha?: string;
    confirmResponseHeadContinuation?: ConfirmResponseHeadContinuation;
    readSettledFindingsAdvice?: (producerId: string) => Promise<FrontlineFollowUpAdvice>;
  },
): Promise<boolean> {
  if (await explicitFrontlineSkip(store, input)) return true;
  for (const lineage of input.lineages) {
    const standardOwner = await readLaneProgressOwner(store, {
      lane: "standard", repositoryId: input.repositoryId, headSha: "", lineage,
    });
    if (standardOwner?.attempts.length) return true;
    const frontlineOwner = await readLaneProgressOwner(store, {
      lane: "frontline", repositoryId: input.repositoryId, headSha: "", lineage,
    });
    for (const attempt of frontlineOwner?.attempts ?? []) {
      if (!attempt.terminalProducer) continue;
      if (attempt.outcome === "clean") return true;
      if (attempt.outcome !== "settled-findings" || input.readSettledFindingsAdvice === undefined) continue;
      const advice = await input.readSettledFindingsAdvice(attempt.attemptId);
      if (advice.action !== "stop") continue;
      const currentLineage = input.lineages[0];
      if (advice.reason === "pass-cap-exhausted" && store.nativeFacts !== undefined
        && input.headSha !== undefined && currentLineage !== undefined
        && await nativeFrontlineCapContinues(store.nativeFacts, { repositoryId: input.repositoryId,
          lineage: currentLineage, producerId: attempt.attemptId, passCount: attempt.logicalPass, headSha: input.headSha,
          confirmResponseHeadContinuation: input.confirmResponseHeadContinuation })) continue;
      return true;
    }
  }
  return false;
}

async function explicitFrontlineSkip(store: Pick<ReviewOperationStateStore, "readOperation" | "nativeFacts">,
  input: { repositoryId: string; lineages: readonly LaneSubjectLineage[] }): Promise<boolean> {
  if (store.nativeFacts !== undefined) return nativeFrontlineWindowSkipped(store.nativeFacts, input);
  const candidateIds = input.lineages.flatMap(lineage => lineage.kind === "candidate" ? [lineage.candidateId] : []);
  return await readSingletonFrontlinePhaseClosure(store, { repositoryId: input.repositoryId, candidateIds }) !== null;
}

/** Persist one accepted initial skip without manufacturing an attempt or clean result. */
export async function recordSingletonFrontlineInitialSkip(
  store: ReviewOperationStateStore,
  input: { repositoryId: string; candidateId: string; now: string },
): Promise<FrontlinePhaseState> {
  const operationId = singletonFrontlinePhaseOperationId(input);
  for (let attempt = 0; attempt < REVIEW_VERSION_RETRY_ATTEMPTS; attempt += 1) {
    const { version, state } = await store.readOperation(operationId);
    if (state !== null) {
      const marker = FrontlinePhaseStateSchema.parse(state);
      if (marker.operationId !== operationId
        || marker.repositoryId !== input.repositoryId
        || marker.candidateId !== input.candidateId) {
        throw new Error("singleton frontline phase closure does not match its Candidate owner");
      }
      return marker;
    }
    const marker = FrontlinePhaseStateSchema.parse({
      schemaVersion: 1,
      semanticsVersion: "review-operation/v1",
      operationId,
      updatedAt: input.now,
      kind: "frontline-phase",
      repositoryId: input.repositoryId,
      candidateId: input.candidateId,
      closedBy: "initial-skip",
    });
    try {
      await store.publishOperation(marker, version);
      return marker;
    } catch (error) {
      if (!isReviewVersionConflict(error)) throw error;
    }
  }
  throw new Error("singleton frontline phase closure exceeded version-conflict retry attempts");
}
