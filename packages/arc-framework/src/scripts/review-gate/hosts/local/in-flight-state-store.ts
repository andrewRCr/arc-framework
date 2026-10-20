/** Native working-state persistence isolated from repository-backed operation records. */
import type { GitCommonStatePublisher } from "../../../../lib/git-common-state.js";
import type { OwnerIdentity } from "../../../../lib/store/identity.js";
import type { ReviewOutcomePort, ReviewInFlightPort, ReviewOperationStateSnapshot } from "../../core/ports.js";
import type { ReviewOperationState } from "../../core/operation-state-schema.js";
import { canonicalDigest, canonicalize } from "../../../../lib/kernel/index.js";
import { composeReviewInFlightState, projectReviewInFlightState, ReviewInFlightRecordSchema,
  type ReviewInFlightRecord } from "../../core/in-flight-state-schema.js";
import { LocalOperationStateStoreError } from "./operation-state-store.js";
import { pruneEndedReviewExecution, assertReviewPassStillOpen } from "./in-flight-outcomes.js";

interface InFlightContext { publisher: GitCommonStatePublisher; workItem: OwnerIdentity; outcomes: ReviewOutcomePort;
  projectId: () => Promise<string> }
const location = { root: "review-gate", namespace: "in-flight" } as const;

/** Bind machine-local execution state to one exact operational owner. */
export class NativeReviewInFlightStateStore implements ReviewInFlightPort {
  private readonly prefix: string;
  private readonly uid: string;
  constructor(private readonly input: InFlightContext) {
    if (input.workItem.type !== "work-item" || input.workItem.uid === undefined) {
      throw new LocalOperationStateStoreError("work-item-uid-required");
    }
    this.uid = input.workItem.uid;
    this.prefix = `operation-${canonicalDigest({ uid: this.uid }).slice(7)}-`;
  }

  private recordName(operationId: string): string {
    return `${this.prefix}${canonicalDigest({ operationId }).slice(7)}.json`;
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

  async readOperation(operationId: string): Promise<{ version: number; state: ReviewOperationState | null }> {
    const raw = await this.input.publisher.read(location, this.recordName(operationId));
    if (raw === null) return { version: 0, state: null };
    const record = await this.parse(raw);
    if (record.operationId !== operationId) throw new LocalOperationStateStoreError("operation-id-mismatch");
    return { version: record.version,
      state: pruneEndedReviewExecution(composeReviewInFlightState(record.state), await this.outcomes()) };
  }

  async readOperationSnapshot(): Promise<ReviewOperationStateSnapshot> {
    try {
      const records = [];
      const outcomes = await this.outcomes();
      for (const entry of await this.input.publisher.snapshot(location)) {
        if (!entry.name.startsWith(this.prefix)) continue;
        if (entry.kind !== "file") return { status: "incomplete", reason: "unexpected-in-flight-entry" };
        const record = await this.parse(entry.content);
        if (entry.name !== this.recordName(record.operationId)) return { status: "incomplete", reason: "operation-record-name-mismatch" };
        const state = pruneEndedReviewExecution(composeReviewInFlightState(record.state), outcomes);
        if (state !== null) records.push({ version: record.version, state });
      }
      records.sort((a, b) => a.state.operationId.localeCompare(b.state.operationId));
      return { status: "complete", records };
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
