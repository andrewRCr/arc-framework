/** Present immutable review outcomes and pending execution as one validated lane owner. */
import type { OwnerIdentity } from "../../../../lib/store/identity.js";
import type { ReviewOutcome } from "../../../../lib/store/kinds/review/outcome/schema.js";
import { reviewOutcomeIsSettled } from "../../../../lib/store/kinds/review/outcome/settlement.js";
import type { ReviewEvidence } from "../../../../lib/store/kinds/review/evidence/schema.js";
import { orderReviewEvidenceLineage } from "../../../../lib/store/kinds/review/evidence/composed-record.js";
import { reviewOutcomeKey } from "../../../../lib/store/kinds/review/outcome/key.js";
import { deriveReviewOutcomePassCounts } from "../../../../lib/store/kinds/review/outcome/counts.js";
import { LaneAttemptSchema, LaneProgressStateSchema, LaneResponsePerformanceSchema, type LaneProgressState } from "../../core/operation-state-schema.js";
import { laneProgressOperationId } from "../../lane-progress.js";

type LaneAttempt = LaneProgressState["attempts"][number];

/** Recompute the stable lane owner from the result's portable admission. */
export function outcomeLaneOperationId(value: ReviewOutcome): string {
  return laneProgressOperationId({ lane: value.lane, repositoryId: value.target.repositoryId,
    headSha: value.target.headSha, lineage: value.lineage });
}

function compareOutcomeOrder(a: ReviewOutcome, b: ReviewOutcome): number {
  const finished = (value: ReviewOutcome) => Number(value.outcome === "clean" || value.outcome === "findings");
  return a.logicalPass - b.logicalPass || Date.parse(a.endedAt) - Date.parse(b.endedAt)
    || a.retryGeneration - b.retryGeneration || finished(a) - finished(b) || a.attemptId.localeCompare(b.attemptId);
}

function responsePerformance(records: readonly ReviewEvidence[]):
  Pick<LaneAttempt, "responsePerformance" | "responsePerformanceHistory"> {
  const performances = records.flatMap(record => record.performance === undefined ? []
    : [LaneResponsePerformanceSchema.strip().parse(record.performance)]);
  const latest = performances.at(-1);
  return latest === undefined ? {} : { responsePerformance: latest,
    ...(performances.length < 2 ? {} : { responsePerformanceHistory: performances.slice(0, -1) }) };
}

function sourceBinding(value: ReviewOutcome, records: readonly ReviewEvidence[]):
  Pick<LaneAttempt, "local" | "frontline" | "hosted"> {
  if (value.local !== undefined) return { local: LaneAttemptSchema.shape.local.unwrap().strip().parse(value.local) };
  if (value.frontline !== undefined) return { frontline: LaneAttemptSchema.shape.frontline.unwrap().parse({ admission: value.frontline.admission,
    effectiveCoverage: value.effectiveCoverage }) };
  if (value.hosted === undefined) return {};
  const tail = records.at(-1);
  return { hosted: { ...value.hosted, dispositionSetId: tail?.dispositionSet.dispositionSetId ?? null,
    dispositionSetLineage: records.map(record => ({ dispositionSetId: record.dispositionSet.dispositionSetId,
      predecessorDispositionSetId: record.predecessorDispositionSetId, successorDispositionSetId: record.successorDispositionSetId,
      findingActions: record.settlement?.findingActions ?? [] })),
    settledFindingIds: (tail?.settlement?.evidence ?? []).map(entry => entry.findingId),
    settlementEvidence: records.flatMap(record => record.settlement?.evidence ?? []) } };
}

function outcomeAttempt(value: ReviewOutcome, evidence: readonly ReviewEvidence[]): LaneAttempt {
  const selected = evidence.filter(record => record.result.outcomeKey === reviewOutcomeKey(value));
  const records = selected.length === 0 ? [] : orderReviewEvidenceLineage(selected);
  return LaneAttemptSchema.parse({ attemptId: value.attemptId, logicalPass: value.logicalPass,
    retryGeneration: value.retryGeneration, changeRequestId: value.hosted === undefined ? null : `pull/${value.hosted.target.pullRequest}`, headSha: value.target.headSha,
    ...responsePerformance(records), ...sourceBinding(value, records),
    sourceId: value.source.sourceId, outcome: reviewOutcomeIsSettled(value, evidence) ? "settled-findings" : value.outcome,
    terminalProducer: value.outcome === "clean" || value.outcome === "findings",
    ...(value.admittedBy === undefined ? {} : { admittedBy: value.admittedBy }),
    ...(value.chunkSeriesComplete === undefined ? {} : { chunkSeriesComplete: value.chunkSeriesComplete }),
  });
}

/** Compose one owner, retaining pending execution after its ordered immutable results. */
export function composeOutcomeLane(operationId: string, pending: LaneProgressState | null,
  outcomes: readonly ReviewOutcome[], workItem: OwnerIdentity, evidence: readonly ReviewEvidence[] = []): LaneProgressState | null {
  const selected = outcomes.filter(value => outcomeLaneOperationId(value) === operationId).sort(compareOutcomeOrder);
  const first = selected[0];
  if (first === undefined) return pending;
  const count = deriveReviewOutcomePassCounts({ lane: first.lane, lineage: first.lineage, outcomes: selected, evidence });
  return LaneProgressStateSchema.parse({ schemaVersion: 1, semanticsVersion: "review-operation/v1",
    operationId, workItem, lane: first.lane, kind: "lane-progress", repositoryId: first.target.repositoryId,
    lineage: pending?.lineage ?? first.lineage, completedPasses: count.completedPasses,
    updatedAt: [pending?.updatedAt, ...selected.map(value => value.endedAt)].filter(value => value !== undefined).sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1),
    attempts: [...selected.map(value => outcomeAttempt(value, evidence)), ...(pending?.attempts ?? [])] });
}
