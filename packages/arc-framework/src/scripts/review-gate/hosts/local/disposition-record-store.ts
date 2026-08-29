/** Repository-shared monotonic storage for approved advisory dispositions. */

import { canonicalDigest, canonicalize } from "../../../../lib/kernel/index.js";
import {
  ApprovedDispositionRecordSchema,
  type ApprovedDispositionRecord,
} from "../../core/advisory-records.js";
import { validateDispositionState } from "../../core/dispositions.js";
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
    const record = ApprovedDispositionRecordSchema.parse(JSON.parse(raw));
    const approvedDisposition = validateDispositionState(record.approvedDisposition);
    if (approvedDisposition.state !== "approved") throw new Error("disposition record requires approval");
    return { ...record, approvedDisposition };
  } catch (error) {
    throw new LocalReviewRecordStoreError("malformed-local-disposition", { cause: error });
  }
}

function parseEnumeratedRecord(raw: string): ApprovedDispositionRecord | null {
  try {
    return parseRecord(raw);
  } catch (error) {
    if (error instanceof LocalReviewRecordStoreError
      && error.reason === "malformed-local-disposition") return null;
    throw error;
  }
}

function isFixResponseAdvance(
  existing: ApprovedDispositionRecord,
  next: ApprovedDispositionRecord,
): boolean {
  const errandAdvance = existing.errandFixResponse === null && next.errandFixResponse !== null;
  const deliveryAdvance = existing.deliveryMemberFixResponse === null
    && next.deliveryMemberFixResponse !== null;
  if (Number(errandAdvance) + Number(deliveryAdvance) !== 1) return false;
  return canonicalize({ ...existing, errandFixResponse: null, deliveryMemberFixResponse: null })
    === canonicalize({ ...next, errandFixResponse: null, deliveryMemberFixResponse: null });
}

/** Git-common disposition store with exact replay and one monotonic verified-fix response append. */
export class LocalApprovedDispositionRecordStore
implements ApprovedDispositionRecordStore, ApprovedDispositionRecordIndex {
  constructor(private readonly publisher: GitCommonStatePublisher) {}

  async listDispositionRecords(): Promise<readonly ApprovedDispositionRecord[]> {
    const entries = await this.publisher.snapshot({ root: "review-gate", namespace: "evidence" });
    return entries.flatMap((entry) => {
      if (entry.kind !== "file" || !entry.name.startsWith(RECORD_PREFIX) || !entry.name.endsWith(".json")) {
        return [];
      }
      const record = parseEnumeratedRecord(entry.content);
      return record === null ? [] : [record];
    });
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
    const structurallyParsed = ApprovedDispositionRecordSchema.parse(recordInput);
    const approvedDisposition = validateDispositionState(structurallyParsed.approvedDisposition);
    if (approvedDisposition.state !== "approved") throw new Error("disposition record requires approval");
    const record = { ...structurallyParsed, approvedDisposition };
    const name = recordName(record.operationId);
    return this.publisher.update({ root: "review-gate", namespace: "evidence" }, name, (raw) => {
      if (raw !== null) {
        const existing = parseRecord(raw);
        const fixResponseAdvance = isFixResponseAdvance(existing, record);
        if (canonicalize(existing) !== canonicalize(record) && !fixResponseAdvance) {
          throw new LocalReviewRecordStoreError("local-disposition-conflict");
        }
        if (fixResponseAdvance) {
          return {
            kind: "write",
            content: `${JSON.stringify(record)}\n`,
            result: { dispositionRecordRef: `git-common:review-gate/evidence/${name}` },
          };
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
