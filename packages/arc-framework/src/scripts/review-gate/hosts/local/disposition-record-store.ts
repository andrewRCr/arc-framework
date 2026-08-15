/** Repository-shared append-only storage for approved advisory dispositions. */

import { canonicalDigest, canonicalize } from "../../../../lib/kernel/index.js";
import {
  ApprovedDispositionRecordSchema,
  type ApprovedDispositionRecord,
} from "../../core/advisory-records.js";
import type {
  ApprovedDispositionRecordIndex,
  ApprovedDispositionRecordStore,
} from "../../core/ports.js";
import type { GitCommonStatePublisher } from "../../../../lib/git-common-state.js";
import { LocalReviewRecordStoreError } from "./record-store-error.js";

const RECORD_PREFIX = "disposition-";

function recordName(operationId: string): string {
  return `${RECORD_PREFIX}${canonicalDigest({ operationId }).slice("sha256:".length)}.json`;
}

function parseRecord(raw: string): ApprovedDispositionRecord {
  try {
    return ApprovedDispositionRecordSchema.parse(JSON.parse(raw));
  } catch (error) {
    throw new LocalReviewRecordStoreError("malformed-local-disposition", { cause: error });
  }
}

/** Git-common disposition store with idempotent exact replay and conflict refusal. */
export class LocalApprovedDispositionRecordStore
implements ApprovedDispositionRecordStore, ApprovedDispositionRecordIndex {
  constructor(private readonly publisher: GitCommonStatePublisher) {}

  async listDispositionRecords(): Promise<readonly ApprovedDispositionRecord[]> {
    const entries = await this.publisher.snapshot({ root: "review-gate", namespace: "evidence" });
    return entries.flatMap((entry) => (
      entry.kind === "file" && entry.name.startsWith(RECORD_PREFIX) && entry.name.endsWith(".json")
        ? [parseRecord(entry.content)]
        : []
    ));
  }

  async readDispositionRecord(operationId: string): Promise<ApprovedDispositionRecord | null> {
    const raw = await this.publisher.read(
      { root: "review-gate", namespace: "evidence" },
      recordName(operationId),
    );
    if (raw === null) return null;
    const record = parseRecord(raw);
    if (record.operationId !== operationId) {
      throw new LocalReviewRecordStoreError("local-disposition-operation-mismatch");
    }
    return record;
  }

  async appendDispositionRecord(
    recordInput: ApprovedDispositionRecord,
  ): Promise<{ dispositionRecordRef: string }> {
    const record = ApprovedDispositionRecordSchema.parse(recordInput);
    const name = recordName(record.operationId);
    return this.publisher.update({ root: "review-gate", namespace: "evidence" }, name, (raw) => {
      if (raw !== null) {
        const existing = parseRecord(raw);
        if (canonicalize(existing) !== canonicalize(record)) {
          throw new LocalReviewRecordStoreError("local-disposition-conflict");
        }
        return {
          kind: "keep",
          result: { dispositionRecordRef: `git-common:review-gate/evidence/${name}` },
        };
      }
      return {
        kind: "write",
        content: `${JSON.stringify(record)}\n`,
        result: { dispositionRecordRef: `git-common:review-gate/evidence/${name}` },
      };
    });
  }
}
