/** Git-common composition of immutable local, frontline, and hosted producer evidence. */

import { canonicalDigest, canonicalize } from "../../../../lib/kernel/index.js";
import { FrontlineOutcomeRecordSchema } from "../../core/advisory-records.js";
import { validateReviewReceipt } from "../../core/gate-contract-v2.js";
import { LocalReviewSourceSchema } from "../../core/local-review-source.js";
import { ReviewOperationStateSchema } from "../../core/operation-state-schema.js";
import type {
  ForwardReviewReceiptIndex,
  FrontlineOutcomeStore,
  LocalReviewSourceStore,
  ReviewOperationStateSnapshotIndex,
  ReviewResultReader,
} from "../../core/ports.js";
import type { ReviewResult } from "../../core/review-result.js";
import type { ReviewOperationStateSnapshotRecord } from "../../core/ports.js";
import type { LaneProgressState } from "../../core/operation-state-schema.js";
import { projectHostedFinding } from "../../hosted/await.js";

type LaneAttempt = LaneProgressState["attempts"][number];
type ProducerCandidate =
  | { kind: "local-review"; record: ReviewOperationStateSnapshotRecord }
  | { kind: "frontline-run"; record: ReviewOperationStateSnapshotRecord }
  | { kind: "hosted"; record: ReviewOperationStateSnapshotRecord; attempt: LaneAttempt };

function immutableProducerOutcome(attempt: LaneAttempt): LaneAttempt["outcome"] {
  return attempt.outcome === "settled-findings" ? "findings" : attempt.outcome;
}

/** Stable read failure for unavailable, ambiguous, or corrupt producer evidence. */
export class LocalReviewResultReaderError extends Error {
  constructor(
    public readonly code: "missing-result" | "ambiguous-result" | "corrupt-result",
    message: string = code,
  ) {
    super(message);
    this.name = "LocalReviewResultReaderError";
  }
}

/** Dependencies composed from the existing native source stores. */
export interface LocalReviewResultReaderDependencies {
  operationIndex: ReviewOperationStateSnapshotIndex;
  receiptIndex: ForwardReviewReceiptIndex;
  outcomeStore: FrontlineOutcomeStore;
  sourceStore: LocalReviewSourceStore;
}

/** Resolve exact immutable producer evidence without introducing another persistence owner. */
export class LocalReviewResultReader implements ReviewResultReader {
  constructor(private readonly dependencies: LocalReviewResultReaderDependencies) {}

  async readResult(producerId: string): Promise<ReviewResult> {
    try {
      const snapshot = await this.dependencies.operationIndex.readOperationSnapshot();
      if (snapshot.status !== "complete") {
        throw new LocalReviewResultReaderError(
          "corrupt-result",
          `operation snapshot is ${snapshot.status}: ${snapshot.reason}`,
        );
      }
      const records = snapshot.records.map((record) => ({
        version: record.version,
        state: ReviewOperationStateSchema.parse(record.state),
      }));
      const candidates: ProducerCandidate[] = [];
      for (const record of records) {
        if ((record.state.kind === "local-review" || record.state.kind === "frontline-run")
          && record.state.operationId === producerId) {
          candidates.push({ kind: record.state.kind, record });
        }
        if (record.state.kind !== "lane-progress") continue;
        for (const attempt of record.state.attempts) {
          if (attempt.hosted !== undefined && attempt.attemptId === producerId) {
            candidates.push({ kind: "hosted", record, attempt });
          }
        }
      }
      if (candidates.length === 0) {
        throw new LocalReviewResultReaderError("missing-result");
      }
      if (candidates.length !== 1) {
        throw new LocalReviewResultReaderError("ambiguous-result");
      }
      const candidate = candidates[0];
      if (candidate?.kind === "local-review") {
        return await this.readLocalResult(candidate.record, records);
      }
      if (candidate?.kind === "frontline-run") {
        return await this.readFrontlineResult(candidate.record, records);
      }
      if (candidate?.kind === "hosted") {
        return this.readHostedResult(candidate.record, candidate.attempt);
      }
      throw new LocalReviewResultReaderError("missing-result");
    } catch (error) {
      if (error instanceof LocalReviewResultReaderError) throw error;
      throw new LocalReviewResultReaderError(
        "corrupt-result",
        error instanceof Error ? error.message : "producer result cannot be validated",
      );
    }
  }

