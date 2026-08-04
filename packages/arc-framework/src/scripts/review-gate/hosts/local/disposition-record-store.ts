/** Repository-shared append-only storage for approved advisory dispositions. */

import { canonicalDigest, canonicalize } from "../../../../lib/kernel/index.js";
import {
  ApprovedDispositionRecordSchema,
  type ApprovedDispositionRecord,
} from "../../core/advisory-records.js";
import type { ApprovedDispositionRecordStore } from "../../core/ports.js";
import type { GitCommonStatePublisher } from "../../../../lib/git-common-state.js";
import { LocalReviewRecordStoreError } from "./record-store-error.js";

function recordName(operationId: string): string {
  return `disposition-${canonicalDigest({ operationId }).slice("sha256:".length)}.json`;
}

function parseRecord(raw: string): ApprovedDispositionRecord {
  try {
    return ApprovedDispositionRecordSchema.parse(JSON.parse(raw));
  } catch (error) {
    throw new LocalReviewRecordStoreError("malformed-local-disposition", { cause: error });
  }
}

/** Git-common disposition store with idempotent exact replay and conflict refusal. */
export class LocalApprovedDispositionRecordStore implements ApprovedDispositionRecordStore {
  constructor(private readonly publisher: GitCommonStatePublisher) {}

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
