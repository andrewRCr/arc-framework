/** Repository-shared persistence for resumable, non-evidentiary review operations. */

import { z } from "zod";

import { canonicalDigest, canonicalize } from "../../../../lib/kernel/index.js";
import {
  ReviewOperationStateSchema,
  type ReviewOperationState,
} from "../../core/operation-state-schema.js";
import type {
  ReviewOperationStateSnapshot,
  ReviewOperationStateSnapshotIndex,
  ReviewOperationStateStore,
} from "../../core/ports.js";
import type { GitCommonStatePublisher } from "../../../../lib/git-common-state.js";

const IdentifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u);
const OPERATION_STORE_SEMANTICS = "review-operation-store/v1" as const;

const ReviewOperationStoreRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal(OPERATION_STORE_SEMANTICS),
  operationId: IdentifierSchema,
  version: z.number().int().positive(),
  state: ReviewOperationStateSchema,
});
type ReviewOperationStoreRecord = z.infer<typeof ReviewOperationStoreRecordSchema>;

/** Stable local-store failure that callers can branch on without parsing prose. */
export class LocalOperationStateStoreError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "LocalOperationStateStoreError";
  }
}

function recordName(operationId: string): string {
  const digest = canonicalDigest({ operationId }).slice("sha256:".length);
  return `operation-${digest}.json`;
}

function parseRecordValue(raw: string): ReviewOperationStoreRecord {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new LocalOperationStateStoreError("malformed-operation-state");
  }
  const parsed = ReviewOperationStoreRecordSchema.safeParse(value);
  if (!parsed.success) throw new LocalOperationStateStoreError("malformed-operation-state");
  if (parsed.data.operationId !== parsed.data.state.operationId) {
    throw new LocalOperationStateStoreError("operation-id-mismatch");
  }
  return parsed.data;
}

function parseRecord(raw: string, operationId: string): ReviewOperationStoreRecord {
  const parsed = parseRecordValue(raw);
  if (parsed.operationId !== operationId) {
    throw new LocalOperationStateStoreError("operation-id-mismatch");
  }
  return parsed;
}

type LaneAttempt = Extract<ReviewOperationState, { kind: "lane-progress" }>["attempts"][number];
type HostedLaneAttempt = NonNullable<LaneAttempt["hosted"]>;

function refuseHostedTransition(): never {
  throw new LocalOperationStateStoreError("immutable-hosted-transition");
}

function assertSettlementEvidencePrefix(
  previous: HostedLaneAttempt,
  next: HostedLaneAttempt,
): HostedLaneAttempt["settlementEvidence"] {
  const retained = next.settlementEvidence.slice(0, previous.settlementEvidence.length);
  if (canonicalize(retained) !== canonicalize(previous.settlementEvidence)) {
    refuseHostedTransition();
  }
  return next.settlementEvidence.slice(previous.settlementEvidence.length);
}

function settlementReceiptProjection(
  evidence: HostedLaneAttempt["settlementEvidence"][number],
): unknown {
  return Object.fromEntries(Object.entries(evidence).filter(([key]) => (
    key !== "dispositionSetId" && key !== "carriedFromDispositionSetId"
  )));
}