  private async readLocalResult(
    producer: ReviewOperationStateSnapshotRecord,
    records: readonly ReviewOperationStateSnapshotRecord[],
  ): Promise<ReviewResult> {
    const state = producer.state;
    if (state.kind !== "local-review") {
      throw new LocalReviewResultReaderError("corrupt-result", "local producer kind mismatch");
    }
    const attempts = records.flatMap(({ state: candidate }) => candidate.kind === "lane-progress"
      ? candidate.attempts.filter((attempt) => attempt.local?.operationId === state.operationId)
      : []);
    if (attempts.length === 0) {
      throw new LocalReviewResultReaderError("missing-result", "local producer admission is unavailable");
    }
    if (attempts.length !== 1) {
      throw new LocalReviewResultReaderError("ambiguous-result", "local producer has multiple admissions");
    }
    const attempt = attempts[0];
    const local = attempt?.local;
    const originalOutcome = attempt === undefined ? undefined : immutableProducerOutcome(attempt);
    if (attempt === undefined || local === undefined || local.effectiveCoverage === null
      || !attempt.terminalProducer
      || (originalOutcome !== "clean" && originalOutcome !== "findings")) {
      throw new LocalReviewResultReaderError("corrupt-result", "local producer admission is not terminal");
    }
    const [entries, source] = await Promise.all([
      this.dependencies.receiptIndex.readReceiptEntries(state.targetId),
      this.dependencies.sourceStore.readSource(state.sourceRef),
    ]);
    const matchingEntries = entries.filter(({ receipt }) => receipt.requestId === state.requestId);
    if (matchingEntries.length === 0) {
      throw new LocalReviewResultReaderError("missing-result", "local producer receipt is unavailable");
    }
    if (matchingEntries.length !== 1) {
      throw new LocalReviewResultReaderError("ambiguous-result", "local producer has multiple terminal receipts");
    }
    if (source === null) {
      throw new LocalReviewResultReaderError("missing-result", "local producer source is unavailable");
    }
    const canonicalSource = LocalReviewSourceSchema.parse(source);
    const entry = matchingEntries[0];
    if (entry === undefined) {
      throw new LocalReviewResultReaderError("missing-result", "local producer receipt is unavailable");
    }
    const exactReceipt = await this.dependencies.receiptIndex.readReceiptReference(entry.durableEvidenceRef);
    if (exactReceipt === null || canonicalize(exactReceipt) !== canonicalize(entry.receipt)) {
      throw new LocalReviewResultReaderError("corrupt-result", "local producer receipt reference mismatch");
    }
    const receipt = validateReviewReceipt(state.target, state.requirement, state.request, entry.receipt);
    if ((receipt.result !== "clean" && receipt.result !== "findings")
      || receipt.result !== originalOutcome
      || attempt.attemptId !== state.operationId
      || attempt.logicalPass !== state.logicalPass
      || attempt.retryGeneration !== state.retryGeneration
      || attempt.sourceId !== state.laneSourceId
      || attempt.headSha !== state.target.headSha
      || local.requestId !== state.requestId
      || local.scopeMode !== state.scopeMode
      || canonicalize(local.target) !== canonicalize(state.target)
      || canonicalize(local.vehicle) !== canonicalize(state.vehicle)
      || canonicalize(local.deliveryAdmission ?? null) !== canonicalize(state.deliveryAdmission ?? null)
      || canonicalSource.sourceDigest !== state.sourceDigest
      || canonicalSource.repositoryId !== state.repositoryId
      || canonicalSource.targetId !== state.targetId) {
      throw new LocalReviewResultReaderError("corrupt-result", "local producer admission mismatch");
    }
    const resultDigest = canonicalDigest({
      domain: "arc.review.local-result/v1",
      producerId: state.operationId,
      receipt,
      admission: {
        lineage: state.lineage,
        logicalPass: state.logicalPass,
        retryGeneration: state.retryGeneration,
        laneSourceId: state.laneSourceId,
        target: state.target,
        requirement: state.requirement,
        request: state.request,
        attestation: state.attestation,
        policyBindingDigest: state.policyBindingDigest,
        sourceDigest: state.sourceDigest,
        guidanceDigest: state.guidanceDigest,
        requestedCoverage: local.requestedCoverage,
        effectiveCoverage: local.effectiveCoverage,
        scopeMode: state.scopeMode,
        deliveryAdmission: state.deliveryAdmission ?? null,
      },
    });
    return {
      kind: "attested-local",
      producerId: state.operationId,
      repositoryId: state.repositoryId,
      target: state.target,
      sourceIdentity: state.request.evaluatorIdentity,
      originalOutcome: receipt.result,
      findings: receipt.findings,
      resultDigest,
      admission: {
        lineage: state.lineage,
        logicalPass: state.logicalPass,
        retryGeneration: state.retryGeneration,
        requestedCoverage: local.requestedCoverage,
        effectiveCoverage: local.effectiveCoverage,
        scopeMode: state.scopeMode,
        policyVersion: state.policyVersion,
      },
      receiptRef: entry.durableEvidenceRef,
      localSourceRef: state.sourceRef,
      requirement: state.requirement,
      request: state.request,
      ...(state.deliveryAdmission === undefined ? {} : { deliveryAdmission: state.deliveryAdmission }),
    };
  }

