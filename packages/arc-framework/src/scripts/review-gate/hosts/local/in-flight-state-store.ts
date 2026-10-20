/** Native working-state persistence isolated from repository-backed operation records. */
import type { GitCommonStatePublisher } from "../../../../lib/git-common-state.js";
import type { OwnerIdentity } from "../../../../lib/store/identity.js";
import type { ReviewOutcomePort, ReviewEvidencePort, ReviewDecisionPort, NativeReviewFactPorts, ReviewInFlightPort, ReviewOperationStateSnapshot } from "../../core/ports.js";
import type { ReviewOperationState } from "../../core/operation-state-schema.js";
import { canonicalDigest, canonicalize } from "../../../../lib/kernel/index.js";
import { composeReviewInFlightState, projectReviewInFlightState, ReviewInFlightRecordSchema,
  type ReviewInFlightRecord } from "../../core/in-flight-state-schema.js";
import { LocalOperationStateStoreError } from "./operation-state-store.js";
import { composeOutcomeLane, outcomeLaneOperationId } from "./lane-outcome-composition.js";
import type { ReviewEvidence } from "../../../../lib/store/kinds/review/evidence/schema.js";
import type { ReviewOutcome } from "../../../../lib/store/kinds/review/outcome/schema.js";
import { pruneEndedReviewExecution, assertReviewPassStillOpen } from "./in-flight-outcomes.js";

interface InFlightContext { publisher: GitCommonStatePublisher; workItem: OwnerIdentity; outcomes: ReviewOutcomePort;
  projectId: () => Promise<string>; evidence?: ReviewEvidencePort; decisions?: ReviewDecisionPort }
const location = { root: "review-gate", namespace: "in-flight" } as const;

function recordPrefix(uid: string): string { return `operation-${canonicalDigest({ uid }).slice(7)}-`; }

/** Name one clone-local execution record by its exact admitted UID and operation. */
export function nativeReviewInFlightRecordName(uid: string, operationId: string): string {
  return `${recordPrefix(uid)}${canonicalDigest({ operationId }).slice(7)}.json`;
}

/** Bind machine-local execution state to one exact operational owner. */
export class NativeReviewInFlightStateStore implements ReviewInFlightPort {
  readonly stateOffBranch = true;
  readonly outcomeWriter: ReviewOutcomePort;
  readonly nativeFacts?: NativeReviewFactPorts;
  private readonly prefix: string;
  private readonly uid: string;
  constructor(private readonly input: InFlightContext) {
    this.outcomeWriter = input.outcomes;
    if (input.evidence !== undefined && input.decisions !== undefined) {
      this.nativeFacts = { outcomes: input.outcomes, evidence: input.evidence, decisions: input.decisions, readProjectId: input.projectId };
    }
    if (input.workItem.type !== "work-item" || input.workItem.uid === undefined) {
      throw new LocalOperationStateStoreError("work-item-uid-required");
    }
    this.uid = input.workItem.uid;
    this.prefix = recordPrefix(this.uid);
  }

  private recordName(operationId: string): string {
    return nativeReviewInFlightRecordName(this.uid, operationId);
  }

  private async parse(raw: string): Promise<ReviewInFlightRecord> {
    const record = ReviewInFlightRecordSchema.parse(JSON.parse(raw));
    if (record.operationId !== record.state.operationId) throw new LocalOperationStateStoreError("operation-id-mismatch");
    if (record.state.workItem.type !== "work-item" || record.state.workItem.uid !== this.uid) {
      throw new LocalOperationStateStoreError("work-item-mismatch");
    }
    if (record.state.repositoryId !== await this.input.projectId()) throw new LocalOperationStateStoreError("project-identity-mismatch");
    return record;
  }

  private async outcomes() {
    const listing = await this.input.outcomes.list();
    if (listing.status !== "complete") throw new LocalOperationStateStoreError(listing.reason);
    return listing.records.map(record => record.value);
  }

  private async evidence() {
    if (this.input.evidence === undefined) return [];
    const listing = await this.input.evidence.list();
    if (listing.status !== "complete") throw new LocalOperationStateStoreError(listing.reason);
    return listing.records.map(record => record.value);
  }