function assertHostedDispositionTransition(
  previous: HostedLaneAttempt,
  next: HostedLaneAttempt,
): void {
  const previousCurrent = previous.dispositionSetId;
  const nextCurrent = next.dispositionSetId;
  if (previousCurrent === null) {
    if (nextCurrent === null) return;
    const initialNode = next.dispositionSetLineage[0];
    if (next.dispositionSetLineage.length !== 1
      || initialNode?.dispositionSetId !== nextCurrent
      || initialNode.predecessorDispositionSetId !== null
      || initialNode.successorDispositionSetId !== null
      || next.settlementEvidence.some((evidence) => (
        evidence.dispositionSetId !== nextCurrent
        || evidence.carriedFromDispositionSetId !== null
        || evidence.channelAction !== "record-only"
      ))) {
      refuseHostedTransition();
    }
    return;
  }

  const appendedEvidence = assertSettlementEvidencePrefix(previous, next);
  if (nextCurrent === previousCurrent) {
    if (canonicalize(next.dispositionSetLineage) !== canonicalize(previous.dispositionSetLineage)
      || appendedEvidence.some((evidence) => (
        evidence.dispositionSetId !== nextCurrent
        || evidence.carriedFromDispositionSetId !== null
        || evidence.channelAction !== "reply-and-resolve"
      ))) {
      refuseHostedTransition();
    }
    return;
  }

  const previousTail = previous.dispositionSetLineage.at(-1);
  const nextPredecessor = next.dispositionSetLineage.at(-2);
  const nextSuccessor = next.dispositionSetLineage.at(-1);
  if (previousTail === undefined
    || nextPredecessor === undefined
    || nextSuccessor === undefined
    || next.dispositionSetLineage.length !== previous.dispositionSetLineage.length + 1
    || canonicalize(next.dispositionSetLineage.slice(0, -2))
      !== canonicalize(previous.dispositionSetLineage.slice(0, -1))
    || canonicalize(nextPredecessor) !== canonicalize({
      ...previousTail,
      successorDispositionSetId: nextCurrent,
    })
    || nextSuccessor.dispositionSetId !== nextCurrent
    || nextSuccessor.predecessorDispositionSetId !== previousCurrent
    || nextSuccessor.successorDispositionSetId !== null) {
    refuseHostedTransition();
  }
  for (const evidence of appendedEvidence) {
    const predecessorEvidence = previous.settlementEvidence.find((candidate) => (
      candidate.dispositionSetId === previousCurrent
      && candidate.findingId === evidence.findingId
    ));
    if (evidence.dispositionSetId !== nextCurrent
      || evidence.carriedFromDispositionSetId !== previousCurrent
      || predecessorEvidence === undefined
      || canonicalize(settlementReceiptProjection(evidence))
        !== canonicalize(settlementReceiptProjection(predecessorEvidence))) {
      refuseHostedTransition();
    }
  }
}

function immutableHostedAttemptProjection(attempt: LaneAttempt): unknown {
  const hosted = attempt.hosted;
  if (hosted === undefined) return null;
  return {
    logicalPass: attempt.logicalPass,
    retryGeneration: attempt.retryGeneration,
    changeRequestId: attempt.changeRequestId,
    headSha: attempt.headSha,
    sourceId: attempt.sourceId,
    admission: hosted.admission,
    target: hosted.target,
    requestedCoverage: hosted.requestedCoverage,
    ...(hosted.vehicle === undefined ? {} : { vehicle: hosted.vehicle }),
    reviewTarget: hosted.reviewTarget,
    requirement: hosted.requirement,
    actorIdentity: hosted.actorIdentity,
  };
}

function assertHostedTransitions(
  current: ReviewOperationState,
  next: ReviewOperationState,
): void {
  if (current.kind !== "lane-progress") return;
  const currentHosted = current.attempts.filter((attempt) => attempt.hosted !== undefined);
  if (currentHosted.length === 0) return;
  if (next.kind !== "lane-progress") {
    throw new LocalOperationStateStoreError("immutable-hosted-transition");
  }
  for (const previous of currentHosted) {
    const previousHosted = previous.hosted;
    if (previousHosted === undefined) continue;
    const candidates = next.attempts.filter((attempt) => (
      attempt.hosted?.admission.admissionId === previousHosted.admission.admissionId
    ));
    const candidate = candidates[0];
    if (candidates.length !== 1 || candidate?.hosted === undefined
      || canonicalize(immutableHostedAttemptProjection(previous))
        !== canonicalize(immutableHostedAttemptProjection(candidate))) {
      throw new LocalOperationStateStoreError("immutable-hosted-transition");
    }
    const hosted = candidate.hosted;
    if (previousHosted.handle !== undefined
      && canonicalize(previousHosted.handle) !== canonicalize(hosted.handle ?? null)) {
      throw new LocalOperationStateStoreError("immutable-hosted-transition");
    }
    if (previousHosted.effectiveCoverage !== null
      && previousHosted.effectiveCoverage !== hosted.effectiveCoverage) {
      throw new LocalOperationStateStoreError("immutable-hosted-transition");
    }
    if (previousHosted.requestFailureReason !== null
      && previousHosted.requestFailureReason !== hosted.requestFailureReason) {
      throw new LocalOperationStateStoreError("immutable-hosted-transition");
    }
    if (previousHosted.sealedResult !== undefined
      && canonicalize(previousHosted.sealedResult) !== canonicalize(hosted.sealedResult ?? null)) {
      throw new LocalOperationStateStoreError("immutable-hosted-transition");
    }
    assertHostedDispositionTransition(previousHosted, hosted);
  }
}