  private async readFrontlineResult(
    producer: ReviewOperationStateSnapshotRecord,
    records: readonly ReviewOperationStateSnapshotRecord[],
  ): Promise<ReviewResult> {
    const state = producer.state;
    if (state.kind !== "frontline-run") {
      throw new LocalReviewResultReaderError("corrupt-result", "frontline producer kind mismatch");
    }
    const attempts = records.flatMap(({ state: candidate }) => candidate.kind === "lane-progress"
      ? candidate.attempts.filter((attempt) => attempt.frontline?.admission.operationId === state.operationId)
      : []);
    if (attempts.length === 0) {
      throw new LocalReviewResultReaderError("missing-result", "frontline producer admission is unavailable");
    }
    if (attempts.length !== 1) {
      throw new LocalReviewResultReaderError("ambiguous-result", "frontline producer has multiple admissions");
    }
    const attempt = attempts[0];
    const frontline = attempt?.frontline;
    const originalOutcome = attempt === undefined ? undefined : immutableProducerOutcome(attempt);
    if (attempt === undefined || frontline === undefined || frontline.effectiveCoverage === null
      || !attempt.terminalProducer
      || (originalOutcome !== "clean" && originalOutcome !== "findings")) {
      throw new LocalReviewResultReaderError("corrupt-result", "frontline producer admission is not terminal");
    }
    const reading = await this.dependencies.outcomeStore.readOutcome(state.operationId);
    if (reading.record === null || reading.outcomeRef === null || reading.version <= 0) {
      throw new LocalReviewResultReaderError("missing-result", "frontline producer outcome is unavailable");
    }
    const record = FrontlineOutcomeRecordSchema.parse(reading.record);
    const admission = frontline.admission;
    const admittedSource = admission.frontlineReview.source;
    const expectedSourceBindingId = admittedSource === null ? null : canonicalDigest({
      domain: "arc.review-gate.frontline-source-binding/v1",
      source: admittedSource,
    });
    if (admittedSource === null
      || record.operationId !== state.operationId
      || record.repositoryId !== state.repositoryId
      || record.sourceIdentity !== state.sourceIdentity
      || record.outcome.outcome !== originalOutcome
      || record.outcome.target.targetId !== state.targetId
      || record.outcome.pass !== state.logicalPass
      || record.outcome.pass !== admission.logicalPass
      || record.outcome.maxPasses !== admission.maxPasses
      || canonicalize(record.outcome.source) !== canonicalize(admittedSource)
      || attempt.attemptId !== state.operationId
      || attempt.logicalPass !== state.logicalPass
      || attempt.retryGeneration !== state.retryGeneration
      || attempt.sourceId !== state.sourceIdentity
      || attempt.headSha !== record.outcome.target.headSha
      || state.policyVersion !== admission.policyVersion
      || state.sourceBindingId !== expectedSourceBindingId
      || canonicalize(state.lineage) !== canonicalize(admission.lineage)
      || canonicalize(record.outcome.target) !== canonicalize(admission.target)) {
      throw new LocalReviewResultReaderError("corrupt-result", "frontline producer admission mismatch");
    }
    return {
      kind: "frontline",
      producerId: state.operationId,
      repositoryId: state.repositoryId,
      target: record.outcome.target,
      sourceIdentity: record.sourceIdentity,
      originalOutcome: record.outcome.outcome,
      findings: record.outcome.findings,
      resultDigest: record.outcomeDigest,
      admission: {
        lineage: admission.lineage,
        logicalPass: admission.logicalPass,
        retryGeneration: admission.retryGeneration,
        requestedCoverage: admission.requestedCoverage,
        effectiveCoverage: frontline.effectiveCoverage,
        scopeMode: "whole-target",
        policyVersion: admission.policyVersion,
      },
      outcomeRef: reading.outcomeRef,
      sourceBindingId: state.sourceBindingId,
      executableIdentity: record.executableIdentity,
      outcome: record.outcome,
    };
  }