  private compose(operationId: string, state: ReviewOperationState | null, outcomes: readonly ReviewOutcome[], evidence: readonly ReviewEvidence[]): ReviewOperationState | null {
    const pending = state === null ? null : pruneEndedReviewExecution(state, outcomes);
    if (pending !== null && pending.kind !== "lane-progress") return pending;
    return composeOutcomeLane(operationId, pending, outcomes, this.input.workItem, evidence);
  }

  private async readRetainedRecord(operationId: string): Promise<ReviewInFlightRecord | null> {
    const raw = await this.input.publisher.read(location, this.recordName(operationId));
    const record = raw === null ? null : await this.parse(raw);
    if (record !== null && record.operationId !== operationId) throw new LocalOperationStateStoreError("operation-id-mismatch");
    return record;
  }

  /** Read only the original source locator without reviving ended execution. */
  async readLocalSourceReference(operationId: string): Promise<string | null> {
    const record = await this.readRetainedRecord(operationId);
    return record?.state.kind === "local-review" ? record.state.sourceRef : null;
  }

  async readOperation(operationId: string): Promise<{ version: number; state: ReviewOperationState | null }> {
    const record = await this.readRetainedRecord(operationId);
    return { version: record?.version ?? 0, state: this.compose(operationId,
      record === null ? null : composeReviewInFlightState(record.state), await this.outcomes(), await this.evidence()) };
  }

  async readOperationSnapshot(): Promise<ReviewOperationStateSnapshot> {
    try {
      const records = new Map<string, { version: number; state: ReviewOperationState | null }>();
      const outcomes = await this.outcomes(), evidence = await this.evidence();
      for (const entry of await this.input.publisher.snapshot(location)) {
        if (!entry.name.startsWith(this.prefix)) continue;
        if (entry.kind !== "file") return { status: "incomplete", reason: "unexpected-in-flight-entry" };
        const record = await this.parse(entry.content);
        if (entry.name !== this.recordName(record.operationId)) return { status: "incomplete", reason: "operation-record-name-mismatch" };
        records.set(record.operationId, { version: record.version, state: composeReviewInFlightState(record.state) });
      }
      for (const outcome of outcomes) {
        const id = outcomeLaneOperationId(outcome);
        if (!records.has(id)) records.set(id, { version: 0, state: null });
      }
      return { status: "complete", records: [...records].flatMap(([id, record]) => {
        const state = this.compose(id, record.state, outcomes, evidence);
        return state === null ? [] : [{ version: record.version, state }];
      }).sort((a, b) => a.state.operationId.localeCompare(b.state.operationId)) };
    } catch (error) {
      return { status: "unavailable", reason: error instanceof Error ? error.message : "in-flight-snapshot-failed" };
    }
  }

  async publishOperation(state: ReviewOperationState, expectedVersion: number): Promise<{ version: number }> {
    if (state.workItem !== undefined && (state.workItem.type !== "work-item" || state.workItem.uid !== this.uid)) {
      throw new LocalOperationStateStoreError("work-item-mismatch");
    }
    const outcomes = await this.outcomes();
    const pending = pruneEndedReviewExecution(state, outcomes);
    if (pending === null) throw new LocalOperationStateStoreError("operation-already-ended");
    assertReviewPassStillOpen(pending, outcomes);
    const working = projectReviewInFlightState({ ...pending, workItem: this.input.workItem });
    if (working.repositoryId !== await this.input.projectId()) throw new LocalOperationStateStoreError("project-identity-mismatch");
    return this.input.publisher.update(location, this.recordName(state.operationId), async raw => {
      const current = raw === null ? null : await this.parse(raw);
      if (current !== null && canonicalize(current.state) === canonicalize(working)) return { kind: "keep", result: { version: current.version } };
      if ((current?.version ?? 0) !== expectedVersion) throw new LocalOperationStateStoreError("version-conflict");
      const record = ReviewInFlightRecordSchema.parse({ schemaVersion: 1, semanticsVersion: "review-in-flight/v1",
        operationId: state.operationId, version: expectedVersion + 1, state: working });
      return { kind: "write", content: `${JSON.stringify(record)}\n`, result: { version: record.version } };
    });
  }
}
