/** Repository-shared append-only storage for approved advisory dispositions. */

import { canonicalDigest, canonicalize } from "../../../../lib/kernel/index.js";
import {
  ApprovedDispositionRecordSchema,
  type ApprovedDispositionRecord,
} from "../../core/advisory-records.js";
import type { ApprovedDispositionRecordStore } from "../../core/ports.js";
import type { GitCommonStatePublisher } from "./git-common-state.js";

function recordName(operationId: string): string {
  return `disposition-${canonicalDigest({ operationId }).slice("sha256:".length)}.json`;
}

/** Git-common disposition store with idempotent exact replay and conflict refusal. */
export class LocalApprovedDispositionRecordStore implements ApprovedDispositionRecordStore {
  constructor(private readonly publisher: GitCommonStatePublisher) {}

  async readDispositionRecord(operationId: string): Promise<ApprovedDispositionRecord | null> {
    const raw = await this.publisher.read("evidence", recordName(operationId));
    if (raw === null) return null;
    const record = ApprovedDispositionRecordSchema.parse(JSON.parse(raw));
    if (record.operationId !== operationId) throw new Error("local-disposition-operation-mismatch");
    return record;
  }

  async appendDispositionRecord(
    recordInput: ApprovedDispositionRecord,
  ): Promise<{ dispositionRecordRef: string }> {
    const record = ApprovedDispositionRecordSchema.parse(recordInput);
    const name = recordName(record.operationId);
    return this.publisher.update("evidence", name, (raw) => {
      if (raw !== null) {
        const existing = ApprovedDispositionRecordSchema.parse(JSON.parse(raw));
        if (canonicalize(existing) !== canonicalize(record)) {
          throw new Error("local-disposition-conflict");
        }
        return {
          content: null,
          result: { dispositionRecordRef: `git-common:review-gate/evidence/${name}` },
        };
      }
      return {
        content: `${JSON.stringify(record)}\n`,
        result: { dispositionRecordRef: `git-common:review-gate/evidence/${name}` },
      };
    });
  }
}