  private readHostedResult(
    producer: ReviewOperationStateSnapshotRecord,
    attempt: LaneAttempt,
  ): ReviewResult {
    const state = producer.state;
    const hosted = attempt.hosted;
    const sealed = hosted?.sealedResult;
    const originalOutcome = immutableProducerOutcome(attempt);
    if (state.kind !== "lane-progress" || state.lane !== "standard" || hosted === undefined
      || hosted.handle === undefined || hosted.effectiveCoverage === null || sealed === undefined
      || !attempt.terminalProducer || (originalOutcome !== "clean" && originalOutcome !== "findings")
      || sealed.outcome !== originalOutcome
      || state.repositoryId !== hosted.reviewTarget.repositoryId
      || attempt.logicalPass !== hosted.admission.logicalPass
      || attempt.sourceId !== hosted.admission.sourceId
      || attempt.headSha !== hosted.reviewTarget.headSha
      || canonicalize(state.lineage) !== canonicalize(hosted.admission.lineage)) {
      throw new LocalReviewResultReaderError("corrupt-result", "hosted producer admission mismatch");
    }
    const findings = sealed.findings.map(projectHostedFinding);
    return {
      kind: "hosted",
      producerId: attempt.attemptId,
      repositoryId: state.repositoryId,
      target: hosted.reviewTarget,
      sourceIdentity: attempt.sourceId,
      originalOutcome,
      findings,
      resultDigest: sealed.hostedResultId,
      admission: {
        lineage: hosted.admission.lineage,
        logicalPass: hosted.admission.logicalPass,
        retryGeneration: attempt.retryGeneration,
        requestedCoverage: hosted.requestedCoverage,
        effectiveCoverage: hosted.effectiveCoverage,
        scopeMode: "whole-target",
        policyVersion: hosted.requirement.policyVersion,
      },
      laneOperationId: state.operationId,
      actorIdentity: hosted.actorIdentity,
      hostedTarget: hosted.target,
      requirement: hosted.requirement,
      ...(hosted.vehicle === undefined ? {} : { vehicle: hosted.vehicle }),
      hostSettlementFindingIds: sealed.findings
        .filter(({ settlement }) => settlement === "reply-and-resolve")
        .map(({ findingId }) => findingId),
      noHostSettlementFindingIds: sealed.findings
        .filter(({ settlement }) => settlement === "not-applicable")
        .map(({ findingId }) => findingId),
      settled: attempt.outcome === "settled-findings",
    };
  }
}