/** Version-checked operation store backed by the repository's non-evidentiary Git-common namespace. */
export class LocalReviewOperationStateStore implements
  ReviewOperationStateStore,
  ReviewOperationStateSnapshotIndex {
  constructor(private readonly publisher: GitCommonStatePublisher) {}

  async readOperation(operationId: string): Promise<{ version: number; state: ReviewOperationState | null }> {
    const name = recordName(operationId);
    const raw = await this.publisher.read({ root: "review-gate", namespace: "operations" }, name);
    if (raw === null) return { version: 0, state: null };
    const record = parseRecord(raw, operationId);
    return { version: record.version, state: record.state };
  }

  async readOperationSnapshot(): Promise<ReviewOperationStateSnapshot> {
    let entries;
    try {
      entries = await this.publisher.snapshot({ root: "review-gate", namespace: "operations" });
    } catch (error) {
      return {
        status: "unavailable",
        reason: error instanceof Error ? error.message : "operation-snapshot-failed",
      };
    }
    const records: Array<{ version: number; state: ReviewOperationState }> = [];
    const operationIds = new Set<string>();
    for (const entry of entries) {
      if (entry.kind !== "file") {
        return { status: "incomplete", reason: "unexpected-operation-state-entry" };
      }
      let record;
      try {
        record = parseRecordValue(entry.content);
      } catch (error) {
        return {
          status: "incomplete",
          reason: error instanceof LocalOperationStateStoreError
            ? error.code
            : "malformed-operation-state",
        };
      }
      if (entry.name !== recordName(record.operationId)) {
        return { status: "incomplete", reason: "operation-record-name-mismatch" };
      }
      if (operationIds.has(record.operationId)) {
        return { status: "incomplete", reason: "duplicate-operation-state" };
      }
      operationIds.add(record.operationId);
      records.push({ version: record.version, state: record.state });
    }
    records.sort((left, right) => left.state.operationId.localeCompare(right.state.operationId));
    return { status: "complete", records };
  }

  async publishOperation(state: ReviewOperationState, expectedVersion: number): Promise<{ version: number }> {
    const canonicalState = ReviewOperationStateSchema.parse(state);
    const name = recordName(canonicalState.operationId);
    return this.publisher.update({ root: "review-gate", namespace: "operations" }, name, (raw) => {
      if (raw !== null) {
        const current = parseRecord(raw, canonicalState.operationId);
        if (canonicalize(current.state) === canonicalize(canonicalState)) {
          return { kind: "keep", result: { version: current.version } };
        }
        if (current.version !== expectedVersion) {
          throw new LocalOperationStateStoreError("version-conflict");
        }
        assertHostedTransitions(current.state, canonicalState);
        const next = ReviewOperationStoreRecordSchema.parse({
          ...current,
          version: current.version + 1,
          state: canonicalState,
        });
        return { kind: "write", content: `${JSON.stringify(next)}\n`, result: { version: next.version } };
      }
      if (expectedVersion !== 0) throw new LocalOperationStateStoreError("version-conflict");
      const next = ReviewOperationStoreRecordSchema.parse({
        schemaVersion: 1,
        semanticsVersion: OPERATION_STORE_SEMANTICS,
        operationId: canonicalState.operationId,
        version: 1,
        state: canonicalState,
      });
      return { kind: "write", content: `${JSON.stringify(next)}\n`, result: { version: next.version } };
    });
  }
}
